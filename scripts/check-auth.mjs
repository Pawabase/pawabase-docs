#!/usr/bin/env node
// Validates the auth/* rewrite against the writing contract in GROUND_TRUTH_auth.md.
// Usage: node scripts/check-auth.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("..", import.meta.url).pathname;
const MIN = 1500, MAX = 1900;

// All pages in docs.json navigation, so internal links can be validated.
const nav = JSON.parse(readFileSync(join(DIR, "docs.json"), "utf8"));
const known = new Set();
(function walk(n) {
  if (typeof n === "string") known.add(n);
  else if (Array.isArray(n)) n.forEach(walk);
  else if (n && typeof n === "object") Object.values(n).forEach(walk);
})(nav.navigation);
known.add("index");

const HYPE = [
  "powerful", "seamless", "effortless", "robust", "blazing fast", "cutting-edge",
  "enterprise-grade", "delightful", "beautiful", "state-of-the-art", "world-class",
  "effortlessly", "magical", "revolutionary", "game-changing", "seamlessly",
];

// Fabrications from the previous pass that must not survive.
const FORBIDDEN = [
  "@pawabase/sdk", "PawabaseClient", "createClient", "MFARecoveryCode", "RoleAssignment",
  "require_aal", "MFARecoveryCode", "CommerceOrg", "OrgMember", "has_permission(",
];

let failures = 0;
const fail = (file, msg) => { failures++; console.log(`  FAIL ${file}: ${msg}`); };

const files = readdirSync(join(DIR, "auth")).filter((f) => f.endsWith(".mdx")).sort();

for (const name of files) {
  const file = `auth/${name}`;
  const src = readFileSync(join(DIR, file), "utf8");
  const lines = src.split("\n");
  const problems = [];

  // Length.
  if (lines.length < MIN) problems.push(`${lines.length} lines (< ${MIN})`);
  else if (lines.length > MAX) problems.push(`${lines.length} lines (> ${MAX})`);

  // Frontmatter: exactly title, description, icon.
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    problems.push("missing or malformed frontmatter");
  } else {
    const keys = fm[1].split("\n").filter(Boolean).map((l) => l.split(":")[0].trim());
    if (keys.join(",") !== "title,description,icon")
      problems.push(`frontmatter keys are [${keys}], expected title,description,icon`);
    const fmLines = fm[1].split("\n");
    if (fmLines.length !== 3) problems.push(`frontmatter is ${fmLines.length} lines, expected 3`);
  }

  // No numbered Step imperatives.
  const step = src.match(/^#{2,4}\s*Step\s+\d+|^Step\s+\d+:|^\d+\.\s+\*\*Step/m);
  if (step) problems.push(`numbered step heading: ${step[0].trim()}`);

  // Duplicate paragraphs (the failure mode being fixed).
  const paras = src
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 120 && !p.startsWith("|") && !p.startsWith("```") && !p.startsWith("<"));
  const seen = new Map();
  for (const p of paras) {
    const norm = p.replace(/\s+/g, " ").toLowerCase();
    seen.set(norm, (seen.get(norm) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((n) => n > 1);
  if (dupes.length)
    problems.push(`${dupes.length} duplicated paragraph(s) of >120 chars`);

  // Hype words.
  for (const w of HYPE) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    const hit = src.match(re);
    if (hit) problems.push(`hype word "${hit[0]}"`);
  }

  // Surviving fabrications. A negated mention ("there is no MFARecoveryCode model",
  // "does not exist") is deliberate debunking and is allowed; an asserted one is not.
  for (const f of FORBIDDEN) {
    for (const m of src.matchAll(new RegExp(f.replace(/[()]/g, "\\$&"), "g"))) {
      const before = src.slice(Math.max(0, m.index - 130), m.index).toLowerCase();
      const negated =
        /\b(no|not|never|without|isn't|aren't|rather than|instead of)\b[^.]{0,90}$/.test(before) ||
        /\bthere (is|are) no\b[^.]{0,90}$/.test(before) ||
        /\bdoes not exist\b[^.]{0,90}$/.test(before);
      if (!negated) problems.push(`forbidden fabricated term "${f}" (asserted, not debunked)`);
    }
  }

  // Internal links must resolve.
  for (const m of src.matchAll(/\]\((\/[^)\s#]*)/g)) {
    const target = m[1].replace(/\/$/, "");
    if (!known.has(target.replace(/^\//, "")))
      problems.push(`link to non-existent page ${target}`);
  }

  // Code fences: only the allowed languages.
  for (const m of src.matchAll(/^```([a-z]*)/gm)) {
    if (m[1] && !["json", "python", "bash", "sql", "text"].includes(m[1]))
      problems.push(`disallowed code fence language "${m[1]}"`);
  }
  const fences = (src.match(/^```/gm) || []).length;
  if (fences % 2 !== 0) problems.push(`odd number of code fences (${fences}) — unclosed block`);

  // Component usage sanity.
  for (const tag of ["CardGroup", "Card", "Note", "Warning", "Table"]) {
    const open = (src.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
    const close = (src.match(new RegExp(`</${tag}>`, "g")) || []).length;
    const selfClosing = (src.match(new RegExp(`<${tag}[^>]*/>`, "g")) || []).length;
    if (open - selfClosing !== close)
      problems.push(`unbalanced <${tag}>: ${open} open vs ${close} close`);
  }

  if (problems.length) problems.forEach((p) => fail(file, p));
  else console.log(`  ok   ${file}  ${lines.length} lines`);
}

console.log(failures ? `\n${failures} problem(s)` : "\nAll auth pages pass");
process.exit(failures ? 1 : 0);