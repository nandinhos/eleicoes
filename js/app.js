/* ApuraBrasil — UI do portal de resultados (dados oficiais do TSE, tempo real). */
import {
  eleConfigUrl, munUrl, dadosUrl, eleitosUrl, fotoUrl,
  REGIOES, UF_NOME, UF_POR_REGIAO, parseEleConfig,
  flattenCandidates, parseResumo, parseEleitos, consolidarRegiao, fetchJson, gapInfo, ideologia,
  fatorVotosPorEleitor,
  projectWeighted, situacaoDisputa, shareParaVirar, turnoAnterior,
  searchCandidates, totalizarColegios, dueloColegios,
} from './tse.js';
import { buildMapData, candidateColor } from './mapa.js';
import { buildSeatData, HEMI_W, HEMI_H } from './cadeiras.js';
import { BRASIL_VIEWBOX, UF_PATHS } from './brasil-ufs.js';

const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat('pt-BR');
const fmtCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtPct = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const storeKey = 'apurabrasil:v1';

const els = {
  selPleito: $('selPleito'), selEleicao: $('selEleicao'), cargoTabs: $('cargoTabs'),
  regiaoChips: $('regiaoChips'), ufChips: $('ufChips'),
  munField: $('munField'), selMunicipio: $('selMunicipio'), munList: $('munList'),
  scopeLine: $('scopeLine'), btnRefresh: $('btnRefresh'), chkAuto: $('chkAuto'), countdown: $('countdown'),
  statusBox: $('statusBox'), kpiStrip: $('kpiStrip'),
  kUrnas: $('kUrnas'), kUrnasBar: $('kUrnasBar'), kValidos: $('kValidos'),
  kBrancos: $('kBrancos'), kBrancosP: $('kBrancosP'), kNulos: $('kNulos'), kNulosP: $('kNulosP'),
  kEleitorado: $('kEleitorado'), kValidosP: $('kValidosP'), kEleitNote: $('kEleitNote'),
  kGapWrap: $('kGapWrap'), kGap: $('kGap'), kGapSub: $('kGapSub'),
  kAbs: $('kAbs'), kAbsSub: $('kAbsSub'),
  kCand1: $('kCand1'), kCand1V: $('kCand1V'), kCand1P: $('kCand1P'),
  kCand2: $('kCand2'), kCand2V: $('kCand2V'), kCand2P: $('kCand2P'),
  resTitle: $('resTitle'), resMeta: $('resMeta'), resBadge: $('resBadge'),
  q: $('q'), ranking: $('ranking'), moreWrap: $('moreWrap'), btnMore: $('btnMore'),
  eleitosPanel: $('eleitosPanel'), eleitosTitle: $('eleitosTitle'), eleitosMeta: $('eleitosMeta'),
  qMun: $('qMun'), eleitosBody: $('eleitosBody'),
  liveBadge: $('liveBadge'), liveLabel: $('liveLabel'), clock: $('clock'),
  btnTheme: $('btnTheme'), icoSun: $('icoSun'), icoMoon: $('icoMoon'), themeColor: $('themeColor'),
  tabRanking: $('tabRanking'), tabMapa: $('tabMapa'), tabProj: $('tabProj'), tabBusca: $('tabBusca'),
  buscaPanel: $('buscaPanel'), buscaMeta: $('buscaMeta'), qCand: $('qCand'),
  buscaHint: $('buscaHint'), buscaResults: $('buscaResults'), buscaFoot: $('buscaFoot'),
  tabCad: $('tabCad'), cadPanel: $('cadPanel'), cadTitle: $('cadTitle'), cadMeta: $('cadMeta'),
  cadLayout: $('cadLayout'), seatTip: $('seatTip'), cadDir: $('cadDir'), cadDirP: $('cadDirP'),
  cadCen: $('cadCen'), cadCenP: $('cadCenP'), cadEsq: $('cadEsq'), cadEsqP: $('cadEsqP'),
  cadLegend: $('cadLegend'), hemiGrid: $('hemiGrid'), seatDetail: $('seatDetail'),
  seatDrillWrap: $('seatDrillWrap'), btnSeatDrill: $('btnSeatDrill'),
  projPanel: $('projPanel'), projTitle: $('projTitle'), projMeta: $('projMeta'), projBadge: $('projBadge'),
  projChart: $('projChart'), viradaBox: $('viradaBox'),
  prevColAnt: $('prevColAnt'), prevBody: $('prevBody'), metodoText: $('metodoText'),
  mapPanel: $('mapPanel'), mapTitle: $('mapTitle'), mapMeta: $('mapMeta'),
  mapLegend: $('mapLegend'), mapGrid: $('mapGrid'), mapHint: $('mapHint'), mapCaption: $('mapCaption'), mapTip: $('mapTip'),
  mapTableWrap: $('mapTableWrap'), updateBar: $('updateBar'), btnUpdate: $('btnUpdate'), appVer: $('appVer'),
  ufTableBody: $('ufTableBody'),
  tabCol: $('tabCol'), colPanel: $('colPanel'), colTitle: $('colTitle'), colMeta: $('colMeta'),
  colTableBody: $('colTableBody'), colTableFoot: $('colTableFoot'),
  colLayout: $('colLayout'), vsCard: $('vsCard'), vsHeadA: $('vsHeadA'), vsHeadB: $('vsHeadB'), vsRows: $('vsRows'),
};

window.__apuraBoot = true;

const state = {
  pleitos: [], pleito: null, eleicao: null, cargo: null,
  regiao: 'todas', uf: '', municipio: '', munCache: new Map(),
  candidatos: [], eleitos: [], showAll: false, timer: 60, finalizada: false, loading: false,
  view: 'ranking', pendingView: false, reloadQueued: false, mapCache: new Map(), projCache: new Map(), mapLast: null,
  buscaCache: new Map(), buscaFalhas: new Set(), buscaRun: 0, buscaLast: [], buscaDrill: '',
  cadCache: new Map(), cadLast: null, cadSel: -1,
  ufStage: new Map(), // chave URL-UF -> { ok, resumo, candidatos } (mapa + colégios)
};

/* ---------------- Boot ---------------- */

init();

async function init() {
  initTheme();
  stampVersion();
  startClock();
  wireEvents();
  setStatus('Carregando eleições…');
  try {
    const raw = await fetchJson(eleConfigUrl());
    state.pleitos = parseEleConfig(raw).filter((p) => p.eleicoes.length > 0);
    if (!state.pleitos.length) throw new Error('Nenhum pleito encontrado.');
    buildPleitoSelect();
    restore();
    renderAll();
    await load();
  } catch (err) {
    console.error(err);
    setStatus('Não foi possível carregar os dados do TSE. Verifique sua conexão e clique em “Atualizar agora”.', true);
    setLive('off', 'desconectado');
  }
}

function wireEvents() {
  els.selPleito.addEventListener('change', () => {
    state.pleito = state.pleitos[Number(els.selPleito.value)];
    state.eleicao = state.pleito.eleicoes[0];
    state.cargo = state.eleicao.abrangencias[0].cargos[0];
    state.regiao = 'todas'; state.uf = ''; state.municipio = ''; state.showAll = false;
    renderAll(); load();
  });
  els.selEleicao.addEventListener('change', () => {
    state.eleicao = state.pleito.eleicoes[Number(els.selEleicao.value)];
    state.cargo = state.eleicao.abrangencias[0].cargos[0];
    state.regiao = 'todas'; state.uf = ''; state.municipio = ''; state.showAll = false;
    renderAll(); load();
  });
  els.cargoTabs.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cargo]');
    if (!btn) return;
    state.cargo = cargos().find((c) => c.codigo === btn.dataset.cargo);
    state.showAll = false;
    renderAll();
    if (isSeatCargo() && state.view !== 'cadeiras') setView('cadeiras');
    else load();
  });
  els.regiaoChips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-regiao]');
    if (!btn) return;
    state.regiao = btn.dataset.regiao;
    state.uf = ''; state.municipio = ''; state.showAll = false;
    renderAll(); load();
  });
  els.ufChips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-uf]');
    if (!btn) return;
    state.uf = btn.dataset.uf;
    state.municipio = ''; els.selMunicipio.value = ''; state.showAll = false;
    renderAll(); load();
  });
  els.selMunicipio.addEventListener('change', () => {
    state.municipio = munCodeByName(els.selMunicipio.value);
    if (els.selMunicipio.value && !state.municipio) {
      setStatus(`Município “${els.selMunicipio.value}” não encontrado. Escolha um item da lista.`, true);
      return;
    }
    state.showAll = false;
    renderAll(); load();
  });
  els.btnRefresh.addEventListener('click', () => load());
  els.btnUpdate.addEventListener('click', () => window.location.reload());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) checkForUpdate(); });
  setTimeout(checkForUpdate, 20000);
  els.btnTheme.addEventListener('click', () => applyTheme(isClaro() ? 'dark' : 'light'));
  els.tabRanking.addEventListener('click', () => setView('ranking'));
  els.tabMapa.addEventListener('click', () => setView('mapa'));
  els.tabProj.addEventListener('click', () => setView('projecoes'));
  els.tabBusca.addEventListener('click', () => setView('busca'));
  els.tabCad.addEventListener('click', () => setView('cadeiras'));
  els.tabCol.addEventListener('click', () => setView('colegios'));
  els.hemiGrid.addEventListener('mousemove', (ev) => {
    const el = ev.target.closest('[data-idx]');
    if (!el) return;
    const i = Number(el.dataset.idx);
    selectSeat(i);
    showSeatTip(ev, i);
  });
  els.hemiGrid.addEventListener('mouseleave', hideSeatTip);
  els.hemiGrid.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-idx]');
    if (!el) return;
    selectSeat(Number(el.dataset.idx));
    drillSeat();
  });
  els.btnSeatDrill.addEventListener('click', drillSeat);
  els.cadLegend.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest('[data-party]');
    const svg = els.hemiGrid.querySelector('svg');
    if (!row || !svg) return;
    svg.classList.add('dim');
    svg.querySelectorAll('.seat.hl').forEach((el) => el.classList.remove('hl'));
    svg.querySelectorAll(`[data-party="${CSS.escape(row.dataset.party)}"]`).forEach((el) => el.classList.add('hl'));
  });
  els.cadLegend.addEventListener('mouseleave', () => {
    const svg = els.hemiGrid.querySelector('svg');
    if (!svg) return;
    svg.classList.remove('dim');
    svg.querySelectorAll('.seat.hl').forEach((el) => el.classList.remove('hl'));
  });
  let buscaT = null;
  els.qCand.addEventListener('input', () => {
    clearTimeout(buscaT);
    buscaT = setTimeout(() => { if (state.view === 'busca' && !state.loading) loadBusca(); }, 300);
  });
  els.qCand.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && state.buscaLast.length) drillBusca(state.buscaLast[0]);
  });
  els.buscaResults.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-idx]');
    if (!b) return;
    const r = state.buscaLast[Number(b.dataset.idx)];
    if (r) drillBusca(r);
  });
  const drill = (ev) => {
    const el = ev.target.closest('[data-uf]');
    if (!el || !UF_NOME[el.dataset.uf]) return;
    state.uf = el.dataset.uf;
    state.municipio = ''; els.selMunicipio.value = '';
    hideMapTip();
    setView('ranking');
  };
  els.mapGrid.addEventListener('click', drill);
  els.ufTableBody.addEventListener('click', drill);
  els.colTableBody.addEventListener('click', drill);
  els.vsRows.addEventListener('click', drill);
  els.mapGrid.addEventListener('mousemove', (ev) => {
    const p = ev.target.closest('[data-uf]');
    els.mapCaption.textContent = p?.dataset.info || '';
    showMapTip(ev, p?.dataset.uf);
  });
  els.mapGrid.addEventListener('mouseleave', () => { els.mapCaption.textContent = ''; hideMapTip(); });
  window.addEventListener('scroll', () => { hideMapTip(); hideSeatTip(); }, { passive: true });
  let rzT = null;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { if (state.view === 'mapa') syncMapTableHeight(); }, 150);
  });
  if (window.ResizeObserver && els.mapGrid) {
    new ResizeObserver(() => { if (state.view === 'mapa') syncMapTableHeight(); }).observe(els.mapGrid);
  }
  els.q.addEventListener('input', () => renderRanking());
  els.qMun.addEventListener('input', () => renderEleitos());
  els.btnMore.addEventListener('click', () => { state.showAll = true; renderRanking(); });
  setInterval(tick, 1000);
}

