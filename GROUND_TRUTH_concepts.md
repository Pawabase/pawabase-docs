# VERIFIED GROUND TRUTH — Guides → Concepts + Get started docs

Every fact below was read from source in `/Users/admin/sillo.build/pawabase` on 2026-10-04.
**Do not contradict this file.** If you cannot find a fact here, do not invent it — omit it, or
go read the source yourself. Never write a field name, operator, URL, env var, or default that is
not in here or that you have confirmed by reading source yourself.

## House style for this section (hard requirements)

- **≥1,500 lines per page.** Aim 1,500–1,900. Never pad with duplicated paragraphs (a previous
  pass replicated paragraphs 5× — that is the failure mode we are fixing).
- **No "Step 1 / Step 2" instruction lists.** Do not write `Step 1: ...`. Do not make the page's
  spine "First do X. Then do Y.". Explain *what the thing is, why it exists, how it behaves, what
  it means for the reader's decisions, and what goes wrong*. Procedural content may appear, but as
  prose and reference tables, not as an imperative checklist.
- **Explain, don't enumerate.** Every section should answer "why would I care?" before
  "what are the fields?".
- **Studio perspective is mandatory.** Name the real UI labels, the real nav path, the real panel.
- **User conception is mandatory.** Lead with the mental model a developer needs.
- Frontmatter is exactly `title`, `description`, `icon` (three lines, then `---`).
- Mintlify components in use in this docs set: `<Note>`, `<Warning>`, `<Info>`, `<Tip>`,
  `<CardGroup cols={2|3}>`, `<Card title icon href>`, `<ResponseField name>`, `<Accordion>`,
  `<AccordionGroup>`, `<Steps>`, `<CodeGroup>`. Use them, but not as filler.
- Code fences: ```json, ```python, ```bash, ```sql, ```text.
- Internal links are absolute-from-root: `/concepts/mental-model`, `/data/field-types`,
  `/flows/overview`. Only link to pages that exist. **`docs.json` lists 151 unique page
  entries** (an earlier note in `DATA_GROUND_TRUTH.md` said 149 — that count is wrong; trust 151).
- No hype words (see §20). No marketing voice. Be direct and specific.
- Tables are heavily encouraged — they are the densest correct way to convey this material.

## Pages in scope

`docs.json` groups. Verify against the file; do not trust this list blindly.

| Group | Pages |
|---|---|
| **Get started** | `index`, `quickstart`, `concepts/mental-model`, `concepts/organizations`, `concepts/projects-and-environments`, `concepts/studio`, `installation/local-development`, `installation/docker`, `tutorial/first-project` |
| **Core concepts** | `concepts/architecture`, `concepts/credentials`, `concepts/request-lifecycle`, `concepts/definitions-as-data`, `concepts/expressions`, `concepts/glossary` |

Note the group is named **"Core concepts"**, not "Concepts". `installation/local-development` is
already rewritten (1605 lines) — do not duplicate its content into `installation/docker`;
cross-link instead.

---

## 1. The tenant hierarchy (`api/database/models/orgs.py`, `projects.py`, `releases.py`)

Four nested nouns, each stored in its own table. This is the spine of every concepts page.

```
Organization  →  Project  →  Environment  →  { Branch, ApiVersion, Release }
```

| Level | Table | Identity field | Notes |
|---|---|---|---|
| Organization | `pb_organizations` | `slug` (63, unique, indexed) | top level; projects live in one |
| Project | `pb_projects` | `ref` (63, unique, indexed) | "The stable, URL-safe reference clients and keys carry (`acme`)" |
| Environment | `pb_environments` | `name` (63), unique per project | an isolated stage |
| Branch | `pb_branches` | `name` (63), unique per environment | a movable authoring pointer |
| DefinitionRevision | `pb_definition_revisions` | `id` (CharField 32), `number` per environment | immutable validated snapshot |
| ApiVersion | `pb_api_versions` | `name` (32), unique per environment | "A stable public URL namespace such as `v1` or `v2`" |
| Release | `pb_releases` | `id` (CharField 32) | "A revision prepared for, or active on, one public API version" |

All IDs are ULIDs via `ulid_pk()` from `pawabase_core.records`, except `ProjectKey`, which is a
UUID, and revisions/releases/function deployments/runs, which are 32-char strings.

### 1.1 Organization roles — `ORG_ROLES` (orgs.py:16)

```python
ORG_ROLES = ("viewer", "developer", "admin", "owner")
```

Source comment, verbatim: "Least to most privileged. A role can do everything the ones before it
can." Then, per role:

| Role | Can |
|---|---|
| `viewer` | reads a project |
| `developer` | changes it |
| `admin` | also manages the organization's members, projects' lifecycle and settings |
| `owner` | also deletes the organization and grants ownership |

There is no per-project role override in these models — `OrgMember.role` is organization-wide.

### 1.2 OrgMember (orgs.py:32)

"An operator (an Akountz user of `_platform`) in an organization."

| Field | Type | Notes |
|---|---|---|
| `organization` | FK → `Organization`, `related_name="members"`, `CASCADE` | |
| `user_id` | CharField(64), indexed | the Akountz user id, not a FK |
| `email` | CharField(255) | |
| `name` | CharField(200), default `""` | |
| `role` | CharField(16), default `"developer"` | one of `ORG_ROLES` |

Table `pb_org_members`, `unique_together = (organization, user_id)`, `ordering = ["id"]`.

### 1.3 OrgInvitation (orgs.py:50)

"An invitation to join. **Only the token's hash is stored.**"

| Field | Type | Notes |
|---|---|---|
| `organization` | FK, `related_name="invitations"`, `CASCADE` | |
| `email` | CharField(255), indexed | |
| `role` | CharField(16), default `"developer"` | role granted on accept |
| `token_hash` | CharField(64), unique, indexed | never the token itself |
| `invited_by` | CharField(255), null | |
| `expires_at` | DatetimeField | **required, no null** |
| `accepted_at` | DatetimeField, null | null = not yet accepted |
| `revoked_at` | DatetimeField, null | null = not revoked |
| `details` | AnyJSONField, default `dict` | |

Table `pb_org_invitations`, `ordering = ["-id"]`. An invitation's state is read off the two
nullable timestamps: both null is pending, `accepted_at` set is accepted, `revoked_at` set is
revoked.

### 1.4 There are TWO different organizations — do not merge them

This is the single most confusable thing in the platform, and both are called "organization".

| | **Platform organization** | **Akountz organization** |
|---|---|---|
| File | `api/database/models/orgs.py` | `akountz/database/models/orgs.py` |
| Table | `pb_organizations` | `akz_organizations` |
| Holds | **your projects** | **your application's end users** |
| Scope | global — `slug` unique platform-wide | per environment — `unique_together = (project, env, slug)` |
| Roles | `viewer, developer, admin, owner` | `owner, admin, member, viewer` |
| Members are | *operators* (Akountz users of `_platform`) | your app's `AuthUser` rows |
| Membership link | `OrgMember.user_id`, a **CharField(64)** | `Membership.user`, a **real FK** to `AuthUser` |
| Teams | none | `Team` + `TeamMember` |
| Extra columns | — | `metadata` AnyJSONField |

**The role vocabularies are not the same and the middle differs.** Platform uses `developer`; Akountz
uses `member`. Neither is a superset of the other:

- Platform `ORG_ROLES = ("viewer", "developer", "admin", "owner")`
- Akountz `ORG_ROLES = ("owner", "admin", "member", "viewer")`

Akountz `Membership.role` defaults to `"member"`, not `"developer"`.

Akountz also has its own `Invitation`, which stores `token_id` (CharField 32) — a **reference** —
whereas the platform `OrgInvitation` stores `token_hash` (CharField 64) and never stores the token.
Different tables, different designs, different files.

Akountz `Team` / `TeamMember` exist only on the Akountz side. There is no team concept for platform
operators.

The mental model to give the reader: the **platform organization owns projects** and is about who
may *change the backend*; an **Akountz organization owns users** inside one environment and is about
who may *use the application you built*. A single person is an operator in the first and a user in
the second, and those are different records.

### 1.5 Project.organization is nullable on purpose (projects.py:25-30)

Source comment, verbatim: "The organization the project lives in. Every project has one, and the
column is nullable only so databases created before organizations existed can migrate, and those
projects are adopted by the first organization made."

So a null organization is a migration artifact, not a supported state. `on_delete=fields.RESTRICT`
— deleting an organization with projects in it is refused by the database, not cascaded.

---

## 2. Environment — the most important object to get right

Four JSON columns do all the real work. Source comment (projects.py:40-51):

| Column | Type | Holds |
|---|---|---|
| `infra` | AnyJSONField | "The developer's infrastructure for this environment: database, Redis, storage, mail. Credentials are `secret://NAME` references." |
| `auth` | AnyJSONField | "Akountz configuration: token lifetimes, password rules, enabled providers (credentials again by secret reference), redirect URLs." |
| `settings` | AnyJSONField | "Everything else: CORS origins, public docs, rate limits." |
| `version` | IntField, default `1` | "Bumped on every definition change, so compiled APIs, engines and caches know when to rebuild." |

