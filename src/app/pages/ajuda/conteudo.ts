import type { RoleUtilizador } from '@/features/auth/AuthContext'

// Convenção dos passos: o texto entre ** sai a negrito ("Toque em **Guardar** no fim").
// Nunca HTML: tudo é desenhado como texto.
export type PassoGuia = string
export type SecaoGuia = { id: string; titulo: string; resumo: string; rota?: string; passos: PassoGuia[] }
export type PerguntaFaq = { pergunta: string; resposta: string }

export const ROTULOS_PAPEL: Record<RoleUtilizador, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  armazem: 'Armazém',
  medicoes: 'Medições',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
  leitura: 'Leitura',
}

export const ORDEM_PAPEIS: RoleUtilizador[] = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']

export function textoComNegrito(texto: string): Array<{ texto: string; negrito: boolean }> {
  return texto.split('**').map((parte, i) => ({ texto: parte, negrito: i % 2 === 1 }))
}

export const GUIA_RAPIDO: SecaoGuia[] = [
  {
    id: 'entrar',
    titulo: 'Entrar na app',
    resumo: 'Com email ou com o nome de utilizador que o administrador lhe deu',
    passos: [
      'Abra **app.encivilconstroi.com** (ou o ícone ENCIVIL, se já instalou a app).',
      'Escreva o seu email ou o seu nome de utilizador e a palavra-passe.',
      'Administradores e gestores confirmam ainda com o código de 6 dígitos da app de autenticação (verificação em dois passos).',
      'Sem mexer na app durante 30 minutos, a sessão termina sozinha: volte a entrar.',
    ],
  },
  {
    id: 'menu',
    titulo: 'Encontrar o que precisa',
    resumo: 'O menu só mostra o que o seu perfil pode usar',
    passos: [
      'No telemóvel, toque no ícone do menu (três riscos) no topo; no computador o menu está sempre à esquerda.',
      'Cada módulo tem separadores no topo (por exemplo, no Armazém: **Visão geral**, **Inventário**, **Movimentos**, **Ferramentas**, **Obras**).',
      'Se um botão não aparece, o seu perfil não tem permissão para essa ação: fale com o administrador.',
    ],
  },
  {
    id: 'perfil',
    titulo: 'O seu perfil e a palavra-passe',
    resumo: 'Atualizar os seus dados e mudar a palavra-passe',
    rota: '/perfil',
    passos: [
      'No menu, abra **O meu perfil**.',
      'Corrija o nome ou o telemóvel e guarde.',
      'Em **Alterar senha / PIN de acesso**, escreva a atual e a nova duas vezes.',
      'A nova palavra-passe tem de ter 12 ou mais caracteres, com maiúscula, minúscula e número.',
    ],
  },
]

const ARMAZEM_SAIDA: SecaoGuia = {
  id: 'armazem-saida',
  titulo: 'Registar uma saída de material',
  resumo: 'Enviar material para uma obra, vender ou dar baixa por quebra',
  rota: '/armazem/movimento/saida',
  passos: [
    'Abra **Armazém** e toque em **Saída** no topo (ou na saída rápida do artigo, no **Inventário**).',
    'Escolha o tipo: **Para obra**, **Venda comercial** ou **Quebra / perda**.',
    'Escolha o artigo e a quantidade. A app mostra o stock atual e o stock depois da saída.',
    'Para obra: escolha a obra (só aparecem obras em execução). Venda: indique o cliente.',
    'Confirme o responsável e, se quiser, escreva observações.',
    'Toque em **Registar saída**. A app nunca deixa o stock ficar abaixo de zero.',
  ],
}

const ARMAZEM_ENTRADA: SecaoGuia = {
  id: 'armazem-entrada',
  titulo: 'Registar uma entrada de material',
  resumo: 'Compra a fornecedor, devolução de obra ou stock próprio',
  rota: '/armazem/movimento/entrada',
  passos: [
    'Abra **Armazém** e toque em **Entrada** no topo.',
    'Escolha o tipo: **Compra a fornecedor**, **Devolução de obra**, **Stock próprio ENCIVIL** ou **Acerto**.',
    'Escolha o artigo e a quantidade recebida.',
    'Compra: indique o fornecedor, o preço unitário (opcional) e o n.º da fatura. Devolução: indique a obra.',
    'Toque em **Registar entrada**. O stock atualiza logo.',
    'Enganou-se? Os movimentos nunca se apagam: registe outro movimento a corrigir, com uma observação.',
  ],
}

