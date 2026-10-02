# VERIFIED GROUND TRUTH — Build → Data docs

Every fact below was read from source in `/Users/admin/sillo.build/pawabase` on 2026-10-01.
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
- Internal links are absolute-from-root: `/data/field-types`, `/policies/overview`, `/flows/...`.
  Only link to pages that exist (149 pages; the full list is `docs.json`).
- No hype words (see §19). No marketing voice. Be direct and specific.
- Tables are heavily encouraged — they are the densest correct way to convey this material.

---

## 1. What a Resource is (api/database/models/definitions.py)

`Resource` row in table `pb_resources`, unique per `(environment, name)`. Fields:

| Column | Type | Default | Meaning |
|---|---|---|---|
| `name` | varchar(128) | — | API name. Becomes the URL segment `/rest/v1/<name>`. |
| `description` | text | `""` | Shown as the route summary in OpenAPI. |
| `table` | varchar(128) | `name` | Table in the environment DB. Set to `body.table or body.name`. |
| `primary_key` | varchar(64) | `id` | Column identifying a record. |
| `id_type` | varchar(16) | `integer` | `integer` or `uuid`. |
| `fields_` | JSON | `[]` | Stored as DB column `fields`. Field definitions. |
| `operations` | JSON | `{}` | Per-operation `{"enabled": bool, "policy": ref}`. |
| `relations` | JSON | `[]` | `[{"name","resource","field","type"}]`. |
| `transformer` | JSON | `null` | Name (string), inline definition (dict), or null. |
| `cache_ttl` | int | `0` | Seconds. 0 = off. |
| `rate_limit` | JSON | `{}` | `{"limit": n, "window": s}` or `{}`. |
| `events` | bool | `True` | Publish `<resource>.created|updated|deleted`. |
| `realtime` | bool | `False` | Publish to `resource:<name>` channel. |
| `timestamps` | bool | `True` | Maintain `created_at`/`updated_at`. |
| `owner_field` | varchar(64) | `null` | Column set to caller's user id on create. |
| `tags` | JSON | `[]` | Extra OpenAPI tags. |

- `OPERATIONS = ("list", "get", "create", "update", "delete")`. An operation is registered only if
  `settings.enabled` is truthy. **Operations are off until enabled.**
- `RESERVED_RESOURCE_NAMES = {"docs", "openapi.json", "x", "rpc", "health", "internal", "platform"}`
  — saving a resource with one of these names is rejected.
- Validation on save (`validate_resource`): reserved name → 422; `validate_fields` errors → 422;
  every `operations.<op>.policy` is checked as a policy ref; a dict `transformer` is validated;
  each relation must have `name`+`resource`+`field`, and `type` ∈ `{belongs_to, has_many}`;
  a non-empty `rate_limit` must have a `limit`.


## 2. Studio UI (studio/frontend/src/lib/kinds.js, components/definitions/forms.jsx)

- Resources live under **Build → Resources**. List columns: **name, table, description**.
- Section label "Resources", description: "Tables exposed as REST at /rest/v1/<name>, guarded per
  operation by policies."
