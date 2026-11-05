const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../mock/data.js");

const DATE = /^(?:[A-Z][a-z]{2} )?(\d{4}) — (?:(?:[A-Z][a-z]{2} )?(\d{4})|Present)$/;

test("profile has the fields the page renders", () => {
  for (const key of ["name", "headline", "currentRole", "currentCompany", "location", "email", "resumeSummary"]) {
    assert.ok(typeof P[key] === "string" && P[key].length, `missing ${key}`);
  }
  for (const key of ["topSkills", "tech", "languages", "certifications", "offHours", "experience", "posts", "references"]) {
    assert.ok(Array.isArray(P[key]) && P[key].length, `empty ${key}`);
  }
  assert.match(P.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
});

test("links are absolute https URLs", () => {
  for (const [name, url] of Object.entries(P.links)) assert.match(url, /^https:\/\//, name);
});

test("every role has a title and well-formed, chronological dates", () => {
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

test("experience is listed most recent first", () => {
  const starts = P.experience.map((j) => Math.max(...j.roles.map((r) => +r.dates.match(DATE)[1])));
  assert.deepEqual(starts, [...starts].sort((a, b) => b - a));
});

test("current role matches the top of the experience list", () => {
  const top = P.experience[0];
  assert.equal(top.company, P.currentCompany);
  assert.equal(top.roles[0].title, P.currentRole);
  assert.match(top.roles[0].dates, /Present$/);
});

test("roles flagged todo have no bullets yet (and vice versa)", () => {
  for (const r of P.experience.flatMap((j) => j.roles)) {
    if (r.todo) assert.ok(!r.bullets, `${r.title} is flagged todo but has bullets`);
  }
});

test("only languages Hugo wants to claim are listed", () => {
  assert.deepEqual(P.languages.map((l) => l.name).sort(), ["English", "French"]);
});

test("posts have the fields the reader needs", () => {
  for (const p of P.posts) {
    assert.ok(p.title && p.tag && p.excerpt && p.read, p.title);
    assert.ok(Array.isArray(p.outline) && p.outline.length, `${p.title} has no outline`);
  }
});