const ARMAZEM_INVENTARIO: SecaoGuia = {
  id: 'armazem-inventario',
  titulo: 'Consultar o inventário',
  resumo: 'Stock de cada artigo, estado e artigos em falta',
  rota: '/armazem/inventario',
  passos: [
    'Abra **Armazém** e o separador **Inventário**.',
    'Pesquise o artigo pelo nome. Cada artigo mostra a foto, o stock e o estado: **ok**, **baixo** ou **sem stock**.',
    'Toque no artigo para ver a ficha e o histórico de movimentos.',
    'Para criar um artigo novo use **Novo artigo** (com foto da câmara, de um ficheiro ou colada com Ctrl+V).',
    'Contou o stock e não bate certo? A **Contagem de inventário** (em **Entrada**) fixa o valor contado e é feita por um gestor ou administrador.',
  ],
}

const ARMAZEM_FERRAMENTAS: SecaoGuia = {
  id: 'armazem-ferramentas',
  titulo: 'Emprestar e receber ferramentas',
  resumo: 'Entregar uma ferramenta a um funcionário e registar a devolução',
  rota: '/armazem/ferramentas',
  passos: [
    'Abra **Armazém** e o separador **Ferramentas**. O estado de cada uma está à vista: disponível, emprestada, em atraso ou manutenção.',
    'Para entregar, toque em **Emprestar**, escolha a ferramenta (só as disponíveis) e o funcionário.',
    'Tire a foto do estado da ferramenta com a câmara (obrigatória) e guarde.',
    'Na devolução, abra a ferramenta e toque em **Devolução**. Tire a foto do estado em que voltou.',
    'Se voltou danificada, vai para manutenção; se foi perdida, fica inativa.',
  ],
}

const ARMAZEM_OBRAS: SecaoGuia = {
  id: 'armazem-obras',
  titulo: 'Ver o material de cada obra',
  resumo: 'O que foi enviado, devolvido e as ferramentas que estão em cada obra',
  rota: '/armazem/obras',
  passos: [
    'Abra **Armazém** e o separador **Obras**.',
    'Cada obra em execução mostra os materiais (enviado menos devolvido, com valor) e as ferramentas emprestadas.',
    'Use o separador **Movimentos** para ver o histórico completo e exportar para Excel.',
  ],
}

const PEDIR_COMBUSTIVEL: SecaoGuia = {
  id: 'pedir-combustivel',
  titulo: 'Pedir combustível',
  resumo: 'Fazer um pedido de abastecimento e esperar a autorização',
  rota: '/abastecimento/pedir',
  passos: [
    'No menu, toque em **Pedir combustível** (os outros perfis: em **Abastecimento**).',
    'O seu nome e a viatura que lhe está atribuída já vêm preenchidos; confirme ou escolha a viatura.',
    'Escolha onde vai abastecer (**Bomba Polo 2**, **Carrinha** ou **Posto de rua**) e o combustível.',
    'Tire a foto dos km do painel na hora (a câmara abre sozinha). Confirme ou corrija os km lidos.',
    'Envie o pedido. Quem aprova recebe logo uma notificação; a resposta chega-lhe no telemóvel.',
  ],
}

const ABASTECER_POLO2: SecaoGuia = {
  id: 'abastecer-polo2',
  titulo: 'Abastecer depois de autorizado',
  resumo: 'Ligar a bomba da Polo 2 ou registar o talão do posto',
  rota: '/abastecimento',
  passos: [
    'Abra **Os meus pedidos** e toque no pedido autorizado.',
    'Na Polo 2: tire a foto do contador da bomba e toque em **LIGAR BOMBA**.',
    'Abasteça e toque em **Terminei**. Tire a foto do contador no fim.',
    'Posto de rua ou carrinha: tire a foto do talão (litros e valor) ou do medidor.',
    'O abastecimento fica registado com as fotos e as horas de cada passo.',
  ],
}

