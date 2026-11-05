const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const LLM = require("../mock/llm.js");
const P = require("../mock/data.js");

test("LLM feature flag defaults to false in data.js", () => {
  assert.equal(P.features.llm, false);
  assert.equal(LLM.isLLMEnabled(P), false);
});

test("LLM feature flag respects profile override", () => {
  assert.equal(LLM.isLLMEnabled({ features: { llm: true } }), true);
  assert.equal(LLM.isLLMEnabled({ features: { llm: false } }), false);
});

test("queryChatAPI parses successful model response", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      reply: "At ServiceNow, Hugo directed AI engineering.",
      model: "command-r7b-12-2024",
      provider: "cohere",
      fallback: false,
    }),
  });

  const res = await LLM.queryChatAPI("Tell me about ServiceNow", { fetch: fakeFetch });
  assert.equal(res.ok, true);
  assert.equal(res.reply, "At ServiceNow, Hugo directed AI engineering.");
  assert.equal(res.model, "command-r7b-12-2024");
  assert.equal(res.fallback, false);
});

test("queryChatAPI triggers fallback on 500 error", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
  });

  const res = await LLM.queryChatAPI("Tell me about ServiceNow", { fetch: fakeFetch });
  assert.equal(res.ok, false);
  assert.equal(res.fallback, true);
  assert.match(res.error, /500/);
});

test("queryChatAPI triggers fallback on upstream server error payload", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      error: "COHERE_API_KEY is not configured",
      fallback: true,
    }),
  });

  const res = await LLM.queryChatAPI("Tell me about SRE", { fetch: fakeFetch });
  assert.equal(res.ok, false);
  assert.equal(res.fallback, true);
});

test("queryChatAPI triggers fallback on network exception", async () => {
  const fakeFetch = async () => {
    throw new Error("Network connection refused");
  };

  const res = await LLM.queryChatAPI("Hi", { fetch: fakeFetch });
  assert.equal(res.ok, false);
  assert.equal(res.fallback, true);
  assert.match(res.error, /Network connection/);
});

test("Cloudflare function exists and has onRequestPost export", () => {
  const fnPath = path.join(__dirname, "..", "functions", "api", "chat.js");
  assert.ok(fs.existsSync(fnPath), "functions/api/chat.js exists");
  const content = fs.readFileSync(fnPath, "utf8");
  assert.match(content, /export async function onRequestPost/);
  assert.match(content, /command-r7b-12-2024/);
  assert.match(content, /COHERE_API_KEY/);
});
