/* ApuraBrasil — hemiciclo de cadeiras (puro, sem DOM; testável no Node).
 * Deputados/Senador/Vereador: eleitos ordenados por votos, cor por partido. */
import { partyColor } from './mapa.js';

/** Dimensões do SVG do hemiciclo. */
export const HEMI_W = 640;
export const HEMI_H = 340;

/**
 * Posiciona N assentos em fileiras de arco concêntricas (hemiciclo).
 * Preenche da fileira externa para a interna, da esquerda para a direita.
 * Retorna [{ x, y, r, row }] — determinístico.
 */
export function hemicycle(n, W = HEMI_W, H = HEMI_H) {
  const total = Math.max(0, Math.floor(n));
  if (!total) return [];
  const cx = W / 2;
  const cy = H - 24;
  const rMax = Math.min(W / 2 - 20, H - 48);
  const rows = Math.max(1, Math.round(Math.sqrt(total) / 1.4));
  // Fileiras externas maiores: peso (rows - i).
  const weights = Array.from({ length: rows }, (_, i) => rows - i);
  const wSum = weights.reduce((t, w) => t + w, 0);
  const counts = weights.map((w) => Math.max(1, Math.round((total * w) / wSum)));
  // Ajusta arredondamento na fileira externa.
  counts[0] += total - counts.reduce((t, c) => t + c, 0);
  // Raio do assento: cabe na fileira mais apertada, com teto por porte.
  const cap = total < 8 ? 11 : 8;
  let r = cap;
  for (let i = 0; i < rows; i++) {
    const radius = (rMax * (rows - i)) / rows;
    r = Math.min(r, ((Math.PI * radius) / counts[i]) * 0.36);
  }
  r = Math.max(2.2, Math.min(cap, r));
  const seats = [];
  for (let i = 0; i < rows; i++) {
    const radius = (rMax * (rows - i)) / rows;
    for (let j = 0; j < counts[i]; j++) {
      const th = Math.PI - ((j + 0.5) * Math.PI) / counts[i];
      seats.push({
        x: Math.round((cx + radius * Math.cos(th)) * 10) / 10,
        y: Math.round((cy - radius * Math.sin(th)) * 10) / 10,
        r: Math.round(r * 10) / 10,
        row: i,
      });
    }
  }
  return seats.slice(0, total);
}

/**
 * Monta os dados do hemiciclo.
 * entries: [{ uf, ok, eleitos: [cand com votos], vagas }] (eleitos já filtrados).
 * Retorna { seats, legenda, definidas, total, erros }.
 * seats: [{ x, y, r, cor, cand|null, uf }] em ordem de votos (vazia = indefinida).
 */
export function buildSeatData(entries, claro = false) {
  const all = [];
  let vagas = 0;
  let erros = 0;
  for (const e of entries) {
    if (!e || e.ok === false) { erros += 1; continue; }
    vagas += e.vagas || 0;
    for (const c of e.eleitos || []) all.push({ ...c, __uf: e.uf });
  }
  all.sort((a, b) => (b.votos || 0) - (a.votos || 0));
  const definidas = all.length;
  const total = Math.max(vagas, definidas);
  const pos = hemicycle(total);
  const legenda = new Map();
  const seats = pos.map((p, i) => {
    const cand = i < definidas ? all[i] : null;
    const cor = cand ? partyColor(cand.partido, claro) : '';
    if (cand) {
      const k = cand.partido || '?';
      const atual = legenda.get(k) || { partido: k, cor, seats: 0, votos: 0 };
      atual.seats += 1;
      atual.votos += cand.votos || 0;
      legenda.set(k, atual);
    }
    return { ...p, cor, cand, uf: cand ? cand.__uf : null };
  });
  return {
    seats,
    legenda: [...legenda.values()].sort((a, b) => b.seats - a.seats || b.votos - a.votos),
    definidas,
    total,
    erros,
  };
}
