/* ApuraBrasil — testes mantidos (Node, sem framework). Uso: node tests/run-tests.mjs
 * Fixtures capturadas da API oficial do TSE; URLs validadas ao vivo. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eleConfigUrl, munUrl, dadosUrl, eleitosUrl, fotoUrl,
  REGIOES, UF_POR_REGIAO, parseEleConfig, flattenCandidates,
  parseResumo, parseEleitos, consolidarRegiao, fetchJson, TseError,
  toInt, toFloat, fatorVotosPorEleitor,
  gapInfo, ideologia,
  projectWeighted, situacaoDisputa, shareParaVirar, turnoAnterior,
  normalizeBusca, searchCandidates, totalizarColegios, dueloColegios,
} from '../js/tse.js';
import {
  identifyProtagonista, candidateColor, partyColor,
  buildMapData, misturarCor, pesoVencedor, COR_BOLSONARO, COR_LULA,
} from '../js/mapa.js';
import { BRASIL_VIEWBOX, UF_PATHS } from '../js/brasil-ufs.js';
import { hemicycle, buildSeatData, HEMI_W, HEMI_H } from '../js/cadeiras.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fx = (name) => JSON.parse(readFileSync(join(dir, name), 'utf-8'));
const src = (name) => readFileSync(join(root, name), 'utf-8');

let passed = 0;
const test = (name, fn) => {
  try { awaited(fn); passed += 1; console.log(`ok - ${name}`); }
  catch (err) { console.error(`FALHOU - ${name}\n${err.stack}`); process.exitCode = 1; }
};
// Suporte a testes async sem runner externo.
const queue = [];
function awaited(fn) {
  if (fn.constructor.name === 'AsyncFunction') queue.push(fn);
  else fn();
}

/* ---- URLs (padroes do app oficial, validados contra a API real) ---- */

