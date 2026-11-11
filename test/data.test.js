const test = require("node:test");
const assert = require("node:assert/strict");
const { PROFILES } = require("../mock/data.js");

// Per-language date format: "Mar 2026 — Present" / "mars 2026 — Présent" (month optional, end may be open).
const FORMATS = {
  en: { month: "[A-Z][a-z]{2}", present: "Present", languages: ["English", "French"] },
  fr_ca: { month: "(?:janv|févr|mars|avr|mai|juin|juill|août|sept|oct|nov|déc)\\.?", present: "Présent", languages: ["Anglais", "Français"] },
};
const dateRe = (f) => new RegExp(`^(?:${f.month} )?(\\d{4}) — (?:(?:${f.month} )?(\\d{4})|${f.present})$`);

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] profile has the fields the page renders`, () => {
    for (const key of ["name", "headline", "currentRole", "currentCompany", "location", "email", "resumeSummary"]) {
      assert.ok(typeof P[key] === "string" && P[key].length, `missing ${key}`);
    }
    for (const key of ["topSkills", "tech", "languages", "certifications", "offHours", "experience", "posts", "references"]) {
      assert.ok(Array.isArray(P[key]) && P[key].length, `empty ${key}`);
    }
    assert.match(P.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] links are absolute https URLs`, () => {
    for (const [name, url] of Object.entries(P.links)) assert.match(url, /^https:\/\//, name);
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] every role has a title and well-formed, chronological dates`, () => {
    for (const job of P.experience) {
      assert.ok(job.company && job.location, `company/location missing on ${JSON.stringify(job)}`);
      for (const r of job.roles) {
        const m = r.dates.match(DATE);
        assert.ok(r.title, `role without title at ${job.company}`);
        assert.ok(m, `bad date format "${r.dates}" (${r.title})`);
        if (m[2]) assert.ok(+m[1] <= +m[2], `end before start: ${r.title}`);
      }
    }
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] experience is listed most recent first`, () => {
    const starts = P.experience.map((j) => Math.max(...j.roles.map((r) => +r.dates.match(DATE)[1])));
    assert.deepEqual(starts, [...starts].sort((a, b) => b - a));
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] current role matches the top of the experience list`, () => {
    const top = P.experience[0];
    assert.equal(top.company, P.currentCompany);
    assert.equal(top.roles[0].title, P.currentRole);
    assert.match(top.roles[0].dates, new RegExp(`${F.present}$`));
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] roles flagged todo have no bullets yet (and vice versa)`, () => {
    for (const r of P.experience.flatMap((j) => j.roles)) {
      if (r.todo) assert.ok(!r.bullets, `${r.title} is flagged todo but has bullets`);
    }
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] only languages Hugo wants to claim are listed`, () => {
    assert.deepEqual(P.languages.map((l) => l.name).sort(), [...F.languages].sort());
  });
}

for (const [lang, P] of Object.entries(PROFILES)) {
  const F = FORMATS[lang];
  const DATE = dateRe(F);
  test(`[${lang}] posts have the fields the reader needs`, () => {
    for (const p of P.posts) {
      assert.ok(p.title && p.tag && p.excerpt && p.read, p.title);
      assert.ok(Array.isArray(p.outline) && p.outline.length, `${p.title} has no outline`);
    }
  });
}

test("every language has the same structure and interface keys as English", () => {
  const [base, ...others] = Object.values(PROFILES);
  for (const P of others) {
    assert.deepEqual(Object.keys(P.ui).sort(), Object.keys(base.ui).sort(), `${P.lang} ui keys`);
    assert.equal(P.experience.length, base.experience.length);
    assert.deepEqual(P.experience.map((j) => j.roles.map((r) => r.dates.match(/\d{4}/g))), base.experience.map((j) => j.roles.map((r) => r.dates.match(/\d{4}/g))), `${P.lang} role years`);
    assert.equal(P.posts.length, base.posts.length);
    assert.deepEqual(P.links, base.links);
    assert.equal(P.email, base.email);
  }
});
