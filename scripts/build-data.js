#!/usr/bin/env node
/**
 * Builds mock/data.js from the Markdown files in content/<lang>/ (one folder per language, same file names in each).
 * Zero dependencies. Run `make data`; `make run`, `make test` and `make build` do it for you.
 * mock/data.js is generated but committed, so the Cloudflare function and tests work without a build step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'mock', 'data.js');

export const LANGS = ['en', 'fr_ca'];
const DEFAULT_LANG = LANGS[0];

/** Reads content/<lang>/<name>. With `fallback` (--allow-missing), a file missing from a translation is read from the default language. */
const read = (lang, name, fallback) => {
  let file = path.join(CONTENT_DIR, lang, name);
  if (!fs.existsSync(file)) {
    if (!fallback) throw new Error(`content/${lang}/${name} is missing (content/${DEFAULT_LANG}/${name} exists)`);
    file = path.join(CONTENT_DIR, DEFAULT_LANG, name);
  }
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
};
const postFiles = (lang) => fs.readdirSync(path.join(CONTENT_DIR, lang, 'posts')).filter((f) => f.endsWith('.md')).sort();

/** Splits "a | b | c" into trimmed parts. */
const cells = (s) => s.split('|').map((p) => p.trim());

/** Inline Markdown → the small HTML subset the page renders: **bold**, bare & escaped. */
const inline = (s) =>
  s.replace(/&(?!(?:[a-z]+|#\d+);)/gi, '&amp;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/** Splits text on lines starting with `prefix` ("## "), returning [{ head, lines }]. Text before the first heading is ignored. */
function sections(text, prefix) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith(prefix)) out.push({ head: line.slice(prefix.length).trim(), lines: [] });
    else if (out.length) out.at(-1).lines.push(line);
  }
  return out;
}

