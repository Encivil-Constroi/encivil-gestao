import { useState } from 'react'
import {
  HardDriveDownload, CheckCircle2, XCircle, Loader2,
  Circle, Info, ShieldCheck, AlertTriangle, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { TABELAS_BACKUP, exportarTabela, type BackupData } from '@/features/backup/backupService'
import { exportarJson } from '@/app/lib/exportJson'

// ── Tipos de estado por tabela ────────────────────────────────────────────────

type TabelaEstado =
  | { estado: 'idle' }
  | { estado: 'a_exportar' }
  | { estado: 'concluido'; count: number }
  | { estado: 'erro'; mensagem: string }

const LAST_BACKUP_KEY = 'encivil-last-backup'

function formatarDataRelativa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

// ── Componente ────────────────────────────────────────────────────────────────

export function BackupPage() {
  const [estadoMap,   setEstadoMap]   = useState<Record<string, TabelaEstado>>({})
  const [exportando,  setExportando]  = useState(false)
  const [progresso,   setProgresso]   = useState(0)   // 0-100
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_BACKUP_KEY) } catch { return null }
  })

  const total = TABELAS_BACKUP.length

  const iniciarBackup = async () => {
    setExportando(true)
    setProgresso(0)

    // Reinicia todos os estados
    const inicial: Record<string, TabelaEstado> = {}
    TABELAS_BACKUP.forEach(t => { inicial[t.id] = { estado: 'idle' } })
    setEstadoMap(inicial)

    const tabelas: Record<string, unknown[]> = {}
    let concluidas = 0
    let erros = 0

    for (const { id } of TABELAS_BACKUP) {
      setEstadoMap(prev => ({ ...prev, [id]: { estado: 'a_exportar' } }))

      try {
        const dados = await exportarTabela(id)
        tabelas[id] = dados
        setEstadoMap(prev => ({ ...prev, [id]: { estado: 'concluido', count: dados.length } }))
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : 'Erro desconhecido'
        tabelas[id] = []
        setEstadoMap(prev => ({ ...prev, [id]: { estado: 'erro', mensagem } }))
        erros++
      }

      concluidas++
      setProgresso(Math.round((concluidas / total) * 100))
    }

    const agora = new Date().toISOString()
    const backup: BackupData = {
      versao:      '1.0',
      aplicacao:   'ENCIVIL Gestão',
      exportadoEm: agora,
      tabelas,
    }

    exportarJson(backup, 'backup_encivil')

    try { localStorage.setItem(LAST_BACKUP_KEY, agora) } catch { /* bloqueado */ }
    setUltimoBackup(agora)
    setExportando(false)

    if (erros === 0) {
      toast.success('Backup exportado com sucesso!', {
        description: `${total} tabelas · ${Object.values(tabelas).reduce((s, a) => s + a.length, 0).toLocaleString('pt-PT')} registos`,
      })
    } else {
      toast.warning(`Backup exportado com ${erros} erro${erros > 1 ? 's' : ''}`, {
        description: 'Verifique as tabelas marcadas a vermelho.',
      })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const grupos = [...new Set(TABELAS_BACKUP.map(t => t.grupo))]

  return (
    <div className="max-w-3xl mx-auto space-y-5 enc-page">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
          <HardDriveDownload className="w-6 h-6 text-primary" />
          Backup & Exportação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exportação manual de todos os dados operacionais da ENCIVIL
        </p>
      </div>

      {/* Banner informativo */}
      <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-primary">Backup automático pelo Supabase</p>
          <p className="text-muted-foreground">
            A base de dados PostgreSQL é gerida pelo Supabase, que realiza backups
            automáticos diários nos planos pagos (Pro+). Plano Free não inclui backup
            automático — recomenda-se exportação manual regular.{' '}
            <span className="font-medium text-foreground">
              Verifique o plano em supabase.com → Project Settings → Add-ons.
            </span>
          </p>
        </div>
      </div>

      {/* Painel de exportação */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Exportação Completa</h3>
          </div>
          {ultimoBackup && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Último backup {formatarDataRelativa(ultimoBackup)}</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Botão de exportação + progresso */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={iniciarBackup}
              disabled={exportando}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shrink-0"
            >
              {exportando
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <HardDriveDownload className="w-5 h-5" />
              }
              {exportando ? `A exportar… (${progresso}%)` : 'Exportar Backup JSON'}
            </button>
            <p className="text-xs text-muted-foreground">
              Descarrega um ficheiro <code className="bg-muted px-1 py-0.5 rounded text-[11px]">.json</code> com
              todas as {total} tabelas. Guarde numa localização segura.
            </p>
          </div>

          {/* Barra de progresso — só durante a exportação */}
          {exportando && (
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}

          {/* Grelha de tabelas por grupo */}
          {grupos.map(grupo => {
            const tabsDoGrupo = TABELAS_BACKUP.filter(t => t.grupo === grupo)
            return (
              <div key={grupo}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  {grupo}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {tabsDoGrupo.map(({ id, label }) => {
                    const est = estadoMap[id] ?? { estado: 'idle' }
                    return (
                      <div
                        key={id}
                        className={`
                          flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors
                          ${est.estado === 'concluido' ? 'border-success/30 bg-success/5'
                          : est.estado === 'erro'      ? 'border-destructive/30 bg-destructive/5'
                          : est.estado === 'a_exportar'? 'border-primary/30 bg-primary/5'
                          : 'border-border bg-muted/30'}
                        `}
                      >
                        {est.estado === 'idle'       && <Circle      className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />}
                        {est.estado === 'a_exportar' && <Loader2     className="w-3.5 h-3.5 shrink-0 text-primary animate-spin" />}
                        {est.estado === 'concluido'  && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-success" />}
                        {est.estado === 'erro'       && <XCircle     className="w-3.5 h-3.5 shrink-0 text-destructive" />}
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{label}</p>
                          {est.estado === 'concluido' && (
                            <p className="text-[10px] text-muted-foreground">
                              {est.count.toLocaleString('pt-PT')} reg.
                            </p>
                          )}
                          {est.estado === 'erro' && (
                            <p className="text-[10px] text-destructive truncate" title={est.mensagem}>
                              {est.mensagem}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Política de backup — secção expansível */}
      <details className="bg-card rounded-2xl border border-border overflow-hidden group">
        <summary className="px-5 py-4 flex items-center justify-between cursor-pointer list-none select-none hover:bg-accent/30 transition-colors">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Política de Backup</h3>
          </div>
          <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">Fechar</span>
        </summary>

        <div className="px-5 pb-5 pt-2 space-y-4 text-sm">
          <section className="space-y-1">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">1. Backup Automático (Supabase)</h4>
            <p className="text-muted-foreground">
              A base de dados PostgreSQL é gerida pelo Supabase e backed up automaticamente consoante o plano contratado:
            </p>
            <ul className="ml-4 space-y-0.5 text-muted-foreground list-disc">
              <li><span className="font-medium text-foreground">Free:</span> sem backup automático — dependente exclusivamente de exportação manual.</li>
              <li><span className="font-medium text-foreground">Pro (€25/mês):</span> backup diário automático, retenção de 7 dias.</li>
              <li><span className="font-medium text-foreground">Team/Enterprise:</span> Point-in-Time Recovery (PITR) com retenção de 14–30 dias.</li>
            </ul>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">2. Exportação Manual Recomendada</h4>
            <p className="text-muted-foreground">
              Independentemente do plano Supabase, recomenda-se exportação manual completa{' '}
              <span className="font-medium text-foreground">pelo menos uma vez por mês</span>,
              preferencialmente no final de cada mês, após fechar os autos de medição do período.
              O ficheiro JSON exportado deve ser guardado em local seguro fora do servidor
              (ex.: pasta partilhada na empresa, Google Drive, OneDrive).
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">3. O que está incluído</h4>
            <p className="text-muted-foreground">
              Obras, subempreiteiros, artigos, autos de medição e linhas, liberações de retenção,
              produtos, movimentos de stock, ferramentas, empréstimos, viaturas, abastecimentos,
              colaboradores, horários, faltas, alertas, regras de alerta, configurações da empresa.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">4. O que não está incluído</h4>
            <ul className="ml-4 space-y-0.5 text-muted-foreground list-disc">
              <li><span className="font-medium text-foreground">Registos de auditoria (audit_log)</span> — geridos e retidos pelo Supabase.</li>
              <li><span className="font-medium text-foreground">Perfis de utilizadores (profiles)</span> — dados de autenticação geridos pelo Supabase Auth.</li>
              <li><span className="font-medium text-foreground">Fila de abastecimentos pendentes</span> — dados transientes do QR code (limpos após processamento).</li>
              <li><span className="font-medium text-foreground">Ficheiros e imagens</span> — armazenados no Supabase Storage; gerir separadamente via Dashboard.</li>
            </ul>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">5. Responsabilidades</h4>
            <p className="text-muted-foreground">
              O <span className="font-medium text-foreground">Administrador do sistema</span> é responsável por
              verificar periodicamente que as exportações manuais estão a ser realizadas e que os ficheiros
              são guardados num local seguro e acessível. Em caso de incidente, o contacto técnico para
              restauro é quem gere o projeto Supabase da ENCIVIL.
            </p>
          </section>
        </div>
      </details>
    </div>
  )
}