- Button: **"New resource"**; empty state: **"No resources yet"** / "Create the first one".
- `ResourceForm` sections, in order: **Details**, **Fields**, **Access**, **Relations**,
  **Behaviour**.
  - **Details**: **Name** (mono, autofocused, placeholder `todos`, disabled once created; hint is
    `Served at /rest/v1/<name>` while new, "The URL segment; fixed once created." afterwards);
    **Table** (optional, mono, hint "Defaults to the name.", stores `null` when cleared);
    **Primary key** (mono, placeholder `id`); **ID type** — a `Segmented` control with exactly two
    options: **Auto-increment** (`integer`) and **UUID** (`uuid`); **Description** (optional,
    placeholder "What rows live here?").
  - **Fields**: section description reads `The primary key and created_at / updated_at are added
    for you.` (or `The primary key is added for you.` when Timestamps is off). Contains the
    `FieldsEditor`.
  - **Access**: description "Which endpoints exist, and who may call each." One row per operation
    in `OPS` order, each row = an On/Off `Switch` + the HTTP method badge + the operation key
    (`list`, `get`, `create`, `update`, `delete`). When a row is on, a `PolicyPicker` appears whose
    empty label is **"Secret keys only"**; when off, the row shows the hint
    **"Off: the endpoint is not served."** There is no all/none toggle.
  - **Relations**: description "Include related rows with ?expand=name." One sunken card per
    relation with **Name** (mono, placeholder `author`), **Kind** — a `Segmented` of
    **Belongs to** / **Has many** —, **Resource** (a `RefSelect` over resources), and a **Foreign
    key** field whose label changes with the kind: **"Foreign key here"** for belongs_to,
    **"Foreign key on <resource>"** for has_many. A trash button labelled "Remove relation", and an
    **"Add relation"** row button.
  - **Behaviour**: a form-grid containing **Emit events** (checked unless `events === false`, hint
    `<name>.created / updated / deleted`), **Broadcast changes** ("Push row changes to realtime
    subscribers."), **Timestamps** ("Maintain created_at and updated_at."), **Owner field**
    (optional `RefSelect` over this resource's own fields, empty label "None", hint "Filled with
    the caller's user id on create."), **Transformer** (optional `RefSelect` over transformers,
    hint "Reshapes rows in responses."), **Cache responses** (the `CacheTtl` control), the
    **Rate limit** control, and **Tags** (optional `TagInput`, hint "Groups endpoints in the API
    docs.", placeholder `billing`).
- The `Definitions.jsx` sheet has a **JSON** tab beside the form, and it is the *same body* the
  API stores — the form and the JSON never disagree.
- Client-side `problem()` guard: name required; unnamed fields (including nested `object` fields)
  block save with "Every field needs a name."
- `RouteForm` sections, in order: **Endpoint**, then the input/response/handler sections. The
  **Endpoint** section has one **"Method and path"** control — a method `<select>`
  (GET/POST/PUT/PATCH/DELETE, default POST) plus a literal `/rest/v1` addon and a path input, with
  the hint "Served under /rest/v1. Use {param} for path parameters."

### Data-plane error bodies (api/app/compiler/errors.py) — important and often gotten wrong

The data plane **does not wrap errors in an envelope**. The JSON body is exactly the exception's
`detail`:
- **401 / 403 / 404 / 409 and most other non-validation errors**: a bare JSON **string**, e.g.
  `"Not found"`. Not `{"detail": ...}`.
- **422**: a bare JSON **array** of Pydantic error items, each `{type, loc, msg, input, url}` —
  e.g. `[{"type":"missing","loc":["title"],"msg":"Field required", ...}]`.
- The `{"error": ..., "message": ..., "details": ...}` shape is used by the **platform/management
  plane** and by flow error bodies, not by resource routes.
- Do not claim a `409 Conflict` on the resource write path: the resource compiler registers no
  `IntegrityError` mapping, so a unique-constraint violation surfaces as the driver's own error
  (a 400 from `SqlError`-adjacent handling or a 500), not a mapped 409. `CONFLICT` exists in
  `errors.py` as a reusable group but is not wired into the resource routes.

### Field row UI (components/definitions/FieldsEditor.jsx) — exact labels

`FIELD_TYPES` (value, label, dot glyph, colour):
`string` "Text (short)", `text` "Text (long)", `integer` "Integer", `number` "Number",
`boolean` "Yes / no", `datetime` "Date & time", `date` "Date", `uuid` "UUID", `email` "Email",
`url` "URL", `json` "JSON", `array` "List", `object` "Object", `ref` "Schema reference".

Each row: reorder arrows, type dot, name input (`mono`, placeholder `field_name`, turns
`.invalid` when the name doesn't match `^[A-Za-z_][A-Za-z0-9_]*$`), a type `<select>` of those 14
labels, a **Required** checkbox, then "More options" / trash.
The **More options** panel labels, by type:
- always: **Description** (optional, placeholder "Shown in the API docs"), **Default**
  (placeholder "No default"; boolean is a segmented None/Yes/No; for `json`/`array`/`object`/`ref`

## 3. Field types and validation (pawabase_core/schemas.py)

`FIELD_TYPES` is a 14-tuple exactly as above (the machine values are the lowercase keys).

Type → Python annotation (`_python_type`):

| type | annotation |
|---|---|
| `string` `text` `email` `url` | `str` |
| `integer` | `int` |
| `number` | `float` |
| `boolean` | `bool` |
| `datetime` | `datetime` |
| `date` | `date` |
| `uuid` | `UUID` |
| `json` | `Any` |
| `array` | `list[<item>]` (item from `items`, `Any` when absent) |
| `object` | nested `create_model` from `fields` |
| `ref` | the referenced schema's compiled model |
| any type with `enum` | `Literal[tuple(enum)]` — **overrides the type entirely** |

Constraints (`_constraints`) → Pydantic `Field(...)` kwargs, applied **only to these types**:
- `pattern`, `min_length`, `max_length` → `string`, `text`, `email`, `url`
- `minimum`, `maximum` → `integer`, `number`, `datetime`, `date`
- `description` → `description`; `example` → `examples`
- `max_length` default is **255** when omitted on `string` (`spec.get("max_length") or 255`) — this
  is also the `VARCHAR(n)` width on Postgres/MySQL.
- `email` auto-sets `pattern = ^[^@\s]+@[^@\s]+\.[^@\s]+$` if no `pattern` given;
  `url` auto-sets `^https?://[^\s]+$`.

Name rules (`validate_fields`, regex `^[A-Za-z_][A-Za-z0-9_]{0,62}$`): must match; duplicates
rejected; unknown `type` rejected; `array.items` validated recursively (as a single field named
`item`); `object.fields` validated recursively; `ref` without `schema` rejected; an uncompilable
`pattern` is rejected at save time.

**Compile modes** (`compile_model(name, fields, mode=...)`):
- `create` — enforces `required`, **rejects unknown fields** (`extra="forbid"`), drops
  `read_only` fields. A field is required only if `required` is true AND there is no `default`.
- `update` — every field optional (partial update); drops `read_only`; **drops unset fields**
  (`exclude_unset=True` in `validate_payload`) so a PATCH never nulls what it didn't mention.
- `read` — describes responses: drops `write_only`, allows extra keys, `from_attributes=True`.
- `any` — types only.
- `nullable`: `spec.get("nullable", not required)` on create; **forced True** for
  update/read/any.
- `required` + no default → required; else `default` on create; else `None`.

## 4. Storage mapping (api/app/data/sql.py)

Dialects: `sqlite`, `postgres`, `mysql`. `dialect_of()` maps by client module name
(`sqlite` / `asyncpg|psycopg|postgres` / `mysql`; default `sqlite`).

| type | sqlite | postgres | mysql |
|---|---|---|---|
| `string` | TEXT | VARCHAR(n) [n = max_length or 255] | VARCHAR(n) |
| `text` | TEXT | TEXT | TEXT |
| `email` | TEXT | VARCHAR(320) | VARCHAR(320) |
| `url` | TEXT | TEXT | TEXT |
| `integer` | INTEGER | BIGINT | BIGINT |
| `number` | REAL | DOUBLE PRECISION | DOUBLE |
| `boolean` | INTEGER | BOOLEAN | BOOLEAN |
| `datetime` | TEXT | TIMESTAMPTZ | DATETIME(6) |
| `date` | TEXT | DATE | DATE |
| `uuid` | TEXT | UUID | CHAR(36) |
| `json`/`array`/`object`/`ref` | TEXT | JSONB | JSON |

`JSON_TYPES = {"json", "array", "object", "ref"}` — all four collapse to the `json` column type.

## 6. The compiled REST surface (api/app/compiler/resources.py)

Registered under the data-plane prefix; the public path is `/rest/<version>/...` with `v1` default
(`REST_PATH = ^/rest/(?P<version>v[1-9][0-9]*)(?:/|$)` — only `v1`, `v2`, … exist).

| method | path | operation |
|---|---|---|
| GET | `/rest/v1/<resource>` | list |
| GET | `/rest/v1/<resource>/{id}` | get |
| POST | `/rest/v1/<resource>` | create |
| PATCH | `/rest/v1/<resource>/{id}` | update |
| DELETE | `/rest/v1/<resource>/{id}` | delete |

`PUT` is also registered on the item path but `exclude_from_schema=True`, so it is not in the
public docs; PATCH is the documented partial update.

List query parameters (exact names and defaults):
- `page` int, default 1, `ge=1` — "Page number, from 1"
- `per_page` int, **default 20**, `ge=1`, `le=200` — "Records per page" (`MAX_PAGE_SIZE = 200`)
- `sort` string — "Comma-separated fields; prefix with - for descending"
- `select` string — "Comma-separated fields to return" (the primary key is appended if missing)
- `expand` string — "Comma-separated relations to include"

Get's only query parameter is `expand`. Create/update take a JSON body validated by the compiled
Pydantic model. Delete returns **204 No Content**.

List response body: `{"data": [...], "page": n, "per_page": n, "total": n | null}`.
`total` is `null` whenever the policy left a per-row residual (see §8) — the DB count would then
be wrong. When a resource has a transformer, the response is the transformer's shape and there is
**no generated page model** (`page_model=None`), so OpenAPI does not claim a fixed envelope.

`id` coercion (`_coerce_id`): for `id_type: integer`, a non-digit id string is a **404 Not Found**,
not a 422.

Policy gate: each operation gets a `PlanGate` whose required API-key scope is `resource:read` for
list/get and `resource:write` for create/update/delete. A key lacking the scope gets 403.

## 7. Filtering (api/app/data/store.py)

**The syntax is `?filter[<field>]=<operator>.<value>`.** A bare value means `eq`.

`FILTER_OPERATORS = ("eq","neq","gt","gte","lt","lte","like","ilike","in","nin","is","isnot")`

| op | meaning | notes |
|---|---|---|

## 9. Policy pushdown and `total: null` (pawabase_core/policies/engine.py)

`PolicyEngine.plan(ref, context)` returns a `ListPlan(allowed, filters, residual, policy)`.
`pushdown()` splits a residual condition into `{column: value}` equalities that become SQL `WHERE`
filters, and whatever is left over:
- `{"eq": ["$record.owner_id", "$auth.user_id"]}` becomes a SQL filter on `owner_id`.
- Anything not an equality between a record field and a known value stays a **residual** checked
  per row in Python (`row_allowed()`).
- If the policy refuses outright with no context involvement, `allowed=False` and the gate 403s
  before any query runs.

When a residual survives, `list` filters rows in Python and sets `total = None`, because the
database's count includes rows the residual would remove. `get` re-checks `plan.filters` against
the loaded record and the residual against it; a mismatch is a **404**.

## 10. Relations and `?expand=`

A relation is `{"name": str, "resource": str, "field": str, "type": "belongs_to" | "has_many"}`.
- `belongs_to` (the default): `field` is the FK column **on this table**.
- `has_many`: `field` is the FK column **on the target table**.

Expansion (`_expand`):
- `belongs_to`: collects the distinct non-null FK values across the page, one `get_many` on the
  target's primary key (`IN` query, capped at `MAX_PAGE_SIZE=200`), then attaches by stringified id.
  A row with a null FK or an id the caller may not read gets `null`.
- `has_many`: one `get_many` on the target's `field` with all parent ids, then grouped by
  stringified FK. Unreadable children are simply absent from the list.
- **Every expanded row answers to the target resource's own read policy** (`get` settings, else
  `list` settings, else default `authenticated`) and is shaped by the *target's* transformer
  (`_readable`). If the target has no public read at all, only **service credentials** see the
  expansion; everyone else gets `null`/`[]`. This is deliberate: an expansion must not be a side
  door around the target's policy.
- Unknown relation name in `expand` → **400** "posts has no relation 'comments'".
- Expansion is a second/third query per relation, not a join.

## 11. Transformers (pawabase_core/transformers.py)

`STEPS = ("omit", "pick", "set", "rename", "case")` — and they always run in **that fixed order**,
regardless of the order they appear in the JSON.

| step | argument | effect |
|---|---|---|
| `omit` | list of names | remove those keys |
| `pick` | list of names | keep only those keys (intersected with what's present) |
| `set` | object name → template | add/overwrite; the value is a template rendered with context plus `record` |

## 12. Caching

- `cache_ttl: 0` (default) = off. Studio allows 0–86,400 seconds.
- `get` cache key: `res:<resource>:get:<sha256 of [user identity, key role, id, expand]>`.
- `list` cache key: `res:<resource>:list:<sha256 of [identity, role, sorted query params]>`.
- `cache_key()` (`compiler/common.py`) always folds in the caller's identity (`user.identity`, or
  `"anon"`) and the API key's role, so **cached reads never cross users**.
- Cache is tagged `resource:<name>` (from `resource_tag()`). **Any** write to the resource calls
  `after_write` → `cache_invalidate([resource:<name>])`, regardless of which field changed.
- Writes performed by raw SQL in Studio's console invalidate **every** resource's tag.
- The cache is Sillo's cache, backed by Redis when `PAWABASE_REDIS_URL` is set; otherwise it is an
  in-process store, which means each API process caches separately.

## 13. What happens after a write (api/app/resources.py)

`after_write(platform, state, resource, change, record, actor=, request_id=)` runs after **every**
write — REST, a flow's `resource.*` block, a function, a `db.transaction`, or Studio's own record
editor. In order:
1. Invalidate the `resource:<name>` cache tag.
2. If `events` is on → emit `<resource>.<change>` where change ∈ `created|updated|deleted`, payload
   `{"resource","change","record"}`, with actor and request id.
3. If `realtime` is on → publish on the `resource:<name>` channel with the same payload. Realtime is
   **best-effort**: a publish failure is logged as a warning and the write still stands.

## 14. Migration behaviour (api/app/data/store.py `migrate`)

Triggered by `POST /platform/v1/projects/{ref}/envs/{env}/resources/{name}/migrate` (operator
only, audited as `resource.migrated`). It is **additive only**:
- If the table does not exist → `CREATE TABLE IF NOT EXISTS` with the primary key, every declared
  field (skipping the key and timestamp columns), the timestamp columns, then indexes.
- If it exists → for each field in `field_map` not present in the live table, `ALTER TABLE ... ADD
  COLUMN`. **Columns are never dropped and never retyped.** The docstring is explicit that this is a
  decision for a person looking at a migration, not a button.
- Then, for every field with `indexed` or `unique`, `CREATE INDEX` / `CREATE UNIQUE INDEX`
  (name `ix_<table>_<column>` truncated to 60 chars; `IF NOT EXISTS` on sqlite and postgres, not
  on mysql).
- Then, if `owner_field` is set, an index on it.

## 15. Your database (api/app/data/source.py)

- Each environment has its own connection, keyed by URL in `DataSourcePool`; the URL comes from
  the environment's `infra.database_url`, else `PAWABASE_DEFAULT_DATA_URL`.
- Connections are opened lazily on first use and reused. `DataSourceError` on a bad URL or an
  unreachable database. A SQLite `file_path`'s parent directories are created automatically.
- `PAWABASE_DEFAULT_DATA_URL` is formatted with `{project}` and `{env}` at runtime
  (`state.py`), so each environment gets its own file/namespace.
- Docker default is `postgres://pawabase:${POSTGRES_PASSWORD}@postgres:5432/pawabase`;
  `scripts/dev.sh` uses `sqlite://$STATE/data/{project}__{env}.db`.
- `api/app/config.py` `ApiSettings`: `default_data_url` default is
  `postgres://pawabase:pawabase@127.0.0.1:5432/pawabase`, `storage_root` `storage/objects`,
  `code_path` `code`, `query_timeout` 15.0, `max_upload_bytes` 50 MiB.
- **Pawabase's own platform database is separate from your resource data.** The platform DB holds
  projects, environments, keys, definitions, audit and observability; `PAWABASE_DATABASE_URL` for
  it. Resources live in the environment DB. Akountz has its own too.
- Settings live under **Settings → Infrastructure** in Studio; `database_url` is the environment
  setting (see `/reference/environment-settings`).

## 16. Studio's Database console (api/routes/platform/data.py + pages/Env/Database.jsx)

Nav: **Build → Database**. Page head: "Browse the environment's database. Bring your own with a
database URL in Settings."
- `GET .../database` → `{dialect, configured, tables: [{name, resource}]}`. `configured` is true
  when the environment set `infra.database_url`; Studio renders "your database" vs
  "platform default" under the table list. A table that backs a Resource shows a green badge with
  the resource name.
- `GET .../database/tables/{table}` → `{name, columns: [{name, type, nullable, default,
  primary_key}], indexes, foreign_keys, rows}`. Studio shows each column as a badge `name: type`
  with a 🔑 on the primary key, and a "· N rows" count in the card title.
- `GET .../database/tables/{table}/rows?limit=&offset=` — limit defaults 50, **max 500**; the UI
  pages 50 at a time with Prev/Next. Rows are decoded with `decode_value(None, v)`, i.e. without
  field-type knowledge, so a JSON column may come back as its raw string.

## 17. Custom routes (definitions.py `RouteDef`, api/app/compiler/routes.py)

Nav: **Build → Routes**. Columns: method, path, handler_type, handler.
Fields: `method` (default `POST`), `path` (must match `ROUTE_PATH`, e.g. `/orders/{id}/pay`),
`policy`, `input_fields` (JSON field list) **or** `input_schema` (a named schema),
`response_schema` (a named schema), `transformer`, `handler_type` (`flow` or `function`),
`handler` (the flow or function name), `rate_limit`, `cache_ttl`, `tags`, `enabled`
(default `True`), `name`, `description`.
- Unique per `(environment, method, path)`.
- Saved under the same `/rest/v1` prefix as resources.
- **A path that would shadow a resource's own routes (`/<resource>` or `/<resource>/{id}`) is
  rejected** (`shadows_resource` → 422).
- A named `input_schema`/`response_schema` must exist in the environment, else 422.
- `handler_type: flow` routes are served by running the flow; the flow's `trigger.http` node must
  carry the path. `handler_type: function` routes run Python.
- A flow with a `trigger.http` node that has **no** `path` is directly invocable at
  `POST /flows/v1/<name>` instead, defaulting to the `authenticated` policy unless the trigger
  sets one.
- Functions are invoked at `POST /functions/v1/<name>`, which requires the API key to carry the
  `functions:invoke` scope; both wrap the result as `{"data": result}`.
- `POST /rest/v1/...` routes return the flow's `response.return` verbatim (status + headers) if the
  flow used one, else `{"data": run.result()}`.

## 18. Events on resources

`<resource>.<change>` with `change` ∈ `created`, `updated`, `deleted`; payload
`{"resource": name, "change": change, "record": {...}}`. Emitted only when `events` is true
(default **true**). Subscriptions match on the event name; a webhook pattern like `todos.*` and
`user.created` both work. Subscriptions have their own `operations` list
(`["created","updated","deleted"]` default) when you want a narrower trigger.

## 19. Studio-side record browse/edit endpoints (operator only)

`GET/POST .../resources/{name}/records`, `PATCH/DELETE .../resources/{name}/records/{record_id}`.
Browse supports `page`, `per_page` (default 50, max 200), plus the same `filter[...]` and `sort`
syntax, returning `{data, page, per_page, total}`. `SqlError` → **400**. These run with service
rights — they bypass the resource's policies — but still fire `after_write`, so events, realtime
and cache invalidation are identical to a public API write.

`GET .../openapi` returns the environment's whole compiled OpenAPI document (operators may read it
regardless of `public_docs`). `GET .../resources/{name}/openapi` returns just that resource's paths.

## 20. Words to never use

powerful, seamless, effortless, robust, blazing, cutting-edge, magic, supercharged,
"blazingly fast", enterprise-grade, world-class, delightful, "just", "simply".

- `POST .../database/query` with `{"sql": str, "params": [...], "allow_write": bool}`.
  - `is_read_only()` (`app/data/inspect.py`): strips trailing `;`; **any remaining `;` → not
    read-only**; the statement must start with `select`, `with`, `explain`, `pragma`, `show` or
    `describe`; and it must not contain ` insert `, ` update `, ` delete `, ` drop `, ` alter `,
    ` create `, ` truncate `, ` grant `, ` attach `.
  - A non-read-only statement without `allow_write` → **400** "this statement writes; set
    allow_write to run it".
  - Read results are truncated to the **first 5000 rows** and `truncated: true` is set.
  - Timeout is `platform.settings.query_timeout` (15 s) → **504** "the query timed out". Any other
    driver error → **400** with `TypeName: message`.
  - A write is audited as `database.write` (first 2000 chars of SQL) and **invalidates every
    resource's cache tag**.
  - `sql` is bounded at 1–100,000 characters.
- The SQL modal has a **Query builder** that rewrites the SQL on each click (Studio tells you the
  next click replaces your hand edits), a hand-editable SQL box, an **allow writes** checkbox, and
  Cmd/Ctrl+Enter to run.
- Studio's own record editor (`RecordEditor` in Definitions.jsx) is field-type aware: text input,
  number, boolean select, `date`/`datetime-local` inputs, a textarea for `text`, and a
  **monospace JSON textarea for `object`/`array`/`json`** that parses on blur. Fields not in the
  definition are still shown, hinted `raw`. Saving goes through the same `after_write` path, so
  events, realtime and cache invalidation all still fire.

- All statements are returned to the caller in `{"resource","table","statements"}` so you can see
  exactly what ran.
- `SqlError` → **422** from the migrate endpoint.
- Changing a field's type, removing a field, or renaming a field therefore does **nothing** to the
  database. Those are manual SQL operations in the console.
- `field_map` includes the primary key, timestamp columns and `owner_field` even when not declared.

| `rename` | object old → new | move the key |
| `case` | `"camel"` or `"snake"` | re-case **every** remaining key |

Validation (`validate_transformer`): unknown step → error naming the allowed set; `omit`/`pick`
must be a list; `set`/`rename` must be an object; `case` must be `camel` or `snake`.

Resolution order for a transformer *reference* (`apply_transformer`):
1. `None` → data unchanged.
2. A **Python transformer registered in this process** wins first (`@transformer("name")`,
   signature `(record, context) -> dict`, may be async; applied per item for lists).
3. Then a **stored** transformer of that name in the environment's registry.
4. Otherwise `TransformerError`: "unknown transformer 'name'".

A transformer's `definition` may also be given **inline** as a dict on the resource or route.
Templating for `set` uses `pawabase_core.templating.render` with `{{ }}` and the state includes
`record` plus the policy context (`auth`, `credential`, `request`, `project`).

| `eq` | equals | the implicit default |
| `neq` | not equal | **`neq`, not `ne`** |
| `gt` `gte` `lt` `lte` | ordering | inclusive for gte/lte |
| `like` | pattern | `*` is rewritten to `%`; client-side `%`/`_` also pass through |
| `ilike` | case-insensitive | real `ILIKE` on postgres; **degrades to `LIKE` on sqlite/mysql** |
| `in` `nin` | in / not in a set | value is split on `,`; a list is also accepted internally |
| `is` `isnot` | `null`, `true` or `false` | anything else → `SqlError` "is/isnot take null, true or false" |

- Multiple `filter[...]` params **AND** together.
- An unknown field → `SqlError`: "cannot filter on unknown field '<name>'" → **400**.
- Filtering is only possible on declared fields (`field_map`), which includes the primary key,
  `created_at`/`updated_at` when timestamps are on, and `owner_field`.
- **There is no `$or`, no negation, no nested filter grouping, and no full-text search.** Multiple
  values of one field AND together; use `in` for alternatives. OR requires a custom route/flow.
- Filters cannot touch inside a `json`/`array`/`object` column.
- The dots in `op.value` are parsed with `partition(".")`, so the first dot separates. A value that
  itself contains a dot works only for `in`/`nin` (split on `,`) or when the operator prefix is
  unrecognised (then the whole raw string is the `eq` value).

## 8. Sorting and pagination

- `sort=-created_at,title` → `[("created_at", True), ("title", False)]`. `-` = descending,
  `+` or bare = ascending. Comma-separated, whitespace stripped. Unknown field → `SqlError`
  "cannot sort on unknown field '<name>'" → **400**.
- With no `sort`, ordering defaults to the **primary key ascending** — stable, but not
  business-meaningful.
- Pagination is offset-based: `offset = (page - 1) * per_page`, capped at `per_page <= 200`.
  There is **no cursor pagination**.
- `store.list` also runs a separate `COUNT(*)` (same WHERE) to fill `total`. Every list request
  therefore costs two queries unless a residual makes `total` null.
- `get()` runs a filtered list with `limit=1, count=False`.

There is **no native array column and no composite/row column** anywhere.

Primary key DDL: integer → sqlite `INTEGER PRIMARY KEY AUTOINCREMENT`, postgres
`BIGSERIAL PRIMARY KEY`, mysql `BIGINT AUTO_INCREMENT PRIMARY KEY`; uuid → sqlite `TEXT`, postgres
`UUID`, mysql `CHAR(36)`. A field with `unique: true` gets `UNIQUE` appended to its column
definition.

Codecs (`encode_value` / `decode_value`):
- JSON types: `json.dumps(value, default=str)` in, `json.loads` out (falls back to the raw string
  if it doesn't parse).
- `boolean`: sqlite stores `int(bool(v))`; others store real bools. Decoded with `bool(value)`.
- `datetime`: naive input is **assumed UTC** (`replace(tzinfo=UTC)`); a trailing `Z` is
  normalised. sqlite stores ISO-8601 text; mysql converts to UTC and **drops tzinfo**; postgres
  gets a tz-aware datetime. Decoded to `.isoformat()`.
- `date`: sqlite stores ISO text, others a date. Decoded to `.isoformat()`.
- `uuid`: postgres gets a real `UUID`, elsewhere a string.
- `integer` → `int(value)`, `number` → `float(value)`.
- Decimal from the driver is decoded to `float`.

## 5. Identifiers and safety

`IDENTIFIER = ^[A-Za-z_][A-Za-z0-9_]{0,62}$`. `check_identifier()` raises `SqlError` on anything
else and is applied to table names, primary keys, index names and every column name used to build
SQL. All queries are **parameterised** (`get_parameterized_sql()`); values never enter SQL by
string formatting. `DataSource` keeps the connection URL (credentials included) and it is never
logged.

  the hint is "Set defaults for this type in JSON view."), **Example** (optional),
  **Read only**, **Write only**.
- text-like (`string`,`text`,`email`,`url`): **Min length**, **Max length**, **Pattern**.
- numeric/temporal (`integer`,`number`,`datetime`,`date`): **Minimum**, **Maximum**.
- `array`: an item editor (a nested `FieldsEditor` over `items`).
- `object`: **Nested fields** (a nested `FieldsEditor` over `fields`).
- `ref`: a `RefSelect` of the environment's schemas.
- The editor **strips** keys whose value is `undefined`/`""`/`null`/`[]`/`false`, so an empty
  pattern is dropped. Keys it doesn't know are carried through untouched — which is how
  `indexed`/`unique` survive editing in the form.
- Two toggles live in the field panel that are *not* types: **Indexed** and **Unique**
  (shown for scalar types). These affect DDL, not validation.