Other fields: `project` FK (`related_name="environments"`, `CASCADE`), `name` CharField(63),
`is_default` Boolean(default False). Table `pb_environments`,
`unique_together = (project, name)`, `ordering = ["name"]`.

`version` is the quiet load-bearing field. Caches, compiled routes and policy engines key off it,
so a definition change is visible to every one of them without a restart.

### 2.1 Deploy previews are ordinary environments (projects.py:63-67)

Source comment, verbatim: "Deploy previews are ordinary isolated environments with an automatic
expiry. **Infrastructure is deliberately never copied into one unless the caller supplies it
explicitly.**"

| Field | Type | Notes |
|---|---|---|
| `preview_source` | CharField(63), null | the environment previewed from |
| `preview_expires_at` | DatetimeField, null | |

The consequence worth writing about: a preview environment has **no database, Redis, storage or
mail** unless the caller passes them. Anything that assumes a working `infra` block will fail in
a preview, and that is by design — copying infrastructure silently would point a preview at
production data.

### 2.2 Default environments on a new project

A new project gets `development` and `production` — **two, not three**. There is no `staging`
created for you. See §11.

---

## 3. Credentials — three different things that all look like "a key"

The single most common confusion in this codebase's docs. There are three distinct mechanisms.

| Mechanism | Table | Lives on | Plaintext stored? | Bypasses policies? |
|---|---|---|---|---|
| **ProjectKey** | `pb_project_keys` | one Environment | no — SHA-256 hash only | depends on `role` |
| **Secret** | `pb_secrets` | one Environment | no — `ciphertext` column | n/a (config, not identity) |
| **User session token** | Akountz-owned | Akountz | no | no |

### 3.1 ProjectKey (projects.py:75)

"An API key for one environment. **The plaintext is shown once at creation.** Only a SHA-256 hash
is stored, computed with Sillo's `hash_api_key`."

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | UUIDField, **primary key** | | only UUID pk in the model set |
| `environment` | FK, `related_name="keys"`, `CASCADE` | | |
| `name` | CharField(200) | | |
| `role` | CharField(20) | `"publishable"` | `publishable` or `secret` |
| `prefix` | CharField(24) | | "the first characters of the key, so Studio can identify it" |
| `key_hash` | CharField(128), unique, indexed | | |
| `scopes` | AnyJSONField | `list` | "Optional restrictions (`resource:read`, `storage:*`…)" |
| `allowed_ips` | AnyJSONField | `list` | "CIDRs and route rules evaluated by the public gateway before proxying" |
| `allowed_routes` | AnyJSONField | `list` | same |
| `expires_at` | DatetimeField | null | |
| `revoked_at` | DatetimeField | null | |
| `last_used_at` | DatetimeField | null | |
| `use_count` | IntField | `0` | |
| `created_by` | CharField(255) | null | |

### 3.2 `publishable` vs `secret` — the decision that matters most

Source docstring, verbatim:

> `role`: `publishable` (browser-safe, policies apply) or `secret` (server-side, bypasses policies).

| | `publishable` | `secret` |
|---|---|---|
| Safe in browser JS | yes | **no** |
| Resource policies | **apply** | **bypass** |
| Typical use | browser client, mobile app | your backend, CI, a server-to-server call |

A `secret` key in a browser bundle is a full data-plane bypass handed to whoever loads the page.
A `publishable` key is not — the policies you wrote still apply to it. That asymmetry is the
whole reason both roles exist.

### 3.3 `allowed_ips` / `allowed_routes` — an empty list means unrestricted

Source comment, verbatim: "CIDRs and route rules evaluated by the public gateway **before
proxying**. An empty list means unrestricted for backwards compatibility."

The important consequence: the check happens **at the gateway, before the request reaches the
API**. It is not a policy, not a filter, and not advisory. A key restricted to a CIDR that does
not match never reaches your code.

### 3.4 Secret (projects.py:111)

"An encrypted configuration value. **Its plaintext never leaves the API.**"

| Field | Type | Notes |
|---|---|---|
| `environment` | FK, `related_name="secrets"`, `CASCADE` | |
| `name` | CharField(128) | unique per environment |
| `ciphertext` | TextField | the encrypted value |
| `description` | TextField, default `""` | |
| `updated_by` | CharField(255), null | |

Table `pb_secrets`, `unique_together = (environment, name)`, `ordering = ["name"]`.

### 3.5 The `secret://` indirection

`Environment.infra` and `Environment.auth` do not hold credentials. They hold **references** of
the form `secret://NAME`, resolved against that environment's `Secret` rows. This is why the same
`infra` block can be copied between environments without copying the secrets.

Encryption uses `PAWABASE_MASTER_KEY`, which "encrypts environment secrets at rest" and is itself
one of the seven defaulted variables in `scripts/dev.sh`.

Studio path for both: **Operate → API keys** and **Operate → Secrets**.

---

## 4. Branches, revisions, versions, releases, deployments

The publishing pipeline, in the order the nouns appear. Five tables in `releases.py`.

### 4.1 Branch (releases.py:12)

"A movable authoring pointer within one environment."

| Field | Type | Notes |
|---|---|---|
| `environment` | FK, `related_name="branches"`, `CASCADE` | |
| `name` | CharField(63) | unique per environment |
| `head_revision_id` | CharField(32), null | |
| `draft` | AnyJSONField, default `dict` | "Mutable definition snapshot for an isolated working branch. **`main` continues to use the environment's live definitions.**" |
| `base_snapshot` | AnyJSONField, default `dict` | "Snapshot the branch started from, used for safe three-way merge checks" |
| `changes` | AnyJSONField, default `list` | "Append-only authoring actions performed against this branch" |
| `protected` | Boolean | default `False` |

The `main`-special-case in the `draft` comment is the part that trips people up: a branch other
than `main` holds its own definition snapshot, while `main` has none and edits go straight to the
environment's live definitions.

### 4.2 DefinitionRevision (releases.py:36)

"An **immutable**, validated snapshot of an environment's definitions."

| Field | Type | Notes |
|---|---|---|
| `id` | CharField(32), **pk** | |
| `environment` | FK, `related_name="revisions"`, `CASCADE` | |
| `number` | IntField | unique per environment, monotonic |
| `branch` | CharField(63) | default `"main"` |
| `parent_revision_id` | CharField(32), null | forms the history chain |
| `checksum` | CharField(64), indexed | content address of the snapshot |
| `snapshot` | AnyJSONField | the whole definition tree |
| `status` | CharField(16) | default `"valid"` |
| `problems` | AnyJSONField, default `list` | validation findings |
| `message` | TextField, default `""` | author-supplied |
| `created_by` | CharField(255), null | |

Table `pb_definition_revisions`, `unique_together = (environment, number)`,
`ordering = ["-number"]`.

Revisions are validated **at creation**, which is why `problems` lives on the revision rather than
being raised at request time.

### 4.3 ApiVersion (releases.py:59)

"A stable public URL namespace such as `v1` or `v2`."

| Field | Type | Default |
|---|---|---|
| `environment` | FK, `related_name="api_versions"`, `CASCADE` | |
| `name` | CharField(32) | unique per environment |
| `status` | CharField(16) | `"draft"` |
| `is_default` | Boolean | `False` |
| `active_release_id` | CharField(32), null | |
| `previous_release_id` | CharField(32), null | |
| `sunset_at` | DatetimeField, null | |

Because the version is **part of the public path**, `v1` and `v2` can serve genuinely different
shapes at the same time. That is the entire point of the object. See §6.2.

### 4.4 Release (releases.py:79)

"A revision prepared for, or active on, one public API version."

| Field | Type | Notes |
|---|---|---|
| `id` | CharField(32), pk | |
| `environment` | FK, `related_name="releases"`, `CASCADE` | |
| `revision_id` | CharField(32), indexed | the immutable snapshot |
| `api_version` | CharField(32), indexed | which namespace |
| `name` | CharField(128) | e.g. `v2.0.0` |
| `status` | CharField(16) | default `"ready"` |
| `notes` | TextField, default `""` | |
| `compatibility` | AnyJSONField, default `dict` | drives the breaking/compatible badge |
| `deployed_at` | DatetimeField, null | |

`compatibility` is computed, not typed: Studio renders `compatible` / `breaking` from
`item.compatibility?.compatible`.

### 4.5 Deployment (releases.py:100)

"**Append-only** history of activations and rollbacks."

| Field | Type |
|---|---|
| `environment` | FK, `related_name="deployments"`, `CASCADE` |
| `api_version` | CharField(32), indexed |
| `release_id` | CharField(32) |
| `previous_release_id` | CharField(32), null |
| `action` | CharField(16) |
| `status` | CharField(16), default `"succeeded"` |
| `actor` | CharField(255), null |
| `details` | AnyJSONField, default `dict` |

Table `pb_deployments`, `ordering = ["-id"]`. Nothing updates or deletes a row here.

---

## 5. Studio — exact navigation (`studio/frontend/src/components/Layout.jsx:11-25`)

