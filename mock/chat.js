/*
 * Scripted "Ask Hugo" engine: keyword intent matching over PROFILE data.
 * Pure (no DOM) so it can be unit-tested in Node and swapped for an LLM later.
 *
 * answer(query) -> { id, tool, html, actions }
 *   actions are ids resolved by the UI: "resume" | "writing" | "pdf" | "email" | "<link id>" | "post:<index>"
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Chat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokenize = (s) => fold(s).match(/[a-z0-9/]+/g) || [];
  const year = (dates) => dates.match(/\d{4}/g) || [];
  const span = (dates) => { const [a, b] = year(dates); return b && b !== a ? `${a}–${b}` : dates.includes("Present") ? `${a}–` : a; };
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

  function createChat(P) {
    const roles = (company) => P.experience.filter((j) => j.company === company).flatMap((j) => j.roles);
    const postIndex = (tag) => P.posts.findIndex((p) => p.tag === tag);
    const post = (tag) => { const i = postIndex(tag); return i >= 0 ? [`post:${i}`] : []; };
    const [current, previous] = roles(P.currentCompany);

    // Order matters: on a score tie, the earlier intent wins, so specific topics come before generic ones.
    const intents = [
      {
        id: "resume", tool: "doc:export_resume",
        keys: ["/resume", "resume", "cv", "pdf", "download", "print"],
        reply: () => ({ html: `<p>Hugo's one-page résumé is on the left. You can read it there or save it as a PDF.</p>`, actions: ["pdf", "resume"] }),
      },
      {
        id: "contact", tool: "comm:get_contact",
        keys: ["/contact", "contact", "email", "reach", "hire", "connect", "talk", "call", "meet"],
        reply: () => ({
          html: `<p>The best way to reach Hugo is <b>${esc(P.email)}</b>, or connect with him on LinkedIn.</p>`,
          actions: ["email", "linkedin"],
        }),
      },
      {
        id: "ai", tool: "profile:query_ai",
        keys: ["/ai", "ai", "ml", "machine", "learning", "kubernetes", "azure", "element", "llm", "model"],
        reply: () => ({
          html: `<p>AI has been central to Hugo's work since 2020:</p>` + list([
            ...roles(P.currentCompany).map((r) => `<b>${esc(P.currentCompany)}</b>: ${esc(r.title)} (${span(r.dates)})`),
            ...roles("Element AI").map((r) => `<b>Element AI</b>: ${esc(r.title)} (${span(r.dates)})`),
          ]) + `<p>At ServiceNow, his SRE/DevOps team hosted AI workloads as SaaS on a Kubernetes/Azure platform.</p>`,
          actions: [...post("Infrastructure"), "resume"],
        }),
      },
      {
        id: "sre", tool: "profile:query_sre",
        keys: ["/sre", "sre", "devops", "reliability", "observability", "prometheus", "grafana", "dynatrace", "monitoring", "aws", "octave"],
        reply: () => ({
          html: `<p>SRE and DevOps are Hugo's roots. At <b>Octave Group</b> (2016–2020) he went from Linux Automation Specialist to Team Lead, then Director of SRE. Along the way he:</p>` + list([
            "owned the global technology budget and AWS spend management",
            "led the observability project (Prometheus, Grafana, Dynatrace, Sumo Logic)",
            "led a POC for hosting production workloads on Kubernetes (AWS EKS)",
            "built a CMDB recording production deployment activity",
          ]),
          actions: [...post("SRE"), "resume"],
        }),
      },
      {
        id: "dassault", tool: "profile:query_consulting",
        keys: ["boeing", "honda", "dassault", "enovia", "consultant", "consulting"],
        reply: () => ({
          html: `<p>Hugo spent 8 years at <b>Dassault Systèmes</b> as an infrastructure &amp; deployment consultant:</p>` + list([
            "<b>Boeing</b> (2007–2010): observability, performance analysis, capacity planning, automated performance tests",
            "<b>Honda R&amp;D Americas</b> (2012–2015): ENOVIA V6 operations, Ant/Jenkins automation, RCA, incident response",
          ]) + `<p>He also managed a QA team of 8.</p>`,
        }),
      },
      {
        id: "leadership", tool: "profile:query_leadership",
        keys: ["/leadership", "leadership", "lead", "leader", "manage", "management", "style", "philosophy", "storytelling", "team", "teams"],
        reply: () => ({
          html: `<p>Two things define how Hugo leads:</p>` + list([
            "<b>Staying hands-on.</b> It keeps him connected with execution teams and helps him deeply understand complex challenges.",
            "<b>Storytelling with data.</b> He uses that understanding to highlight critical issues to upper leadership. That has led to better-informed decisions, which improved deployment success rate and team engagement.",
          ]) + `<p>And he genuinely loves building teams.</p>`,
          actions: [...post("Leadership")],
        }),
      },
      {
        id: "current", tool: "profile:query_current_role",
        keys: ["current", "currently", "now", "today", "role", "job", "position", "title", "director", "servicenow"],
        reply: () => ({
          html: `<p>Since ${esc(current.dates.split(" —")[0])}, Hugo has been <b>${esc(current.title)}</b> at ${esc(P.currentCompany)}.</p>` +
            `<p>Before that he was ${esc(previous.title)} (${span(previous.dates)}). He first joined ServiceNow through the <b>Element AI</b> acquisition, then spent nine months at EXFO in 2023 before coming back.</p>`,
          actions: ["resume"],
        }),
      },
      {
        id: "career", tool: "profile:query_experience",
        keys: ["experience", "career", "history", "background", "companies", "path", "journey", "worked"],
        reply: () => {
          const seen = new Set();
          const items = P.experience.filter((j) => !seen.has(j.company) && seen.add(j.company)).map((j) => {
            const all = P.experience.filter((x) => x.company === j.company).flatMap((x) => x.roles);
            const years = all.flatMap((r) => year(r.dates)).sort();
            const first = years[0], last = years[years.length - 1];
            const range = all.some((r) => r.dates.includes("Present")) ? `${first}–` : first === last ? first : `${first}–${last}`;
            return `<b>${esc(j.company)}</b> (${range})`;
          });
          return { html: `<p>The short version, most recent first:</p>` + list(items), actions: ["resume", "pdf"] };
        },
      },
      {
        id: "skills", tool: "profile:query_skills",
        keys: ["skill", "skills", "stack", "tech", "technology", "technologies", "tools", "python"],
        reply: () => ({
          html: `<p>Hugo's top skills: <b>${P.topSkills.map(esc).join(", ")}</b>.</p><p>Technologies he has worked with hands-on: ${P.tech.map(esc).join(", ")}.</p>`,
          actions: ["resume"],
        }),
      },
      {
        id: "education", tool: "profile:query_education",
        keys: ["education", "degree", "study", "studied", "school", "university", "sherbrooke"],
        reply: () => ({ html: `<p>Hugo holds a <b>${esc(P.education.degree)}</b> from the ${esc(P.education.school)} (${esc(P.education.years)}).</p>` }),
      },
      {
        id: "languages", tool: "profile:query_languages",
        keys: ["language", "languages", "speak", "french", "english", "francais"],
        reply: () => ({ html: `<p>Hugo speaks ${P.languages.map((l) => `<b>${esc(l.name)}</b> (${esc(l.level.toLowerCase())})`).join(" and ")}.</p>` }),
      },
      {
        id: "offhours", tool: "profile:query_off_hours",
        keys: ["hobby", "hobbies", "free", "fun", "outside", "weekend", "wood", "woodworking", "workshop", "bike", "cycling", "climb", "climbing", "kids", "personal"],
        reply: () => ({
          html: `<p>When he is not working, you might find Hugo:</p>` + list(P.offHours.map((h) => esc(h.charAt(0).toLowerCase() + h.slice(1)))),
          actions: [...post("Craft"), "flickr"],
        }),
      },
      {
        id: "writing", tool: "profile:query_writing",
        keys: ["blog", "write", "writing", "post", "posts", "article", "articles", "essay", "essays"],
        reply: () => ({ html: `<p>Hugo writes about engineering leadership, running AI infrastructure, observability, and what the wood shop teaches about building systems.</p>`, actions: ["writing"] }),
      },
      {
        id: "about", tool: "profile:query_summary",
        keys: ["who", "yourself", "introduce", "summary", "pitch"],
        reply: () => ({
          html: `<p>Hugo is an engineering leader in Montreal, currently <b>${esc(P.currentRole)}</b> at ${esc(P.currentCompany)}.</p>` +
            `<p>He has spent about 8 years in management roles across software, AI, DevOps and SRE. What he loves most is building technology teams.</p>`,
          actions: ["resume", "pdf"],
        }),
      },
      {
        id: "help", tool: "sys:help",
        keys: ["/help", "help", "hi", "hello", "hey", "bonjour", "salut", "start"],
        reply: () => ({
          html: `<p>Hi! I'm Hugo's Portfolio Assistant 👋</p><p>Ask me about Hugo's work in AI and SRE, how he leads teams, or his experience. Commands: <code>/resume</code>, <code>/contact</code>, <code>/clear</code>.</p>`,
          actions: ["resume", "pdf"],
        }),
      },
    ];

    const fallback = {
      id: "fallback", tool: "sys:no_match",
      html: `<p>I'm a scripted demo for now, so I only have information from Hugo's profile data.</p><p>Try asking about Hugo's <b>AI work</b>, how he <b>leads teams</b>, his <b>SRE background</b>, or type <code>/resume</code>.</p>`,
      actions: ["email"],
    };

    function answer(query) {
      const raw = String(query || "").trim();
      if (fold(raw) === "/clear") return { id: "clear", tool: null, html: "", actions: [] };
      const words = new Set(tokenize(raw));
      let best = null, bestScore = 0;
      for (const it of intents) {
        const score = it.keys.filter((k) => words.has(k)).length;
        if (score > bestScore) { best = it; bestScore = score; }
      }
      if (!best) return { ...fallback };
      const r = best.reply();
      return { id: best.id, tool: best.tool, html: r.html, actions: r.actions || [] };
    }

    return { intents, answer };
  }

  // Quick-reply chips shown under the transcript; `expect` is the intent each must hit (enforced by tests).
  const suggestions = [
    { label: "/resume", query: "/resume", expect: "resume" },
    { label: "AI", query: "What is your AI experience?", expect: "ai" },
    { label: "Leadership", query: "What is your leadership style?", expect: "leadership" },
    { label: "SRE", query: "Tell me about your SRE background", expect: "sre" },
    { label: "Off hours", query: "What do you do outside work?", expect: "offhours" },
    { label: "/contact", query: "/contact", expect: "contact" },
  ];

  return { createChat, suggestions, tokenize, esc };
});
