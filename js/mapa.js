/* ApuraBrasil — dados do mapa por UF (puro, sem DOM; testável no Node).
 * Mapa geográfico (malha IBGE) + tabela de votos por estado.
 * Cores dos candidatos conforme identidade pedida. */
import { gapInfo } from './tse.js';

export const COR_BOLSONARO = '#2f7de1'; // azul — Flávio Bolsonaro
export const COR_LULA = '#e53e3e'; // vermelho — Lula (mistura lógica com o azul)
export const COR_AGUARDANDO = ''; // tile neutro (CSS)
export const COR_ERRO = ''; // tile neutro escuro (CSS)

/** Paleta para outros vencedores (ordem fixa por chave). */
const PALETA_OUTROS_ESCURO = ['#ecc94b', '#4fd1c5', '#fc8181', '#9ae6b4', '#e2e8f0'];
const PALETA_OUTROS_CLARO = ['#a16207', '#0e7490', '#dc2626', '#15803d', '#475569'];

const PARTIDOS_FIXOS = {
  PT: '#e53e3e', PL: '#2b6cb0', MDB: '#38a169', PSD: '#d69e2e',
  PP: '#3182ce', 'UNIÃO': '#805ad5', UNIAO: '#805ad5', PSDB: '#2c5282',
  PODE: '#00b5d8', PSB: '#e53e3e', PDT: '#319795', NOVO: '#ed8936',
};
const PARTIDOS_FIXOS_CLARO = {
  PT: '#c53030', PL: '#2b6cb0', MDB: '#276749', PSD: '#975a16',
  PP: '#2c5282', 'UNIÃO': '#6b46c1', UNIAO: '#6b46c1', PSDB: '#2a4365',
  PODE: '#0987a8', PSB: '#c53030', PDT: '#2c7a7b', NOVO: '#c05621',
};