`ENV_NAV` is the environment-level sidebar, verbatim. **Use these strings exactly.**

```jsx
export const ENV_NAV = [
  { title: "Build", items: [
    ["overview", "Overview"], ["database", "Database"], ["resources", "Resources"], ["schemas", "Schemas"],
    ["transformers", "Transformers"], ["policies", "Policies"], ["routes", "Routes"], ["explorer", "API Explorer"], ["functions", "Functions"],
  ] },
  { title: "Automate", items: [
    ["flows", "Flows"], ["subscriptions", "Event subscriptions"], ["schedules", "Schedules"],
    ["webhooks", "Webhooks"], ["inbound-hooks", "Inbound hooks"],
  ] },
  { title: "Services", items: [["users", "Users & auth"], ["mail", "Mail"], ["storage", "Storage"], ["realtime", "Realtime"]] },
  { title: "Operate", items: [
    ["jobs", "Jobs & queues"], ["events", "Events & runs"], ["observability", "Observability"],
    ["keys", "API keys"], ["secrets", "Secrets"], ["backups", "Backups"], ["settings", "Settings"],
  ] },
];
```

| Section | Label in the sidebar |
|---|---|
| Build | Overview, Database, Resources, Schemas, Transformers, Policies, Routes, API Explorer, Functions |
| Automate | Flows, Event subscriptions, Schedules, Webhooks, Inbound hooks |
| Services | Users & auth, Mail, Storage, Realtime |
| Operate | Jobs & queues, Events & runs, Observability, API keys, Secrets, Backups, Settings |

Note **"Event subscriptions"** is one label (two words, lowercase s), while **"Events & runs"** is
a different item under Operate. They are not the same page. Note also `API keys` and `Secrets`
are under **Operate**, not Services.

`SECTION_TONES` (Layout.jsx:28-32) — the pastel each section wears on sheet headers and empty
states: `resources` lavender, `schemas` sky, `transformers` butter, `policies` mint,
`routes` peach, `functions` sky, `flows` lavender, `subscriptions` rose, `schedules` butter,
`webhooks` peach, `inbound-hooks` mint, `mail` rose, `buckets` sky, `storage` sky.

### 5.1 The four publishing tabs and their exact copy (Layout.jsx:144-158)

| Tab | Heading | Supporting copy | Control |
|---|---|---|---|
| branches | (branch switcher) | placeholder `feature-checkout` | button **"Create & checkout"** |
| releases | **"Prepare release"** | "Point a stable API version at an immutable revision." | fields **Revision**, **API version**, **Release name** (placeholder `v2.0.0`); checkbox "I acknowledge breaking compatibility findings."; button **"Prepare release"** |
| revisions | **"Create revision"** | "Capture the current {branch} definition tree." | placeholder `Snapshot {branch}`; button **"Create revision"** |
| versions | **"Add API version"** | "Creates a stable public path such as v2." | placeholder `v2`; button **"Add version"** |
| deployments | — | — | table only, with **Rollback** on the latest row |

Version names are validated client-side against `/^v[1-9][0-9]*$/` — the **Add version** button
stays disabled until the name matches. So `v0` and `v01` cannot be created from Studio.

### 5.2 Exact table column labels

| Table | Columns, in order |
|---|---|
| Prepared releases | Release, Path, Status, Compatibility, Created, (action) |
| Revisions | #, Branch, Status, Message, Created |
| API versions | Version, Status |
| Deployments | Version, Action, Release, Status, When, (action) |

The **Path** column renders `` `/rest/${item.api_version}` `` — literal backticks around the path
in the cell. This is the visible proof that the API version is in the URL.

The revision `#` cell offers `#<number> · <branch> · <message or checksum.slice(0,8)>`, so an
unnamed revision is identified by the first 8 characters of its checksum.

---

## 6. Gateway — the public surface (`gateway/app/routing.py`, `proxy.py`, `keys.py`)

### 6.1 The route table, verbatim and in order (routing.py:27-47)

First matching prefix wins, most specific first.

| Prefix | Service | Key |
|---|---|---|
| `/auth/v1/authorize/` | akountz | **none** |
| `/auth/v1/callback/` | akountz | **none** |
| `/auth/v1/links/` | akountz | **none** |
| `/auth/v1/` | akountz | required |
| `/rest/` | api | required |
| `/storage/v1/signed/` | api | **none** |
| `/storage/v1/` | api | required |
| `/functions/v1/` | api | required |
| `/flows/v1/` | api | required |
| `/hooks/v1/` | api | **none** |
| `/docs/v1/` | api | **none** |
| `/health/v1/` | api | required |
| `/realtime/v1/` | angula | required |
| `/platform/v1/` | api | **optional** |

The three `none` auth entries plus `/auth/v1/callback/` exist because, per the source comment,
"Browser navigations and email links carry no API key; the environment is in the path." A redirect
from an email provider cannot present a header.

`/health/v1/` is `required` deliberately — the source comment says it "also proves the key itself
resolves for that project."

`/platform/v1/` is `optional` because "Operators may use bearer tokens; the Functions CLI may
instead present a scoped project API key, which the gateway turns into a signed context."

`BLOCKED_PREFIXES = ("/internal/", "/admin/")` — "Never exposed publicly, whatever the prefix
table says." `route_for()` returns `None` for these before the table is consulted.

### 6.2 The version lives in the path

`ARCHITECTURE.md` describes the data plane as `/rest/v1/*`; `routing.py` matches the prefix
`/rest/`. Both are right and they compose: the public data plane is **`/rest/{api_version}/…`**.
This is what makes two API versions of the same resource coexist at one origin, and it is why the
Studio releases table shows `/rest/${api_version}`.

### 6.3 What the gateway does, in order (proxy.py:7-16)

Source docstring, condensed but faithful:

1. match the path against the route table;
2. "resolves the API key (`apikey` or `x-api-key` header, or `?apikey=` for browser navigations and
   WebSockets) into a platform context";
3. enforce the key's own restrictions;
4. strip internal headers (``x-pawabase-*``) and the raw key;
5. "adds the signed `X-Pawabase-Context`, `X-Request-ID` and forwarding headers, and streams the
   request and the response through."

Step 4 is a security property, not a convenience: the raw key never reaches an upstream service,
and a client cannot forge `x-pawabase-*`.

Environment is taken from the `x-project-id` and `x-environment` request headers (`proxy.py:145-147`).
The signed context is produced by
`issue_context_token(self.settings.internal_secret, context)` and put in `CONTEXT_HEADER`
(proxy.py:219).

### 6.4 Key resolution and its cache (keys.py)

The API owns keys. "The gateway asks it once per key and caches the answer with Sillo's cache,
including refusals (briefly), so a burst of requests with a bad key does not become a burst of
lookups."

| Constant | Value | Meaning |
|---|---|---|
| `NEGATIVE_TTL` | `5` | seconds a **rejected** key is cached |
| default `ttl` | `30` | seconds a successful resolution is cached |
| default cache | `MemoryCache(namespace="gateway-keys")` | per-process, not shared |

Resolution posts to `/internal/v1/keys/resolve` with `{"key", "project", "env"}`. A
`ServiceError` with status **401, 404 or 422** is turned into `KeyRejected`, carrying
`detail` or the fallback `"invalid API key"`. Any other status propagates.

The cache key is `"key:" + sha256(f"{project}:{env}:{raw}")`. Scoping by project and env is
deliberate — the source comment says it means "a key resolved once for the wrong project (or
before it existed) can't shadow a later, correctly-scoped lookup of the same raw key."

The resolved context is a `PlatformContext` of `project`, `env`, `role`, `key_id`, `scopes`.

Because the cache is a `MemoryCache`, a gateway restart re-resolves, and in a multi-process
gateway each process caches separately.

---

## 7. Field types (`pawabase_core/schemas.py:30-50`)

`FIELD_TYPES`, verbatim and complete — **15 types**:

```python
FIELD_TYPES = (
    "string", "text", "integer", "number", "boolean", "datetime", "date",
    "uuid", "ulid", "email", "url", "json", "array", "object", "ref",
)
```

| Pattern | Value | Applies to |
|---|---|---|
| `_NAME` | `^[A-Za-z_][A-Za-z0-9_]{0,62}$` | every field name |
| `EMAIL_PATTERN` | `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `email` |
| `URL_PATTERN` | `^https?://[^\s]+$` | `url` |

`Mode = Literal["create", "update", "read", "any"]`.

`SchemaError(ValueError)` — "A field definition that cannot be compiled." `validate_fields()`
raises it "naming the offending field", so the message carries the index path, e.g.
`fields[3].name`.

Two Pydantic bases worth knowing: `_Base` is `extra="forbid", populate_by_name=True` — unknown
keys in a definition are an error, which is why a typo'd option is rejected rather than ignored.
`_ReadBase` is `extra="allow", from_attributes=True`.

Field names are capped at **63 characters** by the regex (`{0,62}` after the first character).

---

## 8. Expressions — two different things called expressions

Do not conflate these. They are different languages in different files.

