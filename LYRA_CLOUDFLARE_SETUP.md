# LYRA – Cloudflare Worker KI

Diese Version ersetzt den bisherigen Node/Express-Server durch einen nativen Cloudflare Worker.
Du brauchst dafür keinen Node.js-Server.

## Im Cloudflare Worker
1. Öffne deinen bestehenden Worker `lyra-lernassistent`.
2. Öffne den Code-Editor.
3. Ersetze den bisherigen Worker-Code durch den Inhalt von `worker.js`.
4. Deploy.

## Danach API-Key als Secret
Cloudflare Dashboard:
Workers & Pages → `lyra-lernassistent` → Settings → Variables and Secrets → Add
- Type: Secret
- Variable name: `OPENAI_API_KEY`
- Value: dein OpenAI API-Key
- Deploy

Optional:
- Variable `OPENAI_MODEL` = `gpt-5.6-luna`
- Variable `ALLOWED_ORIGIN` = die exakte URL deiner LYRA-Webseite

Den OpenAI-Key niemals in `index.html` eintragen.

## API
GET `/api/health`
POST `/api/ai`

POST erwartet:
{
  "message": "...",
  "image": "data:image/jpeg;base64,...",
  "history": [{"role":"user","content":"..."}],
  "context": {...}
}

## Wichtig
Die Index wurde außerdem korrigiert: `sendChat()` war im ursprünglichen Paket nicht als `async` deklariert, obwohl darin `await fetch(...)` verwendet wird.
