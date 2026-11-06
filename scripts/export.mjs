// Builds the static site into dist/ for Cloudflare: `mint export` writes a zip, which is unpacked here,
// with the local-server helpers it ships removed and a 404 page added.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const ZIP = "export.zip";
const OUT = "dist";

rmSync(OUT, { recursive: true, force: true });
rmSync(ZIP, { force: true });
execFileSync("npx", ["mint", "export", "--output", ZIP], { stdio: "inherit" });

try {
  execFileSync("unzip", ["-q", ZIP, "-d", OUT], { stdio: "inherit" });
} catch {
  execFileSync("python3", ["-m", "zipfile", "-e", ZIP, OUT], { stdio: "inherit" });
}
rmSync(ZIP, { force: true });

for (const name of ["serve.js", "Start Docs.bat", "Start Docs.command", "bun.lock", "package.json", ".gitignore", ".mintignore"]) {
  rmSync(`${OUT}/${name}`, { force: true });
}

if (!existsSync(`${OUT}/404.html`)) {
  writeFileSync(
    `${OUT}/404.html`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found | Pawabase docs</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111214;color:#f3f0eb;font:16px/1.6 system-ui,sans-serif}a{color:#FF6A00}</style></head>
<body><main><h1>Page not found</h1><p>That page doesn't exist. <a href="/">Go to the Pawabase docs</a>.</p></main></body></html>\n`,
  );
}
console.log(`Static site written to ${OUT}/`);