/* ---------------- Filtros ---------------- */

function buildPleitoSelect() {
  els.selPleito.innerHTML = '';
  state.pleitos.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${p.ciclo.replace('ele', '')} · ${p.data}`;
    els.selPleito.appendChild(opt);
  });
}

function buildEleicaoSelect() {
  els.selEleicao.innerHTML = '';
  state.pleito.eleicoes.forEach((e, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = shortEleicao(e.nome);
    els.selEleicao.appendChild(opt);
  });
}

/** Nível do cargo a partir do tipo da eleição (ele-c.json `tp`). */
function nivel() {
  const tp = state.eleicao?.tipo;
  if (tp === '8') return 'nacional'; // ex.: Presidente
  if (tp === '1') return 'estadual'; // ex.: Governador, Senador, Deputados
  return 'municipal'; // tp 3 (Prefeito/Vereador) e 7 (consultas)
}

function cargos() {
  const abr = state.eleicao.abrangencias[0];
  return abr ? abr.cargos : [];
}

/** UFs válidas: restrição do ele-c (2º turno/suplementar) ou as 27. */
function ufsValidas() {
  const abrs = state.eleicao.abrangencias;
  if (abrs.length === 1 && abrs[0].uf === 'br') return Object.keys(UF_NOME);
  return abrs.map((a) => a.uf).filter((u) => u !== 'br');
}

function renderAll() {
  persist();
  els.selPleito.value = String(state.pleitos.indexOf(state.pleito));
  buildEleicaoSelect();
  els.selEleicao.value = String(state.pleito.eleicoes.indexOf(state.eleicao));

  els.cargoTabs.innerHTML = '';
  cargos().forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.dataset.cargo = c.codigo;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(state.cargo?.codigo === c.codigo));
    b.textContent = c.nome;
    els.cargoTabs.appendChild(b);
  });

  const ufs = ufsValidas();
  els.regiaoChips.innerHTML = '';
  const regOpts = [['todas', 'Todas']].concat(
    Object.entries(REGIOES)
      .filter(([, r]) => r.ufs.some((u) => ufs.includes(u)))
      .map(([k, r]) => [k, r.nome]),
  );
  for (const [k, nome] of regOpts) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.regiao = k;
    b.setAttribute('aria-pressed', String(state.regiao === k));
    b.textContent = nome;
    els.regiaoChips.appendChild(b);
  }

  els.ufChips.innerHTML = '';
  const nv = nivel();
  if (nv === 'nacional' && state.regiao === 'todas') {
    els.ufChips.appendChild(ufChip('br', 'BR', state.uf === 'br' || state.uf === ''));
  }
  const listaUf = ufs.filter((u) => state.regiao === 'todas' || (REGIOES[state.regiao]?.ufs.includes(u)));
  for (const u of listaUf) els.ufChips.appendChild(ufChip(u, u.toUpperCase(), state.uf === u));

  els.munField.hidden = !(state.uf && state.uf !== 'br');

  els.scopeLine.innerHTML = scopeHtml();
  updateViewTabs();
  updateTabVisibility();
}

function ufChip(value, label, active) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.uf = value;
  b.setAttribute('aria-pressed', String(active));
  b.textContent = label;
  if (value !== 'br') b.title = UF_NOME[value] || value;
  return b;
}

function scopeHtml() {
  const parts = [
    `<strong>${escapeHtml(shortEleicao(state.eleicao.nome))}</strong>`,
    escapeHtml(state.cargo?.nome || ''),
  ];
  if (state.regiao !== 'todas') parts.push(REGIOES[state.regiao].nome);
  if (state.uf === 'br' || (nivel() === 'nacional' && !state.uf)) parts.push('Brasil');
  else if (state.uf) parts.push(UF_NOME[state.uf] || state.uf.toUpperCase());
  if (state.municipio) parts.push(escapeHtml(munNameByCode(state.municipio) || ''));
  return parts.filter(Boolean).join(' · ');
}

function shortEleicao(nome) {
  return (nome || '').replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}.*$/, '').replace(/(\d)º Turno/i, '$1ºT').trim();
}

/* ---------------- Municípios ---------------- */

async function municipiosDaUf(uf) {
  const key = `${state.pleito.ciclo}/${state.eleicao.codigo}`;
  if (!state.munCache.has(key)) {
    const raw = await fetchJson(munUrl(state.pleito.ciclo, state.eleicao.codigo));
    const porUf = new Map();
    for (const a of raw.abr || []) {
      porUf.set(String(a.cd).toLowerCase(), (a.mu || []).map((m) => ({ codigo: m.cd, nome: m.nm })));
    }
    state.munCache.set(key, porUf);
  }
  let lista = state.munCache.get(key).get(uf.toLowerCase()) || [];
  const restr = state.eleicao.abrangencias.find((a) => a.uf === uf.toLowerCase())?.municipios;
  if (restr) {
    const permitidos = new Set(restr.map((m) => m.codigo));
    lista = lista.filter((m) => permitidos.has(m.codigo));
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function munCodeByName(nome) {
  const opt = [...els.munList.options].find((o) => o.value === nome);
  return opt ? opt.dataset.codigo : '';
}

function munNameByCode(codigo) {
  const opt = [...els.munList.options].find((o) => o.dataset.codigo === codigo);
  return opt ? opt.value : '';
}

async function fillMunicipios() {
  els.munList.innerHTML = '';
  if (els.munField.hidden) return;
  try {
    const lista = await municipiosDaUf(state.uf);
    for (const m of lista) {
      const opt = document.createElement('option');
      opt.value = m.nome;
      opt.dataset.codigo = m.codigo;
      els.munList.appendChild(opt);
    }
    if (state.municipio) els.selMunicipio.value = munNameByCode(state.municipio);
  } catch (err) {
    console.error(err);
  }
}

/* ---------------- Carga de dados ---------------- */

async function load({ keepMap = false } = {}) {
  if (!state.eleicao || !state.cargo) return;
  // Troca de filtro/aba com carga em voo: enfileira em vez de descartar (senão a tela fixa no escopo velho).
  if (state.loading) { state.reloadQueued = true; return; }
  state.loading = true;
  state.timer = 60;
  if (!keepMap) { state.mapCache.clear(); state.projCache.clear(); state.ufStage.clear(); }
  setStatus('Carregando dados oficiais…');
  hideResults();
  // Aba atual pode ter ficado indisponível para o novo cargo → volta ao ranking.
  if (state.view === 'mapa' && mapMode() === null) state.view = 'ranking';
  if (state.view === 'cadeiras' && seatScope().notice) state.view = 'ranking';
  if (state.view === 'colegios' && nivel() === 'municipal') state.view = 'ranking';
  renderAll();

  try {
    if (state.view === 'mapa') {
      await loadMap();
      return;
    }
    if (state.view === 'projecoes') {
      await loadProjecoes();
      return;
    }
    if (state.view === 'busca') {
      await loadBusca();
      return;
    }
    if (state.view === 'cadeiras') {
      await loadCadeiras();
      return;
    }
    if (state.view === 'colegios') {
      await loadColegios();
      return;
    }
    await fillMunicipios();
    const nv = nivel();
    if (nv === 'nacional') {
      if (state.uf && state.uf !== 'br') await loadRanking({ uf: state.uf, municipio: state.municipio });
      else if (state.regiao === 'todas') await loadRanking({ uf: 'br' });
      else await loadRegiao();
    } else if (nv === 'estadual') {
      if (!state.uf || state.uf === 'br') {
        setStatus('Cada UF tem sua própria disputa para este cargo. Escolha a UF acima para ver o resultado.');
        setLive('off', 'aguardando seleção');
      } else await loadRanking({ uf: state.uf, municipio: state.municipio });
    } else {
      if (!state.uf || state.uf === 'br') {
        setStatus('Eleição municipal: escolha a UF. Depois selecione o município para ver a votação detalhada.');
        setLive('off', 'aguardando seleção');
      } else if (state.municipio) {
        await loadRanking({ uf: state.uf, municipio: state.municipio });
      } else {
        await loadEleitos();
      }
    }
  } catch (err) {
    console.error(err);
    state.buscaDrill = '';
    if (err?.status === 404) {
      setStatus('Dados ainda não disponíveis para esta abrangência no TSE. Tente outra UF/município ou aguarde a apuração.', true);
      setLive('off', 'sem dados');
    } else {
      setStatus('Falha ao buscar os dados do TSE. Verifique sua conexão e clique em “Atualizar agora”.', true);
      setLive('off', 'desconectado');
    }
  } finally {
    state.loading = false;
    if (state.pendingView) { state.pendingView = false; load({ keepMap: true }); }
    else if (state.reloadQueued) { state.reloadQueued = false; load({ keepMap: true }); }
  }
}

async function loadMap() {
  const modo = mapMode();
  els.mapPanel.hidden = false;
  els.mapHint.hidden = false;
  if (!modo) {
    els.mapTitle.textContent = `Mapa · ${state.cargo.nome}`;
    els.mapMeta.textContent = 'Mapa disponível para Presidente, Governador e Senador.';
    els.mapLegend.innerHTML = '';
    els.mapGrid.innerHTML = '';
    els.ufTableBody.innerHTML = '';
    els.mapHint.hidden = true;
    clearStatus();
    setLive('off', 'mapa indisponível');
    return;
  }
  const chave = `${state.pleito.ciclo}/${state.eleicao.codigo}/${state.cargo.codigo}`;
  let dados = state.mapCache.get(chave);
  if (!dados) {
    const ufs = Object.keys(UF_PATHS);
    let feito = 0;
    const entries = await Promise.all(ufs.map(async (uf) => {
      try {
        const staged = await stageUf(uf);
        if (!staged.ok) return { uf, ok: false, candidatos: [] };
        return { uf, ok: true, candidatos: staged.candidatos, secoes: staged.resumo.secoes };
      } catch {
        return { uf, ok: false, candidatos: [] };
      } finally {
        feito += 1;
        setStatus(`Carregando mapa: ${feito}/${ufs.length} UFs…`);
      }
    }));
    dados = buildMapData(entries, modo, isClaro());
    state.mapCache.set(chave, dados);
  }
  renderMap(dados, modo);
  clearStatus();
  setLive(dados.erros === dados.total ? 'off' : 'on', dados.erros === dados.total ? 'sem dados' : 'mapa por UF');
}

function renderMap(dados, modo) {
  state.mapLast = dados;
  hideMapTip();
  const rotulo = modo === 'partido' ? 'partido vencedor' : 'candidato vencedor';
  els.mapTitle.textContent = `${state.cargo.nome} · Mapa do Brasil`;
  const comDados = dados.total - dados.erros;
  els.mapMeta.innerHTML = `${comDados} de ${dados.total} UFs com dados · ${rotulo} por UF`
    + (dados.aguardando ? ` · ${dados.aguardando} aguardando apuração` : '')
    + '<br>intensidade = vantagem · fonte TSE';

  els.mapLegend.innerHTML = '';
  for (const item of dados.legenda) {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<span class="leg-cand"><span class="legend-swatch" style="background:${item.cor}"></span>`
      + `<b>${escapeHtml(item.rotulo)}${item.numero && modo !== 'partido' ? ` · ${escapeHtml(item.numero)}` : ''}</b>`
      + `<span class="ideo">(${ideologia(item.partido)})</span></span>`
      + `<span class="leg-ufs">${item.ufs} UF${item.ufs > 1 ? 's' : ''} vencida${item.ufs > 1 ? 's' : ''}</span>`
      + `<span class="leg-votes">${fmtCompact.format(item.votos)} votos nas UFs</span>`;
    els.mapLegend.appendChild(div);
  }
  if (dados.aguardando) {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = '<span class="legend-swatch" style="background:transparent;border:1px dashed var(--faint)"></span>'
      + `<span class="leg-note">Aguardando apuração (${dados.aguardando})</span>`;
    els.mapLegend.appendChild(div);
  }
  if (dados.escala) {
    const wrap = document.createElement('div');
    wrap.className = 'legend-scale';
    const { a, b, refs } = dados.escala;
    wrap.title = `Exemplo ${a.rotulo} × ${b.rotulo}: mistura da cor do vencedor com a do 2º pela vantagem na UF`;
    wrap.innerHTML = '<span class="leg-note">Intensidade na UF — tons fortes: vitória folgada · tons suaves: disputa apertada</span>'
      + refs.map((r) => `<span class="scale-row"><i style="background:${r.corA}"></i><i style="background:${r.corB}"></i><span>${r.margem}</span></span>`).join('');
    els.mapLegend.appendChild(wrap);
  }

  els.mapGrid.innerHTML = '';
  els.mapCaption.textContent = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', BRASIL_VIEWBOX);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Mapa do Brasil — ${state.cargo.nome} por UF`);
  svg.classList.add('brmap');
  for (const u of dados.ufs) {
    const d = UF_PATHS[u.uf];
    if (!d) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.dataset.uf = u.uf;
    path.dataset.st = u.status;
    if (u.status === 'ok') {
      path.style.fill = u.cor;
      const w = u.winner;
      const info = `${UF_NOME[u.uf]} — ${w.urna} (${w.partido}) · ${fmtPct(w.pct)} · ${fmtInt.format(w.votos)} votos`;
      path.dataset.info = info;
    } else {
      const info = u.status === 'aguardando' ? `${UF_NOME[u.uf]} — aguardando apuração`
        : u.status === 'empate' ? `${UF_NOME[u.uf]} — empate técnico`
          : `${UF_NOME[u.uf]} — sem dados no TSE`;
      path.dataset.info = info;
    }
    svg.appendChild(path);
  }
  els.mapGrid.appendChild(svg);
  renderUfTable(dados);
  syncMapTableHeight();
  requestAnimationFrame(() => syncMapTableHeight());
}

