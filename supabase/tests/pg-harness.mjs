// Postgres real em memória (PGlite) com TODAS as migrations do projeto aplicadas
// por ordem, sobre um mínimo de stubs da plataforma Supabase (auth, storage, cron, papéis).
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

const STUBS_SUPABASE = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb DEFAULT '{}',
    raw_app_meta_data  jsonb DEFAULT '{}',
    email_confirmed_at timestamptz,
    last_sign_in_at    timestamptz,
    banned_until       timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
    AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz DEFAULT now()
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
    name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now()
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  -- Como na plataforma: privilégios de base abertos, o acesso real decide-se no RLS
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
  GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
    AS $$ SELECT string_to_array(name, '/') $$;

  CREATE SCHEMA cron;
  CREATE FUNCTION cron.schedule(a text, b text, c text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
  CREATE FUNCTION cron.unschedule(a text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE SCHEMA extensions;
`

function adaptar(nome, sql) {
  // PostGIS não existe no PGlite; só o módulo de picagens (oculto) o usa
  if (/geofence/.test(nome)) {
    return sql
      .replace(/CREATE EXTENSION IF NOT EXISTS postgis;/i, '')
      .replace(/geography\([^)]*\)/gi, 'text')
      .replace(/\b(geography|geometry)\b/gi, 'text')
      .replace(/USING gist/gi, 'USING btree')
  }
  // $$…$$ aninhado dentro de DO $$ — o ficheiro não é válido tal como está
  // (em produção as tabelas existem; foi aplicado noutra versão)
  if (nome === '20260916000000_fase2_horarios.sql') {
    return sql.replace('$$SELECT public.calcular_resumo_dia(CURRENT_DATE)$$', `'SELECT public.calcular_resumo_dia(CURRENT_DATE)'`)
  }
  return sql
}

export const migrations = () => readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

export async function criarBanco({ ate } = {}) {
  const db = new PGlite()
  await db.exec(STUBS_SUPABASE)
  for (const f of migrations()) {
    if (ate && f > ate) break
    try {
      await db.exec(adaptar(f, readFileSync(DIR + f, 'utf8')))
    } catch (e) {
      throw new Error(`Migration ${f} falhou: ${e.message}`)
    }
  }
  return db
}

// Executa SQL como um utilizador da app (papel + auth.uid()), numa transação isolada
export async function como(db, { papel, uid = null }, fn) {
  return db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`SET LOCAL ROLE ${papel}`)
    return fn(tx)
  })
}