| | Template expressions | Policy conditions |
|---|---|---|
| File | `pawabase_core/templating.py` | `pawabase_core/policies/engine.py` |
| Syntax | `{{ path \| filter }}` | `{op: [left, right]}` JSON-ish |
| Used in | flow/step block config | `PolicyDef` rules |
| Evaluated by | `render()`, `evaluate_expression()` | `evaluate()`, `resolve()`, `lookup()` |

They share one primitive: `lookup()`.

### 8.1 `lookup()` — the shared path reader (engine.py:161-178)

"Read `a.b.0.c` out of nested mappings, lists and objects."

- `path == "now"` returns `datetime.now(UTC)` — a reserved word, not a context key;
- each `.`-separated part walks a Mapping via `get`, a list/tuple by digit index, or any other
  object via `getattr`;
- `None` anywhere returns the default;
- a missing key returns the default, using a `_MISSING` sentinel so a stored `None` is
  distinguishable from an absent key.

So `auth.user.email`, `record.items.0.sku` and `now` are all valid paths.

### 8.2 Template expressions (templating.py)

Source docstring: "A template is a **lookup, not a language**: `{{ steps.fetch.output.id }}` reads
a value, and a small set of filters formats it. **A string that is entirely one template returns
the value itself, not its text**, so `"{{ input.items }}"` passes a list along unchanged."

That last sentence is the behaviour to write about: `"{{ x }}"` yields the value with its type
intact, while `"id is {{ x }}"` yields a string with the value interpolated. Embedded in a
larger string, a `dict` or `list` result is `json.dumps(..., default=str)`; a `None` result
becomes the empty string.

Filters are the complete set — `evaluate_expression` splits on `|`, then partitions each filter on
`:` for its argument:

| Filter | Result |
|---|---|
| `default` | the value unless it is `None` or `""`, else the literal argument |
| `upper` / `lower` | `str(value)` cased; `None` passes through unchanged |
| `json` | `json.dumps(value, default=str)` |
| `length` | `len(value)`, or `0` when `None` |
| `int` / `float` | cast, or `None` when the value is `None` or `""` |
| `str` | `""` when `None`, else `str(value)` |
| `bool` | `bool(value)` |
| `first` / `last` | `value[0]` / `value[-1]`, `None` when empty |
| `keys` | `list(value.keys())` for a Mapping, else `[]` |

An unknown filter raises `ValueError(f"unknown template filter {name!r}")`.

The `default` filter's argument is parsed as JSON first (`_literal`), so `default:0` yields the
integer `0` and `default:none` yields `None`.

The whole-string regex `_WHOLE` cannot contain `}}` inside the expression. Source comment: "The
expression may not contain `}}`: otherwise `{{ a }} · {{ b }}` would match as a single expression
`a }} · {{ b`." So an expression cannot contain a literal `}}`; split it across two templates.

`render()` recurses into lists and dicts, so a whole nested configuration object is templated
in one call.

### 8.3 Policy conditions (engine.py)

`SHORTHANDS = {"authenticated", "role", "permission", "owner", "service", "kind", "scope", "aal"}`
— eight bare keywords usable as a condition in their own right.

Structure, from `validate_condition`:

| Form | Shape |
|---|---|
| `all` / `any` | a **list** of conditions — anything else is `PolicyError` |
| `not` | a single condition |
| binary op | a **two-element list** `[left, right]` — `PolicyError` otherwise |
| unary op or shorthand | the bare keyword |
| anything else | `PolicyError(f"{path}: unknown operator {op!r}")` |

`matches` has an extra rule: if the right side is a string that does not start with `$`, it is
treated as a pattern rather than a context lookup.

`resolve(operand, context)` gives an operand its value: a string starting with `$` is a context
lookup (`lookup(context, operand[1:])`), a string starting with `$$` is a literal with one `$`
stripped, and anything else is already a literal. So `$` is the sigil for "look this up" and `$$`
escapes it.

Comparison operators seen in `_compare`: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. Note `ne`, not
`neq` — see `DATA_GROUND_TRUTH.md` for the same asymmetry in *filter* operators.

A `Decision` (engine.py:72) carries `allowed` ("Whether the operation may proceed") and
`filters` — "`{field: value}` equalities to add to the SQL `WHERE`". That pushdown is why a policy
that only matches some rows does not read the rest: the engine adds the equality to the query.

---

## 9. Resource definition (`api/database/models/definitions.py:68-109`)

`Resource` — "An application entity and its backend behaviour."

| Field | Type | Default | Meaning, from the source docstring |
|---|---|---|---|
| `environment` | FK, `related_name="resources"`, `CASCADE` | | |
| `table` | CharField(128) | | "The table in the environment's database" |
| `primary_key` | CharField(64) | `"id"` | |
| `id_type` | CharField(16) | `"integer"` | "`integer` or `uuid`" |
| `fields_` | AnyJSONField | `list` | column name `fields` via `source_field="fields"` |
| `operations` | AnyJSONField | `dict` | see below |
| `relations` | AnyJSONField | `list` | see below |
| `transformer` | AnyJSONField | `null` | "A transformer name or inline definition for responses" |
| `cache_ttl` | IntField | `0` | "Seconds to cache reads (0 is off). Writes invalidate." |
| `rate_limit` | AnyJSONField | `dict` | "`{"limit": 100, "window": 60}` per client, or empty" |
| `events` | Boolean | **`True`** | "Publish `<resource>.created\|updated\|deleted` events" |
| `realtime` | Boolean | **`False`** | "Publish changes to the `resource:<name>` channel" |
| `timestamps` | Boolean | **`True`** | "Maintain `created_at`/`updated_at` columns" |
| `owner_field` | CharField(64) | `null` | "Set this column to the caller's user id on create" |
| `tags` | AnyJSONField | `list` | |

Table `pb_resources`, `unique_together = (environment, name)`, `ordering = ["name"]`.

Note the Python/column name split: the attribute is `fields_` and the stored column is `fields`,
via `source_field`.

### 9.1 Operations are off until enabled

Source docstring, verbatim: `{"list": {"enabled": true, "policy": "public"}, "create": {...}}`.
"**Operations are off until enabled.**"

This is the single most consequential default in the data plane: declaring a resource does not
expose it. Until `operations` says `enabled: true` for an operation, that operation is not served.

`events` and `timestamps` default **on**; `realtime` defaults **off**.

### 9.2 Relations

Source docstring, verbatim:
`[{"name": "author", "resource": "users", "field": "author_id", "type": "belongs_to"}]`, used by
`?expand=`.

### 9.3 The other definition types in the same file

Every one is a `_Definition` subclass (definitions.py:17) keyed by `name` within an environment,
and every one uses `unique_together = (environment, name)` with `ordering = ["name"]`.

| Class | Table | `related_name` | Payload column | Docstring |
|---|---|---|---|---|
| `SchemaDef` | `pb_schemas` | `schemas` | `fields_` → column `fields`, default `list` | "A reusable schema: field definitions (see `pawabase_core.schemas`)" |
| `TransformerDef` | `pb_transformers` | `transformers` | `definition`, default `dict` | "A reusable declarative transformer" |
| `PolicyDef` | `pb_policies` | `policies` | `condition`, default `dict` | "A reusable policy condition" |
| `Resource` | `pb_resources` | `resources` | see §9 | "An application entity and its backend behaviour" |
| `RouteDef` | `pb_routes` | `routes` | — | "A custom API route served by a flow or a Python function" |
| `Flow` | `pb_flows` | `flows` | — | a flow |
| `Bucket` | `pb_buckets` | `buckets` | see below | "A storage bucket in the environment's storage" |
| `MailTemplate` | `pb_mail_templates` | `mail_templates` | — | a mail template |
| `EventSubscription` | `pb_event_subscriptions` | `subscriptions` | — | reacts to a published event |
| `WebhookEndpoint` | `pb_webhook_endpoints` | `webhooks` | — | outbound webhook target |
| `InboundHook` | `pb_inbound_hooks` | `inbound_hooks` | — | inbound webhook receiver |
| `Schedule` | `pb_schedules` | `schedules` | see below | "Scheduled work, run by Sillo's scheduler in the scheduler process" |

The three reusable pieces each hold exactly one payload column: `fields_` for a schema,
`definition` for a transformer, `condition` for a policy. That is why the Studio sidebar lists
Schemas, Transformers and Policies as separate sections — they are three kinds of named fragment,
not three views of one thing.

### 9.4 Bucket (definitions.py:155) — the storage model

| Field | Type | Default | Docstring meaning |
|---|---|---|---|
| `environment` | FK, `related_name="buckets"`, `CASCADE` | | |
| `public` | Boolean | `False` | "Anyone may read (writes still follow `write_policy`)" |
| `read_policy` | AnyJSONField | `null` | policy reference |
| `write_policy` | AnyJSONField | `null` | policy reference |
| `accepts` | AnyJSONField | `list` | "Content types accepted after sniffing (empty is anything)" |
| `max_bytes` | BigIntField | `0` | "Largest object (**0** is the environment's default)" |
| `signed_uploads` | Boolean | **`True`** | direct-to-storage uploads |