test('eleConfigUrl', () => {
  assert.equal(eleConfigUrl(), 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json');
});

test('munUrl preenche eleicao com 6 digitos', () => {
  assert.equal(
    munUrl('ele2026', '6257'),
    'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json',
  );
});

test('dadosUrl nacional/UF/municipio/zona', () => {
  const base = 'https://resultados.tse.jus.br/oficial';
  assert.equal(
    dadosUrl('ele2026', '6257', 'br', '1'),
    `${base}/ele2026/6257/dados/br/br-c0001-e006257-u.json`,
  );
  assert.equal(
    dadosUrl('ele2026', '6259', 'sp', '3'),
    `${base}/ele2026/6259/dados/sp/sp-c0003-e006259-u.json`,
  );
  assert.equal(
    dadosUrl('ele2024', '619', 'sp', '11', '71072'),
    `${base}/ele2024/619/dados/sp/sp71072-c0011-e000619-u.json`,
  );
  assert.equal(
    dadosUrl('ele2024', '619', 'sp', '11', '71072', '7'),
    `${base}/ele2024/619/dados/sp/sp71072-z0007-c0011-e000619-u.json`,
  );
});

test('eleitosUrl e fotoUrl', () => {
  const base = 'https://resultados.tse.jus.br/oficial';
  assert.equal(
    eleitosUrl('ele2024', '619', 'sp', '11'),
    `${base}/ele2024/619/dados/sp/sp-c0011-e000619-e.json`,
  );
  assert.equal(
    fotoUrl('ele2024', '619', 'sp', '250002098117'),
    `${base}/ele2024/619/fotos/sp/250002098117.jpeg`,
  );
});

/* ---- Regioes ---- */

test('27 UFs mapeadas em 5 regioes', () => {
  const todas = Object.values(REGIOES).flatMap((r) => r.ufs);
  assert.equal(new Set(todas).size, 27);
  assert.equal(UF_POR_REGIAO.sp, 'sudeste');
  assert.equal(UF_POR_REGIAO.ba, 'nordeste');
});

/* ---- Parsers sobre fixtures reais ---- */

test('parseEleConfig: 2026 e 2024 com cargos', () => {
  const pleitos = parseEleConfig(fx('ele-c.json'));
  const p2026 = pleitos.find((p) => p.codigo === '3220');
  assert.equal(p2026.ciclo, 'ele2026');
  const federal = p2026.eleicoes.find((e) => e.codigo === '6257');
  assert.equal(federal.tipo, '8');
  assert.equal(federal.abrangencias[0].cargos[0].nome, 'Presidente');
  const estadual = p2026.eleicoes.find((e) => e.codigo === '6259');
  assert.ok(estadual.abrangencias[0].cargos.some((c) => c.nome === 'Governador'));
  const p2024 = pleitos.find((p) => p.codigo === '452');
  const mun = p2024.eleicoes.find((e) => e.codigo === '619');
  assert.deepEqual(
    mun.abrangencias[0].cargos.map((c) => c.nome),
    ['Prefeito', 'Vereador'],
  );
});

test('flattenCandidates: ranking SP 2024 ordenado com vice', () => {
  const cands = flattenCandidates(fx('pref-2024-sp-capital.json'));
  assert.ok(cands.length >= 2);
  assert.equal(cands[0].urna, 'RICARDO NUNES');
  assert.equal(cands[0].votos, 1801139);
  assert.equal(cands[0].partido, 'MDB');
  assert.equal(cands[0].situacao, '2º turno');
  assert.equal(cands[1].urna, 'GUILHERME BOULOS');
  for (let i = 1; i < cands.length; i++) assert.ok(cands[i - 1].votos >= cands[i].votos);
  assert.ok(cands[0].vice.length > 0);
});

test('parseResumo: totais SP 2024', () => {
  const r = parseResumo(fx('pref-2024-sp-capital.json'));
  assert.equal(r.totalizacaoFinal, true);
  assert.equal(r.cargoNome, 'Prefeito');
  assert.deepEqual([r.secoes.total, r.secoes.apuradas], [26513, 26513]);
  assert.equal(r.secoes.pct, 100);
  assert.equal(r.votos.validos, 6108218);
  assert.equal(r.votos.brancos, 241734);
  assert.equal(r.votos.nulos, 422802);
  assert.equal(r.abstencao.total, 2548857);
  assert.ok(Math.abs(r.abstencao.pct - 27.34) < 0.01);
});

test('parseResumo: pre-apuracao 2026 sem totalizar', () => {
  const r = parseResumo(fx('pres-2026-br.json'));
  assert.equal(r.totalizacaoFinal, false);
  assert.equal(r.secoes.apuradas, 0);
  assert.equal(r.cargoNome, 'Presidente');
});

test('parseEleitos: vencedores por municipio', () => {
  const lista = parseEleitos(fx('eleitos-2024-sp-pref.json'));
  assert.equal(lista[0].municipio, 'ADAMANTINA');
  assert.equal(lista[0].candidatos[0].urna, 'JOSÉ TIVERON');
  assert.equal(lista[0].candidatos[0].votos, 7323);
  assert.equal(lista[0].candidatos[0].partido, 'NOVO');
});

test('consolidarRegiao soma votos e recalcula percentual', () => {
  const a = fx('pref-2024-sp-capital.json');
  const cons = consolidarRegiao([a, a, null], 'Teste');
  assert.equal(cons.ufsCarregadas, 2);
  assert.equal(cons.candidatos[0].votos, 1801139 * 2);
  assert.equal(cons.secoes.total, 26513 * 2);
  const somaPct = cons.candidatos.reduce((t, c) => t + c.pct, 0);
  assert.ok(Math.abs(somaPct - 100) < 0.01, `soma pct=${somaPct}`);
  assert.equal(cons.totalizacaoFinal, true);
});

test('eleitorado: consolidado propaga vagas (nv) do cargo (repro #eleit-1)', () => {
  const u = (nv) => ({ s: {}, e: { te: '100', a: '10' }, v: { tv: '180', vv: '150', vb: '10', vn: '20' }, carg: [{ nmn: 'Senador', nv, agr: [] }] });
  const cons = consolidarRegiao([u('2'), u('2')], 'Senado');
  assert.equal(cons.vagas, 2, 'cons.vagas deve ser o nv dos arquivos');
});

test('eleitorado: fator de votos por eleitor por tipo de cargo (repro #eleit-1)', () => {
  assert.equal(fatorVotosPorEleitor('1', 2), 2, 'majoritario nv=2: 2 votos/eleitor');
  assert.equal(fatorVotosPorEleitor('1', 1), 1, 'majoritario nv=1: 1 voto/eleitor');
  assert.equal(fatorVotosPorEleitor('2', 70), 1, 'proporcional ignora nv (voto unico)');
  assert.equal(fatorVotosPorEleitor('2', 513), 1, 'proporcional ignora nv (voto unico)');
  assert.equal(fatorVotosPorEleitor(undefined, undefined), 1, 'ausente: 1 (seguro)');
  assert.equal(fatorVotosPorEleitor('1', 0), 1, 'nv ausente: 1 (seguro)');
});

test('eleitorado: card usa base nv x eleitorado e abstencao base 1x (repro #eleit-1)', () => {
  const js = src('js/app.js');
  assert.match(js, /fatorVotosPorEleitor/, 'renderKpis deve aplicar o fator de votos/eleitor');
  assert.match(js, /kEleitorado\.textContent = fmtInt\.format\(r\.eleitorado \* fator\)/, 'Total deve ser votos possiveis (eleitorado x fator)');
  assert.match(src('index.html'), /total e % sobre o dobro do eleitorado/, 'nota deve explicar total e %');
});

test('toInt/toFloat toleram formato BR e ausentes', () => {
  assert.equal(toInt('1.801.139'), 1801139);
  assert.equal(toInt(undefined), 0);
  assert.equal(toFloat('29,48'), 29.48);
  assert.equal(toFloat('1.234,56'), 1234.56);
  assert.equal(toFloat(null), 0);
});

/* ---- Boot: portal nunca pode travar mudo em "conectando…" (repro #boot-1) ---- */

test('boot: detector de falha de inicializacao no HTML', () => {
  const html = src('index.html');
  assert.match(html, /__apuraBoot/, 'index.html deve conter o detector de boot');
  assert.match(html, /<noscript>/, 'index.html deve avisar com JS desabilitado');
});

test('boot: app sinaliza inicializacao', () => {
  assert.match(src('js/app.js'), /__apuraBoot.*=.*true/, 'app.js deve setar a flag de boot');
});

test('boot: servidor força MIME de módulo JS', () => {
  assert.match(src('server.py'), /text\/javascript/, 'server.py deve forçar Content-Type text/javascript p/ .js');
});

test('boot: [hidden] nunca vencido pelo CSS', () => {
  assert.match(src('css/styles.css'), /\[hidden\][^{]*\{[^}]*display:\s*none/, 'styles.css deve conter guarda [hidden]');
});

/* ---- Mapa por UF ---- */

test('mapa: 27 UFs com paths SVG validos', () => {
  const ufs = Object.keys(UF_PATHS);
  assert.equal(ufs.length, 27);
  assert.match(BRASIL_VIEWBOX, /^\d+ \d+ \d+ \d+$/);
  for (const [uf, d] of Object.entries(UF_PATHS)) {
    assert.match(d, /^M[^Z]+Z/, `path de ${uf} deve ser M...Z`);
    assert.ok(d.length > 100, `path de ${uf} deve ter detalhe (len=${d.length})`);
  }
  const tamanhos = ufs.map((u) => [u, UF_PATHS[u].length]).sort((a, b) => a[1] - b[1]);
  assert.equal(tamanhos[0][0], 'df', 'DF deve ser o menor path');
});

test('mapa: azul Bolsonaro, vermelho Lula', () => {
  assert.equal(identifyProtagonista('FLAVIO BOLSONARO'), 'bolsonaro');
  assert.equal(identifyProtagonista('LULA'), 'lula');
  assert.equal(identifyProtagonista('ZEMA'), null);
  assert.equal(candidateColor({ urna: 'FLAVIO BOLSONARO' }), COR_BOLSONARO);
  assert.equal(candidateColor({ urna: 'LULA' }), COR_LULA);
  assert.equal(COR_BOLSONARO, '#2f7de1');
  assert.equal(COR_LULA, '#e53e3e');
});

test('gapInfo: diferenca 1o x 2o (fixture real SP 2024)', () => {
  const g = gapInfo(flattenCandidates(fx('pref-2024-sp-capital.json')));
  assert.equal(g.status, 'ok');
  assert.equal(g.leader.urna, 'RICARDO NUNES');
  assert.equal(g.runner.urna, 'GUILHERME BOULOS');
  assert.equal(g.diffVotos, 1801139 - 1776127);
  assert.ok(Math.abs(g.diffPp - (29.48 - 29.07)) < 0.001);
  assert.ok(g.share1 > 0.5 && g.share1 < 0.51);
});

test('gapInfo: zeros, empate e insuficiente', () => {
  const C = (urna, votos, pct = 0) => ({ urna, votos, pct, numero: '99', partido: 'X' });
  assert.equal(gapInfo([]).status, 'insuficiente');
  assert.equal(gapInfo([C('A', 5)]).status, 'insuficiente');
  assert.equal(gapInfo([C('A', 0), C('B', 0)]).status, 'aguardando');
  const e = gapInfo([C('A', 10), C('B', 10)]);
  assert.equal(e.status, 'empate');
  assert.equal(e.diffVotos, 0);
});

test('mapa: buildMapData agrega legenda e contadores', () => {
  const C = (urna, numero, partido, votos, pct) => ({ urna, numero, partido, votos, pct });
  const dados = buildMapData([
    { uf: 'sp', ok: true, candidatos: [C('LULA', '13', 'PT', 100, 60), C('FLAVIO BOLSONARO', '22', 'PL', 50, 40)], secoes: { total: 1000, apuradas: 725, pct: 72.5 } },
    { uf: 'rj', ok: true, candidatos: [C('FLAVIO BOLSONARO', '22', 'PL', 80, 80), C('LULA', '13', 'PT', 20, 20)] },
    { uf: 'mg', ok: true, candidatos: [C('LULA', '13', 'PT', 0, 0), C('X', '99', 'Y', 0, 0)] },
    { uf: 'ba', ok: false, candidatos: [] },
  ]);
  assert.equal(dados.aguardando, 1);
  assert.equal(dados.erros, 1);
  assert.equal(dados.legenda.length, 2);
  const lula = dados.legenda.find((l) => l.rotulo === 'LULA');
  assert.equal(lula.cor, COR_LULA);
  assert.equal(lula.partido, 'PT');
  assert.equal(ideologia(lula.partido), 'esquerda');
  assert.equal(lula.ufs, 1);
  assert.equal(lula.votos, 120, 'legenda deve somar votos em TODAS as UFs, não só nas vencidas');
  const bolso = dados.legenda.find((l) => l.rotulo === 'FLAVIO BOLSONARO');
  assert.equal(bolso.cor, COR_BOLSONARO);
  assert.equal(bolso.ufs, 1);
  assert.equal(bolso.votos, 130);
  assert.equal(dados.legenda[0].rotulo, 'FLAVIO BOLSONARO', '1º lugar (mais votos) em cima');
  assert.equal(dados.legenda[1].rotulo, 'LULA', '2º lugar abaixo');
  const sp = dados.ufs.find((u) => u.uf === 'sp');
  assert.equal(sp.status, 'ok');
  assert.equal(sp.corBase, COR_LULA, 'legenda/identidade mantem a cor solida do vencedor');
  assert.equal(sp.margem, 20);
  assert.equal(sp.cor, '#cc4755', 'margem 20 p.p.: vermelho misturado com azul a 86%');
  const rj = dados.ufs.find((u) => u.uf === 'rj');
  assert.equal(rj.cor, COR_BOLSONARO, 'margem >=30 p.p.: cor pura do vencedor');
  assert.equal(sp.gap.status, 'ok');
  assert.equal(sp.gap.runner.urna, 'FLAVIO BOLSONARO');
  assert.equal(sp.gap.diffVotos, 50);
  assert.equal(sp.urnas, 72.5);
  assert.equal(dados.ufs.find((u) => u.uf === 'mg').urnas, null);
  assert.equal(dados.ufs.find((u) => u.uf === 'mg').cor, undefined, 'sem dados: sem cor (tile neutro)');
  assert.equal(dados.ufs.find((u) => u.uf === 'ba').cor, undefined, 'erro: sem cor (tile neutro)');
});

test('mapa: mistura por margem — vencedor sempre predominante', () => {
  assert.equal(misturarCor('#ffffff', '#000000', 1), '#ffffff');
  assert.equal(misturarCor('#ffffff', '#000000', 0), '#000000');
  assert.equal(misturarCor('#ffffff', '#000000', 0.5), '#808080');
  assert.equal(pesoVencedor(0), 0.58);
  assert.equal(pesoVencedor(30), 1);
  assert.equal(pesoVencedor(99), 1, 'margem acima de 30 satura no puro');
  assert.ok(pesoVencedor(2) > 0.5 && pesoVencedor(2) < pesoVencedor(15), 'monotonico e >50%');
  const dist = (x, y) => [1, 3, 5].reduce((t, i) => t + (parseInt(x.slice(i, i + 2), 16) - parseInt(y.slice(i, i + 2), 16)) ** 2, 0);
  for (const m of [0, 1, 5, 10, 20, 29]) {
    const mix = misturarCor(COR_BOLSONARO, COR_LULA, pesoVencedor(m));
    assert.match(mix, /^#[0-9a-f]{6}$/, `m=${m} hex valido`);
    assert.ok(dist(mix, COR_BOLSONARO) < dist(mix, COR_LULA), `m=${m}: vencedor predominante`);
  }
});

test('mapa: escala de intensidade na legenda (derivada da mesma mistura)', () => {
  const C = (urna, numero, partido, votos, pct) => ({ urna, numero, partido, votos, pct });
  const dados = buildMapData([
    { uf: 'sp', ok: true, candidatos: [C('LULA', '13', 'PT', 100, 60), C('FLAVIO BOLSONARO', '22', 'PL', 50, 40)] },
    { uf: 'rj', ok: true, candidatos: [C('FLAVIO BOLSONARO', '22', 'PL', 80, 80), C('LULA', '13', 'PT', 20, 20)] },
  ]);
  assert.ok(dados.escala, 'escala presente com 2+ vencedores');
  assert.equal(dados.escala.refs.length, 3);
  assert.equal(dados.escala.refs[0].corA, dados.escala.a.cor, 'ref +30 p.p. = cor pura');
  assert.ok(![dados.escala.a.cor, dados.escala.b.cor].includes(dados.escala.refs[2].corA), 'ref <5 p.p. = mistura');
  const js = src('js/app.js');
  assert.match(js, /legend-scale/, 'renderMap deve desenhar a faixa de escala');
  assert.match(js, /intensidade = vantagem/, 'meta do mapa deve explicar a intensidade');
  assert.match(src('css/styles.css'), /\.legend-scale/, 'CSS deve estilizar a faixa de escala');
});

test('mapa: partyColor deterministica', () => {
  assert.equal(partyColor('PT'), partyColor('PT'));
  assert.match(partyColor('PT'), /^#[0-9a-f]{6}$/);
  assert.match(partyColor('SIGLAX'), /^#[0-9a-f]{6}$/);
});

test('mapa: tabela sincroniza base com a coluna do mapa e expande no empilhado', () => {
  const js = src('js/app.js');
  assert.match(js, /function mapSideBySide/, 'deteccao de lado a lado deve existir');
  assert.match(js, /gridTemplateColumns\.split\(' '\)\.length > 1/, 'lado a lado deve ler o grid real, nao constante de largura');
  assert.match(js, /els\.mapGrid\.parentElement/, 'sincronia deve mirar a coluna inteira (legenda+mapa)');
  assert.match(js, /ResizeObserver/, 'mudanca de tamanho do mapa deve re-sincronizar');
  assert.match(js, /requestAnimationFrame\(\(\) => syncMapTableHeight\(\)\)/, 'pos-layout deve re-sincronizar');
  const css = src('css/styles.css');
  assert.match(css, /\.map-table-wrap \{ max-height: 70vh; \}/, 'tablet empilhado deve expandir (70vh)');
  assert.match(css, /\.map-table-wrap \{ max-height: 74vh; \}/, 'mobile empilhado deve expandir (74vh)');
});

test('mapa: meta em 2 linhas dentro da coluna esquerda', () => {
  const html = src('index.html');
  const body = html.indexOf('<div class="map-body">');
  const meta = html.indexOf('id="mapMeta"');
  const legend = html.indexOf('id="mapLegend"');
  assert.ok(body > 0 && body < meta && meta < legend, 'mapMeta deve estar na coluna esquerda, acima da legenda');
  assert.match(src('js/app.js'), /mapMeta\.innerHTML = [\s\S]*<br>intensidade = vantagem/, 'meta deve quebrar em 2 linhas');
});

test('colegios: totalizarColegios ordena e soma (ignora falhas)', () => {
  const R = (te, vv, vb, vn, a) => ({ eleitorado: te, votos: { validos: vv, brancos: vb, nulos: vn, comparecimento: vv + vb + vn }, abstencao: { total: a } });
  const dados = totalizarColegios([
    { uf: 'rr', ok: true, resumo: R(100, 70, 5, 5, 20) },
    { uf: 'sp', ok: true, resumo: R(1000, 700, 50, 50, 200) },
    { uf: 'xx', ok: false, resumo: null },
    null,
  ]);
  assert.equal(dados.comDados, 2);
  assert.equal(dados.total, 4);
  assert.equal(dados.linhas[0].uf, 'sp', 'maior colégio primeiro');
  assert.equal(dados.linhas[1].uf, 'rr');
  assert.deepEqual(dados.totais, { total: 1100, validos: 770, brancos: 55, nulos: 55, abstencoes: 220 });
});

test('colegios: aba, painel e funcoes existem', () => {
  const html = src('index.html');
  assert.ok(html.indexOf('id="tabCol"') > html.indexOf('id="tabCad"'), 'aba Colégios após Cadeiras');
  for (const id of ['colPanel', 'colTitle', 'colMeta', 'colTableBody', 'colTableFoot']) {
    assert.ok(html.includes(`id="${id}"`), `index.html deve conter #${id}`);
  }
  for (const col of ['Total', 'Válidos', 'Brancos', 'Nulos', 'Abstenções']) {
    assert.ok(html.includes(`>${col}<`), `thead deve conter coluna ${col}`);
  }
  const js = src('js/app.js');
  assert.match(js, /function loadColegios/, 'loader de colégios deve existir');
  assert.match(js, /function renderColegios/, 'render de colégios deve existir');
  assert.match(js, /function stageUf/, 'staging compartilhado UF deve existir');
  assert.match(js, /setView\('colegios'\)/, 'aba deve trocar para a view colegios');
  assert.match(js, /els\.colPanel\.hidden = true/, 'hideResults deve esconder o painel');
  assert.match(js, /els\.tabCol\.hidden = nivel\(\) === 'municipal'/, 'aba oculta só no nível municipal');
  assert.match(src('css/styles.css'), /table\.uftable tfoot/, 'CSS deve estilizar o rodapé de totais');
});

test('deploy: gate de sintaxe .mjs e URLs versionadas (repro #p0-parse)', () => {
  const sh = src('deploy.sh');
  assert.match(sh, /node --check "\$t"/, 'deploy deve checar sintaxe como .mjs');
  assert.match(sh, /SINTAXE: \$f/, 'falha de sintaxe deve abortar o deploy');
  assert.match(sh, /src=\\"js\/app\\.js\)\(\\\?v=/, 'deploy deve versionar js/app.js no HTML');
  assert.match(sh, /href=\\"css\/styles\\.css\)\(\\\?v=/, 'deploy deve versionar css/styles.css no HTML');
  assert.match(sh, /from '\\1\?v=\$V'/, 'deploy deve versionar os imports do modulo publicado');
  assert.match(sh, /\$DEST\/index\.html/, 'carimbo deve mirar a copia publicada, nao o fonte');
  assert.match(sh, /--exclude '\.git\/'/, 'rsync nao deve publicar o .git');
  assert.match(sh, /\$DEST\/version\.json/, 'version.json deve ser gerado no destino');
});

test('colegios: card VS bilateral com foto e nome do par', () => {
  const html = src('index.html');
  for (const id of ['colLayout', 'vsCard', 'vsHeadA', 'vsHeadB', 'vsRows']) {
    assert.ok(html.includes(`id="${id}"`), `index.html deve conter #${id}`);
  }
  assert.ok(html.indexOf('id="vsCard"') < html.indexOf('id="colTableBody"'), 'card VS a esquerda da tabela');
  const js = src('js/app.js');
  assert.match(js, /function renderVs/, 'render do duelo deve existir');
  assert.match(js, /renderVs\(dueloColegios\(itens\)\)/, 'loader deve renderizar o duelo');
  assert.match(js, /candidateColor\(d\.a, 0/, 'lado A deve usar a cor do 1º nacional');
  assert.match(js, /fotoUrl\(state\.pleito\.ciclo, state\.eleicao\.codigo, 'br', c\.sqcand\)/, 'topo deve exibir a foto do par');
  const css = src('css/styles.css');
  assert.match(css, /\.vs-row \{ display: grid; grid-template-columns: 58px 1fr 40px 1fr 58px/, 'linha bilateral numero-barra-UF-barra-numero');
  assert.match(css, /\.col-layout\.solo/, 'sem par nacional a tabela ocupa tudo');
  assert.match(js, /setProperty\('--win'/, 'linha deve carregar a cor do vencedor da UF');
  assert.match(css, /\.vs-row\.win \.vs-track \{ background: color-mix\(in srgb, var\(--win\)/, 'trilho deve tingir com a cor do vencedor');
});

test('colegios: dueloColegios fixa o par nacional e mede cobertura', () => {
  const C = (urna, numero, sqcand, votos) => ({ urna, numero, sqcand, partido: 'P', votos });
  const R = (te, vv) => ({ eleitorado: te, votos: { validos: vv } });
  const ok = dueloColegios([
    { uf: 'sp', ok: true, resumo: R(1000, 800), candidatos: [C('A', '1', 's1', 500), C('B', '2', 's2', 300)] },
    { uf: 'rj', ok: true, resumo: R(600, 500), candidatos: [C('B', '2', 's2', 300), C('A', '1', 's1', 200)] },
  ]);
  assert.equal(ok.valido, true);
  assert.equal(ok.a.urna, 'A');
  assert.equal(ok.b.urna, 'B');
  assert.equal(ok.a.votos, 700);
  assert.equal(ok.linhas[0].uf, 'sp', 'mesma ordem da tabela (eleitorado)');
  assert.equal(ok.linhas[1].v1, 200, 'lado fixo: A a esquerda mesmo perdendo no RJ');
  assert.equal(ok.linhas[1].v2, 300);
  assert.equal(ok.maxVoto, 500);
  assert.equal(ok.vvNac, 1300);
  const ruim = dueloColegios([
    { uf: 'sp', ok: true, resumo: R(1000, 800), candidatos: [C('A', '1', 's1', 500), C('X', '9', 's9', 300)] },
    { uf: 'rj', ok: true, resumo: R(600, 500), candidatos: [C('B', '2', 's2', 300), C('Y', '8', 's8', 200)] },
  ]);
  assert.equal(ruim.valido, false, 'sem par nacional (cargos por UF): sem card VS');
});

test('ranking: card de diferenca junto a regua', () => {
  const html = src('index.html');
  for (const id of ['kGapWrap', 'kGap', 'kGapSub', 'kCand1', 'kCand1V', 'kCand1P', 'kCand2', 'kCand2V', 'kCand2P', 'kValidosP', 'kBrancosP', 'kNulosP']) {
    assert.ok(html.includes(`id="${id}"`), `index.html deve conter #${id}`);
  }
  assert.match(src('js/app.js'), /renderGapKpi\(\)/, 'app.js deve renderizar o card de diferenca');
});

test('responsivo: breakpoints, toque e guards', () => {
  const css = src('css/styles.css');
  assert.match(css, /max-width: 1024px/, ' deve ter breakpoint de tablet');
  assert.match(css, /max-width: 760px/, ' deve ter breakpoint de celular');
  assert.match(css, /max-width: 420px/, ' deve ter ajuste de telas pequenas');
  assert.match(css, /pointer: coarse/, ' deve ter alvos de toque maiores');
  assert.match(css, /overflow-x: clip/, ' deve travar overflow horizontal');
  assert.match(src('index.html'), /name="viewport"/, ' deve ter meta viewport');
  assert.match(css, /\.wrap \{ max-width: none/, ' deve usar largura total');
  assert.doesNotMatch(css, /max-width: 1120px/, ' não deve limitar a 1120px');
  assert.match(css, /5fr\) minmax\(0, 7fr\)/, 'tabela deve ser protagonista ao lado do mapa');
});

test('ideologia: esquerda/centro/direita por partido', () => {
  for (const p of ['PT', 'PSOL', 'PC do B', 'PDT', 'PSB', 'PV', 'REDE']) assert.equal(ideologia(p), 'esquerda', p);
  for (const p of ['MDB', 'PSD', 'PSDB', 'PODE', 'CIDADANIA', 'AVANTE', 'SOLIDARIEDADE']) assert.equal(ideologia(p), 'centro', p);
  for (const p of ['PL', 'PP', 'UNIÃO', 'REPUBLICANOS', 'NOVO', 'PRD']) assert.equal(ideologia(p), 'direita', p);
  assert.equal(ideologia('missão'), 'direita');
  assert.equal(ideologia('XX'), 'centro');
  assert.equal(ideologia(''), 'centro');
  assert.equal(ideologia(null), 'centro');
});

test('projecao: ponderada escala por fracao de cada UF', () => {
  const C = (numero, urna, votos) => ({ numero, sqcand: numero, urna, partido: 'X', votos, pct: 0 });
  // UF A (50% apurada): A=100, B=0; UF B (100% apurada): A=0, B=100.
  // Ponderada: A=200, B=100. Ingênua (soma ÷ fração global 75%): A=B=133.
  const p = projectWeighted([
    { candidatos: [C('1', 'A', 100), C('2', 'B', 0)], secoes: { total: 100, apuradas: 50 } },
    { candidatos: [C('2', 'B', 100), C('1', 'A', 0)], secoes: { total: 100, apuradas: 100 } },
  ]);
  assert.equal(p.ufsOk, 2);
  assert.equal(p.linhas[0].urna, 'A');
  assert.equal(p.linhas[0].proj, 200);
  assert.equal(p.linhas[1].proj, 100);
  assert.ok(Math.abs(p.fGlobal - 0.75) < 0.001);
});

test('projecao: 100% apurado projeta o proprio resultado', () => {
  const cands = flattenCandidates(fx('pref-2024-sp-capital.json'));
  const p = projectWeighted([{ candidatos: cands, secoes: { total: 26513, apuradas: 26513 } }]);
  assert.equal(p.linhas[0].urna, 'RICARDO NUNES');
  assert.equal(p.linhas[0].proj, 1801139);
  assert.equal(p.linhas[0].atual, 1801139);
  const soma = p.linhas.reduce((t, c) => t + c.projPct, 0);
  assert.ok(Math.abs(soma - 100) < 0.01);
});

test('projecao: situacao e conta da virada', () => {
  assert.equal(situacaoDisputa(1000, 0), 'definido');
  assert.equal(situacaoDisputa(1000, 500), 'definido'); // req=150%
  assert.equal(situacaoDisputa(100, 1000), 'aberto'); // req=55%
  assert.equal(situacaoDisputa(600, 1000), 'tendencia'); // req=80%
  assert.equal(shareParaVirar(0, 1000), 0.5);
  assert.equal(shareParaVirar(100, 0), Infinity);
});

test('projecao: turnoAnterior liga 2T ao 1T', () => {
  const pleitos = parseEleConfig(fx('ele-c.json'));
  assert.deepEqual(turnoAnterior(pleitos, '620'), { ciclo: 'ele2024', eleicao: '619', turno: '1' });
  assert.deepEqual(turnoAnterior(pleitos, '6258'), { ciclo: 'ele2026', eleicao: '6257', turno: '1' });
  assert.equal(turnoAnterior(pleitos, '619'), null);
  const e619 = pleitos.find((p) => p.codigo === '452').eleicoes.find((e) => e.codigo === '619');
  assert.equal(e619.codigoSegundoTurno, '620');
});

test('tema: alternancia claro/escuro presente', () => {
  const html = src('index.html');
  assert.ok(html.includes('id="btnTheme"'), 'deve ter botão de tema');
  assert.ok(html.includes("dataset.theme='light'") || html.includes('dataset.theme'), 'deve aplicar tema antecipado');
  assert.ok(html.includes('id="themeColor"'), 'deve ter theme-color');
  const css = src('css/styles.css');
  assert.match(css, /\[data-theme="dark"\]/, 'deve ter bloco de vars do tema escuro (claro é o padrão)');
  assert.match(css, /--bg: #e9edf4/, 'padrão deve ser o tema claro');
  assert.match(src('js/app.js'), /applyTheme\(/, 'app deve trocar o tema');
});

test('tema: paletas claras distintas', () => {
  assert.notEqual(partyColor('PSD', true), partyColor('PSD'));
  assert.match(partyColor('PSD', true), /^#[0-9a-f]{6}$/);
  assert.equal(candidateColor({ urna: 'LULA' }, 0, true), COR_LULA);
  const C = (urna, numero, partido, votos) => ({ urna, numero, partido, votos, pct: 0, sqcand: numero });
  const escuro = buildMapData([{ uf: 'sp', ok: true, candidatos: [C('ZEMA', '30', 'NOVO', 100), C('X', '99', 'Y', 10)] }]);
  const claro = buildMapData([{ uf: 'sp', ok: true, candidatos: [C('ZEMA', '30', 'NOVO', 100), C('X', '99', 'Y', 10)] }], 'candidato', true);
  assert.notEqual(escuro.ufs[0].cor, claro.ufs[0].cor);
});

test('layout: sidebar de cards e tons semanticos', () => {
  const css = src('css/styles.css');
  assert.match(css, /\.race-layout/, 'deve ter layout de sidebar');
  assert.match(css, /min-width: 1025px/, 'sidebar só no desktop');
  assert.match(css, /3fr\) minmax\(0, 7fr\)/, 'sidebar deve ocupar 30% (3fr/7fr)');
  assert.match(css, /\.ranking \{[^}]*background: transparent/, 'painel da listagem deve ser neutro');
  assert.match(css, /\.cand\.eleito \{[^}]*background: var\(--green-soft\)/, 'só a linha do eleito recebe destaque verde');
  assert.match(css, /\.krow \{[^}]*font-size: 14\.5px/, 'linhas dos cards devem ter fonte ampliada');
  assert.match(css, /\.krow-v \{[^}]*flex-direction: row/, 'valores dos cards em fileira única alinhada');
  assert.ok(src('index.html').includes('Desenvolvido por - Nando DEV - 2026'), 'rodapé deve exibir crédito do desenvolvedor');
  assert.match(css, /\.legend-item \{[^}]*grid-template-columns/, 'legenda deve alinhar 3 colunas');
  assert.ok(src('index.html').indexOf('id="mapLegend"') > src('index.html').indexOf('map-body'), 'legenda deve ficar dentro da coluna do mapa');
  assert.ok(src('index.html').includes('id="mapTip"'), 'tooltip do mapa deve existir no HTML');
  assert.match(src('js/app.js'), /function showMapTip/, 'hover deve abrir tooltip com 1º × 2º');
  assert.ok(src('js/app.js').includes('pctbadge mini" style="background:${cor}'), 'tooltip deve exibir badge de percentual com a cor do líder');
  assert.ok(src('index.html').includes('id="mapTableWrap"'), 'tabela do mapa deve ter id para sincronizar altura');
  assert.match(src('js/app.js'), /function syncMapTableHeight/, 'tabela deve alinhar altura com o mapa');

test('responsivo: mobile de alto padrão', () => {
  const css = src('css/styles.css');
  assert.ok(css.includes('.viewtabs { flex-wrap: wrap; }'), 'tabs devem quebrar linha no mobile');
  assert.ok(!css.includes('min-width: 560px'), 'mobile não deve usar scroll lateral nas tabelas');
  assert.ok(css.includes('table.uftable thead, table.elected thead, table.prev thead { display: none; }'), 'tabelas devem virar cards no mobile');
  assert.ok(src('js/app.js').includes('data-label="Urnas"'), 'tabela de UFs deve rotular campos do card');
  assert.ok(src('js/app.js').includes('data-label="Partido"'), 'tabela de eleitos deve rotular campos do card');
  assert.ok(src('js/app.js').includes('data-label="Δ"'), 'tabela anterior×atual deve rotular campos do card');
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.proj-layout \{ grid-template-columns: 1fr; \}/, 'projeções devem empilhar no mobile');
  assert.ok(css.includes('#liveLabel { display: inline-block;'), 'status ao vivo deve elidir no mobile estreito');
  assert.ok(css.includes('.kpis { grid-template-columns: repeat(2, 1fr); }'), 'tablet deve manter KPIs em 2 colunas');
});

test('tema: light sempre como default', () => {
  const css = src('css/styles.css');
  const html = src('index.html');
  const js = src('js/app.js');
  assert.ok(css.includes('--bg: #e9edf4'), ':root deve ser claro por padrão');
  assert.ok(css.includes('html { color-scheme: light; }'), 'color-scheme deve ser claro por padrão');
  assert.ok(html.includes('<meta name="theme-color" content="#e9edf4"'), 'meta theme-color deve ser claro por padrão');
  assert.ok(!/<html[^>]*data-theme/.test(html), 'HTML nunca deve hardcodar data-theme');
  assert.ok(html.includes("getItem('apurabrasil:theme')==='dark'"), 'anti-flash só aplica dark quando salvo');
  assert.ok(js.includes("saved === 'dark' ? 'dark' : 'light'"), 'initTheme deve cair no light para fresh/garbage');
  assert.ok(js.includes("dataset.theme !== 'dark'"), 'isClaro deve tratar ausência como claro');
});

test('atualização: barra de nova versão', () => {
  const html = src('index.html');
  const js = src('js/app.js');
  assert.ok(html.includes('name="app-version"'), 'HTML deve carregar versão do build');
  assert.ok(html.includes('id="updateBar"'), 'banner de atualização deve existir no HTML');
  assert.match(js, /function checkForUpdate/, 'checagem de nova versão deve existir');
  assert.ok(js.includes('version.json?t=${Date.now()}'), 'checagem deve furar cache com query-buster (iOS)');
  assert.ok(src('deploy.sh').includes('ln -sfn'), 'deploy deve virar symlink atomicamente (sem janela mista)');
  assert.ok(src('index.html').includes('id="appVer"'), 'rodapé deve exibir a versão visível');
  assert.match(src('js/app.js'), /function stampVersion/, 'versão do rodapé deve ser carimbada no boot');
});

test('busca: searchCandidates ranqueia e normaliza', () => {
  const C = (urna, nome, numero, votos) => ({ urna, nome, numero, votos });
  const lista = [
    C('LULA', 'LUIZ INACIO LULA DA SILVA', '13', 100),
    C('FLAVIO BOLSONARO', 'FLAVIO NANTES BOLSONARO', '22', 200),
    C('ZEMA', 'ROMEU ZEMA NETO', '30', 50),
  ];
  assert.equal(normalizeBusca('  João   Dória '), 'joao doria');
  assert.deepEqual(searchCandidates(lista, 'x'), { total: 0, itens: [] });
  const r1 = searchCandidates(lista, 'lula');
  assert.equal(r1.total, 1);
  assert.equal(r1.itens[0].urna, 'LULA');
  const r2 = searchCandidates(lista, 'bolsonaro');
  assert.equal(r2.itens[0].numero, '22');
  const r3 = searchCandidates(lista, '13');
  assert.equal(r3.itens[0].urna, 'LULA', 'número exato primeiro');
  const r4 = searchCandidates(lista, 'o', 99);
  assert.equal(r4.total, 0, 'menos de 2 letras não busca');
  const r5 = searchCandidates(lista, 'luiz inácio');
  assert.equal(r5.itens[0].urna, 'LULA', 'casa nome completo sem acento');
});

test('busca: aba, painel e funcoes existem', () => {
  const html = src('index.html');
  const js = src('js/app.js');
  const css = src('css/styles.css');
  assert.ok(html.includes('id="tabBusca"'), 'aba Buscar deve existir ao lado de Projeções');
  assert.ok(html.indexOf('id="tabBusca"') > html.indexOf('id="tabProj"'), 'aba Buscar após Projeções');
  assert.ok(html.includes('id="buscaPanel"'), 'painel de busca deve existir');
  assert.ok(html.includes('id="qCand"'), 'campo de busca deve existir');
  assert.ok(html.includes('id="buscaResults"'), 'lista de resultados deve existir');
  assert.match(js, /function loadBusca/, 'loader da busca deve existir');
  assert.match(js, /function drillBusca/, 'clique deve navegar para a listagem oficial');
  assert.match(js, /Suplentes/, 'senador deve rotular suplentes (nao vice)');
  assert.match(js, /padStart\(4, '0'\)/, 'codigo do cargo deve ser normalizado (ele-c envia sem zeros)');
  assert.match(js, /cod === '0005'/, 'comparacao deve usar o codigo normalizado');
  assert.match(css, /\.srow/, 'linhas de resultado devem ter estilo');
});

test('cadeiras: hemiciclo posiciona N assentos dentro do SVG', () => {
  for (const n of [1, 2, 3, 24, 54, 70, 94, 513, 1059]) {
    const seats = hemicycle(n);
    assert.equal(seats.length, n, `n=${n} deve gerar n assentos`);
    for (const s of seats) {
      assert.ok(s.x >= 0 && s.x <= HEMI_W && s.y >= 0 && s.y <= HEMI_H, `n=${n} dentro do viewBox`);
      assert.ok(s.r >= 2 && s.r <= 11, `n=${n} raio legível`);
    }
  }
  assert.ok(hemicycle(54).every((s) => s.r <= 8), 'senado com assentos proporcionais');
  assert.equal(new Set(hemicycle(54).map((s) => s.row)).size, 5, 'senado com fileiras justas');
  assert.deepEqual(hemicycle(54), hemicycle(54), 'determinístico');
  assert.deepEqual(hemicycle(0), []);
});

test('cadeiras: buildSeatData ordena por votos e agrupa legenda', () => {
  const C = (urna, partido, votos) => ({ urna, partido, votos });
  const dados = buildSeatData([
    { uf: 'sp', ok: true, vagas: 2, eleitos: [C('A', 'PL', 50), C('B', 'PT', 100)] },
    { uf: 'rj', ok: true, vagas: 2, eleitos: [C('C', 'PL', 70)] },
    { uf: 'mg', ok: false },
  ]);
  assert.equal(dados.total, 4);
  assert.equal(dados.definidas, 3);
  assert.equal(dados.erros, 1);
  assert.equal(dados.seats.length, 4);
  assert.equal(dados.seats[0].cand.urna, 'B', 'mais votado primeiro');
  assert.equal(dados.seats[3].cand, null, 'última cadeira indefinida (cinza)');
  assert.equal(dados.legenda[0].partido, 'PL');
  assert.equal(dados.legenda[0].seats, 2);
});

test('cadeiras: aba, painel e funcoes existem', () => {
  const html = src('index.html');
  const js = src('js/app.js');
  const css = src('css/styles.css');
  assert.ok(html.includes('id="tabCad"'), 'aba Cadeiras deve existir');
  assert.ok(html.indexOf('id="tabCad"') > html.indexOf('id="tabBusca"'), 'aba Cadeiras após Buscar');
  assert.ok(html.includes('id="cadPanel"'), 'painel de cadeiras deve existir');
  assert.ok(html.includes('id="hemiGrid"'), 'grade do hemiciclo deve existir');
  assert.match(js, /function loadCadeiras/, 'loader das cadeiras deve existir');
  assert.match(js, /function isSeatCargo/, 'elegibilidade de cadeiras deve existir');
  assert.match(js, /5 \* 60 \* 1000/, 'cache de cadeiras deve expirar (apuração em curso)');
  assert.match(js, /function updateTabVisibility/, 'abas devem seguir disponibilidade do cargo');
  assert.match(js, /reloadQueued = true/, 'troca durante carga deve enfileirar reload (nunca fixar escopo velho)');
  assert.match(js, /tabMapa\.hidden = !mapaOk/, 'aba mapa oculta quando indisponível');
  assert.match(js, /tabCad\.hidden = !cadOk/, 'aba cadeiras oculta quando indisponível');
  assert.ok(html.includes('id="cadLayout"'), 'cadeiras devem ter layout sidebar + hemiciclo');
  assert.ok(html.includes('id="cadDir"'), 'card ideológico deve ter direita/centro/esquerda');
  assert.match(css, /\.cad-layout \{[^}]*grid-template-columns: minmax\(0, 3fr\)/, 'card ideológico deve ocupar 30%');
  assert.match(js, /function renderIdeoCard/, 'card ideológico deve ser preenchido');
  assert.ok(html.includes('id="seatTip"'), 'tooltip das cadeiras deve existir');
  assert.match(js, /function showSeatTip/, 'hover na cadeira deve abrir tooltip padrão mapa');
  assert.match(js, /function drillSeat/, 'clique na cadeira deve abrir o ranking');
  assert.match(css, /\.seat-vleg/, 'legenda de partidos deve ser lista vertical');
  assert.match(css, /\.hemi\.dim \.seat/, 'hover na legenda deve destacar as cadeiras do partido');
  assert.match(js, /dataset\.party/, 'cadeiras devem carregar partido para highlight');
  assert.match(css, /\.hemi/, 'hemiciclo deve ter estilo');
  assert.ok(js.includes("addEventListener('pageshow'"), 'restauração de bfcache deve rechecar versão');
  assert.ok(js.includes('if (!mine || v !== mine)'), 'HTML sem meta de versão deve ser tratado como desatualizado');
});
  for (const tone of ['ok', 'info', 'neutral', 'bad', 'warn', 'gold']) {
    assert.ok(css.includes(`data-tone="${tone}"`), `CSS deve estilizar tom ${tone}`);
  }
  const html = src('index.html');
  for (const id of ['kpiStrip', 'projChart', 'prevBody']) {
    assert.ok(html.includes(`id="${id}"`), `HTML deve conter #${id}`);
  }
  assert.match(css, /\.proj-layout/, 'deve ter layout de duas colunas nas projecoes');
});

test('numeros: badges de % e alinhamento', () => {
  const css = src('css/styles.css');
  assert.match(css, /\.pctbadge/, 'deve ter componente badge de percentual');
  assert.match(css, /\.pctbadge\.gold/, 'badge deve ter tom ouro (líder)');
  assert.match(css, /\.pctbadge\.green/, 'badge deve ter tom verde (eleito)');
  assert.match(css, /\.pctbadge\.mini/, 'badge deve ter variante mini (cards)');
  assert.match(css, /\.cand-badge/, 'ranking deve ter coluna de badge');
  const app = src('js/app.js');
  assert.match(app, /badgeTone\(c, pos\)/, 'ranking deve usar tom semantico no badge');
  const html = src('index.html');
  const thead = html.slice(html.indexOf('<table class="uftable">'), html.indexOf('</thead>'));
  assert.equal((thead.match(/<th[\s>]/g) || []).length, 6, 'tabela UF deve ter 6 colunas com % central');
  assert.ok(thead.includes('class="ctr"'), 'coluna % deve ser centralizada');
});

/* ---- fetchJson com stub (sem rede) ---- */

queue.push(async () => {
  const nome = 'fetchJson: cache-buster e erro 404 tipado';
  try {
    let seenUrl = '';
    const stub = async (url) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ ok: 1 }) };
    };
    const data = await fetchJson('https://x.test/a.json', stub);
    assert.deepEqual(data, { ok: 1 });
    assert.match(seenUrl, /a\.json\?t=\d+/);

    const stub404 = async () => ({ ok: false, status: 404 });
    await assert.rejects(fetchJson('https://x.test/b.json', stub404), (e) => e instanceof TseError && e.status === 404);
    passed += 1;
    console.log(`ok - ${nome}`);
  } catch (err) { console.error(`FALHOU - ${nome}\n${err.stack}`); process.exitCode = 1; }
});

for (const fn of queue) await fn();
console.log(`\n${passed} testes aprovados${process.exitCode ? ' (com falhas)' : ''}.`);
