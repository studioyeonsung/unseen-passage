#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v npm >/dev/null; then
  echo "Node.js/npm이 필요합니다: https://nodejs.org"
  exit 1
fi

npm install

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Cloudflare API 토큰이 없습니다."
  echo "1. https://dash.cloudflare.com/profile/api-tokens"
  echo "2. 'Edit Cloudflare Workers' 템플릿으로 토큰 생성"
  echo "3. export CLOUDFLARE_API_TOKEN='토큰'"
  exit 1
fi

if [ -z "${AISSTREAM_API_KEY:-}" ]; then
  read -rsp "AISstream API 키: " AISSTREAM_API_KEY
  echo
fi

echo "$AISSTREAM_API_KEY" | npx wrangler secret put AISSTREAM_API_KEY
npx wrangler deploy

echo ""
echo "배포 완료. 출력된 workers.dev URL을 js/config.js AIS_API_URL에 넣으세요."