Source comment, verbatim: "read_policy, write_policy: Policy references; conditions see
`object.key` and `object.segments`."

Three defaults worth writing about:

- `public=False` — a bucket is private until declared otherwise.
- `max_bytes=0` means "inherit the environment default", not "unlimited". An actual zero-byte
  limit is not expressible this way.
- `accepts` empty means **anything**, and it is decided *after sniffing*, so the declared list is
  a check on content rather than on the client's `Content-Type`.
- `public=True` grants read to everyone but writes still go through `write_policy` — the two are
  independent, which is the point.

`object.key` and `object.segments` are the context keys a bucket policy can filter on.

### 9.5 Schedule (definitions.py:272)

"Scheduled work, run by Sillo's scheduler in the scheduler process."

| Field | Type | Default | Notes |
|---|---|---|---|
| `environment` | FK, `related_name="schedules"`, `CASCADE` | | |
| `cron` | CharField(64) | **null** | "A cron expression, or" |
| `interval_seconds` | IntField | **null** | "an interval" |
| `target_type` | CharField(16) | | "`flow`, `function` or `event`" |
| `target` | CharField(255) | | the named target |
| `payload` | AnyJSONField | `null` | "Input for the flow or function, or the event payload" |
| `enabled` | Boolean | `True` | |
| `last_run_at` | DatetimeField | `null` | |
| `last_status` | CharField(20) | `null` | |
| `run_count` | IntField | `0` | |

Both `cron` and `interval_seconds` are nullable and the docstring presents them as alternatives
("A cron expression, **or** an interval"). Two nulls is not a valid schedule — the choice between
them is not captured by the column definitions alone, so read `api/app/scheduler.py` before
claiming what happens if both are null.

---

## 10. Functions (`api/database/models/functions.py`)

### 10.1 FunctionDeployment

"One uploaded, content-addressed Functions artifact for an environment." Source comment, verbatim:
"**The artifact itself is kept in the configured code volume; this record is the durable
control-plane history and deliberately never stores source in the platform database.**"

| Field | Type | Default |
|---|---|---|
| `id` | CharField(32), pk | |
| `environment` | FK, `related_name="function_deployments"`, `CASCADE` | |
| `branch` | CharField(63), indexed | `"main"` |
| `checksum` | CharField(64), indexed | content address |
| `status` | CharField(16) | `"building"` |
| `runtime` | CharField(64) | `"python3.11"` |
| `entrypoint` | CharField(255) | `"functions"` |
| `manifest` / `limits` | AnyJSONField | `dict` |
| `error` | TextField | `""` |
| `activated_at` / `removed_at` | DatetimeField | null |
| `created_by` | CharField(255) | null |

Table `pb_function_deployments`.

The `branch` field means a function is versioned alongside definitions, on the same branch
vocabulary — a function deploy belongs to a branch, not to an environment.

### 10.2 FunctionRun

"One invocation record, including safe structured logs and failures."

| Field | Type | Default |
|---|---|---|
| `id` | CharField(32), pk | |
| `project` / `env` | CharField(63), indexed | |
| `branch` | CharField(63) | `"main"` |
| `function` | CharField(128), indexed | |
| `deployment_id` | CharField(32) | null |
| `trigger` | CharField(32) | |
| `status` | CharField(16) | `"running"` |
| `input` / `output` | AnyJSONField | null |
| `error` | TextField | null |
| `logs` | AnyJSONField | `list` |
| `duration_ms` | FloatField | null |
| `request_id` / `job_id` | CharField(128) | null |

Table `pb_function_runs`. `request_id` and `job_id` are what let you join a run to the request or
queue job that caused it.

---

## 11. Architecture — service ownership (`ARCHITECTURE.md:37-46`)

The service table, condensed. "Owns" column is the source's own wording.

| Service | Directory | Owns |
|---|---|---|
| **Gateway** | `gateway` | "Public routing, API-key resolution, signed platform context, CORS, rate limiting, request ids, WebSocket proxying. **No business logic.**" |
| **Pawabase API** | `api` | "Projects and environments, the project-configuration authority, Resources and the data plane, custom routes, schemas, transformers, policies, functions, flows, events, webhooks, queues, jobs, scheduler, cache, storage, secrets, API keys, mail, Atlas docs." |
| **Worker** | `api` (`python -m app.worker`) | "Runs Sillo `QueueWorker`s: flows, functions, webhook delivery, mail, event processing." |
| **Scheduler** | `api` (`python -m app.scheduler`) | "Runs Sillo's `SchedulerManager`, loading schedules from the database." |
| **Akountz** | `akountz` | "Identity: users, passwords, tokens, sessions, verification, reset, magic links, OAuth/OIDC, MFA (TOTP), recovery codes, organizations, teams, invitations, roles, permissions, login history." |
| **Angula** | `angula` | "Realtime: channels, topics, publish/subscribe, presence, channel authorization, inspection." |
| **Studio** | `studio` | "The control plane UI (Sillo + `sillo-inertia` + React)." |
| **Kit** | `pawabase_core/` | "Shared code, **not a service or an installable package**: policy engine, flow engine and blocks, schema compiler, transformers, service authentication, context propagation, telemetry and service bootstrap." |

Worker and Scheduler share the `api` directory and differ only by module. That is why
`scripts/dev.sh` can run the scheduler inline (`PAWABASE_INLINE_SCHEDULER=true`) with no sixth
process — see `GROUND_TRUTH_installation.md` §3.

`ARCHITECTURE.md` section map, for cross-referencing: 1 Services, 2 Requests and identity
(2.1 Public surface, 2.2 Credentials, 2.3 Context propagation), 3 Sillo mapping (incl. "Where
Pawabase adds code, and why"), 4 Organizations/projects/environments/infrastructure,
5 Resources and the data plane, 6 Flows and blocks, 7 Events, 8 Realtime (Angula),
9 Observability, 10 Extending Pawabase.

---

## 12. Cross-links this section may use

Only pages that exist in `docs.json`. Verified present:

`/concepts/mental-model`, `/concepts/organizations`, `/concepts/projects-and-environments`,
`/concepts/studio`, `/concepts/architecture`, `/concepts/credentials`,
`/concepts/request-lifecycle`, `/concepts/definitions-as-data`, `/concepts/expressions`,
`/concepts/glossary`, `/installation/local-development`, `/installation/docker`,
`/quickstart`, `/tutorial/first-project`, `/data/overview`, `/data/field-types`,
`/policies/overview`, `/auth/overview`, `/flows/overview`, `/storage/overview`,
`/realtime/overview`, `/reference/overview`.

Verify any link not on this list with `docs.json` before using it.

---

## 13. Corrections to the pages this ground truth replaces

Confirmed against the existing files. These are real errors, not stylistic preferences.

| Page | Error |
|---|---|
| `concepts/organizations` | 93 lines — a stub, not a page |
| `concepts/definitions-as-data` | describes the data plane without the `operations` enablement rule |
| `concepts/expressions` | conflates template expressions with policy conditions |
| `concepts/glossary` | 173 lines of bare word list, no definitions of why each matters |
| `concepts/credentials` | treats `Secret` and `ProjectKey` as the same kind of thing |
| `concepts/projects-and-environments` | no mention of `version` as the rebuild trigger, or of previews |
| `concepts/request-lifecycle` | describes the gateway as a router only; omits key resolution, `allowed_ips`, and the raw-key strip |
| `concepts/studio` | wrong sidebar labels (see §5 for the real ones) |
| `index` | 100 lines |
| `quickstart` | 317 lines, written as a numbered checklist |
| `installation/docker` | 240 lines, largely duplicates `installation/local-development` |
| `tutorial/first-project` | 362 lines |

---

## 14. Still to verify before writing

Do not write these pages until these are read. Each is a whole page's worth of claims.

- Flow internals — `pawabase_core/flows/` and the block set. Needed by `definitions-as-data`
  if it covers steps. `DATA_GROUND_TRUTH.md` records an authoritative flow-block count of **71**.
- `RouteDef`, `Flow`, `MailTemplate`, `EventSubscription`, `WebhookEndpoint`, `InboundHook` field
  lists — only `SchemaDef`, `TransformerDef`, `PolicyDef`, `Resource`, `Bucket` and `Schedule`
  were read in full (see §9).
- Storage driver mapping — how `Bucket` maps onto `sillo.storage` drivers and access policies
  (Private/Public/Owned/ReadOnly/Signed). `Bucket` has `public`/`read_policy`/`write_policy`; the
  driver-level policy vocabulary has **not** been checked against it.
- Field-type validation per type — `validate_fields` was read only to the point of the name check
  and the pattern constants (§7).
- Audit entry actions — the values `AuditEntry.action` can take.
- What Studio's **Overview** and **Database** panels actually show.
- Akountz's `AuthUser` and token/session models — **CLOSED, see §15** (read `users.py`,
  `framework.py` and `orgs.py` in full).

Closed since first draft: the two-organization split (§1.4), `SchemaDef`/`TransformerDef`/
`PolicyDef` (§9.3), `Bucket` (§9.4), `Schedule` (§9.5).

