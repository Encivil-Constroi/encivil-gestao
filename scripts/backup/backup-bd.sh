#!/usr/bin/env bash
# Backup da BD: pg_dump → restauro num Postgres vazio → compara contagens → cifra com age.
# Um backup só conta se restaurar. A chave privada age nunca passa por aqui.
#
# Variante escolhida para as FKs para auth.users (testada com contagens iguais):
# o restauro cria uma auth.users "stub" (só com a coluna id) e, ANTES do pg_restore,
# copia para lá os ids reais (COPY best-effort). Assim as FKs de profiles/audit_log
# validam e as contagens batem. Se a cópia falhar (permissões), o pg_restore carrega
# na mesma os dados e só a criação da FK falha (fica no restauro.log); as linhas mantêm-se.
#
# Consistência: uma sessão psql fica aberta numa transação REPEATABLE READ e exporta o
# snapshot; o pg_dump usa --snapshot e as contagens da origem saem dessa mesma transação.
# Escritas feitas durante o dump/restauro não geram falsas divergências.
# DB_URL tem de ser ligação direta ou pooler em modo SESSÃO (modo transação não mantém a sessão).
set -euo pipefail
: "${DB_URL:?DB_URL em falta}" "${RESTAURO_URL:?RESTAURO_URL em falta}"
: "${AGE_DESTINATARIO:?AGE_DESTINATARIO em falta}" "${SAIDA:?SAIDA em falta}"

# Tabelas de negócio comparadas (nomes reais; faturas = faturas_fornecedor)
TABELAS=(produtos movimentos_stock obras colaboradores comb_abastecimentos faturas_fornecedor profiles audit_log)
DATA=$(date -u +%Y-%m-%dT%H%M)
DUMP="$SAIDA/bd-$DATA.dump"
mkdir -p "$SAIDA"

coproc SNAP { psql "$DB_URL" -qAt -v ON_ERROR_STOP=1; }
echo 'BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_export_snapshot();' >&"${SNAP[1]}"
read -r SNAPSHOT <&"${SNAP[0]}" || { echo "::error::Não foi possível abrir o snapshot na origem"; exit 1; }
[ -n "$SNAPSHOT" ] || { echo "::error::Snapshot vazio"; exit 1; }

pg_dump "$DB_URL" --snapshot="$SNAPSHOT" --format=custom --no-owner --no-privileges --schema=public --schema=privado --file="$DUMP"

# Papéis que as policies referem; num Postgres vazio não existem
psql "$RESTAURO_URL" -v ON_ERROR_STOP=0 -q <<'SQL'
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (o papel de serviço não é preciso: o restauro corre com --no-privileges e as
--  policies que o referem falham sem afetar os dados, que é o que se compara)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT '{}'::jsonb $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT NULL::text $f$;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
SQL

# Ids reais dos utilizadores para a stub (best-effort; ver comentário no topo)
psql "$DB_URL" -qc "\copy (SELECT id FROM auth.users) TO STDOUT" 2>>"$SAIDA/restauro.log" \
  | psql "$RESTAURO_URL" -qc "\copy auth.users (id) FROM STDIN" 2>>"$SAIDA/restauro.log" \
  || echo "Aviso: ids de auth.users não copiados; as FKs podem falhar no restauro"

# Erros de objetos da plataforma (extensões, papéis internos) são esperados;
# o que decide é a comparação de contagens a seguir
pg_restore --no-owner --no-privileges --dbname="$RESTAURO_URL" "$DUMP" 2>> "$SAIDA/restauro.log" || true
echo "Avisos do restauro: $(grep -c 'error' "$SAIDA/restauro.log" || true)"

FALHAS=0
for t in "${TABELAS[@]}"; do
  echo "SELECT count(*) FROM public.$t;" >&"${SNAP[1]}"
  read -r ORIG <&"${SNAP[0]}" || { echo "::error::Contagem na origem falhou ($t)"; exit 1; }
  REST=$(psql "$RESTAURO_URL" -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo "ERRO")
  printf '%-24s origem=%-8s restaurado=%s\n' "$t" "$ORIG" "$REST"
  [ "$ORIG" = "$REST" ] || FALHAS=$((FALHAS + 1))
done
[ "$FALHAS" -eq 0 ] || { echo "::error::Restauro não confere em $FALHAS tabela(s)"; exit 1; }

echo 'COMMIT;' >&"${SNAP[1]}"; echo '\q' >&"${SNAP[1]}"; wait "$SNAP_PID" 2>/dev/null || true

age -r "$AGE_DESTINATARIO" -o "$DUMP.age" "$DUMP"
shred -u "$DUMP" 2>/dev/null || rm -f "$DUMP"
echo "Backup cifrado: $DUMP.age"
