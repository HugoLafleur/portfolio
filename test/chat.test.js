const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../mock/data.js");
const { createChat, suggestions, tokenize } = require("../mock/chat.js");

const chat = createChat(P);
const STATIC_ACTIONS = new Set(["resume", "writing", "pdf", "email", ...Object.keys(P.links)]);
const replies = chat.intents.map((it) => ({ id: it.id, ...it.reply() }));

test("every suggestion chip reaches its intended intent", () => {
  for (const s of suggestions) assert.equal(chat.answer(s.query).id, s.expect, `"${s.query}"`);
});

test("routes common questions to the right intent", () => {
  const cases = {
    "What do you do today?": "current",
    "Where did you study?": "education",
    "Do you speak French?": "languages",
    "Tell me about Boeing": "dassault",
    "What's your tech stack?": "skills",
    "Walk me through your career": "career",
    "Do you write a blog?": "writing",
    "Who are you?": "about",
    "hello": "help",
    "/help": "help",
    "How do I reach you?": "contact",
    "Tell me about your woodworking": "offhours",
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(chat.answer(q).id, id, `"${q}"`);
});

test("accents and case are ignored", () => {
  assert.equal(chat.answer("Où est ton RÉSUMÉ ?").id, "resume");
  assert.equal(chat.answer("Parles-tu français ?").id, "languages");
});

test("unknown questions fall back without inventing anything", () => {
  const r = chat.answer("What's your favourite pizza?");
  assert.equal(r.id, "fallback");
  assert.match(r.html, /scripted demo/);
});

test("/clear and empty input are handled", () => {
  assert.equal(chat.answer("/clear").id, "clear");
  assert.equal(chat.answer("  ").id, "fallback");
  assert.equal(chat.answer(undefined).id, "fallback");
});

test("intent keys are folded tokens and unique across intents", () => {
  const seen = new Map();
  for (const it of chat.intents) {
    for (const k of it.keys) {
      assert.deepEqual(tokenize(k), [k], `key "${k}" in ${it.id} can never match a tokenized query`);
      assert.ok(!seen.has(k), `key "${k}" is in both ${seen.get(k)} and ${it.id}`);
      seen.set(k, it.id);
    }
  }
});

test("every action a reply offers can be resolved by the UI", () => {
  for (const r of replies) {
    for (const a of r.actions || []) {
      if (a.startsWith("post:")) assert.ok(P.posts[+a.slice(5)], `${r.id}: ${a} points to a missing post`);
      else assert.ok(STATIC_ACTIONS.has(a), `${r.id}: unknown action "${a}"`);
    }
  }
});

test("replies render data, not 'undefined'", () => {
  for (const r of replies) assert.doesNotMatch(r.html, /undefined|NaN|\[object/, r.id);
});

test("replies speak in third person about Hugo as an assistant", () => {
  for (const r of replies) {
    assert.doesNotMatch(r.html, /\b(?:I am|I've|my work|I hold|I lead|I speak|reach me)\b/i, r.id);
  }
});

test("replies only state the current role from the profile", () => {
  const r = chat.answer("What is your current role?");
  assert.match(r.html, new RegExp(P.currentRole));
});

test("fallback answers in the visitor's language", () => {
  const en = chat.answer("What is your favourite cheese?");
  assert.equal(en.id, "fallback");
  assert.match(en.html, /scripted demo/);

  for (const q of ["Quelle est ta couleur préférée ?", "Peux-tu me parler de ton fromage préféré ?", "Quel temps fait-il à Montréal ?"]) {
    const fr = chat.answer(q);
    assert.equal(fr.id, "fallback", q);
    assert.match(fr.html, /démo scriptée/, q);
    assert.doesNotMatch(fr.html, /scripted demo/, q);
  }
});