---

## 15. Akountz identity — the second organization's people (`akountz/database/models/`)

### 15.1 `AuthUser` (`users.py:23`)

`class AuthUser(PermissionMixin, UlidJWTUserMixin, UlidUserMixin, UserBaseModel)` — "A project
environment's user."

Module docstring, verbatim: "Pawabase adds tenancy: every user belongs to one project environment,
so an address may sign up once per environment rather than once per installation."

| Field | Type | Default | Docstring meaning |
|---|---|---|---|
| `id` | `ulid_pk()` | | |
| `project` | CharField(63), db_index | | the environment the account belongs to |
| `env` | CharField(63) | | |
| `email` | CharField(255), db_index | | "Unique per environment (Sillo's base makes them globally unique; these redefinitions scope them)" |
| `username` | CharField(150), db_index | | same scoping |
| `name` | CharField(200) | `""` | |
| `avatar_url` | CharField(2048), null | | |
| `phone` | CharField(32), null | | |
| `user_metadata` | AnyJSONField | `dict` | "Profile data the user may edit" |
| `app_metadata` | AnyJSONField | `dict` | "Data only the application (service keys, Studio) may edit" |
| `disabled_at` | DatetimeField, null | | "Set when an administrator disables the account" |
| `failed_logins` | IntField | `0` | "Brute-force lockout" |
| `locked_until` | DatetimeField, null | | |
| `mfa_enabled` | Boolean | `False` | |
| `last_sign_in_ip` | CharField(64), null | | |

Table **`akz_users`**, `unique_together = (("project","env","email"), ("project","env","username"))`.

`is_disabled` property: `self.disabled_at is not None or not self.is_active`.

The `user_metadata` / `app_metadata` split is the security-relevant one: the user may write the
first, only the application may write the second. Never put a role, entitlement or internal flag in
`user_metadata` — a user can edit it.

### 15.2 Identity, MFA, recovery, tokens, sessions, login history

| Model | Table | Key facts |
|---|---|---|
| `Identity` | `akz_identities` | "An external identity (OAuth/OIDC) linked to a user." `provider` + `subject`, `email_verified` Bool, `data` dict, `last_sign_in_at`. `unique_together (project, env, provider, subject)` |
| `MfaFactor` | `akz_mfa_factors` | "A second factor. **TOTP secrets are encrypted at rest.**" `kind` CharField(16) default `"totp"`, `secret_ciphertext` TextField, `confirmed_at`, `last_used_step` BigIntField(0), `friendly_name` default `"Authenticator app"` |
| `RecoveryCode` | `akz_recovery_codes` | "A single-use MFA recovery code, **stored as a SHA-256 hash**." `code_hash` CharField(128) db_index, `used_at` |
| `OneTimeToken` | `akz_one_time_tokens` | "A single-use token for verification, recovery, magic links, invitations and MFA challenges." Docstring: "The token itself is signed with Sillo's `URLSafeTimedSerializer` and carries this row's id; **the row makes it single-use**." `purpose` CharField(32), `user` FK **null**, `email` null, `data` dict, `expires_at`, `used_at` |
| `SessionInfo` | `akz_sessions` | "What Pawabase knows about one token family (a session)." `family` CharField(64) **primary_key**; `method` CharField(32); `aal` CharField(8) default `"aal1"`; `org` CharField(63) null; `ip`; `user_agent` CharField(512); `last_refreshed_at`; `revoked_at` |
| `LoginEvent` | `akz_login_events` | "Authentication history: sign-ins, failures, refreshes, sign-outs, resets." `kind` CharField(32), `method` CharField(32) default `"password"`, `success` Bool default `True`, `reason` CharField(255) null. `ordering = ["-id"]` |

`SessionInfo` docstring: "Sillo's `JWTToken` rows carry the family's rotation and revocation state;
this row adds the device, the assurance level, and how the session began."

Source comment on `SessionInfo.org`, verbatim — and it is the identity/tenancy bridge:

```python
# The organization (slug) this session's tokens are issued for, if any.
# Refreshes keep it; a refresh or sign-in that names another org switches it.
```

`aal` defaults to `"aal1"` — the assurance level, so an MFA-verified session is distinguishable
from a password-only one.

### 15.3 Sillo's permission and JWT models, ULID-keyed (`framework.py`)

"Same tables, same columns and the same methods as Sillo's own (these are subclasses), with a ULID
primary key instead of an auto-increment integer." `adopt()` then rebinds Sillo's module attributes
so `Permission.assign`, `JWTToken.revoke_family` and the rest use these tables. **"Sillo's own
classes are not registered with the database."**

| Subclass | Table | Notes |
|---|---|---|
| `Permission` | `permissions` | |
| `Group` | `perm_groups` | overrides `get_or_create` because Sillo's calls `super(cls, cls)`, which on a subclass lands back in Sillo's override |
| `UserPermission` | `user_permissions` | |
| `UserGroup` | `perm_user_groups` | `unique_together (user_id, group)` |
| `GroupPermission` | `perm_group_permissions` | `unique_together (group, permission)` |
| `JWTToken` | `jwt_tokens` | `user_id` CharField(26) db_index |
| `TokenBlacklist` | `token_blacklist` | |

### 15.4 The two organizations, side by side — the contrasts that matter

| | **Platform** (`api/database/models/orgs.py`) | **Akountz** (`akountz/database/models/orgs.py`) |
|---|---|---|
| Roles | `("viewer","developer","admin","owner")` | `("owner","admin","member","viewer")` |
| Role semantics | source states it is **cumulative**: "A role can do everything the ones before it can" | no such statement in source — do not claim it |
| Org table | `pb_organizations` | `akz_organizations` |
| Org columns | `slug`, `name`, `created_by` — **no project/env** | `project`, `env`, `slug`, `name`, `metadata`, `created_by` |
| Org uniqueness | `slug` **unique platform-wide**, db_index, `ordering ["slug"]` | `unique_together (project, env, slug)` |
| Membership | `OrgMember`, `pb_org_members`, `related_name="members"` | `Membership`, `akz_memberships`, `related_name="memberships"` |
| Role column | CharField(**16**), default **`"developer"`** | CharField(**32**), default **`"member"`** |
| User link | `user_id` CharField(**64**), db_index — a bare id | a real **ForeignKey** to `AuthUser` |
| Invitation token | `token_hash` CharField(64) **unique**, db_index — "Only the token's hash is stored" | `token_id` CharField(32) — an **id reference** to an `akz_one_time_tokens` row |
| Teams | none | `Team` (`akz_teams`) and `TeamMember` (`akz_team_members`), both `unique_together` per org/team |

Five contrasts worth writing about, because each is a place where merging the two systems would
produce a bug rather than a style complaint:

1. **Platform orgs have no `project`/`env`; Akountz orgs have both.** A platform org is global; an
   Akountz org is scoped to one environment.
2. **Default roles differ**: `developer` versus `member`, so code that assumes a default will
   produce a different authorization outcome on each side.
3. **The platform stores a member as a bare `user_id`; Akountz uses a foreign key.** Akountz
   membership therefore cascades on user deletion; platform membership does not.
4. **Invitations use different mechanisms** — a hash versus a reference to a single-use token row.
   Akountz invitations share the `OneTimeToken` single-use machinery; platform invitations do not.
5. **Only Akountz has teams.** There is no team concept on the platform side at all.

---

## 16. Projects and environments (`api/database/models/projects.py`, `api/routes/platform/projects.py`)

### The two levels

A **project** is one application backend: a stable reference, a name, a description, an owner
organization. An **environment** is one isolated stage of it, holding its own data, keys,
secrets, and copy of every definition. Keeping them apart is the point.

### Naming patterns — three different regexes

| Thing | Pattern | Length | Start | Allows |
|---|---|---|---|---|
| Project ref | `^[a-z][a-z0-9-]{1,62}$` | 2–63 | lowercase letter | lowercase, digits, hyphens |
| Environment name | `^[a-z][a-z0-9_-]{0,62}$` | 1–63 | lowercase letter | lowercase, digits, hyphens, **underscores** |
| Secret name | `^[A-Z][A-Z0-9_]{0,127}$` | 1–128 | capital letter | capitals, digits, underscores |
| Preview ref | `^[a-z0-9][a-z0-9-]*$` | 1–48 | digit **or** lowercase | lowercase, digits, hyphens |

`PROJECT_REF_PATTERN` and `NAME_PATTERN` live in `api/routes/common.py:53-54`. A project ref
**cannot** contain an underscore; an environment name can. A preview ref may start with a digit
(e.g. a branch named `4821-fix`); nothing else may.

### Model fields

| Model | Table | Fields |
|---|---|---|
| `Project` | `pb_projects` | `ref`, `name`, `description`, `created_by`, `organization` (nullable FK, `on_delete=RESTRICT`) |
| `Environment` | `pb_environments` | `project` (FK, CASCADE), `name`, `is_default`, `infra`, `auth`, `settings`, `version`, `preview_source`, `preview_expires_at` |
| `ProjectKey` | `pb_project_keys` | UUID PK, `role` (`publishable`/`secret`), `prefix` (`full[:14]`), `key_hash`, `expires_at`, `revoked_at`, `scopes`, `allowed_ips`, `allowed_routes`, `last_used_at`, `use_count` |
| `Secret` | `pb_secrets` | `name`, `value` (encrypted), `description`, unique `(environment, name)` |

