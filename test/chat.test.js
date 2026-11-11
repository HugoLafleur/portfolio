const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../mock/data.js");
const { createChat, suggestions, suggestionsFor, tokenize, esc } = require("../mock/chat.js");

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

// ── French (fr_ca): the same structural guarantees, plus routing of French questions ──
const FR = P.PROFILES.fr_ca;
const frChat = createChat(FR);
const frReplies = frChat.intents.map((it) => ({ id: it.id, ...it.reply() }));

test("[fr_ca] every suggestion chip reaches its intended intent", () => {
  for (const s of suggestionsFor("fr_ca")) assert.equal(frChat.answer(s.query).id, s.expect, `"${s.query}"`);
  assert.deepEqual(suggestionsFor("fr_ca").map((s) => s.expect), suggestions.map((s) => s.expect));
  assert.deepEqual(suggestionsFor("xx"), suggestions);
});

test("[fr_ca] routes common French questions to the right intent", () => {
  const cases = {
    "Quel est ton poste actuel ?": "current",
    "Où as-tu étudié ?": "education",
    "Parles-tu anglais ?": "languages",
    "Et chez Boeing ?": "dassault",
    "Quelles sont tes compétences ?": "skills",
    "Quel est ton parcours ?": "career",
    "Écris-tu un blogue ?": "writing",
    "Qui es-tu ?": "about",
    "Bonjour": "help",
    "/help": "help",
    "Comment te joindre ?": "contact",
    "Que fais-tu en menuiserie ?": "offhours",
    "Où est ton RÉSUMÉ ?": "resume",
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(frChat.answer(q).id, id, `"${q}"`);
});

test("[fr_ca] intent keys are folded tokens, unique, and every intent exists in both languages", () => {
  assert.deepEqual(frChat.intents.map((i) => i.id), chat.intents.map((i) => i.id));
  const seen = new Map();
  for (const it of frChat.intents) {
    for (const k of it.keys) {
      assert.deepEqual(tokenize(k), [k], `key "${k}" in ${it.id} can never match a tokenized query`);
      assert.ok(!seen.has(k), `key "${k}" is in both ${seen.get(k)} and ${it.id}`);
      seen.set(k, it.id);
    }
  }
});

test("[fr_ca] replies render French data, offer resolvable actions and speak about Hugo in the third person", () => {
  for (const r of frReplies) {
    assert.doesNotMatch(r.html, /undefined|NaN|\[object/, r.id);
    assert.doesNotMatch(r.html, /\b(?:j'ai|mon travail|je dirige|je parle|contactez-moi)\b/i, r.id);
    for (const a of r.actions || []) {
      if (a.startsWith("post:")) assert.ok(FR.posts[+a.slice(5)], `${r.id}: ${a} points to a missing post`);
      else assert.ok(STATIC_ACTIONS.has(a), `${r.id}: unknown action "${a}"`);
    }
  }
  assert.ok(frChat.answer("Quel est ton poste actuel ?").html.includes(esc(FR.currentRole))); // HTML-escaped: the role contains an apostrophe
  assert.match(frChat.answer("Quelles sont tes compétences ?").html, /Compétences clés/);
});

test("[fr_ca] post actions point to the matching post in French", () => {
  assert.deepEqual(frChat.answer("Que fais-tu en menuiserie ?").actions.slice(0, 1), ["post:4"]);
  assert.deepEqual(frChat.answer("Que sais-tu du SRE ?").actions.slice(0, 1), ["post:3"]);
});

test("[fr_ca] the fallback is always in French, even for an English question", () => {
  for (const q of ["What's your favourite pizza?", "Quel est ton fromage préféré ?"]) {
    const r = frChat.answer(q);
    assert.equal(r.id, "fallback", q);
    assert.match(r.html, /démo scriptée/, q);
  }
});

test("[fr_ca] date ranges treat « Présent » as open-ended", () => {
  assert.match(frChat.answer("Quel est ton parcours ?").html, /ServiceNow<\/b> \(2021–\)/);
  assert.match(frChat.answer("Que fais-tu en IA ?").html, /\(2026–\)/);
});