export function normalizeNome(nome) {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/** Identifica os dois protagonistas pelo nome de urna; null = outro candidato. */
export function identifyProtagonista(urna) {
  const n = ` ${normalizeNome(urna)} `;
  if (n.includes('BOLSONARO')) return 'bolsonaro';
  if (n.includes(' LULA ')) return 'lula';
  return null;
}

/** Cor de um candidato a presidente: fixa p/ os dois, paleta p/ demais. */
export function candidateColor(cand, indiceOutro = 0, claro = false) {
  const id = identifyProtagonista(cand.urna);
  if (id === 'bolsonaro') return COR_BOLSONARO;
  if (id === 'lula') return COR_LULA;
  const pal = claro ? PALETA_OUTROS_CLARO : PALETA_OUTROS_ESCURO;
  return pal[indiceOutro % pal.length];
}

/** Mistura duas cores hex; pesoA em [0,1] (1 = toda A). */
export function misturarCor(corA, corB, pesoA) {
  const w = Math.min(1, Math.max(0, Number(pesoA)));
  const w2 = Number.isFinite(w) ? w : 1;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16));
  const a = rgb(corA), b = rgb(corB);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(a[0] * w2 + b[0] * (1 - w2))}${h(a[1] * w2 + b[1] * (1 - w2))}${h(a[2] * w2 + b[2] * (1 - w2))}`;
}

/** Peso do vencedor na UF pela margem em p.p.: 0.58 (apertada) → 1 (≥30 p.p.). */
export function pesoVencedor(margemPp) {
  const m = Math.min(30, Math.max(0, Number(margemPp) || 0));
  return 0.58 + (0.42 * m) / 30;
}

/** Referências da escala de intensidade p/ a legenda: [margemPp, rotulo]. */
export const ESCALA_MARGEM = [[30, '+30 p.p.'], [15, '~15 p.p.'], [3, '<5 p.p.']];

/** Cor determinística por partido (mapa de Governador/Senador). */
export function partyColor(sigla, claro = false) {
  const fixas = claro ? PARTIDOS_FIXOS_CLARO : PARTIDOS_FIXOS;
  const key = normalizeNome(sigla);
  if (fixas[key]) return fixas[key];
  const pal = claro ? PALETA_OUTROS_CLARO : PALETA_OUTROS_ESCURO;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return pal[h % pal.length];
}

/**
 * Monta os dados do mapa.
 * entries: [{ uf, ok, candidatos }] (candidatos = flattenCandidates da UF).
 * colorBy: 'candidato' (presidente) | 'partido' (gov/sen).
 */
export function buildMapData(entries, colorBy = 'candidato', claro = false) {
  const chavesOutros = new Map(); // chave -> índice na paleta
  const pal = claro ? PALETA_OUTROS_CLARO : PALETA_OUTROS_ESCURO;
  const corDe = (winner) => {
    if (colorBy === 'partido') return partyColor(winner.partido, claro);
    const id = identifyProtagonista(winner.urna);
    if (id) return id === 'bolsonaro' ? COR_BOLSONARO : COR_LULA;
    const chave = `${winner.numero}|${winner.partido}`;
    if (!chavesOutros.has(chave)) chavesOutros.set(chave, chavesOutros.size);
    return pal[chavesOutros.get(chave) % pal.length];
  };

  const ufs = [];
  const legenda = new Map(); // cor -> { cor, rotulo, partido, ufs, votos }
  let aguardando = 0, erros = 0, empates = 0;

  // Totais por chave de legenda somando TODAS as UFs com dados (não só as vencidas).
  const totais = new Map();
  for (const e of entries) {
    if (!e || e.ok === false || !Array.isArray(e.candidatos)) continue;
    for (const c of e.candidatos) {
      const chave = colorBy === 'partido' ? `P|${c.partido}` : `C|${c.numero}|${c.urna}`;
      totais.set(chave, (totais.get(chave) || 0) + (c.votos || 0));
    }
  }

  for (const e of entries) {
    if (!e || e.ok === false) { erros += 1; ufs.push({ uf: e?.uf || '?', status: 'erro' }); continue; }
    const urnas = e.secoes?.pct ?? null;
    const gap = gapInfo(e.candidatos);
    if (gap.status === 'insuficiente') { erros += 1; ufs.push({ uf: e.uf, status: 'erro' }); continue; }
    if (gap.status !== 'ok') {
      if (gap.status === 'aguardando') aguardando += 1; else empates += 1;
      ufs.push({ uf: e.uf, status: gap.status, gap, urnas });
      continue;
    }
    const winner = gap.leader;
    const corBase = corDe(winner);
    const corVice = corDe(gap.runner);
    const margem = gap.diffPp;
    const cor = misturarCor(corBase, corVice, pesoVencedor(margem));
    ufs.push({ uf: e.uf, status: 'ok', cor, corBase, margem, winner, gap, urnas });
    const chave = colorBy === 'partido' ? `P|${winner.partido}` : `C|${winner.numero}|${winner.urna}`;
    const atual = legenda.get(chave) || {
      cor: corBase,
      rotulo: colorBy === 'partido' ? winner.partido : winner.urna,
      partido: winner.partido,
      numero: winner.numero,
      ufs: 0,
      votos: 0,
    };
    atual.ufs += 1;
    atual.votos += winner.votos;
    legenda.set(chave, atual);
  }

  for (const [chave, item] of legenda) {
    if (totais.has(chave)) item.votos = totais.get(chave);
  }

  const ordenada = [...legenda.values()].sort((a, b) => b.votos - a.votos || b.ufs - a.ufs);
  const escala = ordenada.length >= 2 ? {
    a: { rotulo: ordenada[0].rotulo, cor: ordenada[0].cor },
    b: { rotulo: ordenada[1].rotulo, cor: ordenada[1].cor },
    refs: ESCALA_MARGEM.map(([m, rotulo]) => ({
      margem: rotulo,
      corA: misturarCor(ordenada[0].cor, ordenada[1].cor, pesoVencedor(m)),
      corB: misturarCor(ordenada[1].cor, ordenada[0].cor, pesoVencedor(m)),
    })),
  } : null;

  return {
    ufs,
    legenda: ordenada,
    escala,
    aguardando, erros, empates,
    total: entries.length,
  };
}
