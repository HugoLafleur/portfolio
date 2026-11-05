/**
 * Cloudflare Pages Serverless Function: Cohere Chat API Handler
 * Route: POST /api/chat
 *
 * Environment Secrets required:
 *   COHERE_API_KEY: Cohere API Key (Trial or Production)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Input Validation & Guardrails
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body", fallback: true }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = String(body?.message || "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required", fallback: true }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Token protection: prevent large essay pastes into prompt
  if (message.length > 300) {
    return new Response(
      JSON.stringify({
        error: "Message exceeds maximum allowed length (300 characters)",
        fallback: true,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Secret Configuration Check
  const apiKey = env.COHERE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "COHERE_API_KEY is not configured in server environment",
        fallback: true,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Grounding Documents (Sourced from Hugo's Profile)
  const documents = [
    {
      id: "current_role",
      title: "ServiceNow AI Leadership",
      text: "Hugo Lafleur is Director, AI Engineering Management at ServiceNow in Montreal (March 2026 - Present). Previously Sr. Manager Machine Learning Infrastructure (2023 - 2026). Joined ServiceNow via Element AI acquisition as Technical Manager SRE/DevOps hosting SaaS AI workloads on Azure Kubernetes.",
    },
    {
      id: "sre_devops",
      title: "SRE & Cloud Infrastructure",
      text: "At Octave Group (2016 - 2020), progressed from Linux Automation Specialist to Team Lead and Director of SRE. Managed global tech budget and AWS spend; led observability rollout (Prometheus, Grafana, Dynatrace, Sumo Logic); led Kubernetes on AWS EKS POC; built deployment CMDB.",
    },
    {
      id: "enterprise_consulting",
      title: "Dassault Systèmes & Enterprise Engagements",
      text: "Consultant for 8+ years at Dassault Systèmes (2007 - 2015). Managed QA team of 8. Led performance testing, capacity planning and observability at Boeing (2007 - 2010). Led ENOVIA V6 operations and deployment automation at Honda R&D Americas (2012 - 2015).",
    },
    {
      id: "leadership_philosophy",
      title: "Leadership Philosophy",
      text: "Leadership anchored in two tenets: staying hands-on to deeply understand execution team challenges, and using business storytelling with data to highlight critical issues to executive leadership, improving deployment success rate and team engagement.",
    },
    {
      id: "off_hours",
      title: "Personal Interests & Crafts",
      text: "Outside work: crafts timber in his wood workshop, rides bicycle to the climbing gym, and plays board games with his kids. Holds B.Eng in Electrical Engineering from Université de Sherbrooke (2000 - 2004). Fully bilingual in French and English.",
    },
  ];

  // 4. Call Cohere v2 Chat API with strict grounding
  try {
    const cohereResponse = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "command-r7b-12-2024",
        messages: [
          {
            role: "system",
            content:
              "You are Hugo Lafleur's digital representative on his personal portfolio. Speak directly in the first person ('I', 'my'). Strictly answer using the facts provided in the grounding documents. Keep responses concise (under 3 sentences unless asked for a breakdown). If a query is unrelated to Hugo's professional background or hobbies, politely decline and offer to help with his career experience.",
          },
          {
            role: "user",
            content: message,
          },
        ],
        documents,
        max_tokens: 250,
        temperature: 0.3,
      }),
    });

    if (!cohereResponse.ok) {
      const errData = await cohereResponse.text();
      return new Response(
        JSON.stringify({
          error: `Cohere API error (${cohereResponse.status})`,
          detail: errData,
          fallback: true,
        }),
        { status: cohereResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await cohereResponse.json();
    const replyText =
      data.message?.content?.[0]?.text || "Unable to generate response from model.";
    const citations = data.message?.citations || [];

    return new Response(
      JSON.stringify({
        reply: replyText,
        model: "command-r7b-12-2024",
        provider: "cohere",
        citations,
        fallback: false,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Network/upstream failure calling Cohere API",
        message: err.message,
        fallback: true,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