const APROVAR_COMBUSTIVEL: SecaoGuia = {
  id: 'aprovar-combustivel',
  titulo: 'Autorizar pedidos de combustível',
  resumo: 'Só para quem foi designado aprovador (sem designados, os administradores)',
  rota: '/abastecimento',
  passos: [
    'Abra **Abastecimento**, separador **Pedidos**. O número no menu diz quantos esperam decisão.',
    'Os pedidos à espera aparecem do mais antigo para o mais recente; mais de 1 hora é crítico.',
    'Toque em **Autorizar** ou em **Recusar** (com motivo). O motorista recebe a decisão no telemóvel.',
    'Em **Análise** veja custos, consumos e o que os números dizem, comparados com o período anterior.',
  ],
}

const OBRAS_CONSULTAR: SecaoGuia = {
  id: 'obras-consultar',
  titulo: 'Acompanhar as obras',
  resumo: 'Painel, ficha da obra, custos e relatórios diários',
  rota: '/obras',
  passos: [
    'Abra **Obras**. O **Painel** mostra progresso, prazo, custos e ocorrências de cada obra.',
    'Toque numa obra para abrir a ficha: Resumo, Progresso, Equipa, Frota, Ferramentas, Materiais, Subempreitadas, Relatórios, Fotos e Atividade.',
    'No separador **Relatórios diários** veja o que foi feito em cada dia.',
  ],
}

const RELATORIO_DIARIO: SecaoGuia = {
  id: 'relatorio-diario',
  titulo: 'Preencher o relatório diário da obra',
  resumo: 'Clima, trabalhos, equipa presente e ocorrências',
  rota: '/obras/relatorios',
  passos: [
    'Abra a ficha da obra e crie um novo relatório diário.',
    'Indique o clima, os trabalhos feitos e quem da equipa esteve presente.',
    'Se houve ocorrências, descreva-as e junte fotografia.',
    'Pode guardar como rascunho e acabar mais tarde. Depois de submetido já não se altera (só um administrador o reabre, com motivo).',
  ],
}

const AUTOS: SecaoGuia = {
  id: 'autos',
  titulo: 'Fazer um auto de medição',
  resumo: 'Medir o trabalho de um subempreiteiro e enviar para verificação',
  rota: '/obras/subempreitadas',
  passos: [
    'Abra **Obras**, separador **Subempreitadas**, e toque no subempreiteiro.',
    'Toque em **Novo Auto de Medição**.',
    'Indique as quantidades executadas de cada item (nunca acima do contratado).',
    'Junte as fotografias tiradas na obra com a câmara (com localização).',
    'Toque em **Submeter para verificação**. O auto segue: Submetido, Verificado, Aprovado, Fatura guardada, Pago.',
    'Quem cria o auto não o aprova; acima da alçada ou com trabalhos a mais aprova só o administrador.',
  ],
}

const FROTA_MANUTENCAO: SecaoGuia = {
  id: 'frota-manutencao',
  titulo: 'Registar uma manutenção ou revisão',
  resumo: 'Revisões, reparações e custos de cada viatura ou máquina',
  rota: '/frota/manutencao',
  passos: [
    'Abra **Frota**, separador **Manutenção**, e toque em **Registar manutenção**.',
    'Escolha a viatura pela matrícula: a app puxa a última revisão e a leitura atual.',
    'Indique a data, os km ou horas, o tipo (da lista ou "outro"), o custo, a oficina e observações.',
    'Guarde. Uma revisão periódica atualiza sozinha a "última revisão" da viatura.',
    'Para a revisão com checklist, use a **Ficha de revisão** no mesmo separador.',
    'Errou? Edite o registo: a app guarda o antes e o depois e quem corrigiu.',
  ],
}

