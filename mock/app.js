/* Page rendering + UI wiring. Content lives in data.js, chat logic in chat.js. */
(() => {
  const P = window.PROFILE;
  const chat = window.Chat.createChat(P);
  const { esc } = window.Chat;
  const $ = (s) => document.querySelector(s);
  const html = (sel, markup) => { $(sel).innerHTML = markup; };
  const body = document.body;

  /* ─────────────── Render editorial pane ─────────────── */
  const links = [
    { id: "linkedin", name: "LinkedIn", handle: "in/hugolafleur", url: P.links.linkedin },
    { id: "github", name: "GitHub", handle: "@HugoLafleur", url: P.links.github },
    { id: "flickr", name: "Flickr", handle: "hugohugohugo", url: P.links.flickr },
    { id: "email", name: "Email", handle: P.email, url: `mailto:${P.email}` },
  ];

  $("#hero-eyebrow").textContent = `${P.currentRole} · ${P.currentCompany} · Montreal`;
  $("#hero-lede").textContent =
    "Engineering leader across software, AI, DevOps and SRE. I stay hands-on so I understand the hard problems my teams face, then use storytelling and data to help leadership make better decisions.";
  html("#hero-links", links.map((l) => `<li><a href="${l.url}" target="_blank" rel="noopener">${l.name}</a></li>`).join(""));

  $("#cv-name").textContent = P.name;
  $("#cv-title").textContent = `${P.headline} — ${P.currentRole}, ${P.currentCompany}`;
  html("#cv-contact", [`<li>${esc(P.location)}</li>`, ...links.filter((l) => l.id !== "flickr").map((l) => `<li><a href="${l.url}">${esc(l.id === "email" ? l.handle : l.url.replace(/^https:\/\/(www\.)?|\/$/g, ""))}</a></li>`)].join(""));
  $("#cv-summary").textContent = P.resumeSummary;
  html("#cv-experience", P.experience.map((job) => `
    <div class="job">
      <div class="job-company"><span>${esc(job.company)}${job.note ? `<span class="job-note">${esc(job.note)}</span>` : ""}</span><span class="loc">${esc(job.location)}</span></div>
      ${job.roles.map((r) => `
        <div class="role">
          <div class="role-line"><span class="role-title">${esc(r.title)}</span><span class="role-dates">${esc(r.dates)}</span></div>
          ${r.bullets ? `<ul>${r.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>` : ""}
          ${r.todo ? `<span class="todo">✎ Add 2–3 impact bullets — not in LinkedIn profile</span>` : ""}
        </div>`).join("")}
    </div>`).join(""));
  html("#cv-skills", P.topSkills.map((s) => `<li>${esc(s)}</li>`).join(""));
  html("#cv-tech", P.tech.map((s) => `<li>${esc(s)}</li>`).join(""));
  html("#cv-edu", `<div class="edu-school">${esc(P.education.school)}</div><div class="edu-meta">${esc(P.education.degree)}<br>${esc(P.education.years)}</div>`);
  html("#cv-lang", P.languages.map((l) => `<li>${esc(l.name)}<span>${esc(l.level)}</span></li>`).join(""));
  html("#cv-cert", P.certifications.map((c) => `<li>${esc(c)}</li>`).join(""));

  html("#posts", P.posts.map((p, i) => `
    <li class="post" data-post="${i}" tabindex="0">
      <span class="post-tag">${esc(p.tag)}</span>
      <div><h3 class="post-title">${esc(p.title)}</h3><p class="post-excerpt">${esc(p.excerpt)}</p></div>
      <span class="post-read">${esc(p.read)}</span>
    </li>`).join(""));

  html("#refs", P.references.map((r) => `
    <figure class="ref">
      <blockquote class="ref-quote">${esc(r.prompt)}</blockquote>
      <figcaption class="ref-who"><span class="ref-avatar"></span><div><div>${esc(r.who)}</div><div class="ref-role">${esc(r.role)}</div></div></figcaption>
    </figure>`).join(""));

  html("#links-grid", links.map((l) => `<a class="link-card" href="${l.url}" target="_blank" rel="noopener"><span class="link-name">${l.name}<span>↗</span></span><span class="link-handle">${esc(l.handle)}</span></a>`).join(""));
  $("#footer-off").textContent = `Off the clock: ${P.offHours.join(" · ").toLowerCase()}.`;

  /* ─────────────── Blog reader ─────────────── */
  const reader = $("#reader");
  const openPost = (i) => {
    const p = P.posts[i];
    html("#reader-body", `
      <span class="post-tag">${esc(p.tag)} · ${esc(p.read)}</span>
      <h2>${esc(p.title)}</h2>
      <p class="lede">${esc(p.excerpt)}</p>
      <p class="placeholder-flag">Draft outline — placeholder</p>
      <ol>${p.outline.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>`);
    reader.showModal();
  };
  $("#posts").addEventListener("click", (e) => { const li = e.target.closest(".post"); if (li) openPost(+li.dataset.post); });
  $("#posts").addEventListener("keydown", (e) => { const li = e.target.closest(".post"); if (li && e.key === "Enter") openPost(+li.dataset.post); });
  reader.addEventListener("click", (e) => { if (e.target === reader) reader.close(); });

  /* ─────────────── Agent pane: collapse state ─────────────── */
  const pane = $("#agent-pane");
  const input = $("#agent-input");
  const isMobile = () => window.matchMedia("(max-width: 1024px)").matches;
  const isCollapsed = () => body.classList.contains("agent-collapsed");

  const setCollapsed = (collapsed, { focus = false } = {}) => {
    body.classList.toggle("agent-collapsed", collapsed);
    pane.inert = collapsed; // keep hidden controls out of the tab order
    if (!isMobile()) localStorage.setItem("agent-collapsed", String(collapsed));
    if (!collapsed && focus) setTimeout(() => input.focus(), 200);
  };
  // Mobile: the pane is an overlay, so start closed. Desktop: restore last choice (default open).
  setCollapsed(isMobile() || localStorage.getItem("agent-collapsed") === "true");

  /* ─────────────── Agent pane: transcript ─────────────── */
  const log = $("#agent-log");
  const printResume = () => setTimeout(() => window.print(), 50);
  const goTo = (id) => () => {
    if (isMobile()) setCollapsed(true);
    document.getElementById(id).scrollIntoView({ behavior: "smooth" });
  };
  const ACTIONS = {
    resume: { label: "Jump to résumé", run: goTo("resume") },
    writing: { label: "View writing", run: goTo("writing") },
    pdf: { label: "Download PDF ↓", run: printResume },
    email: { label: "Email Hugo", run: () => { location.href = `mailto:${P.email}`; } },
    ...Object.fromEntries(links.filter((l) => l.id !== "email").map((l) => [l.id, { label: `${l.name} ↗`, run: () => window.open(l.url, "_blank", "noopener") }])),
  };
  const resolveAction = (id) => {
    if (id.startsWith("post:")) { const i = +id.slice(5); return { label: `Read: ${P.posts[i].title}`, run: () => openPost(i) }; }
    return ACTIONS[id];
  };

  const append = (el) => { log.appendChild(el); log.scrollTop = log.scrollHeight; return el; };
  const message = (who, inner) => {
    const d = document.createElement("div");
    d.className = `agent-msg ${who}`;
    d.innerHTML = `<div class="agent-msg-meta">${who === "user" ? "❯ user" : "◈ hugo-twin"}</div><div class="agent-bubble">${inner}</div>`;
    return d;
  };
  const appendActions = (d, actions = []) => {
    if (!actions.length) return;
    const bar = document.createElement("div");
    bar.className = "agent-actions";
    for (const a of actions.map(resolveAction).filter(Boolean)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `❯ ${a.label}`;
      b.onclick = a.run;
      bar.appendChild(b);
    }
    d.querySelector(".agent-bubble").appendChild(bar);
  };
  const addReply = ({ tool, isFallback, html: markup, actions = [] }) => {
    const pillClass = isFallback ? "tool-pill fallback" : "tool-pill";
    const d = message("bot", `${tool ? `<div class="${pillClass}">⚡ <code>${tool}</code></div>` : ""}${markup}`);
    appendActions(d, actions);
    return append(d);
  };
  // Follow new content only if the visitor hasn't scrolled up to reread something.
  const isNearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const update = (fn) => {
    const follow = isNearBottom();
    fn();
    if (follow) log.scrollTop = log.scrollHeight;
  };

  /* ─────────────── Feature Flag & LLM Mode ─────────────── */
  const llmActive = window.LLM ? window.LLM.isLLMEnabled(P) : false;
  if (llmActive) {
    const provider = P.features?.llmProvider || "cohere";
    const model = P.features?.llmModel || "command-r7b";
    $("#agent-mode-badge").innerHTML = `mode: <b class="llm-pill">${esc(provider)}:${esc(model)}</b>`;
    $("#agent-tools-badge").textContent = "tools: [grounding, cohere-v2-chat]";
  }

  let isAsking = false;
  const ask = async (q) => {
    if (!q || !q.trim() || isAsking) return;
    const trimmed = q.trim();

    // Slash commands (/clear, /resume, /contact, etc.) are always handled instantly locally
    if (trimmed.startsWith("/")) {
      const res = chat.answer(trimmed);
      if (res.id === "clear") { log.innerHTML = ""; addReply(chat.answer("/help")); return; }
      append(message("user", esc(trimmed)));
      addReply(res);
      return;
    }

    isAsking = true;
    append(message("user", esc(trimmed)));
    const typing = append(message("bot", `<div class="agent-typing"><span></span><span></span><span></span></div>`));

    // When LLM feature flag is enabled
    if (llmActive && window.LLM) {
      log.setAttribute("aria-busy", "true");
      try {
        const localRes = chat.answer(trimmed);
        const tool = `${P.features?.llmProvider || "cohere"}:${P.features?.llmModel || "command-r7b"}`;
        const paragraphs = (text) => text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
        const note = (text) => `<p class="ai-note">${text}</p>`;

        // One bubble for both streamed and JSON replies, created on the first token or on completion.
        let bubble = null;
        let replyBody = null;
        let partial = "";
        const ensureBubble = () => {
          if (bubble) return;
          if (typing.parentNode) typing.remove();
          bubble = addReply({ tool, html: `<div class="agent-reply-body"></div>` });
          replyBody = bubble.querySelector(".agent-reply-body");
        };

        const llmRes = await window.LLM.queryChatAPI(trimmed, {
          endpoint: P.features?.llmEndpoint || "/api/chat",
          stream: true,
          onToken: (_delta, full) => {
            partial = full;
            ensureBubble();
            update(() => { replyBody.innerHTML = `${paragraphs(full)}<span class="agent-cursor">▌</span>`; });
          },
        });

        if (llmRes.ok) {
          ensureBubble();
          update(() => {
            replyBody.innerHTML = paragraphs(llmRes.reply + (llmRes.truncated ? "…" : "")) +
              note("AI-generated from my profile · may be inaccurate");
            if (localRes.id !== "fallback") appendActions(bubble, localRes.actions);
          });
        } else if (bubble) {
          // Streaming failed after some tokens arrived: keep what we have.
          update(() => { replyBody.innerHTML = paragraphs(partial) + note("Stream interrupted · AI-generated from my profile"); });
        } else {
          // Graceful fallback to local profile data if LLM is offline or unconfigured
          addReply({
            tool: "fallback:offline_profile",
            isFallback: true,
            html: localRes.html,
            actions: localRes.actions,
          });
        }
      } finally {
        if (typing.parentNode) typing.remove();
        log.removeAttribute("aria-busy");
        isAsking = false;
      }
      return;
    }

    // Default scripted engine mode (llm flag false)
    const res = chat.answer(trimmed);
    setTimeout(() => {
      if (typing.parentNode) typing.remove();
      addReply(res);
      isAsking = false;
    }, 350 + Math.random() * 250);
  };

  html("#agent-chips", window.Chat.suggestions.map((s) => `<button type="button" data-q="${esc(s.query)}">${esc(s.label)}</button>`).join(""));
  $("#agent-chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.dataset.q); });
  $("#agent-form").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); input.value = ""; });
  addReply(chat.answer("/help"));

  /* ─────────────── Global actions & shortcuts ─────────────── */
  const handlers = {
    "toggle-agent": () => setCollapsed(!isCollapsed(), { focus: true }),
    "print-resume": printResume,
    "close-reader": () => reader.close(),
    "toggle-theme": () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; },
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handlers[el.dataset.action]?.();
  });

  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "b") { e.preventDefault(); handlers["toggle-agent"](); }
    else if ((mod && key === "k") || (key === "/" && !mod && !isTyping(e.target) && !reader.open)) {
      e.preventDefault();
      if (isCollapsed()) setCollapsed(false, { focus: true }); else input.focus();
    } else if (key === "escape" && isMobile() && !isCollapsed()) setCollapsed(true);
  });
})();
