/* Cliente da API oficial de resultados do TSE (resultados.tse.jus.br).
 * Padroes de URL extraidos do app oficial (chunk 9132) e validados contra a API real.
 * Modulo puro (sem DOM): importavel no navegador (type=module) e no Node (testes). */

export const TSE_BASE = 'https://resultados.tse.jus.br';
export const TSE_AMBIENTE = 'oficial';

export const pad = (v, len) => String(v).padStart(len, '0');

/** ele-c.json: pleitos -> eleicoes -> abrangencias -> cargos. */
export function eleConfigUrl() {
  return `${TSE_BASE}/${TSE_AMBIENTE}/comum/config/ele-c.json`;
}

/** Lista de municipios/zonas de uma eleicao (~520 KB, cachear por eleicao). */
export function munUrl(ciclo, eleicao) {
  return `${TSE_BASE}/${TSE_AMBIENTE}/${ciclo}/${eleicao}/config/mun-e${pad(eleicao, 6)}-cm.json`;
}

/** Dados unificados (votacao). municipio='' => agregado UF/BR; zona opcional. */
export function dadosUrl(ciclo, eleicao, uf, cargo, municipio = '', zona = '') {
  const u = String(uf).toLowerCase();
  const mu = municipio && municipio !== 'TODOS' ? pad(municipio, 5) : '';
  const z = zona ? `-z${pad(zona, 4)}` : '';
  const file = `${u}${mu}${z}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
  return `${TSE_BASE}/${TSE_AMBIENTE}/${ciclo}/${eleicao}/dados/${u}/${file}`;
}

/** Eleitos por abrangencia (ex.: vencedores de prefeito por municipio da UF). */
export function eleitosUrl(ciclo, eleicao, uf, cargo) {
  const u = String(uf).toLowerCase();
  return `${TSE_BASE}/${TSE_AMBIENTE}/${ciclo}/${eleicao}/dados/${u}/${u}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-e.json`;
}

/** Foto do candidato (sqcand do JSON de dados). */
export function fotoUrl(ciclo, eleicao, uf, sqcand) {
  return `${TSE_BASE}/${TSE_AMBIENTE}/${ciclo}/${eleicao}/fotos/${String(uf).toLowerCase()}/${sqcand}.jpeg`;
}

/* ---------------- Regioes ---------------- */

export const REGIOES = {
  norte: { nome: 'Norte', ufs: ['ac', 'ap', 'am', 'pa', 'ro', 'rr', 'to'] },
  nordeste: { nome: 'Nordeste', ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
  'centro-oeste': { nome: 'Centro-Oeste', ufs: ['df', 'go', 'mt', 'ms'] },
  sudeste: { nome: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
  sul: { nome: 'Sul', ufs: ['pr', 'rs', 'sc'] },
};

export const UF_NOME = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão',
  mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais', pa: 'Pará',
  pb: 'Paraíba', pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro',
  rn: 'Rio Grande do Norte', rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima',
  sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins',
};

export const UF_POR_REGIAO = Object.fromEntries(
  Object.entries(REGIOES).flatMap(([reg, { ufs }]) => ufs.map((uf) => [uf, reg])),
);

/* ---------------- Parsers ---------------- */

/** Normaliza ele-c.json -> pleitos com eleicoes, cargos e abrangencias. */
export function parseEleConfig(json) {
  return (json.pl || []).map((pl) => ({
    codigo: pl.cd,
    ciclo: pl.c,
    data: pl.dt,
    eleicoes: (pl.e || []).map((e) => ({
      codigo: e.cd,
      nome: e.nm,
      turno: e.t,
      tipo: e.tp,
      codigoSegundoTurno: e.cdt2 || null,
      abrangencias: (e.abr || []).map((a) => ({
        uf: String(a.cd).toLowerCase(),
        cargos: (a.cp || []).map((c) => ({ codigo: c.cd, nome: c.ds.trim(), tipo: c.tp })),
        // Restricao de municipios (2o turno / suplementares); null = todos.
        municipios: a.mu ? a.mu.map((m) => ({ codigo: m.cd, ibge: m.cdi })) : null,
      })),
    })),
  }));
}

/** Achata carg/agr/par/cand -> lista de candidatos com votos. */
export function flattenCandidates(unificado) {
  const out = [];
  for (const carg of unificado?.carg || []) {
    for (const agr of carg.agr || []) {
      for (const par of agr.par || []) {
        for (const c of par.cand || []) {
          out.push({
            numero: c.n,
            sqcand: c.sqcand,
            nome: c.nm,
            urna: c.nmu,
            partido: par.sg,
            partidoNome: par.nm,
            federacao: par.nfed || '',
            composicao: agr.com || '',
            votos: toInt(c.vap),
            pct: toFloat(c.pvap),
            eleitoFlag: c.e === 's',
            situacao: (c.st || '').trim(),
            vice: (c.vs || []).map((v) => ({ nome: v.nmu || v.nm, partido: v.sgp || '' })),
          });
        }
      }
    }
  }
  out.sort((a, b) => b.votos - a.votos);
  return out;
}

/** Resumo: urnas apuradas, eleitorado, votos validos/brancos/nulos, totalizacao. */
export function parseResumo(unificado) {
  const s = unificado?.s || {};
  const e = unificado?.e || {};
  const v = unificado?.v || {};
  return {
    eleicao: unificado?.ele || '',
    turno: unificado?.t || '',
    tipoAbrangencia: unificado?.tpabr || '',
    codAbrangencia: unificado?.cdabr || '',
    geradoEm: [unificado?.dg, unificado?.hg].filter(Boolean).join(' '),
    totalizadoEm: [unificado?.dt, unificado?.ht].filter(Boolean).join(' '),
    divulgar: unificado?.dv === 's',
    totalizacaoFinal: unificado?.tf === 's',
    cargoNome: unificado?.carg?.[0]?.nmn || '',
    vagas: toInt(unificado?.carg?.[0]?.nv),
    secoes: { total: toInt(s.ts), apuradas: toInt(s.st), pct: toFloat(s.pst) },
    eleitorado: toInt(e.te),
    votos: {
      comparecimento: toInt(v.tv),
      validos: toInt(v.vv),
      brancos: toInt(v.vb),
      nulos: toInt(v.vn ?? v.tvn),
    },
    abstencao: { total: toInt(e.a), pct: toFloat(e.pa) },
  };
}

/** Eleitos (-e.json) -> [{ municipio, codigo, candidatos: [...] }]. */
export function parseEleitos(eleitos) {
  return (eleitos?.abr || []).map((a) => ({
    municipio: a.nmabr || '',
    codigo: a.cdabr || '',
    totalizadoEm: [a.dt, a.ht].filter(Boolean).join(' '),
    candidatos: (a.cand || []).map((c) => ({
      numero: c.n,
      sqcand: c.sqcand,
      nome: c.nm,
      urna: c.nmu,
      partido: c.sgp || '',
      composicao: c.com || '',
      votos: toInt(c.vap),
      ordem: toInt(c.seq),
      vice: (c.vs || []).map((v) => ({ nome: v.nmu || v.nm, partido: v.sgp || '' })),
    })),
  }));
}

/** Colégios eleitorais (UFs): itens [{ uf, ok, resumo }] -> linhas ordenadas + totais Brasil. */
export function totalizarColegios(itens) {
  const linhas = [];
  const totais = { total: 0, validos: 0, brancos: 0, nulos: 0, abstencoes: 0 };
  for (const it of itens || []) {
    if (!it || it.ok === false || !it.resumo) continue;
    const r = it.resumo;
    const linha = {
      uf: it.uf,
      total: r.eleitorado || 0,
      validos: r.votos?.validos || 0,
      brancos: r.votos?.brancos || 0,
      nulos: r.votos?.nulos || 0,
      abstencoes: r.abstencao?.total ?? Math.max(0, (r.eleitorado || 0) - (r.votos?.comparecimento || 0)),
    };
    linhas.push(linha);
    totais.total += linha.total;
    totais.validos += linha.validos;
    totais.brancos += linha.brancos;
    totais.nulos += linha.nulos;
    totais.abstencoes += linha.abstencoes;
  }
  linhas.sort((a, b) => b.total - a.total || String(a.uf).localeCompare(String(b.uf)));
  return { linhas, totais, comDados: linhas.length, total: (itens || []).length };
}

/** Duelo 1º x 2º por colégio: itens [{ uf, ok, resumo, candidatos }] -> par fixo + linhas.
 * O par é o top-2 nacional por votos; `valido` exige presença em >=90% das UFs
 * (vale para presidente; cargos por UF não têm par nacional). */
export function dueloColegios(itens) {
  const tot = new Map();
  const porUf = new Map();
  const eleit = new Map();
  const vvUf = new Map();
  for (const it of itens || []) {
    if (!it || it.ok === false) continue;
    eleit.set(it.uf, it.resumo?.eleitorado || 0);
    vvUf.set(it.uf, it.resumo?.votos?.validos || 0);
    const m = new Map();
    for (const c of it.candidatos || []) {
      const k = `${c.numero}|${c.sqcand}`;
      m.set(k, (m.get(k) || 0) + (c.votos || 0));
      if (!tot.has(k)) tot.set(k, { ...c, votos: 0 });
      tot.get(k).votos += c.votos || 0;
    }
    porUf.set(it.uf, m);
  }
  const rank = [...tot.values()].sort((a, b) => b.votos - a.votos);
  const [a, b] = rank;
  const ufs = [...eleit.keys()];
  const chave = (c) => `${c.numero}|${c.sqcand}`;
  const cob = (c) => (!c || !ufs.length ? 0 : ufs.filter((u) => (porUf.get(u).get(chave(c)) || 0) > 0).length / ufs.length);
  const valido = !!a && !!b && cob(a) >= 0.9 && cob(b) >= 0.9;
  const linhas = ufs.map((u) => ({
    uf: u,
    total: eleit.get(u),
    validos: vvUf.get(u),
    v1: a ? (porUf.get(u).get(chave(a)) || 0) : 0,
    v2: b ? (porUf.get(u).get(chave(b)) || 0) : 0,
  })).sort((x, y) => y.total - x.total || String(x.uf).localeCompare(String(y.uf)));
  const maxVoto = linhas.reduce((m, l) => Math.max(m, l.v1, l.v2), 0);
  const vvNac = linhas.reduce((t, l) => t + l.validos, 0);
  return { a, b, linhas, maxVoto, vvNac, valido };
}

/** Votos por eleitor: majoritarios (tp=1) votam `nv` vezes; proporcionais votam 1 vez. */
export function fatorVotosPorEleitor(tipoCargo, vagas) {
  if (String(tipoCargo || '') !== '1') return 1;
  return Math.max(1, toInt(vagas));
}

/** Soma arquivos -u.json de varias UFs -> consolidado de regiao. */
export function consolidarRegiao(unificados, rotulo) {
  const mapa = new Map();
  const soma = { secoesTotal: 0, secoesApuradas: 0, eleitorado: 0, tv: 0, vv: 0, vb: 0, vn: 0 };
  let geradoEm = '';
  let totalizacaoFinal = true;
  let cargoNome = '';
  let vagas = 0;
  let ok = 0;
  for (const u of unificados) {
    if (!u) continue;
    ok += 1;
    const r = parseResumo(u);
    cargoNome = cargoNome || r.cargoNome;
    vagas = Math.max(vagas, r.vagas);
    geradoEm = r.geradoEm || geradoEm;
    totalizacaoFinal = totalizacaoFinal && r.totalizacaoFinal;
    soma.secoesTotal += r.secoes.total;
    soma.secoesApuradas += r.secoes.apuradas;
    soma.eleitorado += r.eleitorado;
    soma.tv += r.votos.comparecimento;
    soma.vv += r.votos.validos;
    soma.vb += r.votos.brancos;
    soma.vn += r.votos.nulos;
    for (const c of flattenCandidates(u)) {
      const k = `${c.numero}|${c.sqcand}`;
      const atual = mapa.get(k) || { ...c, votos: 0 };
      atual.votos += c.votos;
      mapa.set(k, atual);
    }
  }
  const candidatos = [...mapa.values()].sort((a, b) => b.votos - a.votos);
  const base = candidatos.reduce((t, c) => t + c.votos, 0);
  for (const c of candidatos) c.pct = base > 0 ? (c.votos / base) * 100 : 0;
  return {
    rotulo,
    ufsCarregadas: ok,
    cargoNome,
    vagas,
    geradoEm,
    totalizacaoFinal: ok > 0 && totalizacaoFinal,
    secoes: {
      total: soma.secoesTotal,
      apuradas: soma.secoesApuradas,
      pct: soma.secoesTotal > 0 ? (soma.secoesApuradas / soma.secoesTotal) * 100 : 0,
    },
    eleitorado: soma.eleitorado,
    votos: { comparecimento: soma.tv, validos: soma.vv, brancos: soma.vb, nulos: soma.vn },
    candidatos,
  };
}

const PARTIDOS_ESQUERDA = new Set(['PT', 'PSOL', 'PCDOB', 'PC DO B', 'PDT', 'PSB', 'PV', 'REDE', 'PSTU', 'PCB', 'PCO', 'UP']);
const PARTIDOS_DIREITA = new Set(['PL', 'PP', 'REPUBLICANOS', 'UNIAO', 'UNIÃO', 'NOVO', 'PRD', 'PATRIOTA', 'DC', 'PRTB', 'PMN', 'MOBILIZA', 'PMB', 'AGIR', 'MISSAO', 'MISSÃO']);

/** Normaliza texto para busca: sem acento, minúsculo, espaços únicos. */
export function normalizeBusca(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Busca textual em candidatos: casa nome de urna, nome completo e número.
 * Ordena por relevância (posição do match; número exato primeiro) e votos.
 * Retorna { total, itens } com no máximo `limite` itens.
 */
export function searchCandidates(lista, query, limite = 50) {
  const q = normalizeBusca(query);
  if (q.length < 2) return { total: 0, itens: [] };
  const qDig = q.replace(/\D/g, '');
  const scored = [];
  for (const c of lista || []) {
    const numero = String(c.numero || '');
    if (qDig && numero === qDig) { scored.push({ c, score: -1 }); continue; }
    const i1 = normalizeBusca(c.urna).indexOf(q);
    const i2 = normalizeBusca(c.nome).indexOf(q);
    let score = -1;
    if (i1 >= 0) score = i1;
    if (i2 >= 0) score = score < 0 ? i2 + 0.5 : Math.min(score, i2 + 0.5);
    if (score < 0 && qDig && numero.startsWith(qDig)) score = 0;
    if (score >= 0) scored.push({ c, score });
  }
  scored.sort((a, b) => a.score - b.score || (b.c.votos || 0) - (a.c.votos || 0));
  return { total: scored.length, itens: scored.slice(0, limite).map((s) => s.c) };
}

/**
 * Campo ideológico simplificado do partido (esquerda/centro/direita).
 * Centro é o padrão para siglas não mapeadas. Classificação editorial
 * simplificada para leitura rápida — ver nota no rodapé do portal.
 */
export function ideologia(sigla) {
  const s = String(sigla || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  if (PARTIDOS_ESQUERDA.has(s)) return 'esquerda';
  if (PARTIDOS_DIREITA.has(s) || PARTIDOS_DIREITA.has(s.replace(/\s+/g, ''))) return 'direita';
  return 'centro';
}

/**
 * Diferença entre 1º e 2º (lista já ordenada por votos desc).
 * Retorna { status: 'ok'|'aguardando'|'empate'|'insuficiente', leader, runner,
 *           diffVotos, diffPp, share1 } — share1 = fração do líder na soma dos dois.
 */
export function gapInfo(candidatos) {
  const lista = candidatos || [];
  if (lista.length < 2) return { status: 'insuficiente' };
  const [leader, runner] = lista;
  if (leader.votos === 0 && runner.votos === 0) return { status: 'aguardando', leader, runner };
  if (leader.votos === runner.votos) {
    return { status: 'empate', leader, runner, diffVotos: 0, diffPp: 0, share1: 0.5 };
  }
  const soma = leader.votos + runner.votos;
  return {
    status: 'ok',
    leader,
    runner,
    diffVotos: leader.votos - runner.votos,
    diffPp: Math.abs(leader.pct - runner.pct),
    share1: soma > 0 ? leader.votos / soma : 0.5,
  };
}

/**
 * Projeção ponderada por abrangência: extrapola cada entrada (UF/município)
 * pela sua fração apurada e soma por candidato. Com 1 entrada equivale à
 * projeção linear simples. entries: [{ candidatos, secoes: {total, apuradas} }].
 * Retorna { linhas: [{...cand, atual, proj, projPct}], fGlobal, ufsOk, ufsTotal,
 *           validosAtual, validosProj }.
 */
export function projectWeighted(entries) {
  const mapa = new Map();
  let apuradas = 0, total = 0, ok = 0;
  for (const e of entries) {
    const t = e?.secoes?.total || 0;
    const a = e?.secoes?.apuradas || 0;
    if (!e || t <= 0 || a <= 0) continue;
    ok += 1;
    apuradas += a;
    total += t;
    const fator = t / a;
    for (const c of e.candidatos || []) {
      const k = `${c.numero}|${c.sqcand}`;
      const atual = mapa.get(k) || { ...c, atual: 0, proj: 0 };
      atual.atual += c.votos;
      atual.proj += c.votos * fator;
      mapa.set(k, atual);
    }
  }
  const linhas = [...mapa.values()].sort((x, y) => y.proj - x.proj);
  const somaProj = linhas.reduce((t, c) => t + c.proj, 0);
  for (const c of linhas) c.projPct = somaProj > 0 ? (c.proj / somaProj) * 100 : 0;
  return {
    linhas,
    fGlobal: total > 0 ? apuradas / total : 0,
    ufsOk: ok,
    ufsTotal: entries.length,
    validosAtual: linhas.reduce((t, c) => t + c.atual, 0),
    validosProj: somaProj,
  };
}

/**
 * Situação da disputa: 'definido' (matemática impossível de virar),
 * 'tendencia' (2º precisa de >75% dos restantes) ou 'aberto'.
 */
export function situacaoDisputa(diffVotos, restantesValidos) {
  if (restantesValidos <= 0) return 'definido';
  const necessario = 0.5 + diffVotos / (2 * restantesValidos);
  if (necessario > 1) return 'definido';
  if (necessario > 0.75) return 'tendencia';
  return 'aberto';
}

/** Fração dos votos restantes que o 2º precisa para virar (0..1+, >1 = impossível). */
export function shareParaVirar(diffVotos, restantesValidos) {
  if (restantesValidos <= 0) return Infinity;
  return 0.5 + diffVotos / (2 * restantesValidos);
}

/** Localiza o 1º turno correspondente a uma eleição de 2º turno (via cdt2). */
export function turnoAnterior(pleitos, codigoEleicao) {
  for (const p of pleitos || []) {
    for (const e of p.eleicoes || []) {
      if (String(e.codigoSegundoTurno || '') === String(codigoEleicao)) {
        return { ciclo: p.ciclo, eleicao: e.codigo, turno: e.turno };
      }
    }
  }
  return null;
}

export const toInt = (v) => {
  const n = parseInt(String(v ?? '0').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

export const toFloat = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '0').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/* ---------------- Fetch ---------------- */

export class TseError extends Error {
  constructor(message, status, url) {
    super(message);
    this.status = status;
    this.url = url;
  }
}

/** GET JSON sem cache (dados de apuracao mudam a cada minuto). */
export async function fetchJson(url, fetchFn = fetch) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetchFn(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new TseError(`TSE ${res.status} em ${url}`, res.status, url);
  return res.json();
}
