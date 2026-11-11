/* Page rendering + UI wiring. Content lives in data.js, chat logic in chat.js. */
(() => {
  const PROFILES = window.PROFILES;
  const LANGS = Object.keys(PROFILES);
  const { esc } = window.Chat;
  let lang = "en";
  let P = PROFILES[lang];
  let chat = window.Chat.createChat(P);
  const t = (key) => P.ui[key];
  const $ = (s) => document.querySelector(s);
  const html = (sel, markup) => { $(sel).innerHTML = markup; };
  const body = document.body;

  /* ─────────────── Render editorial pane ─────────────── */
  let links = [];
  const renderPage = () => {
  links = [
    { id: "linkedin", name: "LinkedIn", handle: "in/hugolafleur", url: P.links.linkedin },
    { id: "github", name: "GitHub", handle: "@HugoLafleur", url: P.links.github },
    { id: "flickr", name: "Flickr", handle: "hugohugohugo", url: P.links.flickr },
    { id: "email", name: t("linkEmail"), handle: P.email, url: `mailto:${P.email}` },
  ];

  $("#hero-eyebrow").textContent = `${P.currentRole} · ${P.currentCompany} · ${t("heroLocation")}`;
  $("#hero-lede").textContent = t("heroLede");
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
          ${r.todo ? `<span class="todo">${esc(t("todoNote"))}</span>` : ""}
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
  $("#footer-off").textContent = `${t("offClock")} : ${P.offHours.join(" · ").toLowerCase()}.`;
  };

  /* ─────────────── Blog reader ─────────────── */
  const reader = $("#reader");
  const openPost = (i) => {
    const p = P.posts[i];
    html("#reader-body", `
      <span class="post-tag">${esc(p.tag)} · ${esc(p.read)}</span>
      <h2>${esc(p.title)}</h2>
      <p class="lede">${esc(p.excerpt)}</p>
      <p class="placeholder-flag">${esc(t("draftOutline"))}</p>
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
  // A real file download works in every browser (Safari ignores a window.print() it does not like).
  const downloadResume = () => {
    const link = document.createElement("a");
    link.href = t("pdfFile");
    link.download = t("pdfName");
    link.click();
  };
  const paper = $("#resume-paper");
  const cvToggle = $("#cv-toggle");
  const setResumeOpen = (open) => {
    paper.classList.toggle("is-collapsed", !open);
    cvToggle.setAttribute("aria-expanded", String(open));
    cvToggle.textContent = open ? t("showLess") : t("showFull");
  };
  cvToggle.addEventListener("click", () => setResumeOpen(paper.classList.contains("is-collapsed")));
  // Jumping to the résumé opens it; jumping anywhere else folds it back up.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.hash.length > 1) setResumeOpen(a.hash === "#resume");
  });
  const goTo = (id) => () => {
    setResumeOpen(id === "resume");
    if (isMobile()) setCollapsed(true);
    document.getElementById(id).scrollIntoView({ behavior: "smooth" });
  };
  const actions = () => ({
    resume: { label: t("actionResume"), run: goTo("resume") },
    writing: { label: t("actionWriting"), run: goTo("writing") },
    pdf: { label: t("actionPdf"), run: downloadResume },
    email: { label: t("actionEmail"), run: () => { location.href = `mailto:${P.email}`; } },
    ...Object.fromEntries(links.filter((l) => l.id !== "email").map((l) => [l.id, { label: `${l.name} ↗`, run: () => window.open(l.url, "_blank", "noopener") }])),
  });
  const resolveAction = (id) => {
    if (id.startsWith("post:")) { const i = +id.slice(5); return { label: `${t("actionRead")} : ${P.posts[i].title}`, run: () => openPost(i) }; }
    return actions()[id];
  };

  const append = (el) => { log.appendChild(el); log.scrollTop = log.scrollHeight; return el; };
  const message = (who, inner) => {
    const d = document.createElement("div");
    d.className = `agent-msg ${who}`;
    d.innerHTML = `<div class="agent-msg-meta">${who === "user" ? esc(t("userLabel")) : `◈ ${esc(t("agentName"))}`}</div><div class="agent-bubble">${inner}</div>`;
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
  const addReply = ({ html: markup, actions = [] }) => {
    const d = message("bot", markup);
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
  const llmModel = P.features?.llmModel || "command-r7b";
  const llmVendor = (P.features?.llmProvider || "cohere").replace(/^./, (c) => c.toUpperCase());
  const renderBadge = () => {
    if (llmActive) $("#agent-mode-badge").innerHTML = `${esc(t("usingModel"))} : <b class="llm-pill">${esc(llmModel)}</b> (${esc(llmVendor)})`;
  };

  const paragraphs = (text) => text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
  const note = (text) => `<p class="ai-note">${text}</p>`;

  // Streams the LLM reply into one bubble, created on the first token (or on completion for a JSON reply).
  // Falls back to the scripted answer if the LLM fails before any token arrives.
  const askLLM = async (question, typing) => {
    const localRes = chat.answer(question);
    let bubble = null;
    let replyBody = null;
    let partial = "";
    const ensureBubble = () => {
      if (bubble) return;
      typing.remove();
      bubble = addReply({ html: `<div class="agent-reply-body"></div>` });
      replyBody = bubble.querySelector(".agent-reply-body");
    };

    const llmRes = await window.LLM.queryChatAPI(question, {
      endpoint: P.features?.llmEndpoint || "/api/chat",
      stream: true,
      lang,
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
          note(esc(t("aiNote")));
        if (localRes.id !== "fallback") appendActions(bubble, localRes.actions);
      });
    } else if (bubble) {
      // Streaming failed after some tokens arrived: keep what we have.
      update(() => { replyBody.innerHTML = paragraphs(partial) + note(esc(t("streamNote"))); });
    } else {
      // Graceful fallback to local profile data if LLM is offline or unconfigured
      typing.remove();
      addReply({ html: localRes.html, actions: localRes.actions });
    }
  };

  // Default scripted engine mode (llm flag false), with a short fake "thinking" delay.
  const askScripted = (question, typing) => new Promise((resolve) => {
    setTimeout(() => { typing.remove(); addReply(chat.answer(question)); resolve(); }, 350 + Math.random() * 250);
  });

  let isAsking = false;
  const ask = async (q) => {
    const question = String(q || "").trim();
    if (!question || isAsking) return;

    // Slash commands (/clear, /resume, /contact, etc.) are always handled instantly locally
    if (question.startsWith("/")) {
      const res = chat.answer(question);
      if (res.id === "clear") { log.innerHTML = ""; addReply(chat.answer("/help")); return; }
      append(message("user", esc(question)));
      addReply(res);
      return;
    }

    isAsking = true;
    append(message("user", esc(question)));
    const typing = append(message("bot", `<div class="agent-typing"><span></span><span></span><span></span></div>`));
    // aria-busy stops screen readers from announcing every token; the full reply is read once at the end.
    log.setAttribute("aria-busy", "true");
    try {
      await (llmActive ? askLLM(question, typing) : askScripted(question, typing));
    } finally {
      typing.remove();
      log.removeAttribute("aria-busy");
      isAsking = false;
    }
  };

  const renderChips = () => html("#agent-chips", window.Chat.suggestionsFor(lang).map((s) => `<button type="button" data-q="${esc(s.query)}">${esc(s.label)}</button>`).join(""));
  renderChips();
  $("#agent-chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.dataset.q); });
  // While a reply is in flight, keep the typed text instead of clearing it unsent.
  $("#agent-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (isAsking) return;
    ask(input.value);
    input.value = "";
  });
  addReply(chat.answer("/help"));

  /* ─────────────── Language ─────────────── */
  const storage = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  // ?lang= wins, then the saved choice, then the browser language; unknown values fall back to English.
  const pickLang = () => {
    const wanted = new URLSearchParams(location.search).get("lang") || storage.get("lang") || navigator.language || "en";
    const key = String(wanted).toLowerCase().replace("-", "_");
    return LANGS.find((l) => l === key) || LANGS.find((l) => key.startsWith(l.split("_")[0])) || "en";
  };
  const applyStrings = () => {
    for (const el of document.querySelectorAll("[data-i18n]")) el.innerHTML = t(el.dataset.i18n);
    for (const el of document.querySelectorAll("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(",")) { const [attr, key] = pair.split(":"); el.setAttribute(attr, t(key)); }
    }
    for (const a of document.querySelectorAll("a[data-pdf]")) { a.href = t("pdfFile"); a.download = t("pdfName"); }
    document.documentElement.lang = t("htmlLang");
    document.title = t("htmlTitle");
  };
  const setLang = (next, { save = true } = {}) => {
    lang = next;
    P = PROFILES[lang];
    chat = window.Chat.createChat(P);
    if (save) storage.set("lang", lang);
    renderPage();
    applyStrings();
    setResumeOpen(!paper.classList.contains("is-collapsed"));
    renderBadge();
    renderChips();
    if (reader.open) reader.close();
    log.innerHTML = "";
    addReply(chat.answer("/help"));
  };
  setLang(pickLang(), { save: false });

  /* ─────────────── Global actions & shortcuts ─────────────── */
  const handlers = {
    "toggle-agent": () => setCollapsed(!isCollapsed(), { focus: true }),
    "close-reader": () => reader.close(),
    "toggle-lang": () => setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]),
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
