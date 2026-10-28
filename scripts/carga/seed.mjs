// Seed sintético para testes de carga, só na stack Supabase LOCAL (ver env.mjs).
// Uso: node scripts/carga/seed.mjs [--escala=1]
// Idempotente: tudo o que cria leva o marcador "carga-"; voltar a correr completa o que falta, sem duplicar.
// Os movimentos de stock são imutáveis (nunca DELETE), por isso o seed acrescenta até ao alvo em vez de apagar.
import { createClient } from '@supabase/supabase-js'
import { API_URL, SERVICE_ROLE_KEY, PAPEIS, emailPapel, emailUtilizador, psql, senhaCarga } from './env.mjs'

const escala = Number((process.argv.find((a) => a.startsWith('--escala=')) ?? '--escala=1').split('=')[1])
if (!(escala > 0)) throw new Error('--escala inválida')
const N = (base) => Math.max(1, Math.round(base * escala))
const ALVO = {
  utilizadores: N(500), colaboradores: N(300), produtos: N(2000),
  movimentos: N(50000), viaturas: N(40), ferramentas: N(200),
}
const LOTE_MOV = 5000

// Distribuição dos utilizadores: 60% leitura/motorista, 20% armazém, 10% medições, 5% mecânico, 5% gestor.
function papelDoUtilizador(n, total) {
  const p = ((n - 1) / total) * 100
  if (p < 30) return 'leitura'
  if (p < 60) return 'motorista'
  if (p < 80) return 'armazem'
  if (p < 90) return 'medicoes'
  if (p < 95) return 'mecanico'
  return 'gestor'
}

const senha = senhaCarga()
const sb = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const ADMIN_ID = `(select id from public.profiles where email = '${emailPapel('admin')}')`
const COMO_ADMIN = `
select set_config('request.jwt.claim.sub', ${ADMIN_ID}::text, true);
select set_config('request.jwt.claims', json_build_object('sub', ${ADMIN_ID}, 'role', 'authenticated')::text, true);`

