# Modelo de Dados — Controle Armazém ENCIVIL

Base de dados: Supabase / PostgreSQL

---

## Enumerações

```sql
CREATE TYPE tipo_movimento AS ENUM ('entrada', 'saida', 'ajuste');
CREATE TYPE role_utilizador AS ENUM ('admin', 'gestor', 'armazem', 'medicoes', 'leitura', 'mecanico', 'motorista');  -- valores acrescentados por ALTER TYPE ... ADD VALUE (ver abaixo)
CREATE TYPE estado_stock AS ENUM ('normal', 'baixo', 'sem_stock');
```

> `role_utilizador` foi criado só com `'admin'` na migration inicial; `'gestor'` foi adicionado depois com `ALTER TYPE ... ADD VALUE`. Qualquer novo role segue o mesmo padrão — nunca recriar o enum do zero (quebra a coluna existente).

---

## Tabela: profiles

Perfis de utilizadores autenticados. Extensão da tabela `auth.users` do Supabase.

```sql
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       role_utilizador NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Índices:**
```sql
CREATE INDEX idx_profiles_email ON profiles(email);
```

**Notas:**
- `id` corresponde ao `auth.users.id` do Supabase Auth.
- Dois roles em produção: `admin` (acesso total) e `gestor` (consulta + registo de movimentos, sem CRUD de produtos/configurações).
- Trigger `handle_new_user()` (SECURITY DEFINER) cria o perfil automaticamente no signup, com role `gestor` por defeito (mínimo privilégio — promoção a `admin` é manual).
- **GRANT a nível de coluna restringe `UPDATE` de `authenticated` apenas à coluna `nome`.** `role`, `email`, `id` são só-leitura para o próprio utilizador — mudar de role só é possível via RPC `promover_role()` (ver abaixo). Isto fecha uma falha de privilege-escalation onde qualquer utilizador podia auto-promover-se a admin com um `UPDATE` direto (fix em `20260622000001_fix_profiles_privilege_escalation.sql`).
- `INSERT` direto também é revogado de `authenticated` — só o trigger (que corre como owner da função) cria perfis.

---

## Tabela: produtos

Materiais de armazém geridos pelo sistema.

```sql
CREATE TABLE produtos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL,
  categoria    TEXT NOT NULL,
  unidade      TEXT NOT NULL,
  stock_atual  NUMERIC(12, 3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  observacoes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_stock_atual_nao_negativo CHECK (stock_atual >= 0),
  CONSTRAINT ck_stock_minimo_nao_negativo CHECK (stock_minimo >= 0)
);
```

**Índices:**
```sql
CREATE INDEX idx_produtos_codigo ON produtos(codigo);
CREATE INDEX idx_produtos_categoria ON produtos(categoria);
CREATE INDEX idx_produtos_ativo ON produtos(ativo);
```

**Trigger para updated_at:**
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_produtos_updated_at
BEFORE UPDATE ON produtos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Tabela: movimentos_stock

Histórico imutável de todos os movimentos de stock. **Nunca apagar registos desta tabela.**

```sql
CREATE TABLE movimentos_stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id   UUID NOT NULL REFERENCES produtos(id),
  tipo         tipo_movimento NOT NULL,
  quantidade   NUMERIC(12, 3) NOT NULL,
  stock_antes  NUMERIC(12, 3) NOT NULL,
  stock_depois NUMERIC(12, 3) NOT NULL,
  responsavel  TEXT NOT NULL,
  destino_obra TEXT,
  observacoes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id),

  CONSTRAINT ck_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT ck_stock_depois_nao_negativo CHECK (stock_depois >= 0),
  CONSTRAINT ck_destino_obrigatorio_saida CHECK (
    tipo != 'saida' OR (tipo = 'saida' AND destino_obra IS NOT NULL AND destino_obra != '')
  )
);
```

**Índices:**
```sql
CREATE INDEX idx_movimentos_produto_id ON movimentos_stock(produto_id);
CREATE INDEX idx_movimentos_created_at ON movimentos_stock(created_at DESC);
CREATE INDEX idx_movimentos_tipo ON movimentos_stock(tipo);
CREATE INDEX idx_movimentos_responsavel ON movimentos_stock(responsavel);
CREATE INDEX idx_movimentos_destino_obra ON movimentos_stock(destino_obra);
CREATE INDEX idx_movimentos_created_by ON movimentos_stock(created_by);
```

**Notas importantes:**
- `stock_antes` e `stock_depois` são gravados no momento do movimento para garantir auditabilidade.
- Relatórios calculam-se a partir desta tabela, nunca apenas de `produtos.stock_atual`.
- `created_by` é o utilizador autenticado que submeteu o movimento.
- `responsavel` é o nome da pessoa física (pode ser diferente do utilizador que submeteu, ex: encarregado).

---

## Tabela: configuracoes_empresa

Configurações globais do sistema. Apenas uma linha (singleton).

```sql
CREATE TABLE configuracoes_empresa (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_empresa        TEXT NOT NULL DEFAULT 'ENCIVIL',
  logo_url            TEXT,
  responsavel_armazem TEXT,
  stock_minimo_padrao NUMERIC(12, 3) NOT NULL DEFAULT 10,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_stock_minimo_padrao_nao_negativo CHECK (stock_minimo_padrao >= 0)
);