/** Alinha a base da tabela com a base da coluna do mapa (desktop lado a lado). */
function syncMapTableHeight() {
  const wrap = els.mapTableWrap;
  if (!wrap) return;
  if (state.view !== 'mapa' || !mapSideBySide()) { wrap.style.maxHeight = ''; return; }
  const col = els.mapGrid.parentElement;
  const h = col ? col.offsetHeight : 0;
  if (h > 200 && wrap.style.maxHeight !== `${h}px`) wrap.style.maxHeight = `${h}px`;
}

/** Verdadeiro quando mapa e tabela estão lado a lado (2 colunas no grid). */
function mapSideBySide() {
  const body = els.mapGrid.closest('.map-body');
  if (!body) return false;
  return getComputedStyle(body).gridTemplateColumns.split(' ').length > 1;
}

/** Tabela ao lado do mapa: votos por estado (1º × 2º + diferença). */
function renderUfTable(dados) {
  const ordem = { ok: 0, empate: 1, aguardando: 2, erro: 3 };
  const linhas = [...dados.ufs].sort((a, b) =>
    (ordem[a.status] - ordem[b.status])
    || ((b.gap?.leader?.votos || 0) - (a.gap?.leader?.votos || 0))
    || a.uf.localeCompare(b.uf));
  els.ufTableBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const u of linhas) {
    const tr = document.createElement('tr');
    tr.dataset.uf = u.uf;
    tr.title = `Ver ranking — ${UF_NOME[u.uf] || u.uf.toUpperCase()}`;
    if (u.status === 'ok') {
      const g = u.gap;
      tr.innerHTML = `
        <td class="ufcell"><span class="dot" style="background:${u.cor}"></span>${u.uf.toUpperCase()}</td>
        <td><b>${escapeHtml(g.leader.urna)}</b>
          <span class="sub">${escapeHtml(g.leader.partido || '')} (${ideologia(g.leader.partido)}) · 2º ${escapeHtml(g.runner.urna)}</span></td>
        <td class="ctr" data-label="Percentual"><span class="pctbadge" style="background:${u.cor};border-color:transparent;color:${isLight(u.cor) ? '#1a202c' : '#fff'}">${fmtPct(g.leader.pct)}</span></td>
        <td class="num" data-label="Votos">${fmtCompact.format(g.leader.votos)}
          <span class="sub">2º ${fmtCompact.format(g.runner.votos)}</span></td>
        <td class="num diff" data-label="Diferença">+${fmtCompact.format(g.diffVotos)}
          <span class="sub">${fmtPct(g.diffPp).replace('%', '')} p.p.</span></td>
        <td class="num" data-label="Urnas">${urnasCell(u.urnas)}</td>`;
    } else {
      const txt = u.status === 'empate' ? 'Empate técnico'
        : u.status === 'aguardando' ? 'Aguardando apuração' : 'Sem dados no TSE';
      tr.innerHTML = `
        <td class="ufcell">${u.uf.toUpperCase()}</td>
        <td colspan="4" class="nostatus">${txt}</td>
        <td class="num" data-label="Urnas">${urnasCell(u.urnas)}</td>`;
    }
    frag.appendChild(tr);
  }
  els.ufTableBody.appendChild(frag);
}

function urnasCell(pct) {
  if (pct === null || pct === undefined) return '<span class="nostatus">—</span>';
  const v = Math.min(100, Math.max(0, pct));
  return `${fmtPct(v)}<span class="ubar" aria-hidden="true"><i style="width:${v.toFixed(1)}%"></i></span>`;
}

function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) > 0.55;
}

/** Tooltip elegante do mapa: 1º × 2º da UF sob o cursor. */
function showMapTip(ev, uf) {
  const tip = els.mapTip;
  const u = uf && state.mapLast ? state.mapLast.ufs.find((x) => x.uf === uf) : null;
  if (!u || u.status !== 'ok') { tip.hidden = true; return; }
  const g = u.gap;
  const badge = (cor, pct) => (cor
    ? `<span class="pctbadge mini" style="background:${cor};border-color:transparent;color:${isLight(cor) ? '#1a202c' : '#fff'}">${fmtPct(pct)}</span>`
    : `<span class="pctbadge mini" data-tone="neutral">${fmtPct(pct)}</span>`);
  const row = (cor, pos, c) => `<div class="tt-row"><span class="dot${cor ? '' : ' dim'}"`
    + `${cor ? ` style="background:${cor}"` : ''}></span>`
    + `<span>${pos} ${escapeHtml(c.urna)}</span>${badge(cor, c.pct)}`
    + `<b>${fmtInt.format(c.votos)}</b></div>`;
  const urnasTxt = u.urnas == null ? 'urnas —' : `${fmtPct(u.urnas)} urnas`;
  tip.innerHTML = `<div class="tt-head">${escapeHtml(UF_NOME[u.uf] || u.uf.toUpperCase())}</div>`
    + row(u.cor, '1º', g.leader) + row(null, '2º', g.runner)
    + `<div class="tt-foot">diferença +${fmtCompact.format(g.diffVotos)}`
    + ` (${fmtPct(g.diffPp).replace('%', '')} p.p.) · ${urnasTxt}</div>`;
  placeTip(tip, ev);
}

function hideMapTip() {
  els.mapTip.hidden = true;
}

