/**
 * LYRA AI — Cloudflare Worker
 * Replaces the Node/Express server from the prototype.
 *
 * Secret required:
 *   OPENAI_API_KEY
 *
 * Optional variable:
 *   OPENAI_MODEL (defaults to gpt-5.6-luna)
 */

const MODEL = "gpt-5.6-luna";
const MAX_MESSAGE = 8000;
const MAX_IMAGE_CHARS = 14000000;

const DEVELOPER_INSTRUCTIONS = `Du bist LYRA, eine persönliche Lern-KI für einen Schüler der 10. Klasse.
Arbeite geduldig, klar und auf Deutsch, außer der Nutzer bittet um eine andere Sprache.

Lernregeln:
- Erst verstehen lassen, dann anwenden lassen.
- Bei Aufgaben nicht sofort die komplette Lösung vorsagen. Gib bei Bedarf Hinweise in kleinen Schritten.
- Passe die Schwierigkeit an den gespeicherten Lernstand an.
- Fehler gezielt wieder aufgreifen, aber einen einzelnen Fehler nicht automatisch als dauerhaftes Problem behandeln.
- Wenn ein Thema sicher beherrscht wird, schlage den nächsten sinnvollen Schritt vor.
- Bei Fotos: Lies sichtbaren Text sorgfältig. Wenn etwas unleserlich oder unsicher ist, sage genau, welcher Teil unsicher ist, statt etwas zu erfinden.
- Bei handschriftlichen Lösungen: Trenne klar zwischen dem, was du sicher erkennst, und deiner Bewertung.
- Bei Vokabeln: Nur Vokabelmodus-Inhalte als Vokabeltraining verwenden.
- Bei Klassenarbeiten: Der Prüfungsmodus kann durch die App gesperrt sein; respektiere den gelieferten Status.
- Nutze den mitgesendeten Lernstand als Kontext, nicht als Anlass, private oder unnötige Informationen zu wiederholen.
- Antworte strukturiert und verständlich. Bei Mathematik und Naturwissenschaften zeige Rechenschritte.
- Wenn der Nutzer einfach chatten möchte, antworte normal und freundlich.`;

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      "Cache-Control": "no-store"
    }
  });
}

function compactContext(context = {}) {
  const safe = {
    name: typeof context.name === "string" ? context.name.slice(0, 80) : "",
    mode: typeof context.mode === "string" ? context.mode.slice(0, 30) : "",
    plan: context.plan && typeof context.plan === "object" ? context.plan : {},
    done: context.done && typeof context.done === "object" ? context.done : {},
    errors: Array.isArray(context.errors) ? context.errors.slice(-30) : [],
    vocabCount: Number(context.vocabCount || 0),
    tasks: Array.isArray(context.tasks) ? context.tasks.slice(-20) : [],
    notes: Array.isArray(context.notes) ? context.notes.slice(-10) : [],
    tests: Array.isArray(context.tests) ? context.tests.slice(-10) : []
  };
  return JSON.stringify(safe);
}

function validDataImage(value) {
  if (typeof value !== "string") return false;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return false;
  return value.length <= MAX_IMAGE_CHARS;
}

function isAllowedOrigin(request, env) {
  const configured = env.ALLOWED_ORIGIN;
  if (!configured) return "*";
  const origin = request.headers.get("Origin");
  return origin && origin === configured ? origin : configured;
}

export default {
  async fetch(request, env) {
    const origin = isAllowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST,GET,OPTIONS"
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        model: env.OPENAI_MODEL || MODEL,
        keyConfigured: Boolean(env.OPENAI_API_KEY)
      }, 200, origin);
    }

    if (url.pathname !== "/api/ai" || request.method !== "POST") {
      return json({ error: "LYRA API: endpoint nicht gefunden." }, 404, origin);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY fehlt im Cloudflare Worker." }, 503, origin);
    }

    try {
      const body = await request.json();
      const message = typeof body?.message === "string" ? body.message : "";
      const image = body?.image || null;
      const history = Array.isArray(body?.history) ? body.history : [];
      const context = body?.context || {};

      if (message.length > MAX_MESSAGE) {
        return json({ error: "Nachricht ist zu lang." }, 400, origin);
      }
      if (!message.trim() && !image) {
        return json({ error: "Bitte eine Nachricht oder ein Foto senden." }, 400, origin);
      }
      if (image && !validDataImage(image)) {
        return json({ error: "Das Bildformat wird nicht unterstützt oder ist zu groß." }, 400, origin);
      }

      const input = [];

      for (const m of history.slice(-12)) {
        if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string") continue;
        input.push({
          role: m.role,
          content: m.content.slice(0, MAX_MESSAGE)
        });
      }

      const content = [{
        type: "input_text",
        text: `${message}\n\n[LYRA-Lernkontext]\n${compactContext(context)}`
      }];

      if (image) {
        content.push({
          type: "input_image",
          image_url: image,
          detail: "auto"
        });
      }

      input.push({ role: "user", content });

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || MODEL,
          instructions: DEVELOPER_INSTRUCTIONS,
          input,
          max_output_tokens: 1200
        })
      });

      const raw = await aiResponse.text();
      let result = {};
      try { result = JSON.parse(raw); } catch {}

      if (!aiResponse.ok) {
        console.error("OpenAI error:", raw.slice(0, 4000));
        return json({
          error: "Die KI konnte die Anfrage gerade nicht verarbeiten."
        }, 502, origin);
      }

      return json({
        text: result.output_text || "Ich konnte gerade keine Antwort erzeugen.",
        model: env.OPENAI_MODEL || MODEL
      }, 200, origin);

    } catch (error) {
      console.error("LYRA Worker error:", error);
      return json({
        error: "Die KI konnte die Anfrage gerade nicht verarbeiten."
      }, 500, origin);
    }
  }
};
