-- RH: contactos, foto e setor nas fichas; perfil próprio editável; nº mecanográfico automático.

-- ── 1. Colunas ──────────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS telemovel text,
  ADD COLUMN IF NOT EXISTS email     text,
  ADD COLUMN IF NOT EXISTS foto_path text,
  ADD COLUMN IF NOT EXISTS setor     text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telemovel text,
  ADD COLUMN IF NOT EXISTS foto_path text;

CREATE INDEX IF NOT EXISTS colaboradores_setor_idx ON public.colaboradores (setor);

-- ── 2. Nº mecanográfico automático (ficha criada sem número) ────────────────
CREATE SEQUENCE IF NOT EXISTS public.colaboradores_numero_seq;

CREATE OR REPLACE FUNCTION public.colaborador_numero_auto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  IF NEW.numero_mecan IS NULL OR btrim(NEW.numero_mecan) = '' THEN
    LOOP
      n := 'ENC-' || lpad(nextval('public.colaboradores_numero_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE numero_mecan = n);
    END LOOP;
    NEW.numero_mecan := n;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.colaborador_numero_auto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_colaborador_numero_auto ON public.colaboradores;
CREATE TRIGGER trg_colaborador_numero_auto
  BEFORE INSERT ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.colaborador_numero_auto();

-- ── 3. Email do perfil acompanha o email da conta (alteração confirmada) ────
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_user_email_changed ON auth.users;
CREATE TRIGGER trg_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- ── 4. Perfil próprio: nome, telemóvel e foto (profiles + ficha ligada) ─────
-- RPC em vez de GRANT de coluna: mantém a ficha do colaborador em sincronia
-- sem dar ao utilizador escrita na tabela colaboradores.
CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil(
  p_nome text, p_telemovel text, p_foto_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid   uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel  text := nullif(btrim(coalesce(p_telemovel, '')), '');
  v_foto text := nullif(btrim(coalesce(p_foto_path, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  IF v_nome = '' THEN
    RAISE EXCEPTION 'O nome é obrigatório';
  END IF;
  IF v_tel IS NOT NULL AND v_tel !~ '^\+?[0-9 ]{9,15}$' THEN
    RAISE EXCEPTION 'Telemóvel inválido';
  END IF;
  IF v_foto IS NOT NULL AND v_foto NOT LIKE 'perfis/' || uid::text || '/%' THEN
    RAISE EXCEPTION 'Foto inválida';
  END IF;

  UPDATE public.profiles SET nome = v_nome, telemovel = v_tel, foto_path = v_foto WHERE id = uid;
  UPDATE public.colaboradores SET nome = v_nome, telemovel = v_tel, foto_path = v_foto WHERE user_id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_meu_perfil(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text, text) TO authenticated;

-- ── 5. Fotos de pessoal: bucket "rh" ────────────────────────────────────────
-- perfis/<uid>/<n>.<ext>          o próprio utilizador
-- colaboradores/<uuid>/<n>.<ext>  admin e gestor (a ficha pode ainda não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rh', 'rh', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.foto_rh_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_nome ~ '^perfis/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
      THEN split_part(p_nome, '/', 2) = auth.uid()::text
    WHEN p_nome ~ '^colaboradores/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
      THEN public.auth_role() IN ('admin', 'gestor')
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.foto_rh_valida(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.foto_rh_valida(text) TO authenticated;

DROP POLICY IF EXISTS "rh_upload_fotos" ON storage.objects;
CREATE POLICY "rh_upload_fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rh' AND public.foto_rh_valida(name));
