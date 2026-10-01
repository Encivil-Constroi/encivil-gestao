import { Navigate, useLocation, useParams } from 'react-router'

// Endereços antigos (favoritos, QR impressos, notificações já enviadas) continuam
// a funcionar: troca os :parametros e mantém a query (?pedido=, ?v=)
export function Redirecionar({ para }: { para: string }) {
  const params = useParams()
  const { search } = useLocation()
  const destino = para.replace(/:([A-Za-z]+)/g, (_, nome: string) => encodeURIComponent(params[nome] ?? ''))
  return <Navigate to={`${destino}${search}`} replace />
}