const FROTA_ENTREGAS: SecaoGuia = {
  id: 'frota-entregas',
  titulo: 'Entregar e receber uma viatura',
  resumo: 'Passar uma viatura a um condutor e registar a devolução',
  rota: '/frota/entregas',
  passos: [
    'Abra **Frota**, separador **Entregas**, e toque em **Entregar viatura**.',
    'Escolha o condutor, a obra (opcional), os km ou horas e o nível de combustível.',
    'Verifique óleo, pneus, limpeza e o inventário de segurança; marque os danos no mapa da viatura.',
    'Na devolução use **Devolver viatura**: a app mostra a entrega ao lado e separa os danos novos.',
  ],
}

const FROTA_CONSULTAR: SecaoGuia = {
  id: 'frota-consultar',
  titulo: 'Consultar a frota',
  resumo: 'Quem tem cada viatura, revisões, seguro e IPO',
  rota: '/frota/viaturas',
  passos: [
    'Abra **Frota**, separador **Viaturas e máquinas**.',
    'Filtre por Livres, Em uso ou Oficina, por obra ou pela matrícula.',
    'Toque numa viatura para ver a ficha: seguro e IPO com foto (para mostrar à GNR) e a linha do tempo.',
  ],
}

const RELATORIOS: SecaoGuia = {
  id: 'relatorios',
  titulo: 'Tirar relatórios',
  resumo: 'Stock, movimentos, consumos e ferramentas, para imprimir ou guardar em PDF',
  rota: '/relatorios',
  passos: [
    'No menu, abra **Relatórios**.',
    'Escolha o relatório e o período (e a obra ou o artigo, quando pedido).',
    'Toque em **Imprimir** ou **Exportar PDF**. No diálogo de impressão, escolha "Guardar como PDF" no destino.',
    'Para Excel: o histórico de **Movimentos** do Armazém e a **Análise** do Abastecimento têm exportação própria.',
  ],
}

const COLABORADORES: SecaoGuia = {
  id: 'colaboradores',
  titulo: 'Gerir colaboradores',
  resumo: 'Equipa, fichas, horários e faltas',
  rota: '/colaboradores',
  passos: [
    'No menu, abra **Recursos Humanos**.',
    'Em **Equipa** veja e edite as fichas dos colaboradores.',
    'Em **Criar perfil** registe um colaborador novo.',
    'Use **Horários** e **Faltas** para o dia a dia da equipa.',
  ],
}

const ALERTAS: SecaoGuia = {
  id: 'alertas',
  titulo: 'Ver os alertas',
  resumo: 'Revisões, seguro, IPO, documentos, EPIs e formações a vencer',
  rota: '/alertas',
  passos: [
    'No menu, abra **Alertas**.',
    'Veja o que está a vencer ou já venceu e trate primeiro o que está a vermelho.',
  ],
}

const CONTABILIDADE: SecaoGuia = {
  id: 'contabilidade',
  titulo: 'Exportar para a contabilidade',
  resumo: 'Dados prontos para enviar ao contabilista',
  rota: '/exportacao-contabilidade',
  passos: [
    'No menu, abra **Contabilidade**.',
    'Escolha o período e o que quer exportar.',
    'Descarregue o ficheiro e envie-o ao contabilista.',
  ],
}

const OBRAS_GERIR: SecaoGuia = {
  id: 'obras-gerir',
  titulo: 'Criar e gerir uma obra',
  resumo: 'Dados da obra, equipa e autores dos relatórios diários',
  rota: '/obras/lista',
  passos: [
    'Abra **Obras**, separador **Obras**, e crie uma obra nova ou abra uma existente.',
    'Preencha os dados, o estado (planeada, ativa, suspensa ou concluída) e a localização no mapa.',
    'Na ficha da obra, defina a equipa e quem pode preencher os relatórios diários.',
  ],
}

const UTILIZADORES: SecaoGuia = {
  id: 'utilizadores',
  titulo: 'Criar e gerir utilizadores',
  resumo: 'Contas de acesso à app e perfil de cada pessoa',
  rota: '/gestao-utilizadores',
  passos: [
    'No menu, abra **Recursos Humanos** e o separador **Utilizadores**.',
    'Toque em **Novo utilizador**. Com email, a pessoa entra com o email; sem email, recebe um nome de utilizador.',
    'Escolha o perfil (Administrador, Gestor, Armazém, Medições, Mecânico, Motorista ou Leitura).',
    'O perfil decide o que a pessoa vê e pode fazer; a segurança real está na base de dados.',
  ],
}