/** Posiciona um tooltip flutuante junto ao cursor, sem sair da tela. */
function placeTip(tip, ev) {
  tip.hidden = false;
  const pad = 14;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

/* ---------------- Projeções ---------------- */

/** Escopo da projeção: lista de UFs (+ município opcional) ou aviso. */
function projScope() {
  const nv = nivel();
  if (nv === 'nacional') {
    if (state.uf && state.uf !== 'br') return { ufs: [state.uf], municipio: state.municipio };
    if (state.regiao === 'todas') return { ufs: Object.keys(UF_PATHS) };
    return { ufs: REGIOES[state.regiao].ufs };
  }
  if (nv === 'estadual') {
    if (!state.uf || state.uf === 'br') return { notice: 'Escolha uma UF para projetar este cargo.' };
    return { ufs: [state.uf], municipio: state.municipio };
  }
  if (!state.uf || state.uf === 'br' || !state.municipio) {
    return { notice: 'Eleição municipal: escolha UF e município para projetar.' };
  }
  return { ufs: [state.uf], municipio: state.municipio };
}

async function loadProjecoes() {
  els.projPanel.hidden = false;
  const scope = projScope();
  if (scope.notice) {
    els.projTitle.textContent = `Projeções · ${state.cargo.nome}`;
    els.projMeta.textContent = scope.notice;
    els.projChart.innerHTML = '';
    els.prevBody.innerHTML = '';
    els.viradaBox.hidden = true;
    els.projBadge.hidden = true;
    clearStatus();
    setLive('off', 'aguardando seleção');
    return;
  }
  const { ciclo } = state.pleito;
  const ele = state.eleicao.codigo;
  const cargo = state.cargo.codigo;
  const chave = `${ciclo}/${ele}/${cargo}/${scope.ufs.join(',')}/${scope.municipio || ''}`;
  let dados = state.projCache.get(chave);
  if (!dados) {
    setStatus(`Calculando projeção (${scope.ufs.length} abrangência${scope.ufs.length > 1 ? 's' : ''})…`);
    const entries = await Promise.all(scope.ufs.map(async (uf) => {
      try {
        const raw = await fetchJson(dadosUrl(ciclo, ele, uf, cargo, scope.municipio || ''));
        const resumo = parseResumo(raw);
        return { uf, ok: true, raw, candidatos: flattenCandidates(raw), secoes: resumo.secoes, resumo };
      } catch {
        return { uf, ok: false };
      }
    }));
    dados = { proj: projectWeighted(entries.filter((e) => e.ok)), entries };
    state.projCache.set(chave, dados);
  }
  await renderProjecoes(dados, scope);
  clearStatus();
  setLive('on', 'projeção');
}

async function renderProjecoes(dados, scope) {
  const { proj } = dados;
  const rotulo = scope.ufs.length > 1 ? `${scope.ufs.length} UFs` : (UF_NOME[scope.ufs[0]] || '');
  els.projTitle.textContent = `${state.cargo.nome} · Projeção ${rotulo ? `· ${rotulo}` : ''}`.replace(/ · $/, '');
  if (!proj.linhas.length || proj.fGlobal <= 0) {
    els.projMeta.textContent = 'Sem urnas apuradas ainda — projeção indisponível.';
    els.projChart.innerHTML = '';
    els.viradaBox.hidden = true;
    els.projBadge.hidden = true;
    els.prevBody.innerHTML = '';
    return;
  }
  const ponderada = scope.ufs.length > 1;
  els.projMeta.textContent = `${ponderada ? `Ponderada por UF (${proj.ufsOk}/${proj.ufsTotal})` : 'Projeção linear'}`
    + ` · ${(proj.fGlobal * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das urnas · fonte TSE`;

  // Gráfico: top 8 por votos projetados (barra = apurado sólido + projetado claro).
  const top = proj.linhas.slice(0, 8);
  const max = top[0]?.proj || 1;
  els.projChart.innerHTML = '';
  top.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = `cand${i === 0 ? ' first' : ''}`;
    const wAtu = ((c.atual / max) * 100).toFixed(1);
    const wProj = ((c.proj / max) * 100).toFixed(1);
    li.innerHTML = `
      <span class="pos">${i + 1}º</span>
      <img class="photo" src="${fotoUrl(state.pleito.ciclo, state.eleicao.codigo, state.uf && state.uf !== 'br' ? state.uf : 'br', c.sqcand)}" alt="" loading="lazy">
      <div class="cand-main">
        <div class="cand-name"><b>${escapeHtml(c.urna)}</b>
          <span class="party">${escapeHtml(c.partido || '')}</span>
          <span class="ideo">(${ideologia(c.partido)})</span></div>
        <div class="cand-sub">${fmtCompact.format(c.atual)} apurados · proj. ${fmtCompact.format(Math.round(c.proj))}</div>
        <div class="bar" role="img" aria-label="Apurado ${fmtPct((c.atual / proj.validosAtual) * 100)}, projetado ${fmtPct(c.projPct)}"><i class="ext" style="width:${wProj}%"></i><i style="width:${wAtu}%"></i></div>
      </div>
      <span class="cand-badge"><span class="pctbadge ${i === 0 ? 'gold' : ''}">${fmtPct(c.projPct)}</span></span>
      <div class="cand-side"><span class="votes">${fmtCompact.format(Math.round(c.proj))}<small>projetado</small></span></div>`;
    const img = li.querySelector('img');
    img.addEventListener('error', () => { img.onerror = null; img.src = avatarUri(c.urna); }, { once: true });
    els.projChart.appendChild(li);
  });
  document.querySelector('#projPanel .proj-legend')?.remove();
  const leg = document.createElement('div');
  leg.className = 'proj-legend';
  leg.innerHTML = '<span><i style="background:#3b82c4"></i>apurado</span><span><i style="background:rgba(59,130,196,.35)"></i>projetado</span>';
  els.projChart.after(leg);

  // Matemática da virada entre os 2 primeiros.
  const [l1, l2] = proj.linhas;
  els.viradaBox.hidden = true;
  els.projBadge.hidden = true;
  if (l1 && l2) {
    const diff = l1.atual - l2.atual;
    const rest = Math.max(0, proj.validosProj - proj.validosAtual);
    const sit = situacaoDisputa(diff, rest);
    const req = shareParaVirar(diff, rest);
    els.projBadge.hidden = false;
    els.projBadge.textContent = sit === 'definido' ? 'Definido' : sit === 'tendencia' ? 'Tendência forte' : 'Em aberto';
    els.projBadge.className = `badge ${sit === 'aberto' ? 'partial' : 'final'}`;
    els.viradaBox.hidden = false;
    els.viradaBox.innerHTML = sit === 'definido'
      ? `<strong>Disputa definida matematicamente.</strong> Diferença atual de <strong>${fmtInt.format(diff)} votos</strong> é maior que os <strong>~${fmtCompact.format(Math.round(rest))} votos válidos restantes</strong> estimados.`
      : `Faltam <strong>~${fmtCompact.format(Math.round(rest))} votos válidos</strong> (${fmtPct((1 - proj.fGlobal) * 100)} das urnas). `
        + `<strong>${escapeHtml(l2.urna)}</strong> precisa de <strong>${(req * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong> deles para virar sobre <strong>${escapeHtml(l1.urna)}</strong> (diferença atual: ${fmtInt.format(diff)}).`;
  }

  els.metodoText.textContent = 'Cada abrangência é extrapolada pela sua fração apurada (votos ÷ % de urnas) e somada por candidato — ponderação geográfica; com 1 abrangência equivale à projeção linear. Totais projetados = soma escalada pelo mesmo fator. "Definido" = diferença atual maior que os votos restantes estimados; "tendência forte" = o 2º precisa de mais de 75% dos restantes. Não é pesquisa: supõe que o restante se comporte como o já apurado.';

  // Tabela: eleição anterior (1º turno) × atual projetada.
  await renderPrevTable(dados, scope);
}

