import { Navigate, useLocation } from 'react-router'

// O QR colado nas viaturas aponta para /pub/combustivel?v=<viatura>. Desde o
// abastecimento v2 não há pedido sem sessão: segue para /abastecer?v=… (o
// AuthGuard pede o login e volta para lá)
export function QrCombustivel() {
  const { search } = useLocation()
  return <Navigate to={`/abastecer${search}`} replace />
}
