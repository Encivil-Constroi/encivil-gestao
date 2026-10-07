// Tipos mínimos do harness de testes de BD (JS), usado por testes TS
declare module '*/supabase/tests/pg-harness.mjs' {
  export function criarBanco(opts?: { ate?: string }): Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
  }>
}
