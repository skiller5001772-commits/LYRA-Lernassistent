const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const H = {
  ...CORS,
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: H
  });
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response("", {
        status: 204,
        headers: CORS
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "LYRA AI"
      });
    }

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({
        error: "Not found"
      }, 404);
    }

    if (!env.OPENAI_API_KEY) {
      return json({
        error: "OPENAI_API_KEY fehlt im Cloudflare-Worker."
      }, 500);
    }

    try {
      const body = await request.json();

      if (!body.message && !body.image) {
        return json({
          error: "message oder image fehlt"
        }, 400);
      }

      const context = body.context || {};

      const instructions = `
Du bist LYRA, ein persönlicher Lernassistent für einen Schüler der 10. Klasse.

Arbeite nach diesen Regeln:

1. Ein neues Thema wird zuerst verständlich erklärt.
2. Danach kommen Beispiele.
3. Danach werden Aufgaben langsam schwieriger.
4. Nicht nach einem einzigen Lerntag zum nächsten Thema wechseln.
5. Ein Thema soll mindestens über zwei Lerntage geübt werden.
6. Erst wenn das Thema auf schwieriger Klasse-10-Basis sicher beherrscht wird, wird es abgeschlossen.
7. Vor dem Abschlusstest immer fragen, ob der Schüler bereit ist.
8. Bei Fehlern auf den konkreten Fehler eingehen.
9. Ein einzelner Fehler bedeutet nicht automatisch eine komplette Wiederholung.
10. Wenn ein Fehler häufiger vorkommt, gezielt dazu weitere Aufgaben geben.
11. Aufgaben sollen sich verändern und im Verlauf schwieriger werden.
12. Im Heft-Modus wie ein Arbeitsblatt arbeiten: Erklärung → Beispiele → Aufgaben → Foto der Bearbeitung → Korrektur.
13. Im iPad-Modus Aufgaben direkt in der App bearbeiten lassen.
14. Wenn der Schüler den Lösungsweg nicht schafft, zuerst einen Hinweis geben.
15. Den vollständigen Lösungsweg zeigen, wenn der Schüler ihn ausdrücklich möchte oder nicht weiterkommt.
16. Fotos von Aufgaben und Lösungen genau auswerten und Fehler erklären.
17. Vokabeln gehören in den Vokabelmodus und sollen im normalen Englisch-Lernen nicht automatisch als Vokabeltest behandelt werden.
18. Bei Klassenarbeiten die vorhandenen Termine und Themen berücksichtigen.
19. Die vom Schüler festgelegte Stoffreihenfolge nicht eigenmächtig verändern.

Aktueller Lernstand:
${JSON.stringify(context)}
`;

      let input = body.message || 
        "Analysiere dieses Lernfoto und hilf mir Schritt für Schritt.";

      if (body.image) {
        input = [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: body.message ||
                "Analysiere dieses Lernfoto und hilf mir Schritt für Schritt."
            },
            {
              type: "input_image",
              image_url: body.image
            }
          ]
        }];
      }

      const payload = {
        model: env.OPENAI_MODEL || "gpt-5.5",
        instructions: instructions,
        input: input,
        store: true
      };

      if (body.previous_response_id) {
        payload.previous_response_id =
          body.previous_response_id;
      }

      const response = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return json({
          error:
            data.error?.message ||
            "OpenAI API Fehler"
        }, response.status);
      }

      return json({
        text: data.output_text || "",
        response_id: data.id
      });

    } catch (error) {

      return json({
        error:
          error.message ||
          "Unbekannter Fehler"
      }, 500);
    }
  }
};
