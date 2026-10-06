#!/usr/bin/env bash
# Deploy atômico do ApuraBrasil: carimba versão, testa, publica em dir novo e vira o symlink.
# Uso: ./deploy.sh
# Rollback: ssh vps2 "ln -sfn /var/www/eleicoes-<VERSAO> /var/www/eleicoes.fssdev.com.br"
set -euo pipefail
cd "$(dirname "$0")"

V=$(date +%Y%m%d-%H%M)

# Gate de sintaxe como .mjs (força objetivo módulo; --check em .js puro deu falso-negativo).
for f in js/*.js; do
  t="/tmp/gate-$(basename "$f" .js).mjs"
  cp "$f" "$t" && node --check "$t" || { echo "SINTAXE: $f"; exit 1; }
done

node tests/run-tests.mjs > /tmp/suite.log 2>&1 || { tail -20 /tmp/suite.log; exit 1; }
tail -2 /tmp/suite.log

DEST="/var/www/eleicoes-$V"
rsync -az --exclude '.git/' --exclude 'tests/' --exclude 'deploy.sh' --exclude 'version.json' -e ssh ./ "vps2:$DEST/"
# Carimba a cópia publicada (fonte continua limpo): meta, URLs versionadas e version.json.
ssh vps2 "sed -i -E 's#(<meta name=\"app-version\" content=\")[^\"]+(\")#\1$V\2#' $DEST/index.html"
ssh vps2 "sed -i -E 's#(src=\"js/app\.js)(\?v=[^\"]+)?\"#\1?v=$V\"#; s#(href=\"css/styles\.css)(\?v=[^\"]+)?\"#\1?v=$V\"#' $DEST/index.html"
ssh vps2 "sed -i -E \"s#from '(\./[a-z-]+\.js)'#from '\1?v=$V'#\" $DEST/js/app.js"
ssh vps2 "printf '{\"v\": \"$V\", \"builtAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}\n' > $DEST/version.json"
ssh vps2 "ln -sfn $DEST /var/www/eleicoes.fssdev.com.br && ls -dt /var/www/eleicoes-20* | tail -n +4 | xargs -r rm -rf && readlink /var/www/eleicoes.fssdev.com.br"
curl -s -o /dev/null -w "prod: %{http_code}\n" https://eleicoes.fssdev.com.br/
echo "deploy $V ok"
