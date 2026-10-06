// href tel: aceite por Android e iOS (abre a app Telefone, também na PWA).
// Números sem indicativo ficam como estão; o telemóvel português tem 9 dígitos.
export function hrefTel(telemovel: string | undefined | null): string | null {
  const limpo = (telemovel ?? '').replace(/[^\d+]/g, '')
  return limpo.replace(/\D/g, '').length >= 9 ? `tel:${limpo}` : null
}
