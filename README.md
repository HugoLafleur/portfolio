# portfolio

Personal site for Hugo Lafleur: an editorial résumé and writing page, with a collapsible chat pane styled like a coding-agent console.

## Features

- **Résumé** rendered from `mock/data.js`. **Download PDF** prints only the résumé (Letter).
- **"Ask Hugo" pane** on the right. Toggle with <kbd>⌘B</kbd>, focus with <kbd>⌘K</kbd> or <kbd>/</kbd>. On narrow screens it becomes an overlay.
  - Default: Scripted keyword matching in `mock/chat.js` over profile data (zero cost, zero latency, runs offline).
  - **Feature Flag (`llm`):** Optional LLM integration (Cohere `command-r7b-12-2024` via Cloudflare Pages Function `/api/chat`).
- **Writing** and **References** are placeholders until real content exists.
- Light/dark theme.

## LLM Feature Flag

The LLM integration is disabled by default for zero API cost and 100% offline reliability.

You can test and toggle it without editing code:
- **Via URL:** Append `?llm=1` to test with LLM enabled, or `?llm=0` to force scripted mode.
- **Via Console:** `localStorage.setItem('feature:llm', 'true')` (or `'false'`).
- **Via Code:** Toggle `features.llm: true` in `mock/data.js`.
- **Automatic Fallback:** If the API key is missing or the backend is offline, the chat automatically falls back to the local profile engine.

## Usage

```bash
make run     # serve on http://localhost:4173
make test    # syntax check + node:test suite
make build   # test, then copy the site into ./dist
```

Requires Node ≥ 18 (for tests) and Python 3 (for `make run`).

## Layout

```text
mock/
  index.html   markup
  styles.css   tokens, layout, print stylesheet
  data.js      profile content (single source of truth, from LinkedIn export)
  chat.js      scripted chat engine, DOM-free (also runs in Node)
  app.js       rendering and UI wiring
test/
  data.test.js   profile schema, date formats, ordering
  chat.test.js   intent routing, chips, actions, first-person voice
  page.test.js   HTML ↔ app.js wiring, assets, print rules
```

## Editing content

Change `mock/data.js`, then run `make test`. Roles marked `todo: true` show a reminder to add impact bullets. These are hidden when printing.
