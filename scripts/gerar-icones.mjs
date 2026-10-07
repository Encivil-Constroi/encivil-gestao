import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publico = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const LOGO = `
<polygon points="359,424 512,300 722,423 722,449 512,330 370,449"/>
<polygon points="513,368 720,474 720,497 513,402"/>
<polygon points="513,429 720,518 720,542 513,465"/>
<polygon points="513,490 720,567 720,590 513,523"/>
<polygon points="513,549 720,606 720,631 513,587"/>
<polygon points="513,614 720,656 720,685 513,654"/>
<polygon points="513,683 720,707 720,734 513,719"/>
<polygon points="360,751 720,754 720,781 360,779"/>`

const svg = ({ escala, raio }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" rx="${raio}" fill="#04090F"/>
<g fill="#FFFFFF" transform="translate(256 256) scale(${escala}) translate(-540.5 -540.5)">${LOGO}</g></svg>
`

writeFileSync(join(publico, 'icon.svg'), svg({ escala: 0.68, raio: 96 }))

const alvos = [
  ['pwa-64x64.png', 64, { escala: 0.68, raio: 96 }],
  ['pwa-192x192.png', 192, { escala: 0.68, raio: 96 }],
  ['pwa-512x512.png', 512, { escala: 0.68, raio: 96 }],
  ['maskable-icon-512x512.png', 512, { escala: 0.58, raio: 0 }],
  ['apple-touch-icon-180x180.png', 180, { escala: 0.62, raio: 0 }],
  ['favicon.ico', 32, { escala: 0.74, raio: 6 }],
]

for (const [nome, tam, opcoes] of alvos) {
  await sharp(Buffer.from(svg(opcoes))).resize(tam).png().toFile(join(publico, nome))
}
console.log('Ícones gerados.')