const RECUPERAR_DE_ALGUEM: SecaoGuia = {
  id: 'recuperar-alguem',
  titulo: 'Recuperar o acesso de um funcionário',
  resumo: 'Enviar um link pessoal por WhatsApp a quem esqueceu a palavra-passe',
  rota: '/gestao-utilizadores',
  passos: [
    'Abra **Recursos Humanos**, separador **Utilizadores**, e o menu da pessoa.',
    'Toque em **Link de recuperação**. A app cria um link pessoal, válido cerca de 1 hora.',
    'Toque em **Enviar por WhatsApp** (ou em **Copiar link** e envie como preferir).',
    'A pessoa abre o link, cria a palavra-passe nova e entra logo na app.',
    'Em alternativa, **Redefinir senha** define-a diretamente; diga-a à pessoa em privado.',
  ],
}

const AUDITORIA: SecaoGuia = {
  id: 'auditoria',
  titulo: 'Ver quem fez o quê',
  resumo: 'Registo de alterações e eventos de segurança',
  rota: '/auditoria',
  passos: [
    'No menu, abra **Auditoria**.',
    'Filtre por pessoa, módulo, tipo de alteração ou período.',
    'Abra um registo para ver o antes e o depois de cada campo.',
    'Consulte também os eventos de segurança: entradas falhadas, verificação em dois passos e recuperações de acesso.',
  ],
}

const BACKUP: SecaoGuia = {
  id: 'backup',
  titulo: 'Fazer um backup',
  resumo: 'Cópia dos dados para guardar fora da app',
  rota: '/backup',
  passos: [
    'No menu, abra **Configurações** e toque em **Fazer Backup**.',
    'Descarregue a cópia e guarde-a num local seguro, fora deste computador.',
    'A página de Configurações mostra a data do último backup feito neste aparelho.',
  ],
}

const MFA: SecaoGuia = {
  id: 'mfa',
  titulo: 'Ativar a verificação em dois passos',
  resumo: 'Obrigatória para administradores e gestores',
  rota: '/seguranca/mfa',
  passos: [
    'Instale no telemóvel uma app de autenticação (por exemplo Google Authenticator ou Microsoft Authenticator).',
    'Abra **O meu perfil** e, em **Segurança**, toque em **Verificação em dois passos**.',
    'Leia o código QR com a app de autenticação e escreva o código de 6 dígitos que ela mostra.',
    'A partir daí, depois da palavra-passe a app pede o código do momento.',
    'Mudou de telemóvel? Peça a um administrador para remover a verificação e registe-a de novo.',
  ],
}

const CONSULTAR: SecaoGuia = {
  id: 'consultar',
  titulo: 'Consultar sem alterar',
  resumo: 'O perfil Leitura vê os módulos mas não regista nada',
  rota: '/armazem',
  passos: [
    'Use o menu para consultar **Armazém**, **Abastecimento**, **Frota**, **Obras** e **Relatórios**.',
    'Os botões para registar ou alterar não aparecem no seu perfil.',
    'Precisa de registar algo? Peça ao administrador para mudar o seu perfil.',
  ],
}

export const GUIAS_POR_PAPEL: Record<RoleUtilizador, SecaoGuia[]> = {
  admin: [
    UTILIZADORES, RECUPERAR_DE_ALGUEM, AUDITORIA, BACKUP, MFA, APROVAR_COMBUSTIVEL,
    OBRAS_GERIR, AUTOS, COLABORADORES, RELATORIOS,
  ],
  gestor: [
    APROVAR_COMBUSTIVEL, RELATORIOS, COLABORADORES, ALERTAS, OBRAS_GERIR, AUTOS,
    CONTABILIDADE, MFA, ARMAZEM_SAIDA, ARMAZEM_ENTRADA,
  ],
  armazem: [
    ARMAZEM_SAIDA, ARMAZEM_ENTRADA, ARMAZEM_INVENTARIO, ARMAZEM_FERRAMENTAS, ARMAZEM_OBRAS,
    PEDIR_COMBUSTIVEL, FROTA_CONSULTAR,
  ],
  medicoes: [AUTOS, RELATORIO_DIARIO, OBRAS_CONSULTAR, PEDIR_COMBUSTIVEL, RELATORIOS],
  mecanico: [FROTA_MANUTENCAO, FROTA_ENTREGAS, FROTA_CONSULTAR],
  motorista: [PEDIR_COMBUSTIVEL, ABASTECER_POLO2],
  leitura: [CONSULTAR, OBRAS_CONSULTAR, FROTA_CONSULTAR, RELATORIOS],
}