async function renderPrevTable(dados, scope) {
  els.prevBody.innerHTML = '';
  const ant = turnoAnterior(state.pleitos, state.eleicao.codigo);
  if (!ant) {
    els.prevColAnt.textContent = 'Anterior';
    els.prevBody.innerHTML = '<tr><td colspan="4" class="meta">Sem turno anterior na API oficial (ciclos 2022/2020 indisponíveis no TSE).</td></tr>';
    return;
  }
  const rotAnt = rotuloEleicao(ant.ciclo, ant.eleicao) || '1º turno';
  els.prevColAnt.textContent = rotAnt;
  setStatus('Buscando eleição anterior…');
  const raws = await Promise.all(scope.ufs.map(async (uf) => {
    try {
      return await fetchJson(dadosUrl(ant.ciclo, ant.eleicao, uf, state.cargo.codigo, scope.municipio || ''));
    } catch {
      return null;
    }
  }));
  const validos = raws.filter(Boolean);
  if (!validos.length) {
    els.prevBody.innerHTML = '<tr><td colspan="4" class="meta">1º turno indisponível neste escopo.</td></tr>';
    return;
  }
  const cons = consolidarRegiao(validos, 'Anterior');
  const gAnt = gapInfo(cons.candidatos);
  const { proj } = dados;
  const f = proj.fGlobal > 0 ? proj.fGlobal : 1;
  const soma = (fn) => dados.entries.filter((e) => e.ok).reduce((t, e) => t + fn(e.resumo), 0);
  const eleit = soma((r) => r.eleitorado);
  const esc = (v) => Math.round(v / f);
  const atu = {
    eleitorado: eleit,
    tv: esc(soma((r) => r.votos.comparecimento)),
    vv: esc(soma((r) => r.votos.validos)),
    vb: esc(soma((r) => r.votos.brancos)),
    vn: esc(soma((r) => r.votos.nulos)),
  };
  atu.abs = eleit - atu.tv;
  const gAtu = { diff: (proj.linhas[0]?.proj || 0) - (proj.linhas[1]?.proj || 0) };
  const ppAtu = (proj.linhas[0]?.projPct || 0) - (proj.linhas[1]?.projPct || 0);
  const fmtS = (v) => `${v < 0 ? '−' : '+'}${fmtCompact.format(Math.abs(Math.round(v)))}`;
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const rows = [
    ['Eleitorado', fmtInt.format(cons.eleitorado), fmtInt.format(atu.eleitorado), fmtS(atu.eleitorado - cons.eleitorado), cls(atu.eleitorado - cons.eleitorado)],
    ['Comparecimento', fmtInt.format(cons.votos.comparecimento), `~${fmtCompact.format(atu.tv)}`, fmtS(atu.tv - cons.votos.comparecimento), cls(atu.tv - cons.votos.comparecimento)],
    ['Votos válidos', fmtInt.format(cons.votos.validos), `~${fmtCompact.format(atu.vv)}`, fmtS(atu.vv - cons.votos.validos), cls(atu.vv - cons.votos.validos)],
    ['Brancos', fmtInt.format(cons.votos.brancos), `~${fmtCompact.format(atu.vb)}`, fmtS(atu.vb - cons.votos.brancos), cls(atu.vb - cons.votos.brancos)],
    ['Nulos', fmtInt.format(cons.votos.nulos), `~${fmtCompact.format(atu.vn)}`, fmtS(atu.vn - cons.votos.nulos), cls(atu.vn - cons.votos.nulos)],
    ['Abstenções', fmtInt.format(cons.eleitorado - cons.votos.comparecimento), `~${fmtCompact.format(atu.abs)}`, fmtS(atu.abs - (cons.eleitorado - cons.votos.comparecimento)), cls(atu.abs - (cons.eleitorado - cons.votos.comparecimento))],
  ];
  if (gAnt.status === 'ok' && proj.linhas.length >= 2) {
    const ppAnt = Math.abs(gAnt.leader.pct - gAnt.runner.pct);
    rows.push(
      ['Vencedor', `${gAnt.leader.urna} (${fmtPct(gAnt.leader.pct)})`, `${proj.linhas[0].urna} (proj. ${fmtPct(proj.linhas[0].projPct)})`, gAnt.leader.urna === proj.linhas[0].urna ? 'mantido' : 'alterado', ''],
      ['Margem 1º×2º', `${fmtCompact.format(gAnt.diffVotos)} · ${fmtPct(ppAnt).replace('%', '')} p.p.`, `~${fmtCompact.format(Math.round(gAtu.diff))} · ${ppAtu.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p.`, fmtS(gAtu.diff - gAnt.diffVotos), cls(gAtu.diff - gAnt.diffVotos)],
    );
  }
  const frag = document.createDocumentFragment();
  for (const [label, a, b, d, c] of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(label)}</td><td class="num" data-label="${escapeHtml(rotAnt)}">${escapeHtml(a)}</td><td class="num" data-label="Atual proj.">${escapeHtml(b)}</td><td class="num ${c}" data-label="Δ">${escapeHtml(d)}</td>`;
    frag.appendChild(tr);
  }
  els.prevBody.appendChild(frag);
}

function rotuloEleicao(ciclo, codigo) {
  for (const p of state.pleitos) {
    if (p.ciclo !== ciclo) continue;
    const e = p.eleicoes.find((x) => String(x.codigo) === String(codigo));
    if (e) return `${ciclo.replace('ele', '')} · ${e.turno}ºT`;
  }
  return null;
}

async function loadRanking({ uf, municipio = '' }) {
  const url = dadosUrl(state.pleito.ciclo, state.eleicao.codigo, uf, state.cargo.codigo, municipio);
  const raw = await fetchJson(url);
  const resumo = parseResumo(raw);
  state.candidatos = flattenCandidates(raw);
  state.finalizada = resumo.totalizacaoFinal;
  state.showAll = false;

  const titulo = municipio
    ? `${resumo.cargoNome} · ${munNameByCode(municipio) || ''}/${uf.toUpperCase()}`
    : uf === 'br' ? `${resumo.cargoNome} · Brasil` : `${resumo.cargoNome} · ${UF_NOME[uf]}`;
  renderKpis(resumo);
  els.resTitle.textContent = titulo;
  els.resMeta.textContent = metaResumo(resumo);
  setBadge(resumo.totalizacaoFinal);
  els.q.hidden = state.candidatos.length <= 8;
  els.q.value = '';
  document.querySelector('.results').hidden = false;
  renderRanking();
  applyBuscaDrill();

  if (state.candidatos.length && state.candidatos.every((c) => c.votos === 0) && !resumo.totalizacaoFinal) {
    setStatus('Urnas ainda não apuradas para esta disputa. Os números aparecem aqui automaticamente assim que o TSE divulgar.');
  } else {
    clearStatus();
  }
  setLive(resumo.totalizacaoFinal ? 'done' : 'on', resumo.totalizacaoFinal ? 'totalizado' : 'ao vivo · apurando');
}

async function loadRegiao() {
  const reg = REGIOES[state.regiao];
  const ufs = ufsValidas().filter((u) => reg.ufs.includes(u));
  setStatus(`Consolidando ${ufs.length} UFs da região ${reg.nome}…`);
  const resultados = await Promise.all(ufs.map(async (uf) => {
    try {
      const url = dadosUrl(state.pleito.ciclo, state.eleicao.codigo, uf, state.cargo.codigo);
      return await fetchJson(url);
    } catch {
      return null; // UF sem arquivo (ainda) não quebra o consolidado
    }
  }));
  if (resultados.every((r) => r === null)) {
    setStatus(`Nenhuma UF da região ${reg.nome} publicou dados para este cargo ainda.`, true);
    setLive('off', 'sem dados');
    return;
  }
  const cons = consolidarRegiao(resultados, reg.nome);
  state.candidatos = cons.candidatos;
  state.finalizada = cons.totalizacaoFinal;
  state.showAll = false;

  renderKpis({
    secoes: cons.secoes, eleitorado: cons.eleitorado, votos: cons.votos, vagas: cons.vagas,
    totalizadoEm: '', geradoEm: cons.geradoEm,
  });
  els.resTitle.textContent = `${cons.cargoNome || state.cargo.nome} · Região ${reg.nome}`;
  els.resMeta.textContent = `Consolidado de ${cons.ufsCarregadas} de ${ufs.length} UFs · fonte TSE · gerado em ${cons.geradoEm || '—'}`;
  setBadge(cons.totalizacaoFinal);
  els.q.hidden = state.candidatos.length <= 8;
  els.q.value = '';
  document.querySelector('.results').hidden = false;
  renderRanking();
  applyBuscaDrill();
  clearStatus();
  setLive(cons.totalizacaoFinal ? 'done' : 'on', cons.totalizacaoFinal ? 'totalizado' : 'ao vivo · apurando');
}

async function loadEleitos() {
  const url = eleitosUrl(state.pleito.ciclo, state.eleicao.codigo, state.uf, state.cargo.codigo);
  const raw = await fetchJson(url);
  state.eleitos = parseEleitos(raw);
  els.eleitosPanel.hidden = false;
  els.eleitosTitle.textContent = `${state.cargo.nome} · ${UF_NOME[state.uf]} — eleitos por município`;
  els.eleitosMeta.textContent = `${state.eleitos.length} municípios · fonte TSE · ${raw.dg || ''} ${raw.hg || ''}`.trim();
  els.qMun.value = '';
  renderEleitos();
  clearStatus();
  setLive('on', 'eleitos por município');
  setStatus('Selecione um município acima para ver a votação detalhada com todos os candidatos.');
}

/* ---------------- Colégios eleitorais ---------------- */

/** Baixa (1x) e divide o arquivo da UF entre mapa e colégios. */
async function stageUf(uf) {
  const chave = `${state.pleito.ciclo}/${state.eleicao.codigo}/${uf}/${state.cargo.codigo}`;
  const hit = state.ufStage.get(chave);
  if (hit) return hit;
  try {
    const raw = await fetchJson(dadosUrl(state.pleito.ciclo, state.eleicao.codigo, uf, state.cargo.codigo));
    const staged = { ok: true, resumo: parseResumo(raw), candidatos: flattenCandidates(raw) };
    state.ufStage.set(chave, staged);
    return staged;
  } catch {
    const staged = { ok: false, resumo: null, candidatos: [] };
    state.ufStage.set(chave, staged);
    return staged;
  }
}

async function loadColegios() {
  els.colPanel.hidden = false;
  if (nivel() === 'municipal') {
    els.colTitle.textContent = `Colégios eleitorais · ${state.cargo.nome}`;
    els.colMeta.textContent = 'Colégios por UF disponíveis para eleições nacional e estadual.';
    els.colTableBody.innerHTML = '';
    els.colTableFoot.innerHTML = '';
    clearStatus();
    setLive('off', 'colégios indisponíveis');
    return;
  }
  const ufs = Object.keys(UF_PATHS);
  let feito = 0;
  const itens = await Promise.all(ufs.map(async (uf) => {
    try {
      const staged = await stageUf(uf);
      return { uf, ok: staged.ok, resumo: staged.resumo, candidatos: staged.candidatos };
    } catch {
      return { uf, ok: false, resumo: null, candidatos: [] };
    } finally {
      feito += 1;
      setStatus(`Carregando colégios: ${feito}/${ufs.length} UFs…`);
    }
  }));
  renderColegios(totalizarColegios(itens));
  renderVs(dueloColegios(itens));
  clearStatus();
  setLive('on', 'colégios por UF');
}

/** Card VS: barras bilaterais do par nacional 1º x 2º por colégio. */
function renderVs(d) {
  els.vsCard.hidden = !d.valido;
  els.colLayout.classList.toggle('solo', !d.valido);
  if (!d.valido) { els.vsRows.innerHTML = ''; return; }
  const corA = candidateColor(d.a, 0, isClaro());
  const corB = candidateColor(d.b, 1, isClaro());
  const foto = (c) => fotoUrl(state.pleito.ciclo, state.eleicao.codigo, 'br', c.sqcand);
  const pctNac = (c) => (d.vvNac > 0 ? fmtPct((c.votos / d.vvNac) * 100) : '—');
  els.vsHeadA.innerHTML = `<img class="photo" src="${foto(d.a)}" alt="" loading="lazy">`
    + `<b>${escapeHtml(d.a.urna)}</b><span class="sub">${fmtCompact.format(d.a.votos)} · ${pctNac(d.a)}</span>`;
  els.vsHeadB.innerHTML = `<img class="photo" src="${foto(d.b)}" alt="" loading="lazy">`
    + `<b>${escapeHtml(d.b.urna)}</b><span class="sub">${fmtCompact.format(d.b.votos)} · ${pctNac(d.b)}</span>`;
  for (const [el, c] of [[els.vsHeadA, d.a], [els.vsHeadB, d.b]]) {
    const img = el.querySelector('img');
    img.addEventListener('error', () => { img.onerror = null; img.src = avatarUri(c.urna); }, { once: true });
  }
  els.vsRows.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const l of d.linhas) {
    const li = document.createElement('li');
    li.className = 'vs-row';
    li.dataset.uf = l.uf;
    if (l.v1 !== l.v2) {
      li.classList.add('win');
      li.style.setProperty('--win', l.v1 > l.v2 ? corA : corB);
    }
    const p1 = l.validos > 0 ? fmtPct((l.v1 / l.validos) * 100) : '—';
    const p2 = l.validos > 0 ? fmtPct((l.v2 / l.validos) * 100) : '—';
    li.title = `${UF_NOME[l.uf] || l.uf.toUpperCase()} — ${d.a.urna}: ${fmtInt.format(l.v1)} (${p1}) · ${d.b.urna}: ${fmtInt.format(l.v2)} (${p2}) — ver ranking`;
    const w1 = d.maxVoto > 0 ? (l.v1 / d.maxVoto) * 100 : 0;
    const w2 = d.maxVoto > 0 ? (l.v2 / d.maxVoto) * 100 : 0;
    li.innerHTML = `<span class="vs-num a">${fmtCompact.format(l.v1)}</span>`
      + `<span class="vs-track a"><i class="vs-fill" style="width:${w1.toFixed(1)}%;background:${corA}"></i></span>`
      + `<span class="vs-uf">${l.uf.toUpperCase()}</span>`
      + `<span class="vs-track"><i class="vs-fill" style="width:${w2.toFixed(1)}%;background:${corB}"></i></span>`
      + `<span class="vs-num">${fmtCompact.format(l.v2)}</span>`;
    frag.appendChild(li);
  }
  els.vsRows.appendChild(frag);
}

function renderColegios(dados) {
  els.colTitle.textContent = `${state.cargo.nome} · Colégios eleitorais`;
  const doisVotos = state.cargo && state.cargo.tipo === '1' && maxNvColegio() > 1;
  els.colMeta.textContent = `${dados.comDados} de ${dados.total} UFs com dados · fonte TSE`
    + (doisVotos ? ' · 2 votos por eleitor: válidos podem superar o total de eleitores' : '');
  els.colTableBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const l of dados.linhas) {
    const tr = document.createElement('tr');
    tr.dataset.uf = l.uf;
    tr.title = `Ver ranking — ${UF_NOME[l.uf] || l.uf.toUpperCase()}`;
    const nome = UF_NOME[l.uf] ? `${UF_NOME[l.uf]} (${l.uf.toUpperCase()})` : l.uf.toUpperCase();
    tr.innerHTML = `<td class="ufcell">${escapeHtml(nome)}</td>`
      + `<td class="num" data-label="Total">${fmtInt.format(l.total)}</td>`
      + `<td class="num" data-label="Válidos">${fmtInt.format(l.validos)}</td>`
      + `<td class="num" data-label="Brancos">${fmtInt.format(l.brancos)}</td>`
      + `<td class="num" data-label="Nulos">${fmtInt.format(l.nulos)}</td>`
      + `<td class="num" data-label="Abstenções">${fmtInt.format(l.abstencoes)}</td>`;
    frag.appendChild(tr);
  }
  els.colTableBody.appendChild(frag);
  const t = dados.totais;
  els.colTableFoot.innerHTML = `<tr><td class="ufcell">Brasil</td>`
    + `<td class="num" data-label="Total">${fmtInt.format(t.total)}</td>`
    + `<td class="num" data-label="Válidos">${fmtInt.format(t.validos)}</td>`
    + `<td class="num" data-label="Brancos">${fmtInt.format(t.brancos)}</td>`
    + `<td class="num" data-label="Nulos">${fmtInt.format(t.nulos)}</td>`
    + `<td class="num" data-label="Abstenções">${fmtInt.format(t.abstencoes)}</td></tr>`;
}

/** Maior nv entre as UFs carregadas (para a nota de 2 votos/eleitor). */
function maxNvColegio() {
  let nv = 0;
  for (const s of state.ufStage.values()) {
    if (s.ok && s.resumo) nv = Math.max(nv, s.resumo.vagas || 0);
  }
  return nv;
}

/* ---------------- Busque seu candidato ---------------- */

/** UFs do escopo da busca: UF selecionada, região ou Brasil. */
function searchUfs() {
  if (state.uf && state.uf !== 'br') return [state.uf];
  const validas = ufsValidas();
  if (state.regiao === 'todas') return validas;
  return (REGIOES[state.regiao]?.ufs || []).filter((u) => validas.includes(u));
}

/**
 * Arquivos a ler: todos os cargos da eleição no escopo.
 * Presidente = 1 arquivo nacional; municipal = eleitos por município;
 * demais = votação por UF (+ detalhe do município selecionado, se houver).
 */
function searchTargets() {
  const ele = state.eleicao;
  const ufs = searchUfs();
  const out = [];
  for (const cargo of cargos()) {
    if (ele.tipo === '8') { out.push({ uf: 'br', cargo, kind: 'votacao', municipio: '' }); continue; }
    if (ele.tipo === '3') {
      for (const uf of ufs) out.push({ uf, cargo, kind: 'eleitos', municipio: '' });
      continue;
    }
    for (const uf of ufs) out.push({ uf, cargo, kind: 'votacao', municipio: '' });
  }
  if (ele.tipo === '3' && state.municipio && state.uf && state.uf !== 'br') {
    for (const cargo of cargos()) out.push({ uf: state.uf, cargo, kind: 'votacao', municipio: state.municipio });
  }
  return out;
}

function searchKey(t) {
  return `${state.pleito.ciclo}/${state.eleicao.codigo}/${t.uf}/${t.cargo.codigo}/${t.kind}/${t.municipio}`;
}

/** Baixa 1 arquivo do índice (com cache) e guarda candidatos com contexto. */
async function fetchSearchTarget(t) {
  const ciclo = state.pleito.ciclo;
  const ele = state.eleicao.codigo;
  const key = searchKey(t);
  if (state.buscaCache.has(key)) return;
  try {
    if (t.kind === 'eleitos') {
      const raw = await fetchJson(eleitosUrl(ciclo, ele, t.uf, t.cargo.codigo));
      const itens = [];
      for (const m of parseEleitos(raw)) {
        for (const c of m.candidatos) {
          itens.push({
            ...c, pct: null, situacao: 'Eleito',
            cargoCodigo: t.cargo.codigo, cargoNome: t.cargo.nome, uf: t.uf,
            municipioCodigo: m.codigo, municipioNome: m.municipio,
          });
        }
      }
      state.buscaCache.set(key, itens);
    } else {
      const raw = await fetchJson(dadosUrl(ciclo, ele, t.uf, t.cargo.codigo, t.municipio || ''));
      state.buscaCache.set(key, flattenCandidates(raw).map((c) => ({
        ...c,
        cargoCodigo: t.cargo.codigo, cargoNome: t.cargo.nome, uf: t.uf,
        municipioCodigo: t.municipio || '', municipioNome: '',
      })));
    }
  } catch (err) {
    state.buscaCache.set(key, []);
    // 404 = cargo não existe nesta UF (ex.: Distrital fora do DF): esperado, não é falha.
    if (err?.status !== 404) state.buscaFalhas.add(key);
  }
}

/** Carrega o índice em 2 estágios (majoritários, depois proporcionais). */
async function ensureSearchIndex(run, onProgress) {
  const pend = searchTargets().filter((t) => !state.buscaCache.has(searchKey(t)));
  const major = pend.filter((t) => t.cargo.tipo !== '2');
  const proporc = pend.filter((t) => t.cargo.tipo === '2');
  let done = 0;
  for (const batch of [major, proporc]) {
    for (let i = 0; i < batch.length; i += 6) {
      if (run !== state.buscaRun) return;
      await Promise.all(batch.slice(i, i + 6).map(fetchSearchTarget));
      done += Math.min(6, batch.length - i);
      onProgress?.(done, pend.length);
      if (run !== state.buscaRun) return;
      renderSearch();
    }
  }
}

function updateBuscaScope() {
  const ufs = searchUfs();
  const geo = (state.uf && state.uf !== 'br') ? (UF_NOME[state.uf] || state.uf.toUpperCase())
    : state.regiao === 'todas' ? `Brasil (${ufs.length} UFs)` : `Região ${REGIOES[state.regiao]?.nome || ''} (${ufs.length} UFs)`;
  const n = cargos().length;
  const extra = state.eleicao.tipo === '3' ? ' · Prefeito/Vereador: busca entre os eleitos por município' : '';
  els.buscaMeta.textContent = `${shortEleicao(state.eleicao.nome)} · ${geo} · ${n} cargo${n === 1 ? '' : 's'}${extra}`;
}

async function loadBusca() {
  els.buscaPanel.hidden = false;
  updateBuscaScope();
  const q = els.qCand.value.trim();
  if (q.length < 2) {
    els.buscaResults.innerHTML = '';
    state.buscaLast = [];
    els.buscaFoot.textContent = '';
    els.buscaHint.hidden = false;
    clearStatus();
    setLive('on', 'busca de candidatos');
    return;
  }
  els.buscaHint.hidden = true;
  // Falhas de rede são retentadas a cada busca (nunca cegam a sessão).
  for (const k of state.buscaFalhas) state.buscaCache.delete(k);
  state.buscaFalhas.clear();
  const run = ++state.buscaRun;
  await ensureSearchIndex(run, (done, total) => {
    if (run === state.buscaRun) setStatus(`Buscando candidato: ${done}/${total} arquivos…`);
  });
  if (run !== state.buscaRun) return;
  renderSearch();
  clearStatus();
  setLive('on', 'busca de candidatos');
}

function renderSearch() {
  const q = els.qCand.value.trim();
  const box = els.buscaResults;
  box.innerHTML = '';
  state.buscaLast = [];
  if (q.length < 2) { els.buscaFoot.textContent = ''; return; }
  const index = [];
  const keys = [];
  for (const t of searchTargets()) {
    const k = searchKey(t);
    keys.push(k);
    const itens = state.buscaCache.get(k);
    if (itens) index.push(...itens);
  }
  const { total, itens } = searchCandidates(index, q);
  state.buscaLast = itens;
  const frag = document.createDocumentFragment();
  itens.forEach((r, i) => frag.appendChild(searchRow(r, i)));
  box.appendChild(frag);
  const falhas = keys.filter((k) => state.buscaFalhas.has(k)).length;
  const carregados = keys.filter((k) => state.buscaCache.has(k)).length;
  if (total === 0 && carregados >= keys.length) {
    box.innerHTML = '<li><p class="meta">Nenhum candidato encontrado. Confira o nome, o número ou amplie o escopo (UF/Brasil).</p></li>';
  }
  els.buscaFoot.textContent = total === 0 && carregados < keys.length
    ? `Buscando… (${carregados}/${keys.length} arquivos)`
    : `${total} resultado${total === 1 ? '' : 's'} · ${carregados}/${keys.length} arquivos${falhas ? ` · ${falhas} falha${falhas === 1 ? '' : 's'}` : ''}${total > itens.length ? ' — refine a busca' : ''}`;
}

function searchRow(r, i) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'srow';
  b.dataset.idx = String(i);
  b.title = `Abrir listagem oficial — ${r.cargoNome}`;
  const foto = fotoUrl(state.pleito.ciclo, state.eleicao.codigo, r.uf, r.sqcand);
  const lugar = r.uf === 'br' ? 'Brasil' : (UF_NOME[r.uf] || r.uf.toUpperCase());
  const badge = (r.pct === null || r.pct === undefined)
    ? '' : `<span class="pctbadge mini${isEleito(r) ? ' green' : ''}">${fmtPct(r.pct)}</span>`;
  b.innerHTML = `
    <img class="photo" src="${foto}" alt="" loading="lazy">
    <span class="srow-main">
      <span class="srow-name"><b>${escapeHtml(r.urna)}</b>
        <span class="num">${escapeHtml(r.numero)}</span>
        <span class="party">${escapeHtml(r.partido || '')}</span>
        <span class="ideo">(${ideologia(r.partido)})</span>
        ${situacaoPill(r)}</span>
      <span class="srow-sub">${escapeHtml(r.cargoNome)} · ${escapeHtml(lugar)}${r.municipioNome ? ` · ${escapeHtml(r.municipioNome)}` : ''}</span>
    </span>
    <span class="srow-side">${badge}<span class="srow-votes">${fmtInt.format(r.votos)}<small>votos</small></span></span>`;
  const img = b.querySelector('img');
  img.addEventListener('error', () => { img.onerror = null; img.src = avatarUri(r.urna); }, { once: true });
  li.appendChild(b);
  return li;
}

/** Clique no resultado: abre a listagem oficial da disputa, filtrada nele. */
function drillBusca(r) {
  state.cargo = cargos().find((c) => c.codigo === r.cargoCodigo) || state.cargo;
  state.uf = r.uf;
  state.municipio = r.municipioCodigo || '';
  if (r.uf === 'br') state.regiao = 'todas';
  els.selMunicipio.value = r.municipioNome || '';
  state.buscaDrill = r.urna;
  setView('ranking');
}

/** Após carregar o ranking do drill, filtra pelo candidato e rola até ele. */
function applyBuscaDrill() {
  if (!state.buscaDrill) return;
  els.q.hidden = false;
  els.q.value = state.buscaDrill;
  state.buscaDrill = '';
  renderRanking();
  document.querySelector('.results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- Cadeiras (hemiciclo) ---------------- */

/** Cargos com hemiciclo e auto-abertura da aba: Senador e Deputados. */
function isSeatCargo(cargo = state.cargo) {
  if (!cargo || state.eleicao?.tipo !== '1') return false;
  return cargo.tipo === '2' || cargo.nome === 'Senador';
}

/** Elegibilidade da view (inclui Vereador com município). Senão, motivo. */
function seatScope() {
  const cargo = state.cargo;
  if (state.eleicao?.tipo === '3' && /^vereador/i.test(cargo?.nome || '')) {
    if (!state.uf || state.uf === 'br' || !state.municipio) {
      return { notice: 'Cadeiras de Vereador: escolha UF e município para ver a Câmara.' };
    }
    return { municipal: true };
  }
  if (!isSeatCargo()) return { notice: 'Cadeiras disponíveis para Senador e Deputados (Federal, Estadual e Distrital).' };
  return {};
}

async function loadCadeiras() {
  els.cadPanel.hidden = false;
  const scope = seatScope();
  if (scope.notice) {
    els.cadTitle.textContent = `Cadeiras · ${state.cargo.nome}`;
    els.cadMeta.textContent = scope.notice;
    els.cadLayout.hidden = true;
    els.cadLegend.innerHTML = '';
    els.hemiGrid.innerHTML = '';
    els.seatDetail.textContent = '';
    els.seatDrillWrap.hidden = true;
    clearStatus();
    setLive('off', 'cadeiras indisponíveis');
    return;
  }
  const { ciclo } = state.pleito;
  const ele = state.eleicao.codigo;
  const cargo = state.cargo.codigo;
  const ufs = scope.municipal ? [state.uf] : searchUfs();
  const mun = scope.municipal ? state.municipio : '';
  const chave = `${ciclo}/${ele}/${cargo}/${ufs.join(',')}/${mun}/${isClaro() ? 'claro' : 'escuro'}`;
  const hit = state.cadCache.get(chave);
  // TTL de 5 min: cadeiras se definem ao longo da apuração; sem refetch periódico fixam.
  let dados = hit && Date.now() - hit.at < 5 * 60 * 1000 ? hit.dados : null;
  if (!dados) {
    let feito = 0;
    const entries = await Promise.all(ufs.map(async (uf) => {
      try {
        const raw = await fetchJson(dadosUrl(ciclo, ele, uf, cargo, mun));
        const resumo = parseResumo(raw);
        return { uf, ok: true, eleitos: flattenCandidates(raw).filter((c) => c.eleitoFlag), vagas: resumo.vagas };
      } catch {
        return { uf, ok: false };
      } finally {
        feito += 1;
        setStatus(`Carregando cadeiras: ${feito}/${ufs.length} UFs…`);
      }
    }));
    dados = buildSeatData(entries, isClaro());
    state.cadCache.set(chave, { dados, at: Date.now() });
  }
  renderCadeiras(dados, scope);
  clearStatus();
  setLive(dados.definidas === 0 ? 'off' : 'on', 'cadeiras');
}

function renderCadeiras(dados, scope) {
  state.cadLast = dados;
  state.cadSel = -1;
  hideSeatTip();
  els.seatDrillWrap.hidden = true;
  const geo = scope.municipal ? `${munNameByCode(state.municipio) || ''}/${state.uf.toUpperCase()}`
    : (state.uf && state.uf !== 'br') ? UF_NOME[state.uf]
      : state.regiao === 'todas' ? 'Brasil' : `Região ${REGIOES[state.regiao]?.nome || ''}`;
  els.cadTitle.textContent = `${state.cargo.nome} · Cadeiras`;
  els.cadMeta.textContent = `${geo} · ${dados.definidas} de ${dados.total} definidas · eleitos por votos · fonte TSE`
    + (dados.erros ? ` · ${dados.erros} sem dados` : '');
  els.cadLayout.hidden = false;
  renderIdeoCard(dados);
  els.cadLegend.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const item of dados.legenda) {
    const div = document.createElement('div');
    div.className = 'seat-vleg';
    div.dataset.party = item.partido;
    div.title = `${fmtCompact.format(item.votos)} votos`;
    div.innerHTML = `<span class="legend-swatch" style="background:${item.cor}"></span><b>${escapeHtml(item.partido)}</b>`
      + `<span class="n">${item.seats}</span>`;
    frag.appendChild(div);
  }
  els.cadLegend.appendChild(frag);
  els.hemiGrid.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${HEMI_W} ${HEMI_H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Hemiciclo — ${state.cargo.nome}`);
  svg.classList.add('hemi');
  dados.seats.forEach((s, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', s.x);
    c.setAttribute('cy', s.y);
    c.setAttribute('r', s.r);
    c.dataset.idx = String(i);
    if (s.cand) c.dataset.party = s.cand.partido || '';
    c.classList.add('seat');
    if (s.cand) c.style.fill = s.cor;
    else c.classList.add('empty');
    svg.appendChild(c);
  });
  els.hemiGrid.appendChild(svg);
  els.seatDetail.textContent = dados.definidas
    ? 'Passe o mouse ou toque numa cadeira para ver o eleito.'
    : 'Nenhuma cadeira definida ainda para este escopo.';
}

