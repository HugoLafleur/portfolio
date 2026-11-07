const test = require("node:test");
const assert = require("node:assert/strict");
const LLM = require("../mock/llm.js");
const P = require("../mock/data.js");

const fakeStorage = (map = {}) => ({ getItem: (k) => (k in map ? map[k] : null) });
const makeReq = (body, origin = "https://site.test") => ({
  url: "https://site.test/api/chat",
  headers: new Headers(origin ? { Origin: origin } : {}),
  json: async () => {
    if (typeof body === "string") return JSON.parse(body);
    return body;
  },
});

test("LLM feature flag defaults to false in data.js", () => {
  assert.equal(P.features.llm, false);
  assert.equal(LLM.isLLMEnabled(P), false);
});

test("LLM feature flag priority: URL ?llm > localStorage > profile.features.llm", () => {
  // 1. Profile fallback
  assert.equal(LLM.isLLMEnabled({ features: { llm: true } }), true);
  assert.equal(LLM.isLLMEnabled({ features: { llm: false } }), false);

  // 2. localStorage overrides profile
  assert.equal(
    LLM.isLLMEnabled({ features: { llm: false } }, { storage: fakeStorage({ "feature:llm": "true" }) }),
    true
  );
  assert.equal(
    LLM.isLLMEnabled({ features: { llm: true } }, { storage: fakeStorage({ "feature:llm": "false" }) }),
    false
  );

  // 3. URL param overrides both localStorage and profile
  assert.equal(
    LLM.isLLMEnabled(
      { features: { llm: false } },
      { search: "?llm=1", storage: fakeStorage({ "feature:llm": "false" }) }
    ),
    true
  );
  assert.equal(
    LLM.isLLMEnabled(
      { features: { llm: true } },
      { search: "?llm=0", storage: fakeStorage({ "feature:llm": "true" }) }
    ),
    false
  );
});

test("queryChatAPI parses successful model response", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      reply: "I lead AI engineering management at ServiceNow.",
      model: "command-r7b-12-2024",
      provider: "cohere",
      fallback: false,
    }),
  });

  const res = await LLM.queryChatAPI("Tell me about ServiceNow", { fetch: fakeFetch });
  assert.equal(res.ok, true);
  assert.equal(res.reply, "I lead AI engineering management at ServiceNow.");
  assert.equal(res.model, "command-r7b-12-2024");
  assert.equal(res.fallback, false);
});

test("queryChatAPI triggers fallback on HTTP error, server fallback payload, network error, and timeout", async () => {
  const r500 = await LLM.queryChatAPI("Hi", { fetch: async () => ({ ok: false, status: 500 }) });
  assert.equal(r500.ok, false);
  assert.equal(r500.fallback, true);
  assert.equal(r500.status, 500);

  const rServerFallback = await LLM.queryChatAPI("Hi", {
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ error: "No key", fallback: true }) }),
  });
  assert.equal(rServerFallback.ok, false);
  assert.equal(rServerFallback.fallback, true);

  const rNet = await LLM.queryChatAPI("Hi", {
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(rNet.ok, false);
  assert.equal(rNet.fallback, true);
  assert.match(rNet.error, /ECONNREFUSED/);

  const rTimeout = await LLM.queryChatAPI("Hi", {
    timeoutMs: 10,
    fetch: (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          const e = new Error("Aborted");
          e.name = "AbortError";
          reject(e);
        });
      }),
  });
  assert.equal(rTimeout.ok, false);
  assert.equal(rTimeout.fallback, true);
  assert.match(rTimeout.error, /timed out/);
});

test("buildDocuments produces valid Cohere v2 documents covering all companies in data.js", async () => {
  const { buildDocuments } = await import("../functions/api/chat.js");
  const docs = buildDocuments(P);

  assert.ok(Array.isArray(docs) && docs.length >= 6);
  for (const d of docs) {
    assert.ok(typeof d.id === "string" && d.id.length, "document missing id");
    assert.ok(d.data && typeof d.data.title === "string" && typeof d.data.text === "string", `${d.id} missing data.{title,text}`);
    assert.doesNotMatch(d.data.text, /<[^>]+>|&amp;/, `${d.id} contains raw HTML`);
  }

  const allText = docs.map((d) => `${d.data.title} ${d.data.text}`).join(" ");
  for (const job of P.experience) {
    assert.ok(allText.includes(job.company), `missing company ${job.company} in grounding docs`);
  }
});

test("onRequestPost validates input and requires COHERE_API_KEY", async () => {
  const { onRequestPost } = await import("../functions/api/chat.js");

  // Cross-site or missing Origin
  const crossSite = await onRequestPost({ request: makeReq({ message: "Hi" }, "https://evil.test"), env: { COHERE_API_KEY: "k" } });
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).fallback, true);
  const noOrigin = await onRequestPost({ request: makeReq({ message: "Hi" }, null), env: { COHERE_API_KEY: "k" } });
  assert.equal(noOrigin.status, 403);

  // Bad JSON
  const badJson = await onRequestPost({ request: makeReq("{not json"), env: { COHERE_API_KEY: "k" } });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).fallback, true);

  // Empty message
  const empty = await onRequestPost({ request: makeReq({ message: "   " }), env: { COHERE_API_KEY: "k" } });
  assert.equal(empty.status, 400);

  // Over 300 chars
  const tooLong = await onRequestPost({ request: makeReq({ message: "x".repeat(301) }), env: { COHERE_API_KEY: "k" } });
  assert.equal(tooLong.status, 400);

  // Missing API key
  const noKey = await onRequestPost({ request: makeReq({ message: "Hello" }), env: {} });
  assert.equal(noKey.status, 503);
  assert.equal((await noKey.json()).fallback, true);
});

test("onRequestPost sends Cohere v2 payload and handles upstream success & rate limits", async () => {
  const { onRequestPost } = await import("../functions/api/chat.js");
  let capturedUrl = null;
  let capturedOpts = null;

  const okRes = await onRequestPost({
    request: makeReq({ message: "What is your current role?" }),
    env: { COHERE_API_KEY: "test-key-123" },
    fetchImpl: async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: [{ text: "I am Director, AI Engineering Management at ServiceNow." }], citations: [] },
        }),
      };
    },
  });

  assert.equal(okRes.status, 200);
  assert.equal(capturedUrl, "https://api.cohere.com/v2/chat");
  assert.equal(capturedOpts.headers.Authorization, "Bearer test-key-123");

  const sent = JSON.parse(capturedOpts.body);
  assert.equal(sent.model, P.features.llmModel);
  assert.equal(sent.max_tokens, 250);
  assert.ok(Array.isArray(sent.documents) && sent.documents[0].data.text);
  assert.equal(sent.messages.at(-1).content, "What is your current role?");

  const body = await okRes.json();
  assert.equal(body.fallback, false);
  assert.equal(body.reply, "I am Director, AI Engineering Management at ServiceNow.");
  assert.equal("citations" in body, false);

  // Upstream 429 rate-limit -> signals fallback
  const rateLimited = await onRequestPost({
    request: makeReq({ message: "Hi" }),
    env: { COHERE_API_KEY: "test-key-123" },
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  assert.equal(rateLimited.status, 429);
  assert.equal((await rateLimited.json()).fallback, true);
});