`Project.organization` is nullable **only** so pre-organization databases can migrate; those
projects are adopted by the first organization created. `RESTRICT` means an org with projects
cannot be deleted — which is why "deleting one cascades outward" is **wrong**.

`Environment.project` uses `on_delete=CASCADE`, so deleting an environment takes its keys and
secrets with it.

### Defaults on creation

```python
DEFAULT_ENVIRONMENTS = ["development", "production"]
```

**Two environments, no `staging`.** Duplicates collapsed via `dict.fromkeys` (order preserved);
first distinct name becomes the default. Each gets `settings={"public_docs": False}` plus
`Default publishable key` and `Default secret key`.

### Organization is required from an operator

`resolve_org()` (`projects.py:178-190`): a named `org` is used; with no operator a
`default` org is created on demand; an **operator** with no `org` gets
`422 choose the organization the project belongs to (org)`. Creating a project requires the
`developer` role (the one place that is true — everything else is `admin`).

### Immutability

`ProjectUpdate` accepts `name` + `description` only → `ref` is immutable.
`EnvironmentUpdate` accepts `infra`, `auth`, `settings`, `is_default` only → **`name` is
immutable too**. Environments are renamed by creating a new one and promoting into it.

Config sections **merge** per section; keys whose new value is `null` are dropped. The merge is
shallow — a nested object is replaced wholesale.

`is_default` is enforced by clearing siblings in the same write (`projects.py:477-481`).

### Environment `version`

Starts at 1, bumped by `bump()`. Read by compiled APIs, engines, and caches.

### `audit()` vs `changed()` — which actions bump the version

| Helper | Effect |
|---|---|
| `audit()` (`common.py:158`) | One `AuditEntry` |
| `changed()` (`common.py:182`) | `bump(environment.id)` **then** audit. Docstring: "A definition changed: bump the version and audit it." |

Exactly **four** actions use `changed()`: `environment.updated` (:486), `environment.promoted`
(:533), `secret.set` (:635), `secret.deleted` (:649).

Everything else uses `audit()` alone — including `key.created`, `key.revoked`,
`environment.created`, `environment.deleted`, `preview.created`, `preview.deleted`,
`project.*`, `code.reloaded`. **Minting a key does not bump the version.** Adding a sibling
environment does not bump its siblings' versions. The version tracks definitions, not
management activity.

### Full audit action set

`project.created`, `project.updated`, `project.deleted`, `project.blueprint_exported`,
`code.reloaded`, `environment.created`, `environment.updated`, `environment.promoted`,
`environment.deleted`, `preview.created`, `preview.deleted`, `key.created`, `key.revoked`,
`secret.set`, `secret.deleted`.

`project.deleted` and `environment.deleted` are audited **before** the delete, so the record
outlives the thing deleted.

### Deploy previews

`expires_in_hours` default **72**, range **1–720**. Default name `pr-{ref}`.

- Definitions are **cloned** from the source.
- `infra` and `auth` come **only** from the request body — never copied.
- `settings` merge over the source, with `public_docs` forced `False`.
- Preview keys are created already expiring at the same moment, so they die with it.
- Deleting checks **both** `project_id` and `preview_source == source.name`; either failing is
  `404 no such deploy preview`. You cannot delete `production` by calling it a preview.

### Promotion — the 12 kinds

```python
KINDS = {schemas, transformers, policies, resources, routes, flows,
         buckets, mail_templates, subscriptions, webhooks, inbound_hooks, schedules}
```

Ten matched on `name`; **`routes` on `(method, path)`**; **`inbound_hooks` on `slug`**.

Renaming a route therefore creates a **second** route in the target rather than updating.

`copy_definitions` **upserts and never deletes**. Deleting a definition in the source leaves it
in the target. Treat promotion as "bring these across", not "make the target identical".

`include` filters by kind; an unmatched name is **not an error** — check the `copied` counts.

### SKIP columns

```python
SKIP = {"id", "environment_id", "created_at", "updated_at", "deleted_at",
        "received", "last_received_at", "last_run_at", "last_status", "run_count"}
```

`received`/`last_received_at` are inbound-hook counters; `last_run_at`/`last_status`/
`run_count` are schedule state. A promoted schedule does not look overdue and a promoted inbound
hook does not look flooded.

### Never promoted

API keys, secrets, records/tables, users, sessions, organization memberships, and target-side
migrations. Keys and secrets belong to the environment that issued them.

Caveat: `mail_templates` bodies travel, so promoting them into production means production can
send real mail to real recipients.

### Secrets

`SECRET_NAME = ^[A-Z][A-Z0-9_]{0,127}$` → `422 secret names are UPPER_SNAKE_CASE`. **Names**
1–128 chars; **values** 1–65,536 chars, sealed with the platform box, stored as ciphertext.
Setting returns `{"name", "reference": "secret://NAME"}`; listing returns **no values**, only a
masked `preview`.

Setting an existing name **replaces** (Studio: `Replace {name}`). Because `infra`/`auth` hold
`secret://NAME` references, rotating a value needs **no config change**. A `secret://`
reference is **not validated** against existing secrets — deleting the secret leaves it dangling.

### API keys

`generate_api_key(prefix="pb_pk" if role == "publishable" else "pb_sk")`; only
`key_hash` + `prefix = full[:14]` stored; plaintext returned once at creation. UUID PK, so key
routes take the UUID.

`active` is **computed**, not stored: `revoked_at is None and (expires_at is None or
expires_at > now)`. Revoke sets `revoked_at` and keeps the row.

`allowed_ips` validates address or CIDR → `422 invalid IP address or CIDR: 10.0.0.0/33`.
`allowed_routes` accepts `/path/*` or `METHOD /path/*`, method ∈
`{*, GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS}` → `422 route rules must be '/path/*' or 'METHOD /path/*'`.

**Empty restrictions mean unrestricted.** `scopes`, `allowed_ips`, `allowed_routes` all default
empty.

Publishable key = browser-safe, **policies still apply**. Secret key = server-side,
**bypasses policy evaluation**. This is why the two roles exist.

### Listing projects — who sees what

`GET /projects` (`projects.py:204-213`): `?org=<slug>` filters to one org (membership
checked); otherwise an operator is filtered to their orgs via `my_org_ids`; a **service
credential has no operator, so `my_org_ids` returns `None` = unrestricted = all projects**.
Returns `{"data": [...]}`.

### The two project shapes

`project_view(project, **extra)` (`:166-175`) adds the `org` slug. `environments` is a list of
**names** unless the caller passes full views — `GET /projects` gives names,
`GET /projects/{ref}` gives full `environment_view` objects.

`environment_view` (`:192-197`) **replaces the internal `project` FK id with `project.ref`**.
`project_id` never appears in output. Management output is keyed by the ref.

### Creation responses (201 via `created()`)

Project create returns `dump(project)`, `org`, `environments` (**request order after dedupe**),
`keys` (`{env_name: {publishable, secret}}`, plaintext, once), `blueprint`.

