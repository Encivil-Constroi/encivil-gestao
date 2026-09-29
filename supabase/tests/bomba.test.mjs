// @vitest-environment node
// Cenários da bomba Polo 2 num Postgres real com TODAS as migrations aplicadas.
// Cada chamada corre com o papel real: anon (motorista via QR), authenticated
// (gestor / leitura) e service_role (Edge Function pump-status).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, gestor, leitor, viatura

async function novoUtilizador(role) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${role}@teste.pt`])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}

const anon    = fn => como(db, { papel: 'anon' }, fn)
const comoGestor = fn => como(db, { papel: 'authenticated', uid: gestor }, fn)
const comoLeitor = fn => como(db, { papel: 'authenticated', uid: leitor }, fn)
const servico = fn => como(db, { papel: 'service_role' }, fn)

async function pedir(nome = 'João') {
  const id = randomUUID()
  await anon(tx => tx.query(
    `INSERT INTO public.comb_abastecimentos_pendentes
       (id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, estado)
     VALUES ($1, $2, 'Carrinha 1', $3, CURRENT_DATE, 'POLO2', 'AGUARDA_AUTORIZACAO')`,
    [id, viatura, nome]))
  return id
}
const autorizar = id => comoGestor(tx => tx.query('SELECT public.autorizar_abastecimento($1)', [id]))
const poll = async (relay, nivel = false) =>
  (await servico(tx => tx.query('SELECT public.pump_poll($1, $2, $3) AS r', ['polo2', relay, nivel]))).rows[0].r
const terminei = id => anon(tx => tx.query('SELECT public.parar_bomba($1)', [id]))
const sessoes  = async () => (await db.query('SELECT * FROM public.pump_sessoes ORDER BY inicio_em, id')).rows
const estadoPedido = async id =>
  (await anon(tx => tx.query('SELECT * FROM public.get_pend_estado_bomba($1)', [id]))).rows[0]
// Recua o início da sessão aberta (simula o tempo a passar)
const passarTempo = seg =>
  db.query(`UPDATE public.pump_sessoes SET inicio_em = inicio_em - make_interval(secs => $1) WHERE fim_em IS NULL`, [seg])

beforeAll(async () => {
  db = await criarBanco()
  gestor = await novoUtilizador('gestor')
  leitor = await novoUtilizador('leitura')
  const { rows } = await db.query(
    `INSERT INTO public.comb_veiculos (nome, pump_max_seconds) VALUES ('Carrinha 1', 300) RETURNING id`)
  viatura = rows[0].id
}, 60_000)

beforeEach(async () => {
  await db.exec(`TRUNCATE public.pump_sessoes, public.pump_comandos, public.pump_heartbeat,
                          public.comb_abastecimentos_pendentes, public.comb_abastecimentos;
                 UPDATE public.pump_config SET bloqueada = false, motivo = NULL, horario_inicio = NULL, horario_fim = NULL`)
})

const regras = (bloqueada, motivo, inicio = null, fim = null) =>
  comoGestor(tx => tx.query('SELECT public.definir_regras_bomba($1, $2, $3::time, $4::time)', [bloqueada, motivo, inicio, fim]))
const estadoBomba = async () =>
  (await anon(tx => tx.query(`SELECT * FROM public.estado_bomba('POLO2')`))).rows[0]
// Horas (HH:MI) relativas à hora atual de Portugal
const horaLisboa = async deslocMin =>
  (await db.query(`SELECT to_char((now() AT TIME ZONE 'Europe/Lisbon') + make_interval(mins => $1), 'HH24:MI') AS h`, [deslocMin])).rows[0].h

describe('fluxo normal', () => {
  it('autorizar → liga pelo tempo da viatura → sessão regista quem e o quê', async () => {
    const p = await pedir('João')
    await autorizar(p)

    expect(await poll(false)).toEqual({ status: 'authorized', seconds: 300 })
    const [s] = await sessoes()
    expect(s).toMatchObject({
      pedido_id: p, veiculo_id: viatura, veiculo_nome: 'Carrinha 1', funcionario_nome: 'João',
      autorizado_por: gestor, segundos_autorizados: 300, fim_em: null,
    })
    expect(await poll(true)).toEqual({ status: 'idle' })
  })

  it('relé desliga no fim do tempo → sessão fecha como TEMPO', async () => {
    await autorizar(await pedir())
    await poll(false)
    await passarTempo(300)
    expect(await poll(false)).toEqual({ status: 'idle' })
    const [s] = await sessoes()
    expect(s.motivo_fim).toBe('TEMPO')
    expect(s.fim_em).not.toBeNull()
  })

  it('relé desliga muito antes do tempo → INTERROMPIDO', async () => {
    await autorizar(await pedir())
    await poll(false)
    await passarTempo(60)
    await poll(false)
    expect((await sessoes())[0].motivo_fim).toBe('INTERROMPIDO')
  })

  it('autorização expirada não liga', async () => {
    const p = await pedir()
    await autorizar(p)
    await db.query(`UPDATE public.comb_abastecimentos_pendentes SET pump_auth_expires_at = now() - interval '1 second' WHERE id = $1`, [p])
    expect(await poll(false)).toEqual({ status: 'idle' })
    expect(await sessoes()).toHaveLength(0)
  })

  it('bomba desconhecida é ignorada', async () => {
    await autorizar(await pedir())
    const r = (await servico(tx => tx.query(`SELECT public.pump_poll('polo9', false, false) AS r`))).rows[0].r
    expect(r).toEqual({ status: 'idle' })
    expect(await sessoes()).toHaveLength(0)
  })
})

describe('fila (dois motoristas)', () => {
  it('o segundo espera o relé desligar e só então liga', async () => {
    const p1 = await pedir('João'); await autorizar(p1)
    const p2 = await pedir('Rui');  await autorizar(p2)

    expect(await poll(false)).toMatchObject({ status: 'authorized' })
    expect(await poll(true)).toEqual({ status: 'idle' })
    expect((await estadoPedido(p2)).bomba_ocupada).toBe(true)

    await passarTempo(300)
    expect(await poll(false)).toMatchObject({ status: 'authorized' })
    const [s1, s2] = await sessoes()
    expect(s1).toMatchObject({ pedido_id: p1, motivo_fim: 'TEMPO' })
    expect(s2).toMatchObject({ pedido_id: p2, fim_em: null })
    expect((await estadoPedido(p2)).bomba_ocupada).toBe(false)
  })

  it('a ordem é a de autorização, não a de pedido', async () => {
    const p1 = await pedir('João')
    const p2 = await pedir('Rui')
    await autorizar(p2)
    await autorizar(p1)
    await poll(false)
    expect((await sessoes())[0].pedido_id).toBe(p2)
  })

  it('pedido em fila não expira enquanto a bomba está ocupada', async () => {
    await autorizar(await pedir('João'))
    const p2 = await pedir('Rui'); await autorizar(p2)
    await poll(false)
    await db.query(`UPDATE public.comb_abastecimentos_pendentes SET pump_auth_expires_at = now() + interval '10 seconds' WHERE id = $1`, [p2])
    await poll(true)
    const { rows } = await db.query(`SELECT pump_auth_expires_at > now() + interval '1 minute' AS ok FROM public.comb_abastecimentos_pendentes WHERE id = $1`, [p2])
    expect(rows[0].ok).toBe(true)
  })

  it('relé ligado à mão (sem sessão) não recebe autorização por cima', async () => {
    const p = await pedir(); await autorizar(p)
    expect(await poll(true)).toEqual({ status: 'idle' })
    const [s] = await sessoes()
    expect(s).toMatchObject({ origem: 'MANUAL', pedido_id: null })
    expect((await estadoPedido(p)).bomba_ocupada).toBe(true)
  })
})

describe('uso fora da app', () => {
  it('relé ligado sem pedido fica registado como sessão MANUAL e fecha ao desligar', async () => {
    expect(await poll(true)).toEqual({ status: 'idle' })
    expect(await poll(true)).toEqual({ status: 'idle' })
    let lista = await sessoes()
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ origem: 'MANUAL', fim_em: null, segundos_autorizados: 3600 })

    await poll(false)
    lista = await sessoes()
    expect(lista[0].fim_em).not.toBeNull()
    expect(lista[0].motivo_fim).toBe('INTERROMPIDO')
  })

  it('depois do uso manual, o pedido em espera liga', async () => {
    await poll(true)
    const p = await pedir(); await autorizar(p)
    expect(await poll(true)).toEqual({ status: 'idle' })
    expect(await poll(false)).toMatchObject({ status: 'authorized' })
    expect((await sessoes())[1]).toMatchObject({ origem: 'APP', pedido_id: p })
  })

  it('corte de emergência fecha a sessão manual', async () => {
    await poll(true)
    await comoGestor(tx => tx.query('SELECT public.parar_bomba()'))
    expect(await poll(true)).toEqual({ status: 'stop' })
    expect((await sessoes())[0].motivo_fim).toBe('EMERGENCIA')
  })
})

describe('confirmação de paragem (página do motorista)', () => {
  it('"Terminei": só confirma depois de o Shelly reportar o relé desligado', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    expect(await estadoPedido(p)).toMatchObject({ sessao_ativa: true, desligada_confirmada: false })

    await terminei(p)
    await poll(true) // Shelly recebe "stop" — ainda reportou ligado neste poll
    expect(await estadoPedido(p)).toMatchObject({ sessao_ativa: false, motivo_fim: 'TERMINEI', desligada_confirmada: false })

    await poll(false) // poll seguinte: relé desligado
    expect((await estadoPedido(p)).desligada_confirmada).toBe(true)
  })

  it('fim por tempo: confirma no próprio poll que vê o relé desligado', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await passarTempo(300)
    await poll(false)
    expect(await estadoPedido(p)).toMatchObject({ sessao_ativa: false, motivo_fim: 'TEMPO', desligada_confirmada: true })
  })

  it('relé desligado antes do tempo: confirma no mesmo poll (fim = hora do poll)', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await passarTempo(30)
    await poll(false)
    expect(await estadoPedido(p)).toMatchObject({ motivo_fim: 'INTERROMPIDO', desligada_confirmada: true })
  })

  it('Shelly offline depois do STOP: nunca confirma', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await terminei(p)
    await poll(true)
    expect((await estadoPedido(p)).desligada_confirmada).toBe(false)
  })
})

describe('bloqueio e horário', () => {
  it('bloqueada: autorizar recusa com o motivo', async () => {
    await regras(true, 'Manutenção do filtro')
    const p = await pedir()
    await expect(autorizar(p)).rejects.toThrow('Manutenção do filtro')
  })

  it('bloqueada sem motivo usa mensagem padrão', async () => {
    await regras(true, '   ')
    await expect(autorizar(await pedir())).rejects.toThrow('Bomba bloqueada pelo responsável')
  })

  it('bloqueada depois de autorizar: não liga, o motorista vê o motivo; ao desbloquear liga', async () => {
    const p = await pedir(); await autorizar(p)
    await regras(true, 'Fim de semana')
    expect(await poll(false)).toEqual({ status: 'idle' })
    expect(await sessoes()).toHaveLength(0)
    expect((await estadoPedido(p)).bloqueio_motivo).toBe('Fim de semana')

    await regras(false, null)
    expect(await poll(false)).toMatchObject({ status: 'authorized' })
  })

  it('bloquear não corta quem já está a abastecer (isso é o corte de emergência)', async () => {
    await autorizar(await pedir())
    await poll(false)
    await regras(true, 'x')
    expect(await poll(true)).toEqual({ status: 'idle' })
    expect((await sessoes())[0].fim_em).toBeNull()
  })

  it('fora do horário: autorizar recusa com o horário na mensagem', async () => {
    const ini = await horaLisboa(60), fim = await horaLisboa(120)
    await regras(false, null, ini, fim)
    await expect(autorizar(await pedir())).rejects.toThrow(`Fora do horário da bomba (${ini}–${fim})`)
  })

  it('dentro do horário: autoriza e liga', async () => {
    await regras(false, null, await horaLisboa(-60), await horaLisboa(60))
    await autorizar(await pedir())
    expect(await poll(false)).toMatchObject({ status: 'authorized' })
  })

  it('janela que passa a meia-noite (início > fim) é respeitada', async () => {
    // Cobre tudo exceto a hora entre -2h e -1h: agora está dentro
    await regras(false, null, await horaLisboa(-60), await horaLisboa(-120))
    const { rows } = await db.query(`SELECT public.bomba_bloqueio_motivo('POLO2') AS m`)
    expect(rows[0].m).toBeNull()
  })

  it('estado_bomba devolve as regras mesmo antes do primeiro contacto do Shelly', async () => {
    await regras(true, 'Obras no armazém', '07:00', '19:00')
    expect(await estadoBomba()).toMatchObject({
      last_seen_at: null, bloqueada: true, motivo: 'Obras no armazém',
      horario_inicio: '07:00:00', horario_fim: '19:00:00', bloqueio_motivo: 'Obras no armazém',
    })
  })

  it('validações do horário', async () => {
    await expect(regras(false, null, '07:00', null)).rejects.toThrow(/início e de fim/)
    await expect(regras(false, null, '07:00', '07:00')).rejects.toThrow(/não podem ser iguais/)
  })

  it('só quem gere combustível altera as regras', async () => {
    await expect(anon(tx => tx.query(`SELECT public.definir_regras_bomba(true, 'x', NULL, NULL)`))).rejects.toThrow(/permission denied/)
    await expect(comoLeitor(tx => tx.query(`SELECT public.definir_regras_bomba(true, 'x', NULL, NULL)`))).rejects.toThrow(/Sem permissão/)
  })
})

describe('paragem', () => {
  it('"Terminei" do motorista desliga e fecha a sessão como TERMINEI', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await terminei(p)
    expect(await poll(true)).toEqual({ status: 'stop' })
    expect((await sessoes())[0].motivo_fim).toBe('TERMINEI')
  })

  it('"Terminei" atrasado não corta o motorista seguinte', async () => {
    const p1 = await pedir('João'); await autorizar(p1)
    const p2 = await pedir('Rui');  await autorizar(p2)
    await poll(false)
    await passarTempo(300)
    await poll(false) // fecha p1, liga p2

    await terminei(p1)
    const { rows: fila } = await db.query(`SELECT 1 FROM public.pump_comandos WHERE consumido_em IS NULL`)
    expect(fila).toHaveLength(0)
    // mesmo um comando antigo já na fila é descartado
    await db.query(`INSERT INTO public.pump_comandos (pump_id, comando, pedido_id) VALUES ('POLO2', 'STOP', $1)`, [p1])
    expect(await poll(true)).toEqual({ status: 'idle' })
    expect((await sessoes())[1].fim_em).toBeNull()
  })

  it('"Terminei" repetido gera um só comando', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await terminei(p); await terminei(p)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.pump_comandos`)
    expect(rows[0].n).toBe(1)
  })

  it('corte de emergência do gestor desliga e fecha como EMERGENCIA', async () => {
    await autorizar(await pedir())
    await poll(false)
    await comoGestor(tx => tx.query('SELECT public.parar_bomba()'))
    expect(await poll(true)).toEqual({ status: 'stop' })
    expect((await sessoes())[0].motivo_fim).toBe('EMERGENCIA')
  })

  it('emergência sem sessão também desliga (relé ligado à mão)', async () => {
    await comoGestor(tx => tx.query('SELECT public.parar_bomba()'))
    expect(await poll(true)).toEqual({ status: 'stop' })
  })

  it('STOP com mais de 2 minutos é descartado', async () => {
    await comoGestor(tx => tx.query('SELECT public.parar_bomba()'))
    await db.query(`UPDATE public.pump_comandos SET criado_em = now() - interval '3 minutes'`)
    expect(await poll(false)).toEqual({ status: 'idle' })
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.pump_comandos WHERE consumido_em IS NULL`)
    expect(rows[0].n).toBe(0)
  })

  it('rejeitar um pedido com a bomba a trabalhar desliga-a', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await comoGestor(tx => tx.query('SELECT public.rejeitar_abastecimento($1)', [p]))
    expect(await poll(true)).toEqual({ status: 'stop' })
  })
})

describe('integração com aprovação', () => {
  it('aprovar guarda a origem e liga a sessão ao abastecimento', async () => {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await terminei(p); await poll(true)
    await anon(tx => tx.query(`SELECT public.concluir_abastecimento($1, 42.5, 0, 'foto.jpg')`, [p]))
    await comoGestor(tx => tx.query('SELECT public.aprovar_abastecimento_pendente($1)', [p]))

    const { rows: [a] } = await db.query('SELECT * FROM public.comb_abastecimentos')
    // foto_url: a foto do medidor/talão passa para o abastecimento aprovado
    expect(a).toMatchObject({ tipo_fonte: 'POLO2', responsavel: 'João', foto_url: 'foto.jpg' })
    expect(Number(a.litros)).toBe(42.5)
    expect((await sessoes())[0].abastecimento_id).toBe(a.id)
    const { rows } = await db.query('SELECT 1 FROM public.comb_abastecimentos_pendentes WHERE id = $1', [p])
    expect(rows).toHaveLength(0)
  })
})

describe('rejeição na aprovação final', () => {
  async function aguardaAprovacao() {
    const p = await pedir(); await autorizar(p)
    await poll(false)
    await terminei(p); await poll(true)
    await anon(tx => tx.query(`SELECT public.concluir_abastecimento($1, 42.5, 0, 'foto.jpg')`, [p]))
    return p
  }
  const rejeitar = id => comoGestor(tx => tx.query('SELECT public.rejeitar_abastecimento($1)', [id]))
  const estadoDe = async id =>
    (await db.query('SELECT estado FROM public.comb_abastecimentos_pendentes WHERE id = $1', [id])).rows[0]?.estado

  it('rejeita um registo que aguarda aprovação final e não o lança', async () => {
    const p = await aguardaAprovacao()
    await rejeitar(p)
    expect(await estadoDe(p)).toBe('REJEITADO')
    const { rows } = await db.query('SELECT 1 FROM public.comb_abastecimentos')
    expect(rows).toHaveLength(0)
  })

  it('não rejeita duas vezes nem depois de aprovado', async () => {
    const p1 = await aguardaAprovacao()
    await rejeitar(p1)
    await expect(rejeitar(p1)).rejects.toThrow(/já processado/)

    await db.query('TRUNCATE public.pump_sessoes, public.pump_comandos')
    const p2 = await aguardaAprovacao()
    await comoGestor(tx => tx.query('SELECT public.aprovar_abastecimento_pendente($1)', [p2]))
    await expect(rejeitar(p2)).rejects.toThrow(/já processado/)
  })

  it('perfil leitura não rejeita', async () => {
    const p = await aguardaAprovacao()
    await expect(comoLeitor(tx => tx.query('SELECT public.rejeitar_abastecimento($1)', [p]))).rejects.toThrow(/Sem permissão/)
  })
})

describe('segurança', () => {
  it('só a Edge Function (service_role) chama pump_poll', async () => {
    await expect(anon(tx => tx.query(`SELECT public.pump_poll('polo2', false, false)`))).rejects.toThrow(/permission denied/)
    await expect(comoGestor(tx => tx.query(`SELECT public.pump_poll('polo2', false, false)`))).rejects.toThrow(/permission denied/)
  })

  it('motorista (anon) não autoriza nem faz corte de emergência', async () => {
    const p = await pedir()
    await expect(anon(tx => tx.query('SELECT public.autorizar_abastecimento($1)', [p]))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query('SELECT public.parar_bomba()'))).rejects.toThrow(/Sem permissão/)
  })

  it('perfil leitura não autoriza nem vê as sessões', async () => {
    const p = await pedir()
    await expect(comoLeitor(tx => tx.query('SELECT public.autorizar_abastecimento($1)', [p]))).rejects.toThrow(/Sem permissão/)
    await autorizar(p); await poll(false)
    const lidas = await comoLeitor(tx => tx.query('SELECT * FROM public.sessoes_bomba(10)'))
    expect(lidas.rows).toHaveLength(0)
    const doGestor = await comoGestor(tx => tx.query('SELECT * FROM public.sessoes_bomba(10)'))
    expect(doGestor.rows).toHaveLength(1)
  })

  it('nunca duas sessões abertas na mesma bomba', async () => {
    await autorizar(await pedir()); await poll(false)
    await expect(db.query(
      `INSERT INTO public.pump_sessoes (pump_id, pedido_id, segundos_autorizados) VALUES ('POLO2', gen_random_uuid(), 60)`,
    )).rejects.toThrow(/uq_pump_sessao_ativa/)
  })
})