CREATE TRIGGER trg_config_updated_at
BEFORE UPDATE ON configuracoes_empresa
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Tabela: audit_log

Registo de operações sensíveis — hoje, exclusivamente mudanças de role. Adicionada em `20260622000001_fix_profiles_privilege_escalation.sql`.

```sql
CREATE TABLE public.audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  target_id  UUID,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**
- Ninguém insere diretamente — apenas RPCs `SECURITY DEFINER` (ex: `promover_role`) escrevem aqui, dentro da mesma transação da operação sensível.
- `SELECT` restrito a `admin` via RLS.
- `action = 'role_change'` é o único tipo de evento registado atualmente; o padrão é extensível para outras operações sensíveis no futuro (ex: eliminação de produto).

---

## Função: gerar_codigo_produto()

Gera códigos de produto sequenciais (`P1001`, `P1002`, ...) em vez de usar `Date.now()` no frontend (evita colisões e expõe menos informação). Adicionada em `20260612000003_produto_codigo_seq.sql`.

```sql
CREATE SEQUENCE produto_codigo_seq START 1001 INCREMENT 1;

CREATE FUNCTION public.gerar_codigo_produto() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 'P' || LPAD(nextval('produto_codigo_seq')::TEXT, 4, '0');
$$;
```

---

## Função: promover_role(p_user_id, p_novo_role)

Único caminho legítimo para mudar o role de um utilizador. `SECURITY DEFINER`, verifica que o chamador já é `admin`, escreve em `audit_log`. Bloqueia um admin de se auto-despromover (evita lockout acidental). Adicionada em `20260622000001_fix_profiles_privilege_escalation.sql`.

```sql
CREATE FUNCTION public.promover_role(p_user_id UUID, p_novo_role role_utilizador)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
  v_profile     public.profiles%ROWTYPE;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Autorização negada: apenas administradores podem alterar roles.';
  END IF;
  IF p_user_id = auth.uid() AND p_novo_role != 'admin' THEN
    RAISE EXCEPTION 'Não é permitido despromover a própria conta.';
  END IF;
  UPDATE public.profiles SET role = p_novo_role WHERE id = p_user_id RETURNING * INTO v_profile;
  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'role_change', p_user_id, jsonb_build_object('novo_role', p_novo_role));
  RETURN v_profile;
END;
$$;
```

---

## Relacionamentos

```
auth.users (Supabase)
    └── profiles (1:1)

profiles
    └── movimentos_stock.created_by (1:N)
    └── audit_log.actor_id (1:N)

produtos
    └── movimentos_stock.produto_id (1:N)
