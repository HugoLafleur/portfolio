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

test("LLM feature flag defaults to true in data.js", () => {
  assert.equal(P.features.llm, true);
  assert.equal(LLM.isLLMEnabled(P), true);
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
  for (const d of docs) {
    assert.doesNotMatch(d.data.text, /\b(keeps me|I surface|my bike|my kids|my work)\b/i, `${d.id} contains 1st-person phrasing`);
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
          message: { content: [{ text: "Hugo is Director, AI Engineering Management at ServiceNow." }], citations: [] },
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

  const systemMsg = sent.messages.find((m) => m.role === "system");
  assert.ok(systemMsg.content.includes("Portfolio Assistant"));
  assert.ok(systemMsg.content.includes("third person"));
  assert.ok(systemMsg.content.includes("Language"));

  const body = await okRes.json();
  assert.equal(body.fallback, false);
  assert.equal(body.reply, "Hugo is Director, AI Engineering Management at ServiceNow.");
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

test("createDeltaTransformStream extracts deltas and strips citations and metadata", async () => {
  const { createDeltaTransformStream } = await import("../functions/api/chat.js");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const rawChunks = [
    'event: message-start\ndata: {"type":"message-start","delta":{"message":{"role":"assistant"}}}\n\n',
    'event: content-delta\ndata: {"type":"content-delta","index":0,"delta":{"message":{"content":{"text":"Hello"}}}}',
    '\n\nevent: citation-start\ndata: {"type":"citation-start","citations":[{"id":"doc1"}]}\n\n',
    'event: content-delta\ndata: {"type":"content-delta","index":0,"delta":{"message":{"content":{"text":" world"}}}}',
    '\n\nevent: message-end\ndata: {"type":"message-end"}\n\n',
  ];

  const sourceStream = new ReadableStream({
    start(controller) {
      for (const chunk of rawChunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  const transformed = sourceStream.pipeThrough(createDeltaTransformStream());
  const reader = transformed.getReader();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }

  assert.equal(output, 'data: {"delta":"Hello"}\n\ndata: {"delta":" world"}\n\ndata: [DONE]\n\n');
});

test("LLM.readSSEStream accumulates tokens and calls onToken callback", async () => {
  const encoder = new TextEncoder();
  const sseChunks = [
    'data: {"delta":"Hello"}\n\n',
    'data: {"delta":" from"}\n\n',
    'data: {"delta":" streaming"}\n\n',
    'data: [DONE]\n\n',
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const c of sseChunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });

  const tokens = [];
  const { reply, truncated } = await LLM.readSSEStream(stream, (delta) => tokens.push(delta));
  assert.equal(reply, "Hello from streaming");
  assert.equal(truncated, false);
  assert.deepEqual(tokens, ["Hello", " from", " streaming"]);
});

test("queryChatAPI streams tokens via SSE when stream/onToken is provided", async () => {
  const encoder = new TextEncoder();
  const tokens = [];

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"delta":"Director"}\n\n'));
      controller.enqueue(encoder.encode('data: {"delta":", AI"}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const res = await LLM.queryChatAPI("role", {
    onToken: (d) => tokens.push(d),
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
    }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.reply, "Director, AI");
  assert.deepEqual(tokens, ["Director", ", AI"]);
  assert.equal(res.truncated, false);
  assert.equal(res.fallback, false);
});

test("onRequestPost supports stream: true returning SSE Response", async () => {
  const { onRequestPost } = await import("../functions/api/chat.js");
  const encoder = new TextEncoder();
  let capturedOpts = null;

  const mockUpstream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":"Streamed"}}}}'));
      controller.enqueue(encoder.encode('\n\nevent: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":" answer"}}}}'));
      controller.enqueue(encoder.encode('\n\nevent: message-end\ndata: [DONE]\n\n'));
      controller.close();
    },
  });

  const streamRes = await onRequestPost({
    request: makeReq({ message: "What is your current role?", stream: true }),
    env: { COHERE_API_KEY: "test-key-123" },
    fetchImpl: async (_url, opts) => {
      capturedOpts = opts;
      return {
        ok: true,
        status: 200,
        body: mockUpstream,
      };
    },
  });

  assert.equal(streamRes.status, 200);
  assert.equal(streamRes.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(streamRes.headers.get("cache-control"), "no-cache, no-transform");

  const sent = JSON.parse(capturedOpts.body);
  assert.equal(sent.stream, true);

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }

  assert.ok(text.includes('data: {"delta":"Streamed"}\n\n'));
  assert.ok(text.includes('data: {"delta":" answer"}\n\n'));
  assert.ok(text.includes('data: [DONE]\n\n'));
});

const sseStream = (chunks) => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
};

test("createDeltaTransformStream flags replies cut off at max_tokens", async () => {
  const { createDeltaTransformStream } = await import("../functions/api/chat.js");
  const out = await new Response(
    sseStream([
      'event: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":"One, two"}}}}\n\n',
      'event: message-end\ndata: {"type":"message-end","delta":{"finish_reason":"MAX_TOKENS"}}\n\n',
    ]).pipeThrough(createDeltaTransformStream())
  ).text();
  assert.equal(out, 'data: {"delta":"One, two"}\n\ndata: {"truncated":true}\n\ndata: [DONE]\n\n');

  const { reply, truncated } = await LLM.readSSEStream(sseStream([out]));
  assert.equal(reply, "One, two");
  assert.equal(truncated, true);
});

test("queryChatAPI aborts a stream that stalls after the first token", async () => {
  const tokens = [];
  const res = await LLM.queryChatAPI("Hi", {
    idleMs: 20,
    onToken: (d) => tokens.push(d),
    // Sends one token, then goes silent until the client aborts.
    fetch: async (_url, { signal }) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"delta":"Partial"}\n\n'));
          signal.addEventListener("abort", () => controller.error(Object.assign(new Error("Aborted"), { name: "AbortError" })));
        },
      }),
    }),
  });

  assert.deepEqual(tokens, ["Partial"]);
  assert.equal(res.ok, false);
  assert.equal(res.fallback, true);
  assert.match(res.error, /timed out/);
});