// --- 1. Utilizadores (Auth Admin API local) ---
const alvoUsers = [
  ...PAPEIS.map((p) => ({ email: emailPapel(p), papel: p, nome: `Carga ${p}` })),
  ...Array.from({ length: ALVO.utilizadores }, (_, i) => ({
    email: emailUtilizador(i + 1), papel: papelDoUtilizador(i + 1, ALVO.utilizadores), nome: `Carga Utilizador ${i + 1}`,
  })),
]
const jaExistem = new Set(psql(`select email from auth.users where email like 'carga-%@local.test'`).split('\n').filter(Boolean))
const porCriar = alvoUsers.filter((u) => !jaExistem.has(u.email))
let criados = 0
for (let i = 0; i < porCriar.length; i += 10) {
  await Promise.all(porCriar.slice(i, i + 10).map(async (u) => {
    const { error } = await sb.auth.admin.createUser({
      email: u.email, password: senha, email_confirm: true, user_metadata: { nome: u.nome },
    })
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`)
    criados++
  }))
}
console.log(`utilizadores: +${criados} criados`)

// --- 2. Papéis ---
// O trigger de signup cria perfis 'gestor'. Bootstrap do admin de carga como postgres (equivalente ao
// primeiro admin manual); os restantes passam pela RPC promover_role, autenticada como esse admin.
psql(`update public.profiles set role = 'admin' where email = '${emailPapel('admin')}' and role <> 'admin'`)
const mapa = alvoUsers.map((u) => `('${u.email}','${u.papel}')`).join(',')
psql(`
begin;${COMO_ADMIN}
select count(public.promover_role(p.id, m.papel::public.role_utilizador))
  from (values ${mapa}) as m(email, papel)
  join public.profiles p on p.email = m.email
 where p.role::text <> m.papel;
commit;`)

// --- 3. Obras, colaboradores, produtos, viaturas, ferramentas ---
psql(`
create temp table _obras(nome text, cliente text, loc text, estado text);
insert into _obras values
 ('Moradia T3 Sintra','Família Antunes','Sintra','ativa'),
 ('Edifício Residencial Amadora','Habitar Lda','Amadora','ativa'),
 ('Reabilitação Prédio Alfama','Lisboa Nova SA','Lisboa','ativa'),
 ('Armazém Logístico Azambuja','LogiTejo','Azambuja','ativa'),
 ('Moradia T4 Cascais','José Marques','Cascais','ativa'),
 ('Escola Básica Odivelas','Câmara Municipal de Odivelas','Odivelas','ativa'),
 ('Ampliação Centro de Saúde Loures','ARS Lisboa','Loures','ativa'),
 ('Condomínio Quinta do Lago Seixal','Quinta Verde SA','Seixal','ativa'),
 ('Pavilhão Industrial Palmela','MetalSul','Palmela','ativa'),
 ('Reabilitação Casa Rural Mafra','Ana Ribeiro','Mafra','ativa'),
 ('Lar de Idosos Torres Vedras','Fundação São José','Torres Vedras','ativa'),
 ('Muros e Arruamentos Setúbal','Câmara Municipal de Setúbal','Setúbal','ativa'),
 ('Loja Comercial Colombo','Retail Prime','Lisboa','ativa'),
 ('Moradia T2 Ericeira','Pedro Santos','Mafra','suspensa'),
 ('Moradias Geminadas Oeiras','Atlântico Imobiliária','Oeiras','concluida');
insert into public.obras(nome, cliente, localizacao, estado, ativo, observacoes)
select 'carga-' || o.nome, o.cliente, o.loc, o.estado, o.estado <> 'concluida', 'Dados sintéticos de carga'
  from _obras o
 where not exists (select 1 from public.obras x where x.nome = 'carga-' || o.nome);

insert into public.colaboradores(nome, numero_mecan, cargo, obra_id, ativo, notas)
select (array['João','Manuel','António','Rui','Paulo','Carlos','Nuno','Hugo','Tiago','Bruno','Ana','Marta','Rita','Sofia','Inês'])[1 + (g*7) % 15]
       || ' ' || (array['Silva','Santos','Ferreira','Pereira','Oliveira','Costa','Rodrigues','Martins','Sousa','Fernandes','Gonçalves','Gomes'])[1 + (g*5) % 12]
       || ' ' || g,
       'carga-' || lpad(g::text, 5, '0'),
       (array['Pedreiro','Servente','Carpinteiro','Eletricista','Canalizador','Encarregado','Operador de máquinas','Armador de ferro','Pintor','Serralheiro'])[1 + g % 10],
       (select id from public.obras where nome like 'carga-%' order by nome offset (g % 15) limit 1),
       true, 'Dados sintéticos de carga'
  from generate_series(1, ${ALVO.colaboradores}) g
 where not exists (select 1 from public.colaboradores c where c.numero_mecan = 'carga-' || lpad(g::text, 5, '0'));

create temp table _base(i int, nome text, cat text, un text);
insert into _base values
 (1,'Cimento Portland CEM II 32,5 saco 25kg','Cimentos','sc'),(2,'Varão A500 NR Ø12','Aço','kg'),
 (3,'Varão A500 NR Ø8','Aço','kg'),(4,'Tijolo 30x20x15','Alvenaria','un'),(5,'Tijolo 30x20x11','Alvenaria','un'),
 (6,'Areia lavada','Inertes','m3'),(7,'Brita 1','Inertes','m3'),(8,'Betão C25/30','Betões','m3'),
 (9,'Malha eletrossoldada AQ50','Aço','un'),(10,'Cola para cerâmica C2','Revestimentos','sc'),
 (11,'Tubo PVC Ø110','Canalização','m'),(12,'Tubo multicamada Ø20','Canalização','m'),
 (13,'Cabo elétrico H07V-K 2,5mm²','Eletricidade','m'),(14,'Tubo VD Ø20','Eletricidade','m'),
 (15,'Placa de gesso cartonado 13mm','Acabamentos','un'),(16,'Tinta plástica branca 15L','Acabamentos','un'),
 (17,'Poliestireno extrudido XPS 40mm','Isolamentos','m2'),(18,'Lã de rocha 50mm','Isolamentos','m2'),
 (19,'Telha lusa','Coberturas','un'),(20,'Madeira de cofragem 3m','Cofragem','un'),
 (21,'Prego 80mm','Ferragens','kg'),(22,'Arame de atar','Ferragens','kg'),
 (23,'Capacete de proteção','EPI','un'),(24,'Luvas de proteção','EPI','par'),
 (25,'Disco de corte 230mm','Consumíveis','un'),(26,'Impermeabilizante betuminoso','Impermeabilização','un');
insert into public.produtos(codigo, nome, categoria, unidade, stock_minimo, custo_unitario, observacoes)
select 'carga-' || lpad(g::text, 5, '0'), b.nome || ' ref.' || g, b.cat, b.un,
       (10 + g % 40), round((0.5 + (g % 97) / 4.0)::numeric, 2), 'Dados sintéticos de carga'
  from generate_series(1, ${ALVO.produtos}) g
  join _base b on b.i = 1 + g % 26
 where not exists (select 1 from public.produtos p where p.codigo = 'carga-' || lpad(g::text, 5, '0'));

insert into public.comb_veiculos(codigo, nome, tipo, identificacao, tipo_combustivel, unidade_contador, marca, modelo, observacoes)
select 'carga-V' || lpad(g::text, 4, '0'),
       (array['Carrinha','Camião','Retroescavadora','Miniescavadora','Gerador','Dumper'])[1 + g % 6] || ' ' || g,
       (array['viatura','viatura','maquina','maquina','gerador','maquina'])[1 + g % 6],
       lpad((10 + g % 90)::text, 2, '0') || '-' || chr(65 + g % 26) || chr(65 + (g*3) % 26) || '-' || lpad((g % 90 + 10)::text, 2, '0'),
       case when g % 6 = 4 then 'gasolina' else 'gasoleo' end,
       case when g % 6 in (2,3,4,5) then 'horas' else 'km' end,
       (array['Renault','Iveco','Caterpillar','JCB','Atlas Copco','Volvo'])[1 + g % 6], 'Modelo ' || g, 'Dados sintéticos de carga'
  from generate_series(1, ${ALVO.viaturas}) g
 where not exists (select 1 from public.comb_veiculos v where v.codigo = 'carga-V' || lpad(g::text, 4, '0'));

insert into public.ferramentas(codigo, nome, categoria, marca, valor_estimado, observacoes)
select 'carga-F' || lpad(g::text, 4, '0'),
       (array['Berbequim','Rebarbadora','Martelo demolidor','Serra circular','Nível laser','Vibrador de betão','Compressor','Betoneira','Cortadora de azulejo','Escadote'])[1 + g % 10] || ' ' || g,
       'outro', (array['Hilti','Bosch','Makita','DeWalt','Stanley'])[1 + g % 5], 50 + (g % 40) * 25, 'Dados sintéticos de carga'
  from generate_series(1, ${ALVO.ferramentas}) g
 where not exists (select 1 from public.ferramentas f where f.codigo = 'carga-F' || lpad(g::text, 4, '0'));
`)

// --- 4. Movimentos via registar_movimento_armazem (lotes), autenticados como o admin de carga ---
const nMov = () => Number(psql(`select count(*) from public.movimentos_stock where responsavel like 'carga-%'`))
let falta = ALVO.movimentos - nMov()
let lote = 0
while (falta > 0) {
  const n = Math.min(LOTE_MOV, falta)
  psql(`
begin;${COMO_ADMIN}
select setseed(${((lote + 1) * 0.0137) % 1});
do $$
declare
  obras uuid[] := array(select id from public.obras where nome like 'carga-%' and estado = 'ativa' order by nome);
  np int := (select count(*) from public.produtos where codigo like 'carga-%');
  forn text[] := array['Cimpor','Secil','Sidul Aços','Preceram','Leroy Merlin Pro','Saint-Gobain','Fábrica de Tijolos do Oeste'];
  pid uuid; st numeric; q numeric; r float8; i int; k int;
begin
  for i in 1..${n} loop
    k := 1 + floor(random() * np)::int; -- fora do WHERE: random() é volátil e seria reavaliado por linha
    select id, stock_atual into pid, st from public.produtos where codigo = 'carga-' || lpad(k::text, 5, '0');
    r := random();
    if r < 0.45 or st < 1 then
      perform public.registar_movimento_armazem(pid, 'COMPRA', round((20 + random()*180)::numeric, 2), 'carga-armazem',
        null, forn[1 + floor(random()*7)::int], 'FT ' || (1000 + floor(random()*9000)::int), null, round((0.5 + random()*40)::numeric, 2), 'carga-seed', null);
    elsif r < 0.90 then
      q := least(st, 1 + floor(random()*30));
      perform public.registar_movimento_armazem(pid, 'OBRA', q, 'carga-armazem', obras[1 + floor(random()*array_length(obras,1))::int], null, null, null, null, 'carga-seed', null);
    elsif r < 0.95 then
      q := least(st, 1 + floor(random()*10));
      perform public.registar_movimento_armazem(pid, 'VENDA', q, 'carga-armazem', null, null, null, 'Cliente Carga ' || floor(random()*50)::int, round((1 + random()*60)::numeric, 2), 'carga-seed', null);
    elsif r < 0.98 then
      q := least(st, 1 + floor(random()*3));
      perform public.registar_movimento_armazem(pid, 'QUEBRA', q, 'carga-armazem', null, null, null, null, null, 'carga-seed', null);
    else
      perform public.registar_movimento_armazem(pid, 'INVENTARIO', greatest(1, round((st * (0.9 + random()*0.2))::numeric, 2)), 'carga-armazem', null, null, null, null, null, 'carga-seed', null);
    end if;
  end loop;
end $$;
commit;`)
  falta -= n
  lote++
  console.log(`movimentos: lote ${lote} (+${n}), faltam ${Math.max(0, falta)}`)
}

// --- 5. Contagens ---
const contagens = psql(`
select 'utilizadores', count(*) from auth.users where email like 'carga-%@local.test'
union all select 'perfis', count(*) from public.profiles where email like 'carga-%@local.test'
union all select 'obras', count(*) from public.obras where nome like 'carga-%'
union all select 'colaboradores', count(*) from public.colaboradores where numero_mecan like 'carga-%'
union all select 'produtos', count(*) from public.produtos where codigo like 'carga-%'
union all select 'movimentos', count(*) from public.movimentos_stock where responsavel like 'carga-%'
union all select 'viaturas', count(*) from public.comb_veiculos where codigo like 'carga-%'
union all select 'ferramentas', count(*) from public.ferramentas where codigo like 'carga-%'
union all select 'papel:' || role::text, count(*) from public.profiles where email like 'carga-%@local.test' group by role
union all select 'stock_negativo', count(*) from public.produtos where codigo like 'carga-%' and stock_atual < 0`)
console.log('--- contagens ---\n' + contagens.replace(/\|/g, ' = '))
