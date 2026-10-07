# Auditoria de produção de Obras — 2026-10-07

## Objetivo e limites
Permitir à engenharia abrir obras, aferir progresso e guardar/submeter relatórios com evidências e autorização coerentes. Corrigir falhas demonstradas, preservar contratos públicos e fronteiras, sem reescrita global. Produção é apenas leitura; migrations são entregues para aplicação manual, conforme CLAUDE.md. Não há dispositivos físicos neste escopo.

## Diagnóstico e decisões
1. `obra_visao` devolve um único composto `obra_resumo`, enquanto `db.ts` declara array e `buscarVisao` lê `[0]`. PostgREST serializa composto não SETOF como objeto. Corrigir tipagem e aceitar objeto; tolerar array legado na fronteira, sem alterar SQL público. Confirmar a resposta real em leitura autenticada.
2. Fotos: o callback após upload usa lista antiga; o pai pode submeter antes de receber fotos. Manter a lista atual por ref, comunicar upload por callback opcional e bloquear conclusão/cancelamento durante upload e gravação. Não fazer retry automático de escrita não idempotente.
3. Relatórios: autores designados `leitura` são indevidamente excluídos na UI; faltam invalidações de fotos, eventos e últimos relatórios. Alinhar com autorização SQL existente. Proteger saída com alterações não guardadas e congelar edição enquanto submete; manter autosave serializado.
4. Autos: autoria pode ser falsificada por INSERT direto. Trigger deve atribuir auth.uid() em operações autenticadas e impedir mudança posterior; manter autoria histórica e importações privilegiadas. Custos devem verificar `pode_ver_obra`.
5. Evidências: paths inexistentes podem ser aceites. Trigger deve exigir objeto de imagem no bucket `obras`, com caminho esperado já validado pela RPC; impedir remoção/mutação do objeto após vinculação. Aplicar também às fotos JSON de aferições, relatórios, ocorrências e autos e à galeria. Novos vínculos exigem objeto; submissão de relatório e verificação/aprovação/pagamento de auto revalidam os arquivos referenciados. Não apagar evidências antigas nem fingir que GPS/hash enviados pelo browser são prova criptográfica do conteúdo. Essa limitação continua documentada.

## Alternativas consideradas
- Corrigir apenas abertura: insuficiente para o pedido crítico e para falhas de evidência/autorização.
- Reescrever persistência e upload em novo backend: altera contratos e aumenta risco sem necessidade.
- Escolhida: correções locais no frontend e migration aditiva de proteção no servidor, mantendo Supabase como fonte de verdade.

## Critérios de aceite
- Ficha existente abre com resposta real do backend; inexistente/negada/rede conservam erro e retry.
- Engenharia regista fases e aferições; leitura comum não escreve, autor designado escreve apenas conforme SQL.
- Fotos e legendas não são perdidas durante upload; gravação/submissão espera envio.
- Relatório não perde silenciosamente alterações na saída, não aceita edição durante submissão, e atualiza caches relacionados.
- Autor de auto não pode ser forjado ou alterado por cliente; custos negam papéis sem acesso; evidência nova exige objeto e fica protegida.
- Testes locais de UI/serviço/banco, regressão, typecheck e build passam; validação de produção somente leitura e limites registrados.

## Riscos e publicação
Nova proteção de evidências pode revelar arquivos faltantes; listar inconsistências antes da aplicação sem eliminar dados. Migrations novas em ordem crescente, GRANT/REVOKE explícitos e search_path fixo. Rollback lógico preserva dados e exige restaurar funções anteriores apenas para falha operacional, sem publicar novamente vulnerabilidades. Sem confirmação de migrations e validação por papel no ambiente real, não emitir garantia absoluta de produção.
