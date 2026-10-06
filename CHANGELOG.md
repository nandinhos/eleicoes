# Changelog — ApuraBrasil

## v1.0.0 — 2026-10-05

Importação inicial do portal de apuração (dados oficiais do TSE).

### Novidades
- Ranking por cargo com fotos, situação, filtros e eleitos em destaque
- Mapa do Brasil por UF com intensidade pela vantagem do vencedor
- Projeções ponderadas por UF + tabela da eleição anterior
- Busca de candidato por nome/número com drill à listagem oficial
- Cadeiras em hemiciclo (Senado e Deputados) com composição ideológica
- Colégios eleitorais: tabela por UF + duelo bilateral 1º × 2º
- Temas light (padrão) e dark; layout responsivo sem scroll lateral
- Barra de nova versão com detecção de deploy

### Correções
- Percentuais do card Eleitorado com base nv × eleitorado (2 votos/eleitor)
- Gate de sintaxe .mjs e URLs versionadas por deploy no `deploy.sh`

### Testes
- Suite Node sem framework: 54 testes (URLs, parsers, mapa, duelo, abas)
