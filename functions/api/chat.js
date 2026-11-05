/**
 * Cloudflare Pages Function — POST /api/chat
 * Calls Cohere v2 Chat API grounded on PROFILE from mock/data.js.
 * Requires COHERE_API_KEY in the Cloudflare Pages environment.
 */
import PROFILE from "../../mock/data.js";

const MODEL = PROFILE.features?.llmModel || "command-r7b-12-2024";
const MAX_MESSAGE_LEN = 300;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const plain = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

/**
 * Builds Cohere v2 grounding documents ({ id, data: { title, text } }) directly from PROFILE.
 */
export function buildDocuments(P = PROFILE) {
  const byCompany = new Map();
  for (const job of P.experience) {
    const list = byCompany.get(job.company) || [];
    for (const r of job.roles) {
      const bullets = r.bullets ? " — " + r.bullets.map(plain).join(" ") : "";
      list.push(`${r.title} (${r.dates})${bullets}`);
    }
    byCompany.set(job.company, list);
  }

  return [
    {
      id: "summary",
      data: {
        title: `${P.name} — ${P.headline}`,
        text: `${P.currentRole} at ${P.currentCompany} (${P.location}). ${P.resumeSummary} Contact: ${P.email}.`,
      },
    },
    ...[...byCompany.entries()].map(([company, roles]) => ({
      id: `exp_${company.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      data: { title: `Experience — ${company}`, text: roles.join(" | ") },
    })),
    {
      id: "skills_education",
      data: {
        title: "Skills, Education & Languages",
        text: [
          `Top skills: ${P.topSkills.join(", ")}.`,
          `Technologies: ${P.tech.join(", ")}.`,
          `Education: ${P.education.degree}, ${P.education.school} (${P.education.years}).`,
          `Languages: ${P.languages.map((l) => `${l.name} (${l.level})`).join(", ")}.`,
        ].join(" "),
      },
    },
    {
      id: "off_hours",
      data: {
        title: "Outside of work",
        text: P.offHours.join("; ") + ".",
      },
    },
  ];
}

export async function onRequestPost({ request, env, fetchImpl = fetch }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", fallback: true }, 400);
  }

  const message = String(body?.message || "").trim();
  if (!message) return json({ error: "Message is required", fallback: true }, 400);
  if (message.length > MAX_MESSAGE_LEN) {
    return json({ error: `Message exceeds ${MAX_MESSAGE_LEN} characters`, fallback: true }, 400);
  }

  const apiKey = env?.COHERE_API_KEY;
  if (!apiKey) {
    return json({ error: "COHERE_API_KEY is not configured", fallback: true }, 503);
  }

  try {
    const res = await fetchImpl("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Hugo Lafleur answering questions on your personal portfolio. Speak in the first person ('I', 'my'). Use only facts from the provided documents; if a detail is not in the documents, say so rather than guessing. Keep answers concise (2–4 sentences).",
          },
          { role: "user", content: message },
        ],
        documents: buildDocuments(),
        max_tokens: 250,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      return json({ error: `Cohere API error (${res.status})`, fallback: true }, res.status);
    }

    const data = await res.json();
    const reply = data?.message?.content?.[0]?.text?.trim();
    if (!reply) {
      return json({ error: "Empty response from model", fallback: true }, 502);
    }

    return json({
      reply,
      model: MODEL,
      provider: "cohere",
      citations: data.message?.citations || [],
      fallback: false,
    });
  } catch (err) {
    return json({ error: "Upstream request failed", message: err.message, fallback: true }, 502);
  }
}