Environment create returns the env view, a **fresh** `keys` pair (never the source's), and
`copied`. A new env is **not** default.

So creation order (`["staging","development"]`) can differ from later `GET` order (alphabetical).

### Blueprints

Applied at **creation only**. Parsed before anything is created → `422 this is not a valid
blueprint`. An **apply** failure **deletes the project** and clears the cache → `422` with
`{"message", "where", "problem"}` (`:265-276`). Both 422s share that shape.

Export: `GET /projects/{ref}/envs/{env}/blueprint`, params `data` (default false) and
`max_rows` (default 200) → `400 max_rows must be an integer`.

### Deletion rules

- Project: `admin` (not `owner`), no soft delete.
- Environment: `409 a project keeps at least one environment` when it is the last
  (`:494-496`).
- `platform.envs.forget(...)` on project delete, failed blueprint, and env changes.

### Model ordering

| Model | Ordering |
|---|---|
| `Project` | `["ref"]` |
| `Environment` | `["name"]` |
| `Secret` | `["name"]` |
| `AuditEntry` | `["-id"]` (newest first) |
| `ProjectKey` | **none declared** — do not claim key ordering |

Alphabetical ≠ lifecycle: `production` < `staging`; `development` < both; `pr-*` groups early.

### Studio labels (verified)

`New project`, `New environment`, `Promote…`, `Promote definitions`,
`Promote {from} → {to}`, `New key`, `New secret`, `Replace {name}`.
Promote button disabled until source≠target. The environment sidebar has **no `Team` entry** —
teams live at the org level.

### Corrections made while writing this page

1. **"deleting one cascades outward"** in `concepts/organizations.mdx` is wrong. Platform
   org deletion is `RESTRICT`ed by projects and guarded by an emptiness check. Akountz org
   deletion is the one that cascades (no emptiness check).
2. **ProjectKey has no model ordering** — remove any "keys are ordered by `-created_at`" claim.

---

## 17. Architecture (`ARCHITECTURE.md`, all 284 lines)

### The governing rule

**Sillo first**: if Sillo or a first-party Sillo package ships the primitive, Pawabase uses it
and adds the product around it. Every design decision traces to this.

### Services table (`ARCHITECTURE.md:37-46`)

| Service | Directory | Owns |
|---|---|---|
| Gateway | `gateway` | Public routing, API-key resolution, signed platform context, CORS, rate limiting, request ids, WebSocket proxying. **No business logic** |
| Pawabase API | `api` | Projects/environments, project-config authority, Resources + data plane, custom routes, schemas, transformers, policies, functions, flows, events, webhooks, queues, jobs, scheduler, cache, storage, secrets, API keys, mail, Atlas docs |
| Worker | `api` (`python -m app.worker`) | Sillo `QueueWorker`s: flows, functions, webhook delivery, mail, event processing |
| Scheduler | `api` (`python -m app.scheduler`) | Sillo `SchedulerManager`, schedules from the database |
| Akountz | `akountz` | Identity: users, passwords, tokens, sessions, verification, reset, passwordless links, OAuth/OIDC, MFA (TOTP), recovery codes, orgs, teams, invitations, roles, permissions, login history |
| Angula | `angula` | Realtime: channels, topics, pub/sub, presence, channel authorization, inspection |
| Studio | `studio` | Control plane UI |
| Kit | `pawabase_core/` | Shared code — **not a service, not an installable package** |

Worker and Scheduler run the **API image as separate processes**, not separate services: they own
no separate domain. Separate because of scaling/failure characteristics. Running the scheduler in
every web process causes duplicate firing.

### The nine public path prefixes (`ARCHITECTURE.md:60-70`)

| Path | Upstream |
|---|---|
| `/auth/v1/*` | Akountz |
| `/rest/v1/*` | API data plane |
| `/storage/v1/*` | API storage |
| `/functions/v1/*` | API function invocation |
| `/flows/v1/*` | API flow invocation |
| `/hooks/v1/*` | API inbound webhooks |
| `/realtime/v1/*` | Angula (HTTP + WebSocket) |
| `/docs/v1/*` | Atlas docs for the calling project |
| `/platform/v1/*` | API management plane (Studio, CLI, automation) |

`/platform/v1/*` is the management plane and takes operator credentials, not application keys.

### Context propagation (`ARCHITECTURE.md:84-101`)

Gateway resolves `apikey` against the API (cached), then forwards
**`X-Pawabase-Context`**: a short-lived JWT signed with the internal secret carrying
`{project, env, key_id, role, scopes}`.

**Internal services trust only the signed header, never a raw key.** User tokens travel untouched
in `Authorization: Bearer` and are validated statelessly.

| Backend | Validates |
|---|---|
| `ContextBackend` | The signed platform context |
| `ProjectUserBackend` | A user access token |
| `ServiceBackend` | Short-lived service tokens (Studio→services, API→Angula/Akountz) |

All three are Sillo `AuthenticationBackend` implementations.

### Per-environment signing keys

`signing_key = HMAC(master_secret, "<project>:<env>")`. A `development` token can never be
accepted by `production` — different signing key, fails verification before any lookup.

Platform operators are Akountz users of the reserved **`_platform`** project.

### Ports and health

| Service | Port |
|---|---|
| api / akountz / angula | 8001 / 8002 / 8003 |
| gateway | **8080** |
| studio | **8090** |

| Endpoint | Ports | Meaning |
|---|---|---|
| `/health` | 8001, 8002, 8003, 8090 | That one service is up |
| `/v1/status` | 8080 | Gateway up + health of everything behind it |

**There is no `/health` on the gateway** — bootstrap *calls* `/health` on others
(`gateway/app/bootstrap.py:85`). No-Docker path binds `127.0.0.1` only.

No-Docker runs **five** processes with **no worker and no scheduler process**: inline worker
defaults `True`, and `dev.sh` exports `PAWABASE_INLINE_SCHEDULER=true`.

Docker dev stack adds `postgres:16-alpine` (5432), `redis:7-alpine` (6379), `minio` (9000/9001);
app services all from `pawabase:dev`. Volumes: `postgres`, `minio`, `api-data`, `vite-modules`.
Gateway waits for api, akountz, angula.

### Two databases, and resource data is a third thing

`pawabase` (api) and `akountz` (akountz). Resource data lives in the environment's own
`database_url`, per-environment Tortoise clients; no-Docker default is
`sqlite://$STATE/data/{project}__{env}.db`.

### Storage

One remote bucket per environment; every Pawabase bucket is a key prefix
`<project>/<env>/<bucket>/`. Presigned against `PAWABASE_STORAGE_PUBLIC_ENDPOINT` (browser-facing)
which differs from the internal endpoint the API uses. Default from `PAWABASE_STORAGE_*`;
Docker install → MinIO; API outside Docker → local disk.

### Resources

Five operations: `list`, `get`, `create`, `update`, `delete`. **Nothing is public by default**;
every enabled operation governed by a policy whose default is `authenticated`.

List supports `?filter[status]=eq.active`, `?sort=-created_at`, `?page=2&per_page=50`.
Policies comparing record fields to auth values are **pushed down into SQL** so pagination stays
correct.

Compilation turns a project environment into a real `SilloApp`: operations become Sillo routes
with generated models, custom routes run flows/functions, policies become a `useAuth` subclass,
Sillo generates OpenAPI, Atlas renders it.

### Flows

`@xyflow/react` shape so Studio edits directly. Eight triggers: HTTP route, resource operation,
event, realtime event, schedule, job, inbound webhook, manual run.

Templates reference `{{ input }}`, `{{ auth }}`, `{{ vars }}`, `{{ steps.<id>.output }}`,
`{{ secrets }}`, `{{ env }}`. **Templates are lookups, not a language** — real logic needs a
Python function block.

### **71 flow blocks** — authoritative

```python
from pawabase_core.flows.blocks import ALL_BLOCKS
len(ALL_BLOCKS)          # 71
len({b.name for b in ALL_BLOCKS})   # 71 — no duplicates
```

Assembled as `[*triggers.BLOCKS, *control.BLOCKS, *data.BLOCKS, *platform.BLOCKS]`, registered by
`register()`, loaded via the `pawabase.blocks` entry point.

| Source | Claim | Verdict |
|---|---|---|
| `ALL_BLOCKS` | **71** | Authoritative |
| `ARCHITECTURE.md` | "40+" | Imprecise |
| `README.md` | "58 blocks" | **wrong** |
| `concepts/glossary.mdx` | 58 | **wrong** |
| `DOCS_AUDIT.md` | 64 | **wrong** |

### Events

`EventBus` wraps Sillo's `EventEmitter`. `persistent` = Redis list, **at-least-once**;
`memory` = tests and single-process dev. The processor records every event (origin, payload,
consumers, outcomes) **before** fanning out to flows, functions, jobs, outbound webhooks, realtime.

At-least-once ⇒ subscribers can see duplicates. Side effects outside Pawabase must be idempotent.

### Realtime

`/realtime/v1/socket`; verbs `subscribe`, `unsubscribe`, `publish`, `presence`, `history`.
Channels are `sillo-wire` rooms. Access decided by policies matched against channel patterns
(`chat:*`, `user:{auth.user_id}`) — checked **on subscribe**, so revoking access does not
retroactively disconnect. Servers publish over HTTP. Multi-instance via Redis `EventEmitter`.
Realtime-enabled resources publish `resource:<name>` on create/update/delete.

### Where Pawabase wrote code instead of using Sillo

Policy engine (ABAC rules; Sillo gives enforcement points), flows/blocks, schema compiler,
transformers, TOTP (`pyotp`), job tracking + DB-backed `FailedJobRepository`. Gateway proxying
uses `httpx` streaming directly because `HTTPClient` returns parsed bodies.

### Gates

`useAuth` subclass = per-route policy. `OperatorGate` = per-project operator access.
Non-members get **404**, not 403. Service credentials are not tied to an organization.

### Corrections found in source docs while writing this page

1. **`ARCHITECTURE.md:74-75` key prefixes are stale.** It says `pk_…` / `sk_…`. The real
   prefixes are **`pb_pk` / `pb_sk`** (verified in `api/routes/platform/projects.py`).
2. **Block count is 71, not 58 or "40+"** (see table above). `README.md` and
   `concepts/glossary.mdx` both need correcting.
3. **`self-hosting/production-checklist.mdx` uses `/_health`.** Real path is `/health`.
4. Platform organizations are **unrelated** to Akountz's per-project end-user organizations.

---

## 20. Words to never use

powerful, seamless, effortless, robust, blazing, cutting-edge, magic, supercharged,
"blazingly fast", enterprise-grade, world-class, delightful, "just", "simply".

`DATA_GROUND_TRUTH.md` places this at **§20**, not §19 — §19 there is "Studio-side record
browse/edit endpoints". Its house-style section cites §19 for the hype list, which is wrong.
Cite §20.