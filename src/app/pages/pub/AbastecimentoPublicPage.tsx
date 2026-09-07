import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Fuel, CheckCircle2, AlertTriangle, Camera, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useFormGuard } from '@/app/lib/useFormGuard'

// Página pública — sem auth. Acedida via QR code colado na viatura.
// URL: /pub/combustivel?v=UUID_VIATURA&vn=Nome+da+Viatura

export function AbastecimentoPublicPage() {
  const [params] = useSearchParams()
  const vehicleId   = params.get('v')
  const vehicleName = params.get('vn') ?? 'Viatura'

  const [nome,       setNome]       = useState('')
  const [litros,     setLitros]     = useState('')
  const [custo,      setCusto]      = useState('')
  const [contador,   setContador]   = useState('')
  const [local,      setLocal]      = useState('')
  const [foto,       setFoto]       = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [err,        setErr]        = useState('')
  const fotoInputRef = useRef<HTMLInputElement>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setFoto(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = ev => setFotoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setFotoPreview(null)
    }
  }

  function removerFoto() {
    setFoto(null)
    setFotoPreview(null)
    if (fotoInputRef.current) fotoInputRef.current.value = ''
  }

  if (!vehicleId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">QR Code inválido</h1>
          <p className="text-sm text-gray-500">
            Este código não contém dados de viatura. Contacte o responsável pela obra.
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = useFormGuard(async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    const litrosN = parseFloat(litros)
    const custoN  = parseFloat(custo)
    const contN   = contador ? parseFloat(contador) : null

    if (!nome.trim())                    { setErr('Indique o seu nome.');              return }
    if (!(litrosN > 0))                  { setErr('Indique os litros abastecidos.');   return }
    if (isNaN(custoN) || custoN < 0)     { setErr('Indique o custo total.');           return }

    setSaving(true)

    // Upload opcional da foto do talão
    let fotoUrl: string | null = null
    if (foto) {
      const ext  = foto.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${vehicleId}/${todayStr}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('combustivel-taloes')
        .upload(path, foto, { contentType: foto.type, upsert: false })
      if (uploadErr) {
        setErr('Erro ao enviar foto. Tente sem foto ou tente novamente.')
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('combustivel-taloes').getPublicUrl(path)
      fotoUrl = urlData.publicUrl
    }

    const { error } = await supabase.from('comb_abastecimentos_pendentes').insert({
      veiculo_id:       vehicleId,
      veiculo_nome:     vehicleName,
      funcionario_nome: nome.trim(),
      data:             todayStr,
      litros:           litrosN,
      custo_total:      custoN,
      contador:         contN,
      local:            local.trim() || null,
      foto_url:         fotoUrl,
    })
    setSaving(false)

    if (error) {
      setErr('Erro ao enviar. Verifique a ligação e tente novamente.')
      console.error('[pub/combustivel]', error)
    } else {
      setDone(true)
    }
  })

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Enviado!</h1>
          <p className="text-gray-500 mb-8">
            O abastecimento de <strong className="text-gray-800">{vehicleName}</strong> foi registado
            e aguarda aprovação do responsável.
          </p>
          <button
            onClick={() => {
              setDone(false)
              setLitros(''); setCusto(''); setContador(''); setLocal('')
              removerFoto()
            }}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform"
          >
            Registar Novo Abastecimento
          </button>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base text-gray-900 placeholder-gray-400'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Cabeçalho */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
          <Fuel className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">ENCIVIL · Combustível</p>
          <p className="text-base font-bold text-gray-900 leading-tight">{vehicleName}</p>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 p-5 pb-10">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              O seu nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className={inputCls}
              placeholder="Ex: João Silva"
              autoComplete="name"
              autoCapitalize="words"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Litros <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={litros}
                onChange={e => setLitros(e.target.value)}
                className={`${inputCls} text-xl font-bold`}
                placeholder="0"
                min="0.001"
                step="0.001"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Custo total (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={custo}
                onChange={e => setCusto(e.target.value)}
                className={`${inputCls} text-xl font-bold`}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                KM / Horas{' '}
                <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={contador}
                onChange={e => setContador(e.target.value)}
                className={inputCls}
                placeholder="Leitura"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Posto{' '}
                <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={local}
                onChange={e => setLocal(e.target.value)}
                className={inputCls}
                placeholder="Ex: Galp N2"
              />
            </div>
          </div>

          {/* Foto do talão */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Foto do talão{' '}
              <span className="text-xs font-normal text-gray-400">(opcional)</span>
            </label>
            {fotoPreview ? (
              <div className="relative">
                <img
                  src={fotoPreview}
                  alt="Talão"
                  className="w-full max-h-52 object-contain rounded-xl border border-gray-200 bg-gray-100"
                />
                <button
                  type="button"
                  onClick={removerFoto}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow border border-gray-200"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-1.5 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-[0.98]"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm font-medium">Fotografar ou escolher imagem</span>
              </button>
            )}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFotoChange}
            />
          </div>

          {err && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {saving ? 'A enviar…' : 'Registar Abastecimento'}
          </button>

          <p className="text-center text-xs text-gray-400 leading-relaxed">
            O registo fica pendente até aprovação pelo responsável.
            <br />Data: {new Date().toLocaleDateString('pt-PT')}
          </p>
        </form>
      </div>
    </div>
  )
}
