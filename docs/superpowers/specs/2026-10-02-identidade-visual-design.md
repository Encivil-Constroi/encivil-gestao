# ENCIVIL Gestão — identidade visual unificada

## Objetivo e autorização
Atualizar a apresentação de todas as áreas existentes com a estética neutra do tema Vercel fornecido pelo utilizador, respeitando a marca ENCIVIL. O utilizador delegou decisões, revisão/aprovação do plano e execução autónoma com subagentes. Não executar comandos Git, commits, push, deploy nem criar branches/worktrees; há trabalho simultâneo do Claude neste checkout.

## Decisão de desenho
Foram consideradas: substituição literal dos tokens (deixaria incompatibilidades), redesenho completo dos layouts (risco e âmbito desnecessários), e atualização dos tokens com normalização dos componentes e exceções locais. Adota-se a terceira opção.

- Cores oficiais: preto `#04090F` e azul `#001C7D`.
- Claro: fundo quase branco, cartões brancos, texto e ação principal preto oficial, bordas neutras. Escuro: fundo preto oficial, superfícies grafite, texto claro e ação principal clara com texto escuro.
- Azul oficial para identidade (`brand`), com token informativo legível adaptado ao modo escuro. Não tornar a interface inteira azul.
- Estados: sucesso verde, aviso âmbar, erro/destrutivo vermelho e informação azul; sempre acompanhados por texto ou ícone. Contraste de texto normal mínimo 4,5:1 nos pares semânticos sólidos; controlos identificáveis e foco visível.
- Geist e Geist Mono alojadas localmente, com licença; se aquisição não for possível, documentar fallback de sistema. Não depender de um pedido a serviço de fontes em runtime.
- Raio base 8px; escala consistente, sombras discretas e neutras. Preservar dimensões úteis dos controlos e densidade dos dados. Respeitar redução de movimento.
- Logótipo existente preservado, com tratamento monocromático apenas de apresentação quando necessário. Não redesenhar a marca nem gerar imagens.
- Gráficos mantêm cores distinguíveis, eixos/texto adaptados ao tema; relatórios de impressão continuam com papel branco e tinta escura explícitos.

## Âmbito e limites
Tokens, CSS global, componentes partilhados, navegação, autenticação, páginas de gestão e componentes visuais dos módulos existentes. Não alterar serviços, regras de negócio, autorizações, dados, schemas ou rotas. Não inserir atalhos de autenticação para testes.
O Claude está a alterar `src/features/obras/components/subempreitadas/AutoDetailPage.tsx`, `AutoFormPage.tsx` e o diretório `auto/`; não editar esses caminhos. As suas superfícies herdam os tokens comuns. Não modificar artefactos de outras tarefas em `.superpowers/`.

## Validação
Inventário de cores locais e incompatibilidades (texto branco com primary invertido, inputs sem fundo, gráficos fixos). Typecheck, suite completa e build. Agent-browser em Vite local: login/reset, claro/escuro, desktop 1440 e mobile 390; percorrer áreas internas se sessão autorizada disponível. Sem credenciais, usar harness efémero local com fixtures e interceção de rede, sem mudar guardas de produção, identificando explicitamente a simulação no relatório. Nunca escrever no Supabase real.

## Documentação e aceitação
Atualizar `docs/06-ux-ui.md` e `CLAUDE.md` com tokens e convenções efetivamente implementados. Registar ficheiros alterados, verificações, cobertura visual e limitações. Não declarar validação autenticada real se só foi possível simulação. Nenhuma publicação.
