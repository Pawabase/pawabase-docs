# Pawabase Documentation Audit

Audit-only pass over all 146 pages (~38,500 lines) across 24 sections, cross-checked against
actual source in `{akountz,angula,api,gateway,studio}/` and `pawabase_kit`. No files were
rewritten. This report is the input to a subsequent rewrite pass — see per-directory sections for
file-by-file verdicts, and the cross-cutting patterns below for what to fix first.

Six parallel audits were run, split by domain:
- **A. auth/ + policies/**
- **B. data/ + storage/**
- **C. flows/ + events/ + jobs/ + webhooks/**
- **D. clients/ + code/ + realtime/**
- **E. operate/ + self-hosting/ + installation/ + reference/ + concepts/**
- **F. compare/ + migrate/ + school/ + mail/ + tutorial/ + index/quickstart**

---

## Cross-cutting patterns (read this first)

Four distinct failure modes recur across almost every batch, not just isolated mistakes in
individual pages:

### 1. Wholesale fabrication of models, fields, and mechanisms
Several pages don't just get details wrong — they describe an entirely different, invented
implementation. Examples: `auth/mfa.mdx`'s `MFARecoveryCode` model (real: `RecoveryCode` with only
a hash, never the raw code), `auth/roles-and-permissions.mdx`'s `Role`/`RoleAssignment` + TOML
policy expressions (real: `Permission`/`Group`/`UserGroup`, JSON-only policies everywhere else),
`flows/templates.mdx`'s ~16 filters and dozen functions (real engine: 12 filters, zero
function-call syntax), `flows/custom-blocks.mdx`'s invented `Registry`/`validate()` API (real:
`BlockRegistry.add()`, `pawabase.blocks` entry points, never mentioned), `code/*.mdx`'s
pip-installable `pawabase.functions`/`pawabase.routes` entry points (don't exist — only
`pawabase.blocks` is real; actual mechanism is directory-based file loading), `mail/overview.mdx`'s
suppression-list feature and 5-attempt/hours-long retry schedule (real: 3 tries, 5–60s backoff, no
suppression lists anywhere in the codebase), `storage/content-safety.mdx` (a feature — virus
scanning, AI moderation — that doesn't exist at all; zero grep hits), and
`reference/changelog.mdx` (a fabricated v0.10.0→v0.20.0 release history when `pyproject.toml` says
`0.1.0`).

**Implication for the rewrite**: these files need to be regenerated from source, not edited. Do
not treat existing prose as a starting draft for these specific pages.

### 2. Wrong "what the user actually types" (violates the core Studio-config rule)
Even where the general shape of a feature is right, the specific field names Studio asks for are
often wrong: `flows/block-reference.mdx`/`control-flow.mdx` show `control.switch` taking a
`condition` field (real: `value` + `cases`), `control.foreach` taking `collection`/`item`/`index`
(real: only `items` — `item`/`index` are hardcoded, not configurable), `control.retry` taking
`delay` (real: `base_delay`) with handles `next, error` (real: `attempt, next`),
`control.merge` taking `values` (real: `objects`). This same bug is copy-pasted identically across
5+ separate files, meaning it isn't 5 independent mistakes — it's one wrong template that
propagated. Similarly `triggers.mdx` gets 5 of 8 trigger types' config fields wrong, and
`data/filtering.mdx`'s entire query-string syntax (`filter[field][op]=value`) is wrong — the real
syntax is `filter[field]=op.value`. Every example in that page would 400 if copy-pasted.

**Implication**: any Flow/trigger/filter JSON example needs to be re-derived from the actual block
registry / route source, field by field, not lightly edited.

### 3. Mechanical duplication (template/generation corruption)
Independent of accuracy, several files contain the *same paragraph repeated 4–5 times verbatim*
back-to-back. This is most severe in `realtime/*` (every one of the 7 files has 12–35 duplicate
lines — in `channel-rules.mdx`, 32 of 179 lines are literal repeats) and all 7 `storage/*` files
(identical paragraphs 5x each, meaning real unique content is ~1/3 to 1/5 of the reported line
count). `code/python-extensions.mdx` and `code/extension-routes.mdx` have their back halves
re-cover their front halves under near-identical headers. This inflates line counts in a way that
masks how shallow these pages actually are — `realtime/overview.mdx` reports 160 lines but has
well under 100 lines of real content.

**Implication**: strip duplicates before assessing real depth; these pages need to be rewritten
from scratch at proper length, not de-duplicated and called done.

### 4. Internal leakage, especially in operate/ and a security-sensitive case
All 8 `operate/*` pages read as internal engineering docs — they quote ORM model source, internal
class names (`DataSourcePool`, `ContextMiddleware`, `TelemetryRecorder`, `WorkerHeartbeat`), and
internal-only endpoints (`SERVICE_ONLY`-auth telemetry routes, Studio's private management API).
Most severe: **`operate/secrets.mdx` publishes the exact KDF parameters protecting customer
secrets at rest** — algorithm, the literal fixed salt, and iteration count. This is a genuine
security-hygiene issue, not just a doc-style violation, and should be pulled/redacted immediately
regardless of when the broader rewrite happens. `operate/security.mdx` similarly exposes internal
auth-token verification internals. None of this is necessary for a self-hosting operator to run
the product.

---

## Recommended immediate action (before the full rewrite)

- **Pull or redact `operate/secrets.mdx`'s crypto parameters (salt, iteration count) now** — this
  is a live security exposure independent of the rewrite timeline.
- **Fix `webhooks/outbound.mdx`'s signature header** (`X-Pawabase-Signature` → `Pawabase-Signature`)
  — a security-relevant contradiction with the other two webhook pages in the same cluster.
- **Flag `reference/environment-variables.mdx` and `reference/limits.mdx` as unreliable for
  self-hosters right now** — the Akountz/Angula/Studio env var names are systematically invented
  (e.g. `PAWABASE_ANGULA_MAX_CHANNELS` doesn't exist; real var is `PAWABASE_MAX_CHANNELS`, no
  service infix). Anyone configuring from this page alone silently misconfigures their instance.
- **Flag `installation/local-development.mdx`** — describes a nonexistent `pawabase` CLI and a
  Postgres-based setup; real local dev (`scripts/dev.sh`) is SQLite-only, no CLI, no Postgres
  needed. This actively blocks new contributors trying to follow it today.

---

## A. auth/ + policies/

**policies/** (11 files): generally strong, most verified line-for-line against
`pawabase_kit/policies/engine.py` and Studio's `ConditionBuilder.jsx`/`PolicyPicker.jsx`. Studio
example fields confirmed to match real UI, not internal payloads.
- `policies/debugging.mdx` (51 lines): **truncated mid-section**, cross-linked elsewhere as a key
  reference — needs real content, not just length.
- `policies/shorthands.mdx`: invents an engine caching layer that doesn't exist (`_shorthand`/
  `resolve_ref` are called fresh every evaluation, no cache).

**auth/** (15 files): bimodal. `auth/passwords.mdx` and most of `auth/configuration.mdx` are
carefully grounded (regexes, function signatures match source almost verbatim). But six files
describe a wholesale different, invented system:
- `auth/mfa.mdx` — wrong storage model, wrong recovery-code generation, invented `require_aal`
  TOML directive (config is JSON everywhere else, including in this same file's sibling docs).
- `auth/social-login.mdx` — wrong provider list (claims Apple/Facebook/LinkedIn; real: Google,
  GitHub, Discord, Microsoft — Discord is omitted from the doc), wrong generic-provider field names.
- `auth/roles-and-permissions.mdx` — entirely invented `Role`/`RoleAssignment` model + TOML +
  `has_permission()` function; real system is `Permission`/`Group`/`UserGroup`.
- `auth/organizations.mdx` — invented `Org`/`OrgMember` model, `CommerceOrg` blueprint, per-org AAL
  override; real: `Organization`/`Membership`/`Team`/`TeamMember`/`Invitation`.
- `auth/tokens-and-sessions.mdx`, `auth/overview.mdx` — fabricated functions/fields
  (`build_token_payload`, `AuthUser.project: UUID` when it's actually a string, invented `roles`
  array field).
- `auth/configuration.mdx`'s "complete AuthConfig dataclass" block merges in fields that actually
  belong to a different class (`AkountzSettings`).
- 7 files not deep-verified this pass (`auth-in-policies`, `client-integration`,
  `email-verification`, `magic-links`, `managing-users`, `password-recovery`, `security-model`) —
  given the confirmed 50/50 split, these need a targeted follow-up check before trusting them.

---

## B. data/ + storage/

**data/** (15 files): several files well-grounded (`data/resources.mdx` is the strongest, matches
`app/compiler/resources.py` closely), several badly wrong:
- `data/filtering.mdx` — entire query syntax wrong (bracket-op vs. real dot-op syntax); every
  example would 400.
- `data/your-database.mdx` — Postgres-only framing when sqlite (the actual default) and mysql are
  equally supported; fabricated DB-side UUID default (`gen_random_uuid()` — real: generated in
  Python); claims tables auto-create on first write (real: explicit `/migrate` call required).
- `data/migrations.mdx` — contradicts the above on the same point; claims migrations are
  "reversible" (no rollback mechanism exists).
- `data/transformers.mdx` — documents the wrong authoring mechanism entirely (raw Python shown;
  real Studio-facing shape is a declarative JSON object with `pick`/`rename`/`case` steps, never
  mentioned).
- `data/validation.mdx` — validation/authorization order is backwards vs. actual request handling;
  invents `exclusive_minimum`, `min_items`, conditional validation (none implemented).
- `data/field-types.mdx` — claims 14 types, documents 7; wrong storage-type claims for `number`
  (claims Decimal, real: float) and `array` (claims `TEXT[]`, real: always JSON/JSONB).
- `data/defining-resources.mdx` — fabricated reserved-name list, missing the real one.
- `data/caching.mdx` — invented `enabled`/`max_entries`/`?cache=false` (real: single `cache_ttl`
  int field, no bypass param).
- `data/database-console.mdx` — wrong numeric limits (10,000 rows/30s claimed vs. real 5,000
  rows/15s) and an invented three-pane UI (real Studio UI: single modal, no history pane).

**storage/** (7 files) — **systemic failure**, worse than any single data/ file:
- All 7 files are template-corrupted: identical paragraphs repeated 5x verbatim throughout,
  inflating reported line counts 3-5x over real unique content.
- `content-safety.mdx` documents a feature (virus scanning, AI content moderation) with zero
  support anywhere in the codebase.
- `drivers.mdx` documents GCS/Azure drivers that don't exist (real: local, memory, s3 only).
- `buckets.mdx`'s config example doesn't match the real `Bucket`/`BucketBody` schema at all — no
  per-bucket `driver` field exists (it's environment-level), no `content_safety` field exists.
- `uploads.mdx` documents multipart uploads and a Python SDK module, neither of which exist.
- `access.mdx`'s policy operator names are wrong (`neq`/`and`/`or` vs. real `ne`/`all`/`any`) —
  copy-pasting would 422.

**Recommendation**: all 7 storage/* files need a full rewrite from source, not incremental fixes.

---

## C. flows/ + events/ + jobs/ + webhooks/

This is the platform's flagship feature and the most severely affected batch.

**Fully verified and accurate** (use as the quality bar / templates for rewriting the rest):
`flows/data-blocks.mdx`, `flows/resource-blocks.mdx`, `flows/platform-blocks.mdx`,
`webhooks/signatures.mdx`.

**Severely fabricated**:
- `flows/templates.mdx` — the real template engine (91 lines of source) has 12 filters and no
  function-call syntax at all; the doc invents 16+ filters, a dozen functions (`now()`,
  `format_currency()`, etc.), and arithmetic/null-coalescing operators that don't exist anywhere.
- `flows/custom-blocks.mdx` — invents a `validate()` method, a `Registry` class with `.register()`,
  and `FlowRun` methods that don't exist; never mentions the real `pawabase.blocks` entry-point
  mechanism. Code samples would crash with `AttributeError` if run. Also raises a product question:
  is "write a Python class and register an entry point" even a Studio-only customer's capability?
  Needs a product decision, not just a doc fix.
- `flows/triggers.mdx` — config tables wrong for 5 of 8 trigger types (http, schedule, resource,
  webhook, job) — since triggers are every flow's entry point, this breaks things at step one.

**Systemic copy-paste bug**: `control.switch`/`control.foreach`/`control.merge`/`control.retry`
field names are wrong, and the *identical* wrong names appear across 5 separate files
(`block-reference.mdx`, `control-flow.mdx`, `recipes.mdx`, `state.mdx`'s `control.set` bug,
`errors-and-retries.mdx`'s `control.retry` bug) — one bad template propagated, not 5 independent
typos.

**Condition operators**: `neq` used throughout when the real operator is `ne`; six real operators
(`not_in`, `contains`, `starts_with`, `ends_with`, `matches`, `exists`, `empty`, plus shorthand
keys) are never documented.

**Events**: envelope shape documented three contradictory ways across `events/overview.mdx`,
`emitting.mdx`, `subscriptions.mdx` (flat vs. nested under `input.event`; wrong field name
`published_at` vs. real `occurred_at`). Platform lifecycle events (`flow.started`,
`flow.completed`, etc.) appear to be fabricated — no emission call site found anywhere in the
engine/scheduler/job code.

**Webhooks**: `webhooks/outbound.mdx` says `X-Pawabase-Signature`; the other two webhook pages
(correctly, verified against source) say `Pawabase-Signature`, no `X-` prefix. Security-relevant
contradiction inside a 3-page cluster meant to be read together.

**Jobs**: `jobs/queues.mdx` (76 lines) claims 3 retries by default; real jobs (`RunFlowJob`,
`RunFunctionJob`) are hardcoded `tries=1` — no default retries at all.

**Depth shortfalls**: `block-reference.mdx` (436), `control-flow.mdx` (310), `triggers.mdx` (364),
`errors-and-retries.mdx` (222), `jobs/queues.mdx` (76) all fall well short of the 750–2000 target,
and the shortfall correlates with the fabrication — these are pages that skipped verification
rather than pages that got longer and more wrong.

**Contributor-doc smell**: `flows/runs-and-testing.mdx` and `flows/errors-and-retries.mdx` paste
verbatim private (`_`-prefixed) engine methods and internal class names
(`RecordFailedJobRepository`) — accurate, but pitched at the wrong audience.

---

## D. clients/ + code/ + realtime/

**clients/** (7 files): the strongest sub-batch in the whole audit. `clients/overview.mdx` is the
best file found anywhere — correctly and honestly states no first-party SDK exists rather than
inventing one. Language guides (JS/Python/React/mobile/REST-conventions/errors) show no
duplication and no contradicted claims.

**code/** (6 files): the entry-point fabrication described above (§C summary) plus:
- `code/overview.mdx` self-contradicts on whether adding a function requires a restart (says both
  "no restart required" and "picked up on next API restart" in the same file).
- Wrong imports throughout (`from pawabase import function, FunctionContext` — no top-level
  `pawabase` package exists, only `pawabase_kit`).
- `code/python-extensions.mdx`/`code/extension-routes.mdx` have duplicated back-halves (see
  cross-cutting pattern 3).
- `code/runtime.mdx` is the best-verified file in code/ — accurate `Runtime` protocol description,
  though padded in its last third.

**realtime/** (7 files): every file has significant duplicate-paragraph padding (12-35 lines
each). Beyond that:
- `realtime/overview.mdx` (160 lines) and `realtime/protocol.mdx` (163 lines) are flagship pages
  that should be 750+ lines; even their existing content is mostly duplicate filler.
- `realtime/channel-rules.mdx` gets the architecture backwards — claims the gateway evaluates
  channel policies before proxying to Angula; source shows this happens inside Angula itself.
  Schema shown (`subscribe_policy`/`publish_policy` as inline conditions) doesn't match real config
  (`subscribe`/`publish` as policy-name strings).
- `realtime/presence.mdx` invents a `status` field and an "update" event type that don't exist in
  the real presence model.
- `realtime/connecting.mdx` describes SDK-like auto-reconnect behavior, directly contradicting
  `clients/overview.mdx`'s (correct) statement that no first-party SDK exists — a clear cross-file
  inconsistency.
- `realtime/resource-changes.mdx` — the one file whose core claim is right (the `realtime: true`
  flag does publish resource changes), but the payload shape shown is wrong (`event`/`data`/
  `timestamp` vs. real `resource`/`change`/`record`). Also has a literal HTML-escaping rendering
  bug (`&lt;name&gt;` shows as raw entities).

---

## E. operate/ + self-hosting/ + installation/ + reference/ + concepts/

**concepts/** (9 files): consistently good — correctly stays at product-boundary level without
descending into internals. `concepts/expressions.mdx` verified accurate filter/operator lists
against source. Only issue: `concepts/glossary.mdx` claims 58 built-in flow blocks; actual count
is 64.

**operate/** (8 files): **all eight** read as internal engineering docs rather than product ops
guides — ORM model source, internal class names, internal-only endpoints throughout. Most
individual facts check out as accurate, which doesn't change that they shouldn't be published this
way. Worst instances:
- `operate/secrets.mdx` — publishes exact KDF salt/iteration count (security issue, see above).
- `operate/security.mdx` — exposes internal auth-token verification internals.
- `operate/environments-and-promotion.mdx` and `operate/rate-limits-and-cors.mdx` both show a
  fabricated nested `infra.database.url`/`pool_size` shape that contradicts
  `reference/environment-settings.mdx`'s correct flat `infra.database_url` string (verified
  against `state.py`).

**self-hosting/** (8 files): mostly solid — `docker-compose.mdx`, `scaling.mdx`, `tls.mdx`,
`backups.mdx`, `requirements.mdx` all check out against actual `docker-compose.yml`/`.env.example`.
- `self-hosting/production-checklist.mdx` has one wrong health-check path (`/_health` vs. real
  `/health`).
- `self-hosting/upgrades.mdx` implies per-service migration commands; real `entrypoint.sh` always
  migrates both api and akountz together regardless of which is invoked.

**installation/**: `installation/docker.mdx` is accurate. `installation/local-development.mdx` is
**largely fabricated** — invents a `pawabase` CLI, wrong Python version (3.12+ claimed vs. real
3.11+), and a Postgres-based setup when real local dev (`scripts/dev.sh`) is SQLite-only with no
external database. Actively blocks anyone following it today.

**reference/** (7 files): the weakest cluster in this batch.
- `reference/environment-variables.mdx` — systematically wrong var names for Akountz/Angula/Studio
  (invents service-name infixes; the real prefix scheme is flat `PAWABASE_*` with no per-service
  infix, confirmed as the only `env_prefix` definition in the codebase).
- `reference/limits.mdx` — repeats the same fabricated var names.
- `reference/event-names.mdx` — **verified-incorrect wildcard semantics**: claims `*` matches
  exactly one segment; actual code uses `fnmatch.fnmatchcase` directly, which matches across dots.
- `reference/troubleshooting.mdx` — refers to the Postgres container as `db`; real compose service
  name is `postgres` — the given command would fail as written. Also references a nonexistent
  `PAWABASE_SECRET_KEY`.
- `reference/changelog.mdx` — fabricated version history (v0.10.0→v0.20.0) contradicting the
  actual `pyproject.toml` version (`0.1.0`); also leaks internal refactor history/class names.
- A stale default recurs across 4 files (`environment-variables.mdx`, `environment-settings.mdx`,
  `limits.mdx`, `self-hosting/configuration.mdx`): `sqlite:///data/envs/...` in docs vs. actual
  `sqlite://storage/data/...` in `app/config.py`.

---

## F. compare/ + migrate/ + school/ + mail/ + tutorial/ + index/quickstart

**school/** (7 files) and **tutorial/first-project.mdx**: the strongest example-fidelity in the
entire audit. `school/frontend.mdx` and `school/data-model.mdx` verified almost verbatim against
the real `school-portal` reference app (resource names, `.env` vars, the `filter[…]` helper, and
the secret-key regex all match source). Minor: `school/overview.mdx` advertises "23 resources";
`school/data-model.mdx`'s own enumeration lists 22 — small internal inconsistency worth
reconciling.

**compare/** (6 files): generally calm and honest in tone (explicitly commits to stating
weaknesses). One clear violation: `compare/when-not-to-use-pawabase.mdx` opens with "Pawabase is a
powerful backend platform" — a hype-word violation on the one page that explicitly promises no
marketing language. `compare/feature-matrix.mdx` mischaracterizes custom routes as
Python-handler-only when flow-handled (no-code) routes are the primary path shown throughout the
rest of the docs (including the school tutorial).

**migrate/** (2 files): **both fabricate the policy/condition syntax**. Both
`migrate/from-firebase.mdx` and `migrate/from-supabase.mdx` use a `{{ jinja-expression }}`-style
condition syntax and an invented `enforcement_point` field, contradicting the real JSON-condition
syntax verified everywhere else, including `school/access-control.mdx` and Studio's own templates.
`from-supabase.mdx` also has a comparative-hype violation ("more powerful than Supabase's RLS").
Anyone following either guide literally writes non-functional policy definitions.

**mail/** (2 files): both significantly fabricated.
- `mail/overview.mdx` — invented 5-attempt/hours-long retry schedule (real: 3 tries, 5-60s
  backoff) and an entire "Suppression lists" feature with no support anywhere in the codebase.
- `mail/templates.mdx` — invents custom Jinja2 filters (`date`, `currency`), a preview/send-test
  UI, and working template inheritance/includes — the real renderer uses a one-shot
  `Environment.from_string()` with no loader, so includes/inheritance can't work as described.
  Contains a code sample with invalid Jinja2 syntax that wouldn't run.

**index.mdx / quickstart.mdx**: both fine — appropriately scoped entry points, no leakage, no
hype.

---

## Depth summary

Nearly every page in the docs falls under the 750-line target for "major" pages (average across
all 146 files is ~264 lines; total 38,538 lines). For most sections this is a genuine depth gap
that the rewrite needs to close. But depth alone is not the priority — several of the *longest*
pages in the set (e.g. `storage/*` at 77-123 reported lines, `realtime/overview.mdx`) are inflated
by literal duplication rather than real content, and several *shorter* pages are actually accurate
and complete for their scope (e.g. most of `concepts/*`, `data/sorting-pagination.mdx`). Treat the
per-file verdicts above as the actual prioritization signal, not raw line count.

## Suggested rewrite order

1. **flows/** — flagship feature, most severely wrong, affects every other page that references a
   Flow example.
2. **storage/** — full rewrite needed, not incremental (template corruption + wrong schema).
3. **auth/** (the 6 fabricated files) + **mail/** + **migrate/** — invented models/mechanisms that
   would actively break anyone following them.
4. **realtime/** — de-duplicate and rewrite to real depth; fix the architecture inversion.
5. **operate/** + **reference/** — reframe from engineering-doc to ops-doc altitude; fix the
   security leak in `secrets.mdx` immediately, independent of this ordering.
6. **data/** (remaining files), **code/**, **events/**, **jobs/**, **webhooks/** — targeted field-
   and syntax-level fixes plus depth expansion.
7. **compare/**, **school/**, **concepts/**, **clients/** — lightest touch; mostly tone/consistency
   polish, not fabrication cleanup.
