/*
 * Scripted "Ask Hugo" engine: keyword intent matching over PROFILE data, in English or French (P.lang).
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
  // Open-ended range marker in the date strings of every language.
  const OPEN_END = /Present|Présent/;
  const year = (dates) => dates.match(/\d{4}/g) || [];
  const span = (dates) => { const [a, b] = year(dates); return b && b !== a ? `${a}–${b}` : OPEN_END.test(dates) ? `${a}–` : a; };
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  // Words that are French but not English. Accents are a strong signal on their own.
  const FRENCH_WORDS = new Set(["bonjour", "salut", "merci", "je", "vous", "tu", "est", "les", "des", "une", "quel", "quelle", "parle", "pour", "avec", "dans", "votre", "ton", "sur"]);
  const isFrench = (raw, words) => /[àâçéèêëîïôùûœ]/i.test(raw) || [...words].some((w) => FRENCH_WORDS.has(w));

  // Intent order matters: on a score tie the earlier intent wins, so specific topics come before generic ones.
  const INTENTS = [
    ["resume", "doc:export_resume"], ["contact", "comm:get_contact"], ["ai", "profile:query_ai"], ["sre", "profile:query_sre"],
    ["dassault", "profile:query_consulting"], ["leadership", "profile:query_leadership"], ["current", "profile:query_current_role"],
    ["career", "profile:query_experience"], ["skills", "profile:query_skills"], ["education", "profile:query_education"],
    ["languages", "profile:query_languages"], ["offhours", "profile:query_off_hours"], ["writing", "profile:query_writing"],
    ["about", "profile:query_summary"], ["help", "sys:help"],
  ];

  // Keywords per language: folded (lowercase, no accents) single tokens, unique across intents within a language.
  const KEYS = {
    en: {
      resume: ["/resume", "resume", "cv", "pdf", "download", "print"],
      contact: ["/contact", "contact", "email", "reach", "hire", "connect", "talk", "call", "meet"],
      ai: ["/ai", "ai", "ml", "machine", "learning", "kubernetes", "azure", "element", "llm", "model"],
      sre: ["/sre", "sre", "devops", "reliability", "observability", "prometheus", "grafana", "dynatrace", "monitoring", "aws", "octave"],
      dassault: ["boeing", "honda", "dassault", "enovia", "consultant", "consulting"],
      leadership: ["/leadership", "leadership", "lead", "leader", "manage", "management", "style", "philosophy", "storytelling", "team", "teams"],
      current: ["current", "currently", "now", "today", "role", "job", "position", "title", "director", "servicenow"],
      career: ["experience", "career", "history", "background", "companies", "path", "journey", "worked"],
      skills: ["skill", "skills", "stack", "tech", "technology", "technologies", "tools", "python"],
      education: ["education", "degree", "study", "studied", "school", "university", "sherbrooke"],
      languages: ["language", "languages", "speak", "french", "english", "francais"],
      offhours: ["hobby", "hobbies", "free", "fun", "outside", "weekend", "wood", "woodworking", "workshop", "bike", "cycling", "climb", "climbing", "kids", "personal"],
      writing: ["blog", "write", "writing", "post", "posts", "article", "articles", "essay", "essays"],
      about: ["who", "yourself", "introduce", "summary", "pitch"],
      help: ["/help", "help", "hi", "hello", "hey", "bonjour", "salut", "start"],
    },
    fr_ca: {
      resume: ["/resume", "resume", "cv", "pdf", "telecharger", "telechargement", "imprimer", "curriculum"],
      contact: ["/contact", "contact", "contacter", "courriel", "email", "mail", "joindre", "embaucher", "recruter", "rencontrer", "appeler", "coordonnees"],
      ai: ["/ai", "ia", "ml", "apprentissage", "automatique", "machine", "intelligence", "kubernetes", "azure", "element", "llm", "modele"],
      sre: ["/sre", "sre", "devops", "fiabilite", "observabilite", "prometheus", "grafana", "dynatrace", "surveillance", "aws", "octave"],
      dassault: ["boeing", "honda", "dassault", "enovia", "consultant", "consultation", "conseil"],
      leadership: ["/leadership", "leadership", "leader", "diriger", "dirige", "gestion", "gestionnaire", "gerer", "style", "philosophie", "storytelling", "recit", "equipe", "equipes"],
      current: ["actuel", "actuelle", "actuellement", "maintenant", "aujourd", "poste", "titre", "emploi", "role", "directeur", "servicenow", "travaille", "travailles"],
      career: ["experience", "experiences", "carriere", "parcours", "historique", "entreprises", "antecedents", "trajectoire"],
      skills: ["competence", "competences", "technologie", "technologies", "techno", "technos", "outils", "python", "pile"],
      education: ["formation", "diplome", "etudes", "etudie", "etudier", "ecole", "universite", "sherbrooke", "baccalaureat", "genie"],
      languages: ["langue", "langues", "parle", "parles", "parlez", "francais", "anglais", "bilingue"],
      offhours: ["loisir", "loisirs", "passion", "passions", "dehors", "weekend", "bois", "menuiserie", "atelier", "velo", "escalade", "gym", "enfants", "jeux", "personnel"],
      writing: ["blogue", "blog", "ecris", "ecrit", "ecrire", "article", "articles", "billet", "billets", "publication", "publications", "essai", "essais"],
      about: ["qui", "presenter", "presente", "presentation", "sommaire", "apercu", "propos", "pitch"],
      help: ["/help", "aide", "help", "hello", "hi", "hey", "bonjour", "salut", "allo", "commencer"],
    },
  };

  // Post tags are looked up by their English name; this maps them to the tag used in each language's posts.
  const TAGS = { en: {}, fr_ca: { Craft: "Artisanat" } };

  const FALLBACKS = {
    en: {
      id: "fallback", tool: "sys:no_match",
      html: `<p>I'm a scripted demo for now, so I only have information from Hugo's profile data.</p><p>Try asking about Hugo's <b>AI work</b>, how he <b>leads teams</b>, his <b>SRE background</b>, or type <code>/resume</code>.</p>`,
      actions: ["email"],
    },
    fr: {
      id: "fallback", tool: "sys:no_match",
      html: `<p>Je suis une démo scriptée pour l'instant, donc je n'ai que les informations du profil de Hugo.</p><p>Essayez de demander son <b>travail en IA</b>, sa façon de <b>diriger des équipes</b>, son <b>parcours en SRE</b>, ou tapez <code>/resume</code>.</p>`,
      actions: ["email"],
    },
  };

  // Replies per language. `c` carries the profile and helpers; each reply returns { html, actions }.
  const REPLIES = {
    en: (c) => {
      const { P, current, previous, roles, post, span } = c;
      return {
        resume: () => ({ html: `<p>Hugo's one-page résumé is on the left. You can read it there or save it as a PDF.</p>`, actions: ["pdf", "resume"] }),
        contact: () => ({
          html: `<p>The best way to reach Hugo is <b>${esc(P.email)}</b>, or connect with him on LinkedIn.</p>`,
          actions: ["email", "linkedin"],
        }),
        ai: () => ({
          html: `<p>AI has been central to Hugo's work since 2020:</p>` + list([
            ...roles(P.currentCompany).map((r) => `<b>${esc(P.currentCompany)}</b>: ${esc(r.title)} (${span(r.dates)})`),
            ...roles("Element AI").map((r) => `<b>Element AI</b>: ${esc(r.title)} (${span(r.dates)})`),
          ]) + `<p>At ServiceNow, his SRE/DevOps team hosted AI workloads as SaaS on a Kubernetes/Azure platform.</p>`,
          actions: [...post("Infrastructure"), "resume"],
        }),
        sre: () => ({
          html: `<p>SRE and DevOps are Hugo's roots. At <b>Octave Group</b> (2016–2020) he went from Linux Automation Specialist to Team Lead, then Director of SRE. Along the way he:</p>` + list([
            "owned the global technology budget and AWS spend management",
            "led the observability project (Prometheus, Grafana, Dynatrace, Sumo Logic)",
            "led a POC for hosting production workloads on Kubernetes (AWS EKS)",
            "built a CMDB recording production deployment activity",
          ]),
          actions: [...post("SRE"), "resume"],
        }),
        dassault: () => ({
          html: `<p>Hugo spent 8 years at <b>Dassault Systèmes</b> as an infrastructure &amp; deployment consultant:</p>` + list([
            "<b>Boeing</b> (2007–2010): observability, performance analysis, capacity planning, automated performance tests",
            "<b>Honda R&amp;D Americas</b> (2012–2015): ENOVIA V6 operations, Ant/Jenkins automation, RCA, incident response",
          ]) + `<p>He also managed a QA team of 8.</p>`,
        }),
        leadership: () => ({
          html: `<p>Two things define how Hugo leads:</p>` + list([
            "<b>Staying hands-on.</b> It keeps him connected with execution teams and helps him deeply understand complex challenges.",
            "<b>Storytelling with data.</b> He uses that understanding to highlight critical issues to upper leadership. That has led to better-informed decisions, which improved deployment success rate and team engagement.",
          ]) + `<p>And he genuinely loves building teams.</p>`,
          actions: [...post("Leadership")],
        }),
        current: () => ({
          html: `<p>Since ${esc(current.dates.split(" —")[0])}, Hugo has been <b>${esc(current.title)}</b> at ${esc(P.currentCompany)}.</p>` +
            `<p>Before that he was ${esc(previous.title)} (${span(previous.dates)}). He first joined ServiceNow through the <b>Element AI</b> acquisition, then spent nine months at EXFO in 2023 before coming back.</p>`,
          actions: ["resume"],
        }),
        career: () => ({ html: `<p>The short version, most recent first:</p>` + list(c.companyRanges()), actions: ["resume", "pdf"] }),
        skills: () => ({
          html: `<p>Hugo's top skills: <b>${P.topSkills.map(esc).join(", ")}</b>.</p><p>Technologies he has worked with hands-on: ${P.tech.map(esc).join(", ")}.</p>`,
          actions: ["resume"],
        }),
        education: () => ({ html: `<p>Hugo holds a <b>${esc(P.education.degree)}</b> from the ${esc(P.education.school)} (${esc(P.education.years)}).</p>` }),
        languages: () => ({ html: `<p>Hugo speaks ${P.languages.map((l) => `<b>${esc(l.name)}</b> (${esc(l.level.toLowerCase())})`).join(" and ")}.</p>` }),
        offhours: () => ({
          html: `<p>When he is not working, you might find Hugo:</p>` + list(P.offHours.map((h) => esc(h.charAt(0).toLowerCase() + h.slice(1)))),
          actions: [...post("Craft"), "flickr"],
        }),
        writing: () => ({ html: `<p>Hugo writes about engineering leadership, running AI infrastructure, observability, and what the wood shop teaches about building systems.</p>`, actions: ["writing"] }),
        about: () => ({
          html: `<p>Hugo is an engineering leader in Montreal, currently <b>${esc(P.currentRole)}</b> at ${esc(P.currentCompany)}.</p>` +
            `<p>He has spent about 8 years in management roles across software, AI, DevOps and SRE. What he loves most is building technology teams.</p>`,
          actions: ["resume", "pdf"],
        }),
        help: () => ({
          html: `<p>Hi! I'm Hugo's Portfolio Assistant 👋</p><p>Ask me about Hugo's work in AI and SRE, how he leads teams, or his experience. Commands: <code>/resume</code>, <code>/contact</code>, <code>/clear</code>.</p>`,
          actions: ["resume", "pdf"],
        }),
      };
    },

    // French replies avoid gendered pronouns for Hugo: they name Hugo or use impersonal phrasing.
    fr_ca: (c) => {
      const { P, current, previous, roles, post, span } = c;
      const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
      return {
        resume: () => ({ html: `<p>Le CV d'une page de Hugo est à gauche. Vous pouvez le lire sur place ou l'enregistrer en PDF.</p>`, actions: ["pdf", "resume"] }),
        contact: () => ({
          html: `<p>Le meilleur moyen de joindre Hugo est <b>${esc(P.email)}</b>, ou par LinkedIn.</p>`,
          actions: ["email", "linkedin"],
        }),
        ai: () => ({
          html: `<p>L'IA est au cœur du travail de Hugo depuis 2020 :</p>` + list([
            ...roles(P.currentCompany).map((r) => `<b>${esc(P.currentCompany)}</b> : ${esc(r.title)} (${span(r.dates)})`),
            ...roles("Element AI").map((r) => `<b>Element AI</b> : ${esc(r.title)} (${span(r.dates)})`),
          ]) + `<p>Chez ServiceNow, l'équipe SRE/DevOps de Hugo hébergeait des charges de travail d'IA en SaaS sur une plateforme Kubernetes/Azure.</p>`,
          actions: [...post("Infrastructure"), "resume"],
        }),
        sre: () => ({
          html: `<p>Le SRE et le DevOps sont les racines de Hugo. Chez <b>Octave Group</b> (2016–2020), Hugo est passé de spécialiste en automatisation Linux à responsable d'équipe, puis à la direction du SRE. En chemin :</p>` + list([
            "responsabilité du budget technologique mondial et de la gestion des dépenses AWS",
            "pilotage du projet d'observabilité (Prometheus, Grafana, Dynatrace, Sumo Logic)",
            "pilotage d'une preuve de concept pour héberger des charges de production sur Kubernetes (AWS EKS)",
            "conception d'une CMDB consignant l'activité de déploiement en production",
          ]),
          actions: [...post("SRE"), "resume"],
        }),
        dassault: () => ({
          html: `<p>Hugo a passé 8 ans chez <b>Dassault Systèmes</b> comme spécialiste-conseil en infrastructure et déploiement :</p>` + list([
            "<b>Boeing</b> (2007–2010) : observabilité, analyse de performance, planification de capacité, tests de performance automatisés",
            "<b>Honda R&amp;D Americas</b> (2012–2015) : exploitation d'ENOVIA V6, automatisation Ant/Jenkins, analyse de cause racine, gestion des incidents",
          ]) + `<p>Hugo y a aussi géré une équipe d'AQ de 8 personnes.</p>`,
        }),
        leadership: () => ({
          html: `<p>Deux choses définissent la façon dont Hugo dirige :</p>` + list([
            "<b>Rester proche du terrain.</b> Cela maintient le lien avec les équipes d'exécution et permet de bien comprendre des défis complexes.",
            "<b>Le récit appuyé par les données.</b> Cette compréhension sert à porter les enjeux critiques à l'attention de la haute direction, ce qui a mené à des décisions mieux informées et amélioré le taux de réussite des déploiements ainsi que l'engagement des équipes.",
          ]) + `<p>Et bâtir des équipes demeure sa grande motivation.</p>`,
          actions: [...post("Leadership")],
        }),
        current: () => ({
          html: `<p>Depuis ${esc(current.dates.split(" —")[0])}, Hugo occupe le poste de <b>${esc(current.title)}</b> chez ${esc(P.currentCompany)}.</p>` +
            `<p>Auparavant : ${esc(previous.title)} (${span(previous.dates)}). Hugo a d'abord joint ServiceNow par l'acquisition d'<b>Element AI</b>, puis a passé neuf mois chez EXFO en 2023 avant de revenir.</p>`,
          actions: ["resume"],
        }),
        career: () => ({ html: `<p>En bref, de la plus récente à la plus ancienne :</p>` + list(c.companyRanges()), actions: ["resume", "pdf"] }),
        skills: () => ({
          html: `<p>Compétences clés de Hugo : <b>${P.topSkills.map(esc).join(", ")}</b>.</p><p>Technologies utilisées en pratique : ${P.tech.map(esc).join(", ")}.</p>`,
          actions: ["resume"],
        }),
        education: () => ({ html: `<p>Hugo détient un <b>${esc(lower(P.education.degree))}</b> de l'${esc(P.education.school)} (${esc(P.education.years)}).</p>` }),
        languages: () => ({ html: `<p>Hugo parle ${P.languages.map((l) => `<b>${esc(l.name.toLowerCase())}</b> (${esc(l.level.toLowerCase())})`).join(" et ")}.</p>` }),
        offhours: () => ({
          html: `<p>Hors du travail, Hugo aime :</p>` + list(P.offHours.map((h) => esc(lower(h)))),
          actions: [...post("Craft"), "flickr"],
        }),
        writing: () => ({ html: `<p>Hugo écrit sur le leadership en ingénierie, l'exploitation d'infrastructures d'IA, l'observabilité et ce que l'atelier de bois enseigne sur la conception de systèmes.</p>`, actions: ["writing"] }),
        about: () => ({
          html: `<p>Hugo, leader en ingénierie à Montréal, occupe actuellement le poste de <b>${esc(P.currentRole)}</b> chez ${esc(P.currentCompany)}.</p>` +
            `<p>Hugo cumule environ 8 ans en gestion, en logiciel, en IA, en DevOps et en SRE. Sa plus grande motivation : bâtir des équipes en technologie.</p>`,
          actions: ["resume", "pdf"],
        }),
        help: () => ({
          html: `<p>Bonjour! Je suis l'assistant du portfolio de Hugo 👋</p><p>Posez-moi des questions sur le travail de Hugo en IA et en SRE, sa façon de diriger des équipes ou son parcours. Commandes : <code>/resume</code>, <code>/contact</code>, <code>/clear</code>.</p>`,
          actions: ["resume", "pdf"],
        }),
      };
    },
  };

  const langOf = (P) => (P && P.lang && REPLIES[P.lang] ? P.lang : "en");

  function createChat(P) {
    const lang = langOf(P);
    const roles = (company) => P.experience.filter((j) => j.company === company).flatMap((j) => j.roles);
    const post = (tag) => { const i = P.posts.findIndex((p) => p.tag === (TAGS[lang][tag] || tag)); return i >= 0 ? [`post:${i}`] : []; };
    const [current, previous] = roles(P.currentCompany);
    const companyRanges = () => {
      const seen = new Set();
      return P.experience.filter((j) => !seen.has(j.company) && seen.add(j.company)).map((j) => {
        const all = P.experience.filter((x) => x.company === j.company).flatMap((x) => x.roles);
        const years = all.flatMap((r) => year(r.dates)).sort();
        const first = years[0], last = years[years.length - 1];
        const range = all.some((r) => OPEN_END.test(r.dates)) ? `${first}–` : first === last ? first : `${first}–${last}`;
        return `<b>${esc(j.company)}</b> (${range})`;
      });
    };

    const replies = REPLIES[lang]({ P, current, previous, roles, post, span, companyRanges });
    const intents = INTENTS.map(([id, tool]) => ({ id, tool, keys: KEYS[lang][id], reply: replies[id] }));

    function answer(query) {
      const raw = String(query || "").trim();
      if (fold(raw) === "/clear") return { id: "clear", tool: null, html: "", actions: [] };
      const words = new Set(tokenize(raw));
      let best = null, bestScore = 0;
      for (const it of intents) {
        const score = it.keys.filter((k) => words.has(k)).length;
        if (score > bestScore) { best = it; bestScore = score; }
      }
      // A French page always answers in French; an English page answers in the visitor's language.
      if (!best) return { ...FALLBACKS[lang === "fr_ca" || isFrench(raw, words) ? "fr" : "en"] };
      const r = best.reply();
      return { id: best.id, tool: best.tool, html: r.html, actions: r.actions || [] };
    }

    return { intents, answer };
  }

  // Quick-reply chips shown under the transcript; `expect` is the intent each must hit (enforced by tests).
  const SUGGESTIONS = {
    en: [
      { label: "/resume", query: "/resume", expect: "resume" },
      { label: "AI", query: "What is your AI experience?", expect: "ai" },
      { label: "Leadership", query: "What is your leadership style?", expect: "leadership" },
      { label: "SRE", query: "Tell me about your SRE background", expect: "sre" },
      { label: "Off hours", query: "What do you do outside work?", expect: "offhours" },
      { label: "/contact", query: "/contact", expect: "contact" },
    ],
    fr_ca: [
      { label: "/resume", query: "/resume", expect: "resume" },
      { label: "IA", query: "Que fais-tu en IA ?", expect: "ai" },
      { label: "Leadership", query: "Quel est ton style de leadership ?", expect: "leadership" },
      { label: "SRE", query: "Que sais-tu du SRE ?", expect: "sre" },
      { label: "Temps libre", query: "Que fais-tu en dehors du travail ?", expect: "offhours" },
      { label: "/contact", query: "/contact", expect: "contact" },
    ],
  };
  const suggestionsFor = (lang) => SUGGESTIONS[lang] || SUGGESTIONS.en;

  return { createChat, suggestions: SUGGESTIONS.en, suggestionsFor, tokenize, esc };
});