/** Card lateral: cadeiras definidas por campo ideológico. */
function renderIdeoCard(dados) {
  const n = { direita: 0, centro: 0, esquerda: 0 };
  for (const s of dados.seats) {
    if (s.cand) n[ideologia(s.cand.partido)] += 1;
  }
  const base = dados.definidas;
  const share = (v) => (base > 0 ? fmtPct((v / base) * 100) : '—');
  els.cadDir.textContent = fmtInt.format(n.direita);
  els.cadDirP.textContent = share(n.direita);
  els.cadCen.textContent = fmtInt.format(n.centro);
  els.cadCenP.textContent = share(n.centro);
  els.cadEsq.textContent = fmtInt.format(n.esquerda);
  els.cadEsqP.textContent = share(n.esquerda);
}

/** Tooltip da cadeira: mesmo padrão premium do mapa. */
function showSeatTip(ev, i) {
  const tip = els.seatTip;
  const s = state.cadLast?.seats[i];
  if (!s?.cand) { tip.hidden = true; return; }
  const c = s.cand;
  const cor = s.cor;
  tip.innerHTML = `<div class="tt-head">${escapeHtml(c.urna)} <small>${escapeHtml(c.numero)}</small></div>`
    + `<div class="tt-row"><span class="dot" style="background:${cor}"></span>`
    + `<span>${escapeHtml(c.partido || '')} <span class="ideo">(${ideologia(c.partido)})</span></span>`
    + `<span class="pctbadge mini" style="background:${cor};border-color:transparent;color:${isLight(cor) ? '#1a202c' : '#fff'}">${fmtPct(c.pct)}</span>`
    + `<b>${fmtInt.format(c.votos)}</b></div>`
    + `<div class="tt-foot">${escapeHtml(state.cargo.nome)} · ${s.uf === 'br' ? 'Brasil' : (UF_NOME[s.uf] || s.uf.toUpperCase())} · #${i + 1} por votos · clique para ver no ranking</div>`;
  placeTip(tip, ev);
}

