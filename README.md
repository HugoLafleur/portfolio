# Hugo Lafleur — Personal Branding & Agent Console

An editorial personal branding portfolio paired with a persistent, collapsible AI representative console inspired by **Claude Code** and **Antigravity**.

---

## Architecture & Features

- **Editorial Split-Pane Layout**:
  - **Left Pane (~70%)**: Executive pitch, modern single-page résumé, writing drafts, and verified recommendations.
  - **Right Pane (~30%)**: Sticky, 100vh persistent agent console (`hugo-twin v1.2`) with tool execution badges and deep-linking actions.
- **Collapsible Workspace**: Toggle console via <kbd>⌘B</kbd> or <kbd>⌘K</kbd> to expand the editorial layout to full width.
- **Single-Page Résumé with PDF Export**: Clean, print-optimized stylesheet (`@media print`) that formats to standard Letter/A4 for one-click PDF downloads.
- **Client-Side Grounded Chat**: Interactive responses grounded strictly in verified profile data with interactive action triggers.
- **Design Tokens & Dark Mode**: Obsidian slate (`#0d0f12`) and warm paper (`#fbfaf7`) palettes with `Instrument Serif`, `Inter`, and `JetBrains Mono`.

---

## Quickstart

```bash
# Start local preview server and open browser (http://localhost:4173)
make run

# Run automated test suite and syntax validation
make test

# Build production bundle into ./dist (for Cloudflare Pages / Vercel / GitHub Pages)
make build
```

---

## Project Structure

```text
├── Makefile           # build, run, test, and clean automation
├── README.md          # Project documentation
├── .gitignore         # Build and OS ignores
├── mock/
│   ├── index.html     # Semantic HTML markup (split-pane architecture)
│   ├── styles.css     # CSS tokens, animations, and print stylesheets
│   ├── app.js         # Interactive agent logic and keybindings
│   └── data.js        # Grounded profile data & experience schema
└── scripts/
    └── test.js        # Automated schema and asset test suite
```

---

## License

MIT © Hugo Lafleur
