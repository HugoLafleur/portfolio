# portfolio

Personal site for Hugo Lafleur: an editorial résumé and writing page, with a collapsible chat pane styled like a coding-agent console.

## Features

- **Résumé** rendered from `content/*.md` (compiled to `mock/data.js`). **Download PDF** prints only the résumé (Letter).
- **"Ask Hugo" pane** on the right. Toggle with <kbd>⌘B</kbd>, focus with <kbd>⌘K</kbd> or <kbd>/</kbd>. On narrow screens it becomes an overlay.
  - Default: Scripted keyword matching in `mock/chat.js` over profile data (zero cost, zero latency, runs offline).
  - **Feature Flag (`llm`):** Optional LLM integration (Cohere `command-r7b-12-2024` via Cloudflare Pages Function `/api/chat`).
- **Writing** and **References** are placeholders until real content exists.
- Light/dark theme.
- **Two languages**, `en` and `fr_ca`: EN/FR button in the header, `?lang=fr` or `?lang=en` to force one, otherwise the saved choice, then the browser language. Each language has its own résumé PDF.

## LLM Feature Flag

The LLM integration is enabled by default (Cohere `command-r7b-12-2024` via Cloudflare Pages Function `/api/chat`).

You can test and toggle it without editing code:
- **Via URL:** Append `?llm=0` to force offline scripted mode, or `?llm=1` to ensure LLM mode.
- **Via Console:** `localStorage.setItem('feature:llm', 'false')` (or `'true'`).
- **Via Code:** Set `llm: false` under `## Features` in `content/profile.md`.
- **Automatic Fallback:** If the API key is missing or the backend is offline, the chat automatically falls back to the local profile engine.

**Before setting `COHERE_API_KEY` in production:** the flag only gates the UI — `/api/chat` is public. The function rejects requests whose `Origin` doesn't match the site, but that is easy to forge outside a browser. Add a Cloudflare rate-limiting rule (Security → WAF → Rate limiting rules) on `/api/chat`, e.g. 10 requests per minute per IP.

## Usage

```bash
make run     # serve on http://localhost:4173
make test    # syntax check + node:test suite
make build   # test, then copy the site into ./dist
```

Requires Node ≥ 18 (for tests) and Python 3 (for `make run`).

## Layout

```text
content/
  en/ fr_ca/     one folder per language, same file names in each:
    profile.md     name, contact, summary, skills, tech, education, feature flags
    experience.md  jobs and roles
    references.md  reference slots
    ui.md          interface strings (key: value)
    posts/         one file per post (NN-slug.md, ordered by filename)
mock/
  index.html   markup (data-i18n attributes point at ui.md keys)
  styles.css   tokens, layout, print stylesheet
  data.js      GENERATED from content/<lang>/*.md — do not edit
  chat.js      scripted chat engine, DOM-free (also runs in Node)
  app.js       rendering and UI wiring
test/
  data.test.js   profile schema, date formats, ordering
  chat.test.js   intent routing, chips, actions, first-person voice
  page.test.js   HTML ↔ app.js wiring, assets, print rules
```

## Editing content

Edit the Markdown in `content/<lang>/`, then run `make test`. `make run` rebuilds and reloads on save; `make data` regenerates `mock/data.js` on its own (it is committed, since the Cloudflare function imports it). The format is described in the comment at the top of each file. Roles marked `todo` show a reminder to add impact bullets. These are hidden when printing.

### Languages

`content/en/` and `content/fr_ca/` must stay in sync in *structure*: same files, same `ui.md` keys, same number of roles, bullets, posts and references, same email, links and flags. Wording is yours to control in each. `make data` (and so `make test`) fails with the list of differences otherwise. The scripted chat engine still only knows English; the LLM chat answers from the active language's profile.

To add AI-drafted translations later, put `translated: ai` in the front matter of `profile.md` or a post, and run `node scripts/build-data.js --allow-missing`: differences become warnings and files missing from `fr_ca/` fall back to the English ones. `make pdf` writes `resume.pdf` and `resume-fr_ca.pdf` (both are checked in; `make test` fails if one is missing).