const bullets = (lines) => lines.filter((l) => l.startsWith('- ')).map((l) => inline(l.slice(2).trim()));
const keyValues = (lines) =>
  Object.fromEntries(lines.map((l) => l.match(/^([\w.]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const paragraphs = (lines) =>
  lines.join('\n').split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter((p) => p && !p.startsWith('- '));
const scalar = (v) => (v === 'true' ? true : v === 'false' ? false : v);

function parseFrontMatter(text, file) {
  const m = text.match(/^\s*---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing --- front matter`);
  return { meta: keyValues(m[1].split('\n')), body: m[2] };
}

function profile(lang, fb) {
  const file = `content/${lang}/profile.md`;
  const { meta, body } = parseFrontMatter(read(lang, 'profile.md', fb), file);
  const sec = Object.fromEntries(sections(body, '## ').map((s) => [s.head.toLowerCase(), s.lines]));
  const need = (name) => sec[name] ?? (() => { throw new Error(`${file}: missing "## ${name}" section`); })();
  const links = {};
  const top = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith('links.')) links[k.slice(6)] = v;
    else top[k] = v;
  }
  const edu = keyValues(need('education'));
  return {
    lang,
    ...top,
    links,
    resumeSummary: paragraphs(need('summary')).join(' '),
    topSkills: bullets(need('top skills')),
    features: Object.fromEntries(Object.entries(keyValues(need('features'))).map(([k, v]) => [k, scalar(v)])),
    tech: bullets(need('technologies')),
    languages: bullets(need('languages')).map((l) => { const [name, level] = cells(l); return { name, level }; }),
    certifications: bullets(need('certifications')),
    education: { school: edu.school, degree: edu.degree, years: edu.years },
    offHours: bullets(need('off hours')),
    ui: keyValues(read(lang, 'ui.md', fb).split('\n')),
  };
}

function experience(lang, fb) {
  return sections(read(lang, 'experience.md', fb), '## ').map(({ head, lines }) => {
    const [company, location, note] = cells(head);
    const roles = sections(lines.join('\n'), '### ').map((r) => {
      const [title, dates, flag] = cells(r.head);
      const b = bullets(r.lines);
      return { title, dates, ...(flag === 'todo' && { todo: true }), ...(b.length && { bullets: b }) };
    });
    return { company, ...(note && { note }), location, roles };
  });
}

/** One file per post in content/<lang>/posts/, ordered by filename (01-…, 02-…). */
function posts(lang, fb) {
  return postFiles(fb ? DEFAULT_LANG : lang).map((f) => {
    const rel = `posts/${f}`;
    const { meta, body } = parseFrontMatter(read(lang, rel, fb), `content/${lang}/${rel}`);
    for (const k of ['title', 'tag', 'read']) if (!meta[k]) throw new Error(`content/${lang}/${rel}: missing "${k}:" in front matter`);
    return { title: meta.title, tag: meta.tag, read: meta.read, ...(meta.translated && { translated: meta.translated }), excerpt: paragraphs(body.split('\n'))[0], outline: bullets(body.split('\n')) };
  });
}

function references(lang, fb) {
  return sections(read(lang, 'references.md', fb), '## ').map(({ head, lines }) => {
    const [who, role] = cells(head);
    return { prompt: paragraphs(lines)[0], who, role };
  });
}

export function buildProfile(lang, { allowMissing = false } = {}) {
  const fb = allowMissing && lang !== DEFAULT_LANG;
  return { ...profile(lang, fb), experience: experience(lang, fb), posts: posts(lang, fb), references: references(lang, fb) };
}

/** What must be identical across languages: structure and facts, not wording. */
const shape = (P, lang) => ({
  email: P.email,
  links: P.links,
  features: P.features,
  name: P.name,
  currentCompany: P.currentCompany,
  counts: [P.topSkills, P.tech, P.languages, P.certifications, P.offHours, P.references].map((a) => a.length),
  uiKeys: Object.keys(P.ui).sort(),
  postFiles: postFiles(lang),
  postOutlines: P.posts.map((p) => p.outline.length),
  experience: P.experience.map((j) => j.roles.map((r) => [r.todo ?? false, r.bullets?.length ?? 0])),
  education: P.education.years,
});

/** Returns human-readable differences between a translation and the default language. */
export function parityProblems(profiles) {
  const base = shape(profiles[DEFAULT_LANG], DEFAULT_LANG);
  const problems = [];
  for (const lang of LANGS.slice(1)) {
    const got = shape(profiles[lang], lang);
    for (const key of Object.keys(base)) {
      if (JSON.stringify(base[key]) !== JSON.stringify(got[key])) {
        problems.push(`${lang}: "${key}" differs from ${DEFAULT_LANG} — ${JSON.stringify(got[key])} vs ${JSON.stringify(base[key])}`);
      }
    }
  }
  return problems;
}

export function build({ allowMissing = false } = {}) {
  const profiles = Object.fromEntries(LANGS.map((lang) => [lang, buildProfile(lang, { allowMissing })]));
  const problems = parityProblems(profiles);
  if (problems.length && !allowMissing) throw new Error(`Languages are out of sync:\n  ${problems.join('\n  ')}`);
  for (const p of problems) console.warn(`warning: ${p}`);

  const body = `/*
 * GENERATED by scripts/build-data.js from content/<lang>/*.md — do not edit by hand.
 * Edit the Markdown files, then run \`make data\`.
 * PROFILES holds one profile per language; PROFILE is the default (en) one the scripted chat engine reads.
 */
const PROFILES = ${JSON.stringify(profiles, null, 2)};
const PROFILE = PROFILES.${DEFAULT_LANG};

if (typeof window !== "undefined") { window.PROFILES = PROFILES; window.PROFILE = PROFILE; }
if (typeof module === "object" && module.exports) {
  module.exports = PROFILE;
  Object.defineProperty(PROFILE, "PROFILES", { value: PROFILES }); // non-enumerable, so PROFILE stays a plain profile
}
`;
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === body) return false;
  fs.writeFileSync(OUT, body);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(build({ allowMissing: process.argv.includes('--allow-missing') }) ? `Wrote ${path.relative(ROOT, OUT)}` : `${path.relative(ROOT, OUT)} is up to date`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
