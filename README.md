# portfolio

Personal site for Hugo Lafleur: an editorial résumé and writing page, with a collapsible chat pane styled like a coding-agent console.

## Features

- **Résumé** rendered from `mock/data.js`. **Download PDF** prints only the résumé (Letter).
- **"Ask Hugo" pane** on the right. Toggle with <kbd>⌘B</kbd>, focus with <kbd>⌘K</kbd> or <kbd>/</kbd>. On narrow screens it becomes an overlay.
  - The chat is **scripted**: keyword matching in `mock/chat.js` over the profile data, with no LLM and no network calls.
- **Writing** and **References** are placeholders until real content exists.
- Light/dark theme.

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
