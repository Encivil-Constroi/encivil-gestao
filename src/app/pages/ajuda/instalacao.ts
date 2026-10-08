export type Plataforma = 'ios' | 'android' | 'desktop' | 'instalada'

// O iPadOS identifica-se como "Macintosh"; só o ecrã tátil o distingue de um Mac.
export function detetarPlataforma(ua: string, standalone: boolean, maxTouchPoints = 0): Plataforma {
  if (standalone) return 'instalada'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export const ROTULOS_PLATAFORMA: Record<Exclude<Plataforma, 'instalada'>, string> = {
  ios: 'iPhone e iPad',
  android: 'Android',
  desktop: 'Computador',
}

export const PASSOS_INSTALACAO: Record<Exclude<Plataforma, 'instalada'>, string[]> = {
  ios: [
    'Abra a app no **Safari** (no iPhone só o Safari instala apps da Internet).',
    'Toque no botão **Partilhar** (o quadrado com uma seta para cima), em baixo ou no topo do ecrã.',
    'Desça na lista e toque em **Adicionar ao ecrã principal**.',
    'Confirme em **Adicionar**. O ícone ENCIVIL aparece junto das outras apps.',
    'Abra sempre a app por esse ícone: abre em ecrã inteiro e recebe as notificações.',
  ],
  android: [
    'Abra a app no **Chrome**.',
    'Toque no botão **Instalar app** desta página ou, no Chrome, no menu **⋮** (três pontos).',
    'Escolha **Instalar aplicação** (ou **Adicionar ao ecrã principal**).',
    'Confirme em **Instalar**. O ícone ENCIVIL aparece no ecrã principal.',
  ],
  desktop: [
    'Abra a app no **Chrome** ou no **Edge**.',
    'Clique no botão **Instalar app** desta página ou no ícone de instalar, à direita da barra de endereço.',
    'Confirme em **Instalar**. A app abre numa janela própria e fica no menu Iniciar.',
  ],
}