```

---

## Estratégia de Auditoria

- `movimentos_stock` é a fonte de auditoria principal — nunca apagar.
- Campos `stock_antes` e `stock_depois` garantem rastreabilidade total.
- `created_by` identifica o utilizador autenticado que submeteu.
- `responsavel` identifica a pessoa física responsável pelo movimento.
- Para auditoria avançada (Fase 2): ativar Supabase Audit Logging ou usar extensão `pgaudit`.

---

## Campos para Relatórios

Os seguintes campos em `movimentos_stock` são necessários para os relatórios:

| Campo | Relatório |
|-------|-----------|
| `created_at` | Diário, semanal, mensal, anual |
| `tipo` | Separar entradas de saídas |
| `quantidade` | Totais e somas |
| `produto_id` | Por produto |
| `destino_obra` | Por obra |
| `responsavel` | Por responsável |
| `stock_depois` | Estado de stock em dado momento |

---

## Estado do schema em 2026-11-12

Este documento descreve o **núcleo original** (junho de 2026). O schema atual tem 101 migrations (`supabase/migrations/`, última `20261028120900`); ler as migrations, e os documentos de módulo, para o resto. Diferenças principais:

- **Enum `role_utilizador`:** `admin`, `gestor`, `armazem`, `medicoes`, `leitura` (`20260702000003`), `mecanico` (`20260929020000`), `motorista` (`20260930000000`). Conta nova nasce `leitura` (`20261028120600`; antes nascia `gestor`).
- **`movimentos_stock`** ganhou `obra_id` (`20260702000007`), `subtipo`, `fornecedor`, `cliente`, `numero_fatura`, `preco_unitario` (`20261001000000`) e `client_id` (idempotência, `20261020110000`). Recusa UPDATE, DELETE e TRUNCATE. Índice `(tipo, created_at DESC)` (`20261028120900`).
- **`produtos`:** `stock_atual` e `codigo` só mudam por movimentos/sequência (GRANT UPDATE por coluna); artigo criado por `criar_produto(jsonb)`.
- **`colaboradores`:** `nif` só pela RPC `colaborador_nif`; `telemovel`, `email`, `notas` só pela RPC `colaboradores_contactos()` (SELECT de coluna revogado). Colunas novas precisam de `GRANT SELECT (coluna)`.
- **`picagens.client_id`** (uuid, índice único parcial) para reenvio idempotente (`20261028120800`).
- **`faltas`, `resumo_assiduidade_dia`:** SELECT só admin, gestor e o próprio colaborador.
- **Módulos posteriores** (tabelas próprias, todas com RLS e GRANT explícito): obras e relatórios diários, subempreitadas/autos/orçamento EAP, frota e manutenção, combustível/bomba (`comb_*`, `pump_*`), RH (horários, faltas, picagens, EPIs, formações), alertas, faturas de fornecedor, custos, livro de obra, `seguranca_config`, `eventos_seguranca`, schema `privado` (segredos, rate limit).
- **Tipos TypeScript:** `src/integrations/supabase/types.ts` é gerado; tabela ou RPC ainda sem tipos declara-se em `db.ts` do módulo ou usa `rpcSemTipos`.

---

## Migrations Aplicadas (ordem cronológica)

A migration única inicial foi superada por dezenas de migrations incrementais (a lista abaixo cobre só as de junho de 2026; as restantes estão em `supabase/migrations/`, 101 ficheiros em 2026-11-12). O estado de aplicação em produção confirma-se com `supabase/scripts/verificar-migrations.mjs` (`docs/22-seguranca-operacao.md` §7). **A fonte de verdade do schema é sempre `supabase/migrations/`, não este documento.** Lista para referência:

| Ficheiro | O que faz |
|---|---|
| `20260611000000_initial_schema.sql` | Schema inicial completo: enums, 4 tabelas, RLS básica, RPC `registar_movimento` v1 |
| `20260611000001_grants.sql` | GRANTs de PostgREST para `authenticated`/`anon` |
| `20260611000002_gestor_role.sql` | Adiciona `'gestor'` ao enum; restringe INSERT/UPDATE de produtos e config a admin |
| `20260611000003_seed_users.sql` | Confirma emails e ajusta roles dos utilizadores iniciais |
| `20260611000004_produto_crud.sql` | Policy de DELETE em produtos (admin); permite gestor inserir movimentos |
| `20260612000001_default_role_gestor.sql` | Novo signup recebia `gestor` por defeito (substituído por `leitura` em `20261028120600`) |
| `20260612000002_secure_registar_movimento.sql` | Adiciona verificação de role dentro da RPC `registar_movimento` |
| `20260612000003_produto_codigo_seq.sql` | Sequência + RPC `gerar_codigo_produto()` |
| `20260612000004_movimentos_idx_produto.sql` | Índice `(produto_id, created_at DESC)` |
| `20260622000001_fix_profiles_privilege_escalation.sql` | **Crítico** — GRANT a nível de coluna em `profiles`, tabela `audit_log`, RPC `promover_role()` |

Para verificar o estado real do schema em produção a qualquer momento:
```bash
supabase db pull --db-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
```
