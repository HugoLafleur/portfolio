// Static wiring checks between index.html, app.js and the asset files.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "mock");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const html = read("index.html");
const app = read("app.js");

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test("every element app.js looks up exists in index.html", () => {
  const used = new Set([
    ...[...app.matchAll(/(?:\$|html)\("#([\w-]+)"/g)].map((m) => m[1]),
    ...[...app.matchAll(/getElementById\("([\w-]+)"\)/g)].map((m) => m[1]),
    ...[...app.matchAll(/goTo\("([\w-]+)"\)/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size > 10, "selector extraction found too few ids — regex out of date?");
  for (const id of used) assert.ok(htmlIds.has(id), `#${id} is used in app.js but missing from index.html`);
});

test("every data-action in index.html has a handler", () => {
  const actions = new Set([...html.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]));
  for (const a of actions) assert.match(app, new RegExp(`"${a}":`), `no handler for data-action="${a}"`);
});

test("local assets exist and scripts load in dependency order", () => {
  const assets = [...html.matchAll(/(?:src|href)="(?!https?:|#|mailto:)([^"]+)"/g)].map((m) => m[1]);
  for (const a of assets) assert.ok(fs.existsSync(path.join(dir, a)), `${a} referenced but missing`);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ["data.js", "chat.js", "llm.js", "app.js"]);
});

test("print stylesheet hides everything but the résumé", () => {
  const print = read("styles.css").split("@media print")[1] || "";
  for (const sel of [".agent-pane", ".agent-edge-tab", ".site-header", ".hero", "#writing", "#references"]) {
    assert.ok(print.includes(sel), `${sel} is not hidden when printing`);
  }
});

test("every data-i18n key exists in every language, and each language names an existing PDF", () => {
  const { PROFILES } = require("../mock/data.js");
  const keys = new Set([
    ...[...html.matchAll(/data-i18n="([\w]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((p) => p.split(":")[1])),
    ...[...app.matchAll(/\bt\("(\w+)"\)/g)].map((m) => m[1]),
  ]);
  assert.ok(keys.size > 30, "key extraction found too few keys — regex out of date?");
  for (const [lang, P] of Object.entries(PROFILES)) {
    for (const k of keys) assert.ok(P.ui[k], `ui key "${k}" missing in ${lang}`);
    assert.ok(fs.existsSync(path.join(dir, P.ui.pdfFile)), `${lang}: ${P.ui.pdfFile} is missing (run make pdf)`);
  }
});
