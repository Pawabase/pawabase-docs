import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const explicit = process.argv.slice(2);

function walk(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    })
    .filter((path) => extname(path) === ".mdx");
}

const files = explicit.length
  ? explicit.map((path) => resolve(root, path))
  : walk(root).filter((path) => !path.includes("/node_modules/"));

const docs = JSON.parse(readFileSync(join(root, "docs.json"), "utf8"));
const routes = new Set();

function collectRoutes(value) {
  if (Array.isArray(value)) {
    for (const item of value) collectRoutes(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.pages)) {
    for (const page of value.pages) if (typeof page === "string") routes.add(`/${page}`);
  }
  for (const child of Object.values(value)) collectRoutes(child);
}

collectRoutes(docs);

const allowedFences = new Set(["json", "python", "bash", "sql", "text", "typescript", "tsx"]);
const forbiddenWords = [
  "powerful",
  "seamless",
  "effortless",
  "robust",
  "blazing",
  "cutting-edge",
  "magic",
  "supercharged",
  "enterprise-grade",
  "world-class",
  "delightful",
  "just",
  "simply",
];

let errors = 0;

function report(file, line, message) {
  const name = relative(root, file);
  console.error(`${name}:${line}: ${message}`);
  errors += 1;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/);

  if (!frontmatter) {
    report(file, 1, "missing frontmatter");
  } else {
    const keys = frontmatter[1]
      .split("\n")
      .map((line) => line.match(/^([A-Za-z0-9_-]+):/))
      .filter(Boolean)
      .map((match) => match[1]);
    if (keys.join(",") !== "title,description,icon") {
      report(file, 1, `frontmatter keys must be title, description, icon; found ${keys.join(", ")}`);
    }
  }

  if (lines.length < 500 || lines.length > 1500) {
    report(file, 1, `page has ${lines.length} lines; required range is 500-1500`);
  }

  const paragraphs = new Map();
  const blocks = source
    .replace(/^---[\s\S]*?---\n/, "")
    .split(/\n\s*\n/)
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => value.length >= 100 && !value.startsWith("```") && !value.startsWith("|"));
  for (const paragraph of blocks) {
    const count = (paragraphs.get(paragraph) ?? 0) + 1;
    paragraphs.set(paragraph, count);
    if (count === 2) report(file, 1, `duplicated paragraph: ${paragraph.slice(0, 80)}…`);
  }

  let openFence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const fence = line.match(/^```([^\s]*)(?:\s+[^`]*)?$/);
    if (fence) {
      if (openFence === null) {
        if (!allowedFences.has(fence[1])) {
          report(file, lineNumber, `code fence language must be one of ${[...allowedFences].join(", ")}`);
        }
        openFence = fence[1];
      } else {
        openFence = null;
      }
      continue;
    }
    if (openFence !== null) continue;

    if (/\bStep\s+\d+\s*:/i.test(line)) {
      report(file, lineNumber, "numbered Step instruction is not allowed");
    }

    // Inline code, link targets and the feature name "magic link" are not prose.
    const prose = line
      .replace(/`[^`]*`/g, " ")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/href="[^"]*"/g, " ")
      .replace(/\bmagic[- ]links?\b/gi, " ");
    for (const word of forbiddenWords) {
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(prose)) report(file, lineNumber, `forbidden marketing word: ${word}`);
    }

    for (const match of line.matchAll(/\]\((\/[^)#?\s]+)(?:#[^)]+)?\)/g)) {
      const target = match[1].replace(/\/$/, "");
      if (!routes.has(target)) report(file, lineNumber, `internal link is not present in docs.json: ${target}`);
    }
  }

  if (openFence !== null) report(file, lines.length, "unclosed code fence");
}

if (errors) {
  console.error(`\n${errors} content-rule violation${errors === 1 ? "" : "s"}.`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} page${files.length === 1 ? "" : "s"}; no content-rule violations.`);
}
