# /migration — Fluxo seguro de migration Supabase

Segue este fluxo **sempre** que criar ou aplicar uma migration:

## Ao criar uma nova migration

1. Criar o ficheiro em `supabase/migrations/YYYYMMDDHHMMSS_nome_descritivo.sql`

2. **Verificar GRANTs** — antes de continuar, confirmar que o SQL inclui GRANTs explícitos para TODAS as tabelas e funções novas:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nova_tabela TO authenticated;
   GRANT EXECUTE ON FUNCTION public.nova_funcao(UUID) TO authenticated;
   -- Para sequências (se usadas):
   GRANT USAGE ON SEQUENCE public.nova_seq TO authenticated;
   ```
   **Porquê:** "Automatically expose new tables" está DESATIVADO no Supabase desta organização.

3. **RLS** — se a tabela for nova, ativar RLS e criar políticas:
   ```sql
   ALTER TABLE public.nova_tabela ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "authenticated_all" ON public.nova_tabela
     FOR ALL TO authenticated USING (true) WITH CHECK (true);
   -- Ajustar conforme as regras de negócio (filtros por user_id, papel, etc.)
   ```

## Ao aplicar a migration

4. Aplicar via **Supabase Dashboard → SQL Editor** (copiar e colar o conteúdo SQL).
   - Ou via CLI se configurado: `supabase db push`

5. **Regenerar tipos TypeScript**:
   ```sh
   npx supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```
   Se usar remote:
   ```sh
   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
   ```

6. **Verificar tipos** — `npm run typecheck` deve dar 0 erros.

7. **Commitar** os ficheiros da migration + `src/integrations/supabase/types.ts` juntos num único commit.

## Checklist rápido
- [ ] GRANT em todas as tabelas novas
- [ ] GRANT EXECUTE em todas as RPCs novas
- [ ] RLS ativado e políticas criadas
- [ ] Tipos regenerados
- [ ] `npm run typecheck` = 0 erros