function hideSeatTip() {
  els.seatTip.hidden = true;
}

/** Abre o ranking oficial da disputa da cadeira selecionada. */
function drillSeat() {
  const s = state.cadLast?.seats[state.cadSel];
  if (!s?.cand) return;
  hideSeatTip();
  const mun = state.eleicao.tipo === '3' ? (state.municipio || '') : '';
  drillBusca({
    ...s.cand, cargoCodigo: state.cargo.codigo, uf: s.uf,
    municipioCodigo: mun, municipioNome: mun ? munNameByCode(mun) || '' : '',
  });
}

/** Seleciona a cadeira (hover/toque) e mostra o eleito + botão de drill. */
function selectSeat(i) {
  const dados = state.cadLast;
  if (!dados || !dados.seats[i]) return;
  state.cadSel = i;
  els.hemiGrid.querySelectorAll('.seat.sel').forEach((el) => el.classList.remove('sel'));
  els.hemiGrid.querySelector(`[data-idx="${i}"]`)?.classList.add('sel');
  const s = dados.seats[i];
  if (!s.cand) {
    els.seatDetail.textContent = 'Cadeira ainda indefinida.';
    els.seatDrillWrap.hidden = true;
    return;
  }
  const c = s.cand;
  els.seatDetail.innerHTML = `<b>${escapeHtml(c.urna)}</b> <span class="num">${escapeHtml(c.numero)}</span> `
    + `<span class="party">${escapeHtml(c.partido || '')}</span> <span class="ideo">(${ideologia(c.partido)})</span> · `
    + `${fmtInt.format(c.votos)} votos (${fmtPct(c.pct)}) · ${s.uf === 'br' ? 'Brasil' : (UF_NOME[s.uf] || s.uf.toUpperCase())}`;
  els.seatDrillWrap.hidden = false;
}

/* ---------------- Render ---------------- */

function renderKpis(r) {
  els.kpiStrip.hidden = false;
  els.kUrnas.textContent = fmtPct(r.secoes.pct);
  els.kUrnasBar.style.width = `${Math.min(100, r.secoes.pct)}%`;
  els.kUrnasBar.parentElement.title = `${fmtInt.format(r.secoes.apuradas)} de ${fmtInt.format(r.secoes.total)} seções`;
  const [c1, c2] = state.candidatos;
  els.kCand1.textContent = c1 ? `${c1.urna} (${c1.partido || ''})` : '—';
  els.kCand1P.textContent = c1 ? fmtPct(c1.pct) : '—';
  els.kCand1V.textContent = c1 ? `${fmtInt.format(c1.votos)} votos` : '—';
  els.kCand2.textContent = c2 ? `${c2.urna} (${c2.partido || ''})` : '—';
  els.kCand2P.textContent = c2 ? fmtPct(c2.pct) : '—';
  els.kCand2V.textContent = c2 ? `${fmtInt.format(c2.votos)} votos` : '—';
  renderGapKpi();
  const fator = fatorVotosPorEleitor(state.cargo && state.cargo.tipo, r.vagas);
  const baseVotos = r.eleitorado * fator;
  const shareVotos = (v) => (baseVotos > 0 ? fmtPct((v / baseVotos) * 100) : '—');
  const shareEl = (v) => (r.eleitorado > 0 ? fmtPct((v / r.eleitorado) * 100) : '—');
  els.kEleitorado.textContent = fmtInt.format(r.eleitorado * fator);
  els.kValidos.textContent = fmtInt.format(r.votos.validos);
  els.kValidosP.textContent = shareVotos(r.votos.validos);
  els.kBrancos.textContent = fmtInt.format(r.votos.brancos);
  els.kBrancosP.textContent = shareVotos(r.votos.brancos);
  els.kNulos.textContent = fmtInt.format(r.votos.nulos);
  els.kNulosP.textContent = shareVotos(r.votos.nulos);
  els.kAbs.textContent = fmtInt.format(r.abstencao?.total || 0);
  els.kAbsSub.textContent = shareEl(r.abstencao?.total || 0);
  els.kEleitNote.hidden = fator < 2;
}

/** Card da régua: diferença de votos/p.p. entre 1º e 2º (disputa completa). */
function renderGapKpi() {
  const g = gapInfo(state.candidatos);
  if (g.status === 'insuficiente') { els.kGapWrap.hidden = true; return; }
  els.kGapWrap.hidden = false;
  if (g.status === 'ok') {
    els.kGap.textContent = `+${fmtInt.format(g.diffVotos)}`;
    els.kGapSub.textContent = `${fmtPct(g.diffPp).replace('%', '')} p.p.`;
    els.kGapWrap.title = `${g.leader.urna} × ${g.runner.urna}`;
  } else if (g.status === 'empate') {
    els.kGap.textContent = '0';
    els.kGapSub.textContent = 'empate técnico';
    els.kGapWrap.title = `${g.leader.urna} × ${g.runner.urna}: mesmos votos`;
  } else {
    els.kGap.textContent = '—';
    els.kGapSub.textContent = 'aguardando apuração';
    els.kGapWrap.title = '';
  }
}

function renderRanking() {
  const q = els.q.value.trim().toLowerCase();
  let lista = state.candidatos;
  if (q) {
    lista = lista.filter((c) =>
      c.urna.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q)
      || c.numero.includes(q) || (c.partido || '').toLowerCase().includes(q));
  }
  const limite = state.showAll || q ? lista.length : Math.min(lista.length, 12);
  els.ranking.innerHTML = '';
  lista.slice(0, limite).forEach((c, i) => els.ranking.appendChild(candRow(c, i + 1)));
  els.moreWrap.hidden = state.showAll || !!q || lista.length <= 12;
  els.btnMore.textContent = `Mostrar todos (${lista.length})`;
  if (!lista.length) {
    const li = document.createElement('li');
    li.className = 'cand';
    li.innerHTML = '<p class="meta" style="grid-column:1/-1">Nenhum candidato encontrado para este filtro.</p>';
    els.ranking.appendChild(li);
  }
}

