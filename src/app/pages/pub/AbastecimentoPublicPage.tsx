import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import {
  Fuel, CheckCircle2, AlertTriangle, Camera, X,
  Clock, Loader2, ChevronRight, Droplets, Truck, ShoppingBag,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useFormGuard } from '@/app/lib/useFormGuard'

// Página pública — sem auth. Acedida via QR code colado na viatura.
// URL: /pub/combustivel?v=UUID_VIATURA&vn=Nome+da+Viatura
//
// Fluxo (4 passos):
//   1. Escolher tipo (Polo 2 / Carrinha / Posto de rua)
//   2. Nome + km → "Pedir Autorização"
//   3. Aguardar autorização do responsável (polling a cada 3s, max 10 min)
//   4. Tirar foto → Gemini extrai litros/custo → Confirmar

type TipoFonte = 'POLO2' | 'CARRINHA' | 'POSTO_RUA'
type Passo = 'TIPO' | 'FORM' | 'AGUARDAR' | 'FOTO' | 'DONE' | 'REJEITADO'

const TIPO_CONFIG: Record<TipoFonte, {
  label:    string
  desc:     string
  icon:     typeof Fuel
  cor:      string
  corFundo: string
}> = {
  POLO2:    { label: 'Polo 2',    desc: 'Bomba do depósito fixo',  icon: Droplets,   cor: 'text-blue-700',   corFundo: 'bg-blue-50 border-blue-200'    },
  CARRINHA: { label: 'Carrinha',  desc: 'Viatura de transporte',   icon: Truck,      cor: 'text-amber-700',  corFundo: 'bg-amber-50 border-amber-200'  },
  POSTO_RUA:{ label: 'Posto Rua', desc: 'Posto comercial de rua',  icon: ShoppingBag,cor: 'text-emerald-700', corFundo: 'bg-emerald-50 border-emerald-200'},
}

const todayStr = () => new Date().toISOString().split('T')[0]

// Max polling attempts before showing timeout message (200 × 3s ≈ 10 min)
const MAX_POLL = 200

