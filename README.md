# ApuraBrasil — Resultados das Eleições por Região e Categoria

Portal dinâmico que reorganiza os **dados oficiais do TSE** (`resultados.tse.jus.br`)
por **região → UF → município** e por **categoria/cargo**, com atualização automática
durante a apuração.

- **Sem backend, sem build**: HTML + CSS + JS puro; o navegador busca o JSON público
  do TSE diretamente (a API permite CORS).
- **Eleições**: dirigido pelo `ele-c.json` oficial — 2026 (Presidente, Governador,
  Senador, Deputados) e 2024 (Prefeito, Vereador, 1º/2º turno, suplementares).
- **Por região**: consolidado regional de Presidente (soma das UFs da região);
  Governador/Senador/Deputados por UF; Prefeito/Vereador por município +
  tabela de eleitos por município na UF.
- **Tempo real**: auto-refresh de 60 s, selo AO VIVO / TOTALIZADO, fotos oficiais.
- **Mapa do Brasil**: SVG geográfico real (malha IBGE) com as 27 UFs pintadas
  pelo vencedor — azul Flávio Bolsonaro, laranja Lula (Presidente); por
  partido em Governador/Senador. Ao lado, tabela de votos por estado
  (líder, 2º e diferença). Clique (mapa ou tabela) para ver o ranking da UF.
- **Projeções**: extrapolação ponderada por UF (gráfico apurado × projetado),
  matemática da virada (quanto o 2º precisa dos votos restantes) e tabela
  1º turno × atual (2º turno). Régua inclui abstenções para fechar os 100%.
- **Layout**: no desktop, cards semânticos por cor empilhados à esquerda e
  tabelas à direita (ranking e projeções seguem o mesmo padrão).
- **Temas**: light (padrão) e dark, com botão no topo e preferência salva.
- **Busca de candidato**: aba que procura por nome/número em todos os cargos
  da eleição no escopo (UF/Brasil); o clique abre a listagem oficial filtrada.
- **Cadeiras**: hemiciclo de eleitos por partido para Senador e Deputados
  (abre sozinha ao clicar nesses cargos); toque numa cadeira para ver o
  eleito e ir ao ranking.
- **Colégios**: tabela de eleitorado por UF (total, válidos, brancos, nulos,
  abstenções + rodapé Brasil); para presidente há ainda o card VS com as
  barras bilaterais do 1º × 2º nacional por colégio.

## Como rodar

```bash
python3 server.py        # ou: python3 server.py 8080
```

Abra no navegador: **http://127.0.0.1:8000/**

## Se travar em "conectando…"

1. Não abra o `index.html` por duplo-clique (`file://` bloqueia os módulos JS).
   Sempre rode `python3 server.py` **dentro da pasta do projeto** e use o `http://` acima.
2. O portal agora avisa sozinho na tela quando o app não inicia — siga a mensagem.
3. Persistindo, abra o console do navegador (F12) e veja o erro vermelho
   (ex.: `Failed to load module script` = MIME/caminho; `Failed to fetch` = rede/TSE).

## Estrutura

```
index.html          shell + filtros + ranking
css/styles.css      tema escuro premium
js/tse.js           cliente da API do TSE (URLs, fetch, parsers) — sem DOM
js/app.js           estado, filtros, ranking, auto-refresh
server.py           servidor do portal (stdlib)
tests/              testes Node (sem framework) + fixtures reais da API
```

## Deploy (produção)

```bash
./deploy.sh
```

O script carimba a versão (`index.html` + `version.json`), roda a suite,
publica em `/var/www/eleicoes-<VERSAO>/` e vira o symlink
`eleicoes.fssdev.com.br` de forma atômica (nunca há HTML e `version.json`
de versões diferentes no ar). Mantém as 3 últimas versões.
Sempre publique por ele — nunca rsync manual — para a versão sair carimbada.
Rollback: `ssh vps2 "ln -sfn /var/www/eleicoes-<VERSAO> /var/www/eleicoes.fssdev.com.br"`.

**Como os usuários recebem a versão nova (sem travar em cache):**
- O HTML revalida sempre (`no-store`) e referencia `js/css` com `?v=<deploy>`
  — cada deploy gera URLs novas, imunes a cópia velha/quebrada em cache.
- Quem está com a aba **aberta** recebe a barra "Nova versão disponível":
  o app compara a versão do HTML carregado com `version.json` a cada ciclo
  de auto-refresh (60 s), 20 s após abrir e ao voltar para a aba; um clique
  em "Atualizar agora" recarrega para a versão nova.

## Testes

```bash
node tests/run-tests.mjs
```

Cobre: construção das URLs (padrões extraídos do app oficial e validados ao vivo),
parsers de `ele-c`, dados unificados (`-u.json`) e eleitos (`-e.json`), e o
consolidado regional — tudo sobre **fixtures capturadas da API real**.

## Fonte dos dados

Padrões de URL (ambiente `oficial`):

| Arquivo         | URL                                                     |
|-----------------|---------------------------------------------------------|
| Eleições        | `/oficial/comum/config/ele-c.json`                      |
| Municípios      | `/oficial/{ciclo}/{ele}/config/mun-e{ele:06d}-cm.json`  |
| Votação         | `/oficial/{ciclo}/{ele}/dados/{uf}/{uf}{mun}{zona}-c{cargo:04d}-e{ele:06d}-u.json` |
| Eleitos         | `/oficial/{ciclo}/{ele}/dados/{uf}/{uf}-c{cargo:04d}-e{ele:06d}-e.json` |
| Fotos           | `/oficial/{ciclo}/{ele}/fotos/{uf}/{sqcand}.jpeg`       |