export const RECUPERAR_ACESSO: SecaoGuia = {
  id: 'recuperar-acesso',
  titulo: 'Esqueci-me da palavra-passe',
  resumo: 'Com email: recupere sozinho. Sem email (entra com nome de utilizador): peça ao administrador.',
  passos: [
    'Tem email na conta? No ecrã de entrada toque em **Esqueceu a palavra-passe?**, escreva o email e abra o link que recebe.',
    'Entra com nome de utilizador (sem email)? Peça a um administrador um link de recuperação.',
    'O administrador envia-lhe por WhatsApp um link pessoal, válido cerca de 1 hora. Não o partilhe.',
    'Abra o link, toque em **Continuar** e crie a palavra-passe nova: 12 ou mais caracteres, com maiúscula, minúscula e número.',
    'Tem verificação em dois passos? A app pede também o código de 6 dígitos antes de guardar.',
    'Guarde e entra logo na app. O navegador pode oferecer-se para guardar a palavra-passe.',
    'O link expirou ou já foi usado? Peça um novo ao administrador.',
  ],
}

export const FAQ: PerguntaFaq[] = [
  {
    pergunta: 'Não vejo um módulo ou um botão. Porquê?',
    resposta: 'O menu e os botões dependem do seu perfil. Se precisa de outra permissão, peça ao administrador.',
  },
  {
    pergunta: 'Saí da app sem querer. O que aconteceu?',
    resposta: 'Por segurança, a sessão termina após 30 minutos sem atividade. Basta voltar a entrar.',
  },
  {
    pergunta: 'Enganei-me num movimento de stock. Posso apagá-lo?',
    resposta: 'Não. O histórico de movimentos nunca se apaga nem se altera. Registe um movimento de correção com uma observação a explicar.',
  },
  {
    pergunta: 'Fiquei sem rede na obra. Perco o que registei?',
    resposta: 'Os movimentos do armazém registados sem rede ficam guardados no aparelho e são enviados quando a ligação voltar. Não feche a sessão antes disso.',
  },
  {
    pergunta: 'Mudei de telemóvel e a app pede o código de verificação. E agora?',
    resposta: 'Peça a um administrador para remover a verificação em dois passos da sua conta e registe-a de novo no telemóvel novo.',
  },
  {
    pergunta: 'Não recebo notificações no telemóvel. O que faço?',
    resposta: 'Instale a app no ecrã principal (veja "Instalar no telemóvel") e aceite as notificações quando a app pedir. No iPhone as notificações só funcionam com a app instalada.',
  },
  {
    pergunta: 'O link de recuperação diz que expirou. O que faço?',
    resposta: 'O link vale cerca de 1 hora e só pode ser usado uma vez. Peça um novo ao administrador ou use "Esqueceu a palavra-passe?" se tiver email.',
  },
  {
    pergunta: 'A app mostra "Nova versão disponível". É normal?',
    resposta: 'Sim. A app foi atualizada: toque em Recarregar App para continuar com a versão nova.',
  },
]

// Sem acentos e sem maiúsculas, para "saida" encontrar "Saída"
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarSecoes(secoes: SecaoGuia[], termo: string): SecaoGuia[] {
  const q = normalizar(termo.trim())
  if (!q) return secoes
  return secoes.filter(s => normalizar([s.titulo, s.resumo, ...s.passos].join(' ')).includes(q))
}

export function filtrarFaq(faq: PerguntaFaq[], termo: string): PerguntaFaq[] {
  const q = normalizar(termo.trim())
  if (!q) return faq
  return faq.filter(f => normalizar(`${f.pergunta} ${f.resposta}`).includes(q))
}