export function AbastecimentoPublicPage() {
  const [params]    = useSearchParams()
  const vehicleId   = params.get('v')
  const vehicleName = params.get('vn') ?? 'Viatura'

  const [passo,          setPasso]          = useState<Passo>('TIPO')
  const [tipo,           setTipo]           = useState<TipoFonte | null>(null)
  const [nome,           setNome]           = useState('')
  const [km,             setKm]             = useState('')
  const [pendId,         setPendId]         = useState<string | null>(null)
  const [foto,           setFoto]           = useState<File | null>(null)
  const [fotoPreview,    setFotoPreview]    = useState<string | null>(null)
  const [uploadedFotoUrl,setUploadedFotoUrl]= useState<string>('')  // saved after upload (A2)
  const [litros,         setLitros]         = useState<number | null>(null)
  const [custo,          setCusto]          = useState<number | null>(null)
  const [confianca,      setConfianca]      = useState<string | null>(null)
  const [geminiError,    setGeminiError]    = useState(false)   // true only on Gemini failures (A1)
  const [saving,         setSaving]         = useState(false)
  const [err,            setErr]            = useState('')
  const [pollTimedOut,   setPollTimedOut]   = useState(false)
  const [litrosManual,   setLitrosManual]   = useState('')
  const [custoManual,    setCustoManual]    = useState('')

  const fotoRef      = useRef<HTMLInputElement>(null)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  // ── Polling do estado após pedido de autorização ──────────────────────────
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (passo !== 'AGUARDAR' || !pendId) return
    pollCountRef.current = 0
    pollRef.current = setInterval(async () => {
      pollCountRef.current++
      if (pollCountRef.current > MAX_POLL) {
        stopPoll()
        setPollTimedOut(true)
        return
      }
      const { data, error: pollErr } = await supabase
        .from('comb_abastecimentos_pendentes')
        .select('estado')
        .eq('id', pendId)
        .single()
      if (pollErr) {
        // Erros de rede transitórios não interrompem o polling — tentar de novo no próximo tick
        console.warn('poll error:', pollErr.message)
        return
      }
      const row = data as { estado?: string } | null
      if (row?.estado === 'AUTORIZADO') { stopPoll(); setPasso('FOTO') }
      if (row?.estado === 'REJEITADO')  { stopPoll(); setPasso('REJEITADO') }
    }, 3_000)
    return stopPoll
  }, [passo, pendId, stopPoll])

  // ── Foto ──────────────────────────────────────────────────────────────────
  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setFoto(file)
    setLitros(null); setCusto(null); setConfianca(null)
    setGeminiError(false); setErr('')
    setUploadedFotoUrl('')
    if (file) {
      const reader = new FileReader()
      reader.onload = ev => setFotoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setFotoPreview(null)
    }
  }

  function clearFoto() {
    setFoto(null); setFotoPreview(null)
    setLitros(null); setCusto(null); setConfianca(null)
    setGeminiError(false); setErr('')
    setUploadedFotoUrl('')
    setLitrosManual(''); setCustoManual('')
    if (fotoRef.current) fotoRef.current.value = ''
  }

  // ── Passo 2: submeter pedido de autorização ───────────────────────────────
  const handlePedido = useFormGuard(async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!nome.trim()) { setErr('Indique o seu nome.'); return }

    setSaving(true)
    const { data, error } = await supabase
      .from('comb_abastecimentos_pendentes')
      .insert({
        veiculo_id:       vehicleId!,
        veiculo_nome:     vehicleName,
        funcionario_nome: nome.trim(),
        data:             todayStr(),
        tipo_fonte:       tipo ?? 'POSTO_RUA',
        estado:           'AGUARDA_AUTORIZACAO',
        contador:         km ? parseFloat(km) : null,
      })
      .select('id')
      .single()
    setSaving(false)

    if (error || !data) { setErr('Erro ao enviar. Verifica a ligação.'); return }

    setPendId(data.id)
    setPollTimedOut(false)
    setPasso('AGUARDAR')

    supabase.functions.invoke('send-push', {
      body: {
        title: `Pedido de abastecimento — ${vehicleName}`,
        body:  `${nome.trim()} pede autorização (${TIPO_CONFIG[tipo!].label})`,
        url:   '/combustivel',
      },
    }).catch(() => {})
  })

  // ── Passo 4: enviar foto + chamar Gemini ──────────────────────────────────
  const handleFoto = useFormGuard(async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setGeminiError(false)
    if (!foto || !pendId) { setErr('Selecione uma foto.'); return }

    setSaving(true)

    // Upload da foto — erros aqui não activam o formulário manual (A1)
    const ext  = foto.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${vehicleId}/${todayStr()}_${pendId}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('combustivel-taloes')
      .upload(path, foto, { contentType: foto.type, upsert: true })
    if (upErr) { setErr('Erro ao enviar foto. Tente novamente.'); setSaving(false); return }

    const { data: urlData } = supabase.storage.from('combustivel-taloes').getPublicUrl(path)
    const fotoUrl = urlData.publicUrl
    setUploadedFotoUrl(fotoUrl)  // guardar URL para uso posterior sem reconstrução (A2)

    // Chamar Gemini para ler a foto
    const { data: gemRes, error: gemErr } = await supabase.functions.invoke('ler-foto-abastecimento', {
      body: { foto_url: fotoUrl, tipo_fonte: tipo },
    })

    if (gemErr || !gemRes) {
      // Falha da API Gemini → mostrar formulário manual (A1)
      setGeminiError(true)
      setErr('Não foi possível processar a foto. Introduz os valores manualmente.')
      setSaving(false)
      return
    }

    const litrosLidos = gemRes.litros    as number | null
    const custoLido   = gemRes.custo_total as number | null
    const conf        = gemRes.confianca   as string

    setLitros(litrosLidos)
    setCusto(custoLido)
    setConfianca(conf)

    if (!litrosLidos || conf === 'baixa') {
      // Confiança baixa → formulário manual (A1)
      setGeminiError(true)
      setErr('Não foi possível ler os valores com clareza. Introduz os valores manualmente.')
      setSaving(false)
      return
    }

    if (conf === 'media') {
      // Confiança média → mostrar valores extraídos e aguardar confirmação do motorista (M1)
      setSaving(false)
      return
    }

    // Confiança alta → submeter automaticamente
    const { error: conclErr } = await supabase.rpc('concluir_abastecimento', {
      p_id:           pendId!,
      p_litros:       litrosLidos,
      p_custo_total:  custoLido ?? 0,
      p_foto_medidor: fotoUrl,
    })
    setSaving(false)
    if (conclErr) { setErr('Erro ao guardar. Tenta novamente.'); return }
    setPasso('DONE')
  })

  // ── Confirmar valores extraídos pela Gemini (confiança média) ─────────────
  const handleConfirmarGemini = async () => {
    if (saving || !litros) return
    setErr('')
    setSaving(true)
    const { error: conclErr } = await supabase.rpc('concluir_abastecimento', {
      p_id:           pendId!,
      p_litros:       litros,
      p_custo_total:  custo ?? 0,
      p_foto_medidor: uploadedFotoUrl,
    })
    setSaving(false)
    if (conclErr) { setErr('Erro ao guardar. Tenta novamente.'); return }
    setPasso('DONE')
  }

  // ── Confirmar manualmente (quando Gemini não leu bem) ─────────────────────
  // Nota: não é um <form> — é um botão directo para evitar forms aninhados (C3)
  const handleConfirmarManual = async () => {
    if (saving) return
    setErr('')
    const l = parseFloat(litrosManual)
    const c = parseFloat(custoManual)
    if (!(l > 0)) { setErr('Indique os litros.'); return }

    setSaving(true)
    const { error: conclErr } = await supabase.rpc('concluir_abastecimento', {
      p_id:           pendId!,
      p_litros:       l,
      p_custo_total:  isNaN(c) ? 0 : c,
      p_foto_medidor: uploadedFotoUrl,  // URL já guardada no estado (A2)
    })
    setSaving(false)
    if (conclErr) { setErr('Erro ao guardar. Tenta novamente.'); return }
    setLitros(l)
    setPasso('DONE')
  }

  if (!vehicleId) return <ErrQR />

  const ic = 'w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base text-gray-900 placeholder-gray-400'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Cabeçalho fixo */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
          <Fuel className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">ENCIVIL · Combustível</p>
          <p className="text-base font-bold text-gray-900 leading-tight">{vehicleName}</p>
        </div>
        {/* Indicador de passo (M4: REJEITADO mostra passo 3 a vermelho) */}
        <div className="ml-auto flex items-center gap-1">
          {([1, 2, 3, 4] as const).map(n => {
            const ativo = (passo === 'TIPO' && n === 1) || (passo === 'FORM' && n === 2)
                        || (passo === 'AGUARDAR' && n === 3)
                        || ((passo === 'FOTO' || passo === 'DONE') && n === 4)
            const feito = (n === 1 && passo !== 'TIPO')
                        || (n === 2 && !['TIPO', 'FORM'].includes(passo))
                        || (n === 3 && ['FOTO', 'DONE'].includes(passo))
            const rejeitado = passo === 'REJEITADO' && n === 3
            return (
              <div key={n} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                ${rejeitado ? 'bg-red-500 text-white' : feito ? 'bg-green-500 text-white' : ativo ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {rejeitado ? '✕' : feito ? '✓' : n}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 p-5 pb-10">
        <div className="max-w-md mx-auto">

          {/* ── PASSO 1: Escolher tipo ──────────────────────────────────────── */}
          {passo === 'TIPO' && (
            <div className="space-y-4">
              <div className="text-center pt-2 pb-4">
                <h1 className="text-xl font-bold text-gray-900">Onde vai abastecer?</h1>
                <p className="text-sm text-gray-500 mt-1">Seleciona o tipo de abastecimento</p>
              </div>
              {(Object.entries(TIPO_CONFIG) as [TipoFonte, typeof TIPO_CONFIG['POLO2']][]).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={key}
                    onClick={() => { setTipo(key); setPasso('FORM') }}
                    className={`w-full flex items-center gap-4 p-5 border-2 rounded-2xl text-left transition-all active:scale-[0.98] ${cfg.corFundo} hover:shadow-md`}
                  >
                    <div className={`p-3 rounded-xl bg-white shadow-sm ${cfg.cor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-base ${cfg.cor}`}>{cfg.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{cfg.desc}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                  </button>
                )
              })}
            </div>
          )}

          {/* ── PASSO 2: Nome + km ──────────────────────────────────────────── */}
          {passo === 'FORM' && tipo && (
            <form onSubmit={handlePedido} className="space-y-4">
              <div className="text-center pt-2 pb-2">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${TIPO_CONFIG[tipo].corFundo} ${TIPO_CONFIG[tipo].cor} mb-3`}>
                  {(() => { const Icon = TIPO_CONFIG[tipo].icon; return <Icon className="w-4 h-4" /> })()}
                  {TIPO_CONFIG[tipo].label}
                </div>
                <h1 className="text-xl font-bold text-gray-900">Pedir autorização</h1>
                <p className="text-sm text-gray-500 mt-1">O responsável irá aprovar o abastecimento</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  O seu nome <span className="text-red-500">*</span>
                </label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  className={ic} placeholder="Ex: João Silva"
                  autoComplete="name" autoCapitalize="words" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  KM / Horas da viatura
                  <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>
                </label>
                <input type="number" inputMode="decimal" value={km}
                  onChange={e => setKm(e.target.value)}
                  className={ic} placeholder="Ex: 125430" min="0" step="1" />
              </div>

              {err && <ErrBox msg={err} />}

              <button type="submit" disabled={saving}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                Pedir Autorização
              </button>

              <button type="button" onClick={() => setPasso('TIPO')}
                className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← Alterar tipo
              </button>
            </form>
          )}

          {/* ── PASSO 3: Aguardar autorização ────────────────────────────────── */}
          {passo === 'AGUARDAR' && (
            <div className="text-center py-12 space-y-5">
              {pollTimedOut ? (
                <>
                  <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                    <Clock className="w-12 h-12 text-amber-500" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">Tempo esgotado</h1>
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                      O responsável não respondeu em 10 minutos.<br />
                      Contacte-o diretamente.
                    </p>
                  </div>
                  <button
                    onClick={() => { setPasso('FORM'); setPollTimedOut(false) }}
                    className="w-full py-4 bg-gray-800 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-transform">
                    Tentar Novamente
                  </button>
                </>
              ) : (
                <>
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center">
                      <Clock className="w-12 h-12 text-amber-500" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">A aguardar autorização</h1>
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                      O responsável foi notificado.<br />
                      Aguarda a aprovação antes de abastecer.
                    </p>
                  </div>
                  <div className={`mx-auto w-fit flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${tipo ? TIPO_CONFIG[tipo].corFundo : ''} ${tipo ? TIPO_CONFIG[tipo].cor : ''}`}>
                    {tipo && (() => { const Icon = TIPO_CONFIG[tipo].icon; return <Icon className="w-4 h-4" /> })()}
                    {tipo && TIPO_CONFIG[tipo].label} · {vehicleName}
                  </div>
                  <p className="text-xs text-gray-400">Esta página atualiza automaticamente.</p>
                </>
              )}
            </div>
          )}

          {/* ── PASSO 4: Foto ─────────────────────────────────────────────────── */}
          {passo === 'FOTO' && tipo && (
            <form onSubmit={handleFoto} className="space-y-4">
              <div className="text-center pt-2 pb-2">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">Autorizado!</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {tipo === 'POLO2'    && 'Abastece no Polo 2 e tira foto ao medidor.'}
                  {tipo === 'CARRINHA' && 'Abastece na carrinha e tira foto ao medidor.'}
                  {tipo === 'POSTO_RUA'&& 'Abastece no posto e tira foto ao talão.'}
                </p>
              </div>

              {/* Seletor de foto */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {tipo === 'POSTO_RUA' ? 'Foto do talão' : 'Foto do medidor'}{' '}
                  <span className="text-red-500">*</span>
                </label>
                {fotoPreview ? (
                  <div className="relative">
                    <img src={fotoPreview} alt="Foto" className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-100" />
                    <button type="button" onClick={clearFoto}
                      className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow border border-gray-200">
                      <X className="w-4 h-4 text-gray-700" />
                    </button>
                    {/* Resultado Gemini (confiança alta ou média) */}
                    {litros !== null && !geminiError && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
                        <p className="font-semibold text-green-700">
                          Lido: <span className="tabular-nums">{litros.toFixed(2)} L</span>
                          {custo ? <span className="ml-2 text-gray-600">· {custo.toFixed(2)} €</span> : null}
                        </p>
                        {confianca === 'media' && (
                          <p className="text-xs text-amber-600 mt-0.5">Confirma os valores antes de enviar.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => fotoRef.current?.click()}
                    className="w-full py-5 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-[0.98]">
                    <Camera className="w-7 h-7" />
                    <span className="text-sm font-medium">Fotografar</span>
                  </button>
                )}
                <input ref={fotoRef} type="file" accept="image/*" capture="environment"
                  className="hidden" onChange={handleFotoChange} />
              </div>

              {/* Erros de upload (sem formulário manual) */}
              {err && !geminiError && <ErrBox msg={err} />}

              {/* Formulário manual — apenas quando Gemini falha (A1, C3) */}
              {geminiError && fotoPreview && (
                <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm font-semibold text-amber-800">Introduz os valores manualmente:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Litros *</label>
                      <input type="number" inputMode="decimal" value={litrosManual}
                        onChange={e => setLitrosManual(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: 45.23" min="0.001" step="0.001" />
                    </div>
                    {tipo === 'POSTO_RUA' && (
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Custo (€)</label>
                        <input type="number" inputMode="decimal" value={custoManual}
                          onChange={e => setCustoManual(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: 68.40" min="0" step="0.01" />
                      </div>
                    )}
                  </div>
                  {/* Erro de concluir dentro do formulário manual */}
                  {err && (
                    <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {err}
                    </div>
                  )}
                  {/* Botão como <button type="button"> — evita form aninhado (C3) */}
                  <button type="button" onClick={handleConfirmarManual} disabled={saving}
                    className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirmar e Enviar
                  </button>
                </div>
              )}

              {/* Confirmar valores de confiança média (M1) */}
              {confianca === 'media' && litros !== null && !geminiError && fotoPreview && (
                <>
                  {err && <ErrBox msg={err} />}
                  <button type="button" onClick={handleConfirmarGemini} disabled={saving}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                    {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                    {saving ? 'A guardar…' : `Confirmar ${litros.toFixed(2)} L e Enviar`}
                  </button>
                </>
              )}

              {/* Botão principal de envio (foto seleccionada, sem erros especiais) */}
              {fotoPreview && !geminiError && !(confianca === 'media' && litros !== null) && (
                <button type="submit" disabled={saving || !foto}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                  {saving ? 'A processar…' : 'Enviar Registo'}
                </button>
              )}
            </form>
          )}

          {/* ── DONE ──────────────────────────────────────────────────────────── */}
          {passo === 'DONE' && (
            <div className="text-center py-12 space-y-5">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Registado!</h1>
                <p className="text-gray-500 mt-2 leading-relaxed">
                  O abastecimento de <strong className="text-gray-800">{vehicleName}</strong>{' '}
                  foi registado e aguarda aprovação final.
                </p>
                {litros !== null && (
                  <p className="text-sm text-gray-400 mt-1">
                    {litros.toFixed(2)} L · {tipo && TIPO_CONFIG[tipo].label}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setPasso('TIPO'); setTipo(null); setNome(''); setKm('')
                  setPendId(null); setFoto(null); setFotoPreview(null)
                  setUploadedFotoUrl(''); setLitros(null); setCusto(null)
                  setConfianca(null); setGeminiError(false); setErr('')
                  setLitrosManual(''); setCustoManual('')
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform">
                Novo Abastecimento
              </button>
            </div>
          )}

          {/* ── REJEITADO ─────────────────────────────────────────────────────── */}
          {passo === 'REJEITADO' && (
            <div className="text-center py-12 space-y-5">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pedido Rejeitado</h1>
                <p className="text-gray-500 mt-2">O responsável não autorizou este abastecimento.</p>
              </div>
              <button
                onClick={() => { setPasso('TIPO'); setTipo(null); setNome(''); setKm(''); setPendId(null); setErr('') }}
                className="w-full py-4 bg-gray-800 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-transform">
                Tentar Novamente
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function ErrQR() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">QR Code inválido</h1>
        <p className="text-sm text-gray-500">Este código não contém dados de viatura. Contacte o responsável.</p>
      </div>
    </div>
  )
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {msg}
    </div>
  )
}