function candRow(c, pos) {
  const li = document.createElement('li');
  li.className = `cand${pos === 1 ? ' first' : ''}${isEleito(c) ? ' eleito' : ''}`;
  const foto = fotoUrl(state.pleito.ciclo, state.eleicao.codigo, state.uf && state.uf !== 'br' ? state.uf : 'br', c.sqcand);
  const pill = situacaoPill(c);
  const sub = subInfo(c);
  li.innerHTML = `
    <span class="pos">${pos}º</span>
    <img class="photo" src="${foto}" alt="Foto de ${escapeHtml(c.urna)}" loading="lazy">
    <div class="cand-main">
      <div class="cand-name">
        <b>${escapeHtml(c.urna)}</b>
        <span class="num">${escapeHtml(c.numero)}</span>
        <span class="party">${escapeHtml(c.partido || '')}</span>
        <span class="ideo">(${ideologia(c.partido)})</span>
        ${pill}
      </div>
      ${sub ? `<div class="cand-sub">${sub}</div>` : ''}
      <div class="bar" role="img" aria-label="${fmtPct(c.pct)} dos votos"><i></i></div>
    </div>
    <span class="cand-badge"><span class="pctbadge ${badgeTone(c, pos)}">${fmtPct(c.pct)}</span></span>
    <div class="cand-side">
      <span class="votes">${fmtInt.format(c.votos)}<small>votos</small></span>
    </div>`;
  const img = li.querySelector('img');
  img.addEventListener('error', () => { img.onerror = null; img.src = avatarUri(c.urna); }, { once: true });
  requestAnimationFrame(() => { li.querySelector('.bar i').style.width = `${Math.min(100, c.pct)}%`; });
  return li;
}

/** Tom do badge de %: verde eleito, dourado líder, neutro demais. */
function badgeTone(c, pos) {
  if (/eleit/i.test(c.situacao || '') && !/não eleit/i.test(c.situacao || '')) return 'green';
  return pos === 1 ? 'gold' : '';
}

function isEleito(c) {
  const s = c.situacao || '';
  return /eleit|2º turno|segundo turno/i.test(s) && !/não eleit/i.test(s);
}
function situacaoPill(c) {
  if (!c.situacao) return '';
  return `<span class="pill ${isEleito(c) ? 'win' : 'out'}">${escapeHtml(c.situacao)}</span>`;
}

function subInfo(c) {
  const parts = [];
  if (c.vice.length) {
    const cod = state.cargo ? String(state.cargo.codigo).padStart(4, '0') : '';
    const rotulo = cod === '0005' ? 'Suplentes' : 'Vice';
    parts.push(`${rotulo}: ${escapeHtml(c.vice.map((v) => v.partido ? `${v.nome} (${v.partido})` : v.nome).join(' · '))}`);
  }
  if (c.composicao && c.composicao !== c.partido) parts.push(escapeHtml(c.composicao));
  else if (c.federacao) parts.push(`Fed. ${escapeHtml(c.federacao)}`);
  return parts.join(' · ');
}

function renderEleitos() {
  const q = els.qMun.value.trim().toLowerCase();
  const lista = q
    ? state.eleitos.filter((e) => e.municipio.toLowerCase().includes(q))
    : state.eleitos;
  els.eleitosBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  const LIMITE = 400;
  let linhas = 0;
  for (const e of lista) {
    if (linhas >= LIMITE) break;
    for (const c of e.candidatos) {
      if (linhas >= LIMITE) break;
      linhas += 1;
      const tr = document.createElement('tr');
      const foto = fotoUrl(state.pleito.ciclo, state.eleicao.codigo, state.uf, c.sqcand);
      tr.innerHTML = `
        <td class="mun">${escapeHtml(e.municipio)}</td>
        <td><span class="candcell">
          <img class="photo" src="${foto}" alt="" loading="lazy">
          <span>${escapeHtml(c.urna)} <span class="num" style="color:var(--faint);font-size:12px">${escapeHtml(c.numero)}</span></span>
        </span></td>
        <td data-label="Partido">${escapeHtml(c.partido || '')}</td>
        <td class="num" data-label="Votos">${fmtInt.format(c.votos)}</td>`;
      const img = tr.querySelector('img');
      img.addEventListener('error', () => { img.onerror = null; img.src = avatarUri(c.urna); }, { once: true });
      frag.appendChild(tr);
    }
  }
  els.eleitosBody.appendChild(frag);
  if (!lista.length) {
    els.eleitosBody.innerHTML = '<tr><td colspan="4" class="meta">Nenhum município encontrado.</td></tr>';
  } else if (linhas >= LIMITE) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="meta">Mostrando os primeiros ${LIMITE} — refine pelo filtro de município.</td>`;
    els.eleitosBody.appendChild(tr);
  }
}

function metaResumo(r) {
  const bits = [];
  bits.push(`${fmtInt.format(r.secoes.apuradas)} de ${fmtInt.format(r.secoes.total)} seções apuradas`);
  if (r.totalizacaoFinal && r.totalizadoEm) bits.push(`totalizado em ${r.totalizadoEm}`);
  else if (r.geradoEm) bits.push(`atualizado em ${r.geradoEm}`);
  bits.push('fonte TSE');
  return bits.join(' · ');
}

/* ---------------- Tema claro/escuro ---------------- */

function isClaro() {
  return document.documentElement.dataset.theme !== 'dark';
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('apurabrasil:theme'); } catch { /* padrão claro */ }
  applyTheme(saved === 'dark' ? 'dark' : 'light', false);
}

function applyTheme(theme, reload = true) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('apurabrasil:theme', theme); } catch { /* modo privado */ }
  document.documentElement.style.colorScheme = theme;
  els.themeColor.setAttribute('content', theme === 'light' ? '#e9edf4' : '#0a1120');
  els.icoSun.hidden = theme !== 'dark';
  els.icoMoon.hidden = theme !== 'light';
  if (reload) {
    state.mapCache.clear();
    state.projCache.clear();
    load(); // reconstrói cores do mapa/tabela no novo tema
  }
}

function setBadge(finalizada) {
  els.resBadge.hidden = false;
  els.resBadge.textContent = finalizada ? 'Totalizado' : 'Apuração parcial';
  els.resBadge.className = `badge ${finalizada ? 'final' : 'partial'}`;
}

function hideResults() {
  document.querySelector('.results').hidden = true;
  els.eleitosPanel.hidden = true;
  els.mapPanel.hidden = true;
  els.projPanel.hidden = true;
  els.buscaPanel.hidden = true;
  els.cadPanel.hidden = true;
  els.colPanel.hidden = true;
  els.kpiStrip.hidden = true;
  els.resBadge.hidden = true;
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  updateViewTabs();
  if (state.loading) { state.pendingView = true; return; }
  load({ keepMap: true });
}

function updateViewTabs() {
  els.tabRanking.setAttribute('aria-selected', String(state.view === 'ranking'));
  els.tabMapa.setAttribute('aria-selected', String(state.view === 'mapa'));
  els.tabProj.setAttribute('aria-selected', String(state.view === 'projecoes'));
  els.tabBusca.setAttribute('aria-selected', String(state.view === 'busca'));
  els.tabCad.setAttribute('aria-selected', String(state.view === 'cadeiras'));
  els.tabCol.setAttribute('aria-selected', String(state.view === 'colegios'));
}

/** Mostra somente as abas válidas para o cargo (mapa, cadeiras e colégios variam). */
function updateTabVisibility() {
  const mapaOk = mapMode() !== null;
  const cadOk = !seatScope().notice;
  els.tabMapa.hidden = !mapaOk;
  els.tabCad.hidden = !cadOk;
  els.tabCol.hidden = nivel() === 'municipal';
}

/** Modo do mapa: 'candidato' (presidente), 'partido' (gov/sen) ou null. */
function mapMode() {
  if (nivel() === 'nacional') return 'candidato';
  if (nivel() === 'estadual' && state.cargo?.tipo === '1') return 'partido';
  return null;
}

/* ---------------- Status / live / relógio ---------------- */

function setStatus(msg, isError = false) {
  els.statusBox.hidden = false;
  els.statusBox.className = `status${isError ? ' error' : ''}`;
  els.statusBox.textContent = msg;
}
function clearStatus() { els.statusBox.hidden = true; }
function setLive(mode, label) {
  els.liveBadge.className = `live ${mode === 'on' ? 'live-on' : mode === 'done' ? 'live-done' : ''}`;
  els.liveLabel.textContent = label;
}
function startClock() {
  const update = () => {
    els.clock.textContent = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  };
  update();
  setInterval(update, 1000);
}
function tick() {
  if (!els.chkAuto.checked || state.loading) { els.countdown.textContent = '—'; return; }
  if (state.finalizada) { els.countdown.textContent = 'fim'; return; }
  state.timer -= 1;
  if (state.timer <= 0) { load(); checkForUpdate(); return; }
  els.countdown.textContent = `${state.timer}s`;
}

/* ---------------- Nova versão ---------------- */

/** Versão do HTML carregado (carimbada no deploy). */
function appVersion() {
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') || null;
}

/** Carimba a versão visível no rodapé (diagnóstico "qual versão estou vendo?"). */
function stampVersion() {
  if (!els.appVer) return;
  const v = appVersion();
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(v || '');
  els.appVer.textContent = m ? `v${m[3]}/${m[2]} ${m[4]}:${m[5]}` : (v ? `v${v}` : 'v?');
}

/** Compara com version.json; se houve deploy, exibe barra de atualização. */
async function checkForUpdate() {
  if (!els.updateBar.hidden) return;
  try {
    // Query-buster: iOS antigo ignora `cache: 'no-store'`; URL única fura todo cache.
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v) return;
    const mine = appVersion();
    // Sem meta = HTML anterior ao versionamento = desatualizado por definição.
    if (!mine || v !== mine) els.updateBar.hidden = false;
  } catch { /* dev/offline: sem version.json */ }
}

/* ---------------- Persistência ---------------- */

function persist() {
  try {
    localStorage.setItem(storeKey, JSON.stringify({
      pleito: state.pleito?.codigo, eleicao: state.eleicao?.codigo,
      cargo: state.cargo?.codigo, regiao: state.regiao, uf: state.uf, municipio: state.municipio,
      view: state.view,
    }));
  } catch { /* modo privado: segue sem persistir */ }
}

function restore() {
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { /* usa padrão */ }
  state.pleito = state.pleitos.find((p) => p.codigo === pref.pleito)
    || state.pleitos.find((p) => p.ciclo === 'ele2026')
    || state.pleitos[0];
  state.eleicao = state.pleito.eleicoes.find((e) => e.codigo === pref.eleicao) || state.pleito.eleicoes[0];
  state.cargo = cargos().find((c) => c.codigo === pref.cargo) || cargos()[0];
  if (pref.regiao && (pref.regiao === 'todas' || REGIOES[pref.regiao])) state.regiao = pref.regiao;
  if (pref.uf && (pref.uf === 'br' || UF_NOME[pref.uf])) state.uf = pref.uf;
  if (pref.view === 'mapa' || pref.view === 'projecoes') state.view = pref.view;
  state.municipio = pref.municipio || '';
  if (state.municipio) els.selMunicipio.value = '';
}

/* ---------------- Utils ---------------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function avatarUri(nome) {
  const iniciais = String(nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const bg = isClaro() ? '#dfe6f0' : '#182437';
  const fg = isClaro() ? '#4c5d78' : '#9fb0c9';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="104" height="104"><rect width="104" height="104" rx="52" fill="${bg}"/><text x="52" y="62" font-family="sans-serif" font-size="36" font-weight="700" fill="${fg}" text-anchor="middle">${iniciais}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
