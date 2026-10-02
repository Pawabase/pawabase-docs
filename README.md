# Pawabase docs

The Pawabase documentation site, built with [Mintlify](https://mintlify.com).

## Preview locally

Requires Node.js 20 or newer.

```bash
npm install          # installs the Mintlify CLI (mint) locally
npm run dev          # http://localhost:3333, reloads as pages change
```

Or without installing into the project:

```bash
npx mint dev --port 3333
```

## Check before publishing

```bash
npm run check        # broken internal links
npm run validate     # docs.json and page frontmatter
```

## Layout

| Path | What |
| --- | --- |
| `docs.json` | Site config: theme, brand colours, fonts, navigation (tabs → groups → pages) |
| `style.css` | Brand layer (pastel palette, hero, pills) |
| `logo/`, `favicon.svg` | Brand marks for light and dark |
| `openapi/` | Gateway-facing OpenAPI specs; the Reference tab's API pages are generated from them |
| `images/` | Screenshots |
| `*/**.mdx` | Pages. Pages still being written carry `tag: "Draft"` in their frontmatter |

## Adding a page

1. Create `section/page-name.mdx` with `title` and `description` frontmatter.
2. Add `"section/page-name"` to the right group in `docs.json`.
3. `npm run check`.

## Regenerating the API reference

The files in `openapi/` are built from the running services' OpenAPI documents
with internal `/admin` and `/internal` routes removed and the gateway set as the
server. Regenerate them after API changes.

## Deploying

Connect the repository in the Mintlify dashboard and leave the docs directory at the repository root. Every push to the default branch publishes.
