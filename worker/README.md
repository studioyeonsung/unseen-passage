# AIS Worker (Cloudflare · 무료)

GitHub Pages에서 실시간 선박을 쓰려면 Worker를 1회 배포합니다.

## 비용

Cloudflare Workers **무료 플랜** — 개인 사이트 충분.

---

## 방법 A — GitHub Actions (추천)

**최초 1회만** GitHub 저장소 Settings → Secrets:

| Secret | 값 |
|--------|-----|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 대시보드 오른쪽 **Account ID** |
| `AISSTREAM_API_KEY` | AISstream API 키 |

`main`에 push하면 Worker가 자동 배포됩니다.

배포 후 Actions 로그에서 URL 확인 (예: `https://unseen-passage-ais.xxxxx.workers.dev`)

`js/config.js`:

```js
const AIS_API_URL = "https://unseen-passage-ais.xxxxx.workers.dev";
```

---

## 방법 B — 로컬에서 직접

```bash
cd worker
export CLOUDFLARE_API_TOKEN="..."
export AISSTREAM_API_KEY="..."
bash deploy.sh
```

---

## 로컬 개발

터미널 없이 GitHub Pages만 쓸 때는 Worker URL만 config에 넣으면 됩니다.

로컬 테스트: `python3 serve.py` → http://localhost:8000

