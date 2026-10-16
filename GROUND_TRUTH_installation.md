# VERIFIED GROUND TRUTH — Installation & local development docs

Every fact below was read from source in `/Users/admin/sillo.build/pawabase` on 2026-10-04.
**Do not contradict this file.** If you cannot find a fact here, do not invent it — omit it, or
go read the source yourself. Never write a field name, port, path, env var, command or default
that is not in here or that you have not confirmed by reading source yourself.

Files read for this pass:

| File | What it settled |
|---|---|
| `scripts/dev.sh` | the no-Docker dev path, in full |
| `scripts/smoke.sh` | how a running install is verified |
| `docker-compose.dev.yml` | the Docker dev stack, in full |
| `docker-compose.yml` | production stack (referenced, not re-derived here) |
| `docker/dev.Dockerfile` | dev image, Python version, uv pin |
| `docker/entrypoint.sh` | how a service is started, and when migrations run |
| `docker/postgres/init.sql` | which databases exist on bundled Postgres |
| `.env.example` | the documented env surface |
| `pyproject.toml` | `requires-python`, workspace members, lint/test config |
| `api/app/config.py` | `ApiSettings` defaults, inline worker/scheduler |
| `api/app/bootstrap.py` | where inline worker/scheduler start and stop |
| `api/routes/platform/projects.py` | `DEFAULT_ENVIRONMENTS` |
| `pawabase_core/service.py` | where `/health` is registered |
| `gateway/app/bootstrap.py` | `/v1/status` |
| `pawabase_core/flows/blocks/__init__.py` | authoritative block count |
| `studio/frontend/src/components/Layout.jsx` | Studio navigation labels |

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
- Code fences: label every block with the language it actually contains. `bash`, `json`, and
  `python` dominate this docs set; `yaml`, `text`, `sql`, `typescript`, and `toml` are also in
  established use across existing pages. Do not label a YAML fragment as `bash` to satisfy a
  narrower rule — match the content.
- Internal links are absolute-from-root. Only link to pages that exist in `docs.json`.
- No hype words (see §20). No marketing voice. Be direct and specific.
- Tables are heavily encouraged — they are the densest correct way to convey this material.

---

## 1. The one decision that governs this page

There are exactly **two** supported ways to get a Pawabase development environment running, and
they differ in more than mechanism. Choosing wrongly costs an hour.

| | `scripts/dev.sh` | `docker compose -f docker-compose.dev.yml up` |
|---|---|---|
| Needs Docker | no | yes |
| Needs Postgres installed | no | bundled container |
| Needs Redis | no | bundled container |
| Object storage | local disk | bundled MinIO |
| Platform database | SQLite | Postgres 16 |
| Identity database | SQLite | Postgres 16 (`akountz`) |
| Resource data | SQLite, one file per project+env | SQLite on a volume, one file per project+env |
| Tables created by | `PAWABASE_DB_GENERATE_SCHEMAS=true` | `python -m database.migrate`, run by the entrypoint |
| Worker process | inline in the API process | separate `worker` container |
| Scheduler process | inline in the API process | separate `scheduler` container |
| Front end | built once by the script, or `npm run dev` | Vite container, hot reload |
| Startup cost | seconds | first build is minutes |
| Best when | you are writing Python | you want the real topology, or you are changing infra |

Both need only `uv` (or Docker) and Node. Neither needs a `.env`: every secret has a development
default. Copy `.env.example` to `.env` only to *override* one.

**There is no third path.** In particular there is no `pawabase` CLI that starts a development
environment. The `pawabase` command is the deploy CLI shipped by the separate `pawabase-python`
package (`pip install pawabase`); it is not on the PATH inside this repository's containers
either — `docker/entrypoint.sh` says so in a comment on purpose.

## 2. Prerequisites

| Requirement | Version | Source of truth |
|---|---|---|
| Python | **>=3.11** | `pyproject.toml` → `requires-python = ">=3.11"` |
| Node | 20+ | `README.md` → "Requires [uv](https://docs.astral.sh/uv/) and Node 20+" |
| uv | any recent | installed by you, or by the dev image at `>=0.8,<0.9` |
| Docker + Compose v2 | any recent | only for the Docker path |

`studio/frontend/package.json` declares **no** `engines.node` field. The Node 20+ figure is a
README statement, not an enforced constraint; CI uses Node 22 (`ci.yml`) and the Vite container
uses `node:22-slim`.

The dev image is `FROM python:3.11-slim` (`docker/dev.Dockerfile`).

<Warning>
The previous version of this page claimed **Python 3.12+**. That is wrong. `requires-python` is
`>=3.11` and the image is 3.11. On 3.12 the install succeeds but you are off the supported floor.
</Warning>

Install workspace dependencies once, from the repository root:

```bash
uv sync --all-packages
```

`[tool.uv.workspace] members` is `api`, `akountz`, `angula`, `gateway`, `studio`. `--all-packages`
is required — a plain `uv sync` at the root installs only the root package.

<Note>
The root project depends on `pawabase`, resolved from git, not PyPI:
`[tool.uv.sources] pawabase = { git = "https://github.com/Pawabase/pawabase-python" }`.
That is why `git` is installed in the dev image ("the Pawabase kit is installed from its
repository"). A shallow or firewalled clone will fail here, not at runtime.
</Note>

## 3. `scripts/dev.sh` — the no-Docker path

### 3.1 What it actually does

`scripts/dev.sh` is 51 lines. It exports a fixed set of environment variables, starts five uvicorn
processes, prints their URLs, and waits. Ctrl-C kills the whole set (a `trap` on `EXIT INT TERM`).

It is deliberately **not** a general-purpose script. It takes no arguments, has no flags, and no
service-selection mode. `PAWABASE_DEV_DIR` relocates state; `STUDIO_VITE` is the only switch.

### 3.2 The five processes

Started by `start <name> <port> [ENV=VALUE …]`, which runs
`uv run uvicorn app.main:app --host 127.0.0.1 --port <port> --log-level warning` inside each
service directory.

| Order | Service | Port | Extra environment |
|---|---|---|---|
| 1 | `api` | 8001 | `PAWABASE_DATABASE_URL=sqlite://$STATE/api.db`, `PAWABASE_DEFAULT_DATA_URL=sqlite://$STATE/data/{project}__{env}.db`, `PAWABASE_STORAGE_ROOT=$STATE/objects`, `PAWABASE_CODE_PATH=$ROOT/code` |
| 2 | `akountz` | 8002 | `PAWABASE_DATABASE_URL=sqlite://$STATE/akountz.db` |
| 3 | `angula` | 8003 | none |
| 4 | `gateway` | 8080 | none |
| 5 | `studio` | 8090 | none |

Two things are absent from that table, and their absence is the most important fact on this page:

- **No worker process.** The queue worker runs *inside* the API process, because
  `ApiSettings.inline_worker` defaults to `True` and `dev.sh` never overrides it. See §6.
- **No scheduler process.** The scheduler runs inside the API process because `dev.sh` explicitly
  exports `PAWABASE_INLINE_SCHEDULER=true`.

Every process binds `127.0.0.1`, not `0.0.0.0`. The no-Docker path is not reachable from another
machine, by design.

### 3.3 The environment it exports

**Verified from `scripts/dev.sh` lines 10–26.** Two groups, and the split decides whether an
override can work:

- **Defaulted** — uses `${NAME:-default}`, so a value already in your shell wins (7 variables).
- **Forced** — plain assignment, no `:-`, so the script's value always wins and anything you
  exported beforehand is discarded (6 variables).

`SILLO_ENV_FILE=""` is forced on purpose: it stops Sillo loading any `.env`, which is what makes
the built-in values authoritative for this path. `PAWABASE_PUBLIC_URL` being forced is the more
surprising member of that group — see §13.1, because it is the value people most want to change.

| Variable | Value set by `dev.sh` | Forced or defaulted | Why it is there |
|---|---|---|---|
| `PAWABASE_DEV_DIR` | `$ROOT/.dev` (read at line 11, before any export) | defaulted | where state and logs live |
| `PYTHONPATH` | `$ROOT` (+ existing) | defaulted, appended | so `pawabase_core` and `code` import from the working tree |
| `PAWABASE_APP_ENV` | `local` | defaulted | marks the environment as non-production |
| `PAWABASE_INTERNAL_SECRET` | `dev-internal-secret-change-me-please` | defaulted | signs service tokens and the gateway context |
| `PAWABASE_JWT_MASTER_SECRET` | `dev-jwt-master-secret-change-me-please` | defaulted | per-environment user token secrets derive from it |
| `PAWABASE_MASTER_KEY` | `dev-master-key-change-me-please-0000` | defaulted | encrypts environment secrets at rest |
| `PAWABASE_ADMIN_EMAIL` | `admin@pawabase.local` | defaulted | first Studio operator, created on first start |
| `PAWABASE_ADMIN_PASSWORD` | `Pawabase!admin1` | defaulted | as above |
| `SILLO_ENV_FILE` | `""` | **forced** | do not read a `.env` |
| `PAWABASE_DB_GENERATE_SCHEMAS` | `true` | **forced** | create tables at startup instead of migrating |
| `PAWABASE_PUBLIC_URL` | `http://127.0.0.1:8080` | **forced** | links in mail, OAuth callbacks, signed URLs |
| `PAWABASE_PUBLIC_GATEWAY_URL` | `http://127.0.0.1:8080` | **forced** | as above, gateway-specific |
| `PAWABASE_INLINE_SCHEDULER` | `true` | **forced** | one scheduler without a sixth process |
| `PAWABASE_VITE_DEV` | `true`, only when `STUDIO_VITE` is non-empty (line 26) | **forced** | point Studio at the Vite dev server |

Note `PAWABASE_VITE_DEV` is set on line 26 as `[ -n "${STUDIO_VITE:-}" ] && export PAWABASE_VITE_DEV=true`,
which is why a naive `grep '^export'` for it returns nothing. It is real.

The three secrets are development placeholders committed in a public repository. `PAWABASE_APP_ENV`
is `local`, not `production`, so the production guard that refuses to boot with a development
secret does not fire. Do not reuse these values anywhere else.

### 3.4 State on disk

`STATE="${PAWABASE_DEV_DIR:-$ROOT/.dev}"`, created with `mkdir -p "$STATE/logs"`.

```text
.dev/
├── logs/
│   ├── api.log
│   ├── akountz.log
│   ├── angula.log
│   ├── gateway.log
│   └── studio.log
├── api.db                 # platform database (SQLite)
├── akountz.db             # identity database (SQLite)
├── data/
│   └── {project}__{env}.db   # one file per project+environment, from {project}/{env} templating
└── objects/               # PAWABASE_STORAGE_ROOT — local-disk file storage
```

Per-service stdout and stderr go to `.dev/logs/<service>.log`. `--log-level warning` is passed to
uvicorn, so normal request logging is suppressed and anything you need is in those files. **There
is no combined log**; when something fails, read the one file for the service that owns it.

`<project>` and `<env>` in the data path are substituted at runtime from `PAWABASE_DEFAULT_DATA_URL`
by `api/app/state.py`. That is why resource data is isolated per environment with no extra
configuration.

Deleting `.dev/` is the supported reset. It destroys the platform database, the identity
database, every project's data and every stored object. Nothing is recoverable from it.

### 3.5 The front-end build

On startup, unless `STUDIO_VITE` is set:

```bash
if [ -z "${STUDIO_VITE:-}" ] && [ ! -f "$ROOT/studio/frontend/dist/.vite/manifest.json" ]; then
  (cd "$ROOT/studio/frontend" && npm install --no-audit --no-fund && npm run build)
fi
```

So the script builds the front end exactly once — when `studio/frontend/dist/.vite/manifest.json`
is absent — and never again. Subsequent runs reuse the build. If you edit React source without
setting `STUDIO_VITE`, you are editing files nothing is serving; rebuild by deleting
`studio/frontend/dist`.

`STUDIO_VITE=1` skips the build and sets `PAWABASE_VITE_DEV=true`, which tells Studio to load
scripts from the Vite dev server instead of the built manifest.

```bash
# built front end, everything on SQLite
scripts/dev.sh

# front end from `npm run dev`, hot reload
STUDIO_VITE=1 scripts/dev.sh
```

In the second mode you run `npm run dev` in `studio/frontend` yourself, in another terminal. The
script does not start Vite for you.

### 3.6 Signing in

```text
Studio   http://127.0.0.1:8090
Gateway  http://127.0.0.1:8080
Email    admin@pawabase.local
Password Pawabase!admin1
```

Note `127.0.0.1`, not `localhost`. `PAWABASE_PUBLIC_URL` is `http://127.0.0.1:8080` and it is what
signed URLs, mail links and OAuth callbacks are built from. Mixing `localhost` and `127.0.0.1` in
the same browser session produces cookies and redirects that appear to work and then fail.

On first sign-in Studio asks you to create an organization, because every project lives in one.
Then create a project with any reference you like.

## 4. `docker-compose.dev.yml` — the Docker path

### 4.1 Topology

Eleven services. Three are infrastructure, six are Pawabase, one is Vite, and one is a one-shot.

| Service | Image / build | Host ports | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | two databases; healthcheck `pg_isready -U pawabase -d pawabase` |
| `redis` | `redis:7-alpine` | 6379 | healthcheck `redis-cli ping` |
| `minio` | `minio/minio:latest` | 9000, 9001 | console on 9001; healthcheck `mc ready local` |
| `api` | `pawabase:dev` | 8001 | `command: ["api"]` |
| `worker` | `pawabase:dev` | — | `command: ["worker"]`; waits for `api` healthy |
| `scheduler` | `pawabase:dev` | — | `command: ["scheduler"]`; waits for `api` healthy |
| `akountz` | `pawabase:dev` | 8002 | own database `akountz` |
| `angula` | `pawabase:dev` | 8003 | depends on Redis only |
| `gateway` | `pawabase:dev` | `${PAWABASE_GATEWAY_PORT:-8080}` | waits for api, akountz, angula |
| `studio` | `pawabase:dev` | `${PAWABASE_STUDIO_PORT:-8090}` | `PAWABASE_VITE_DEV=true` |
| `vite` | `node:22-slim` | 5173 | `npm install && npm run dev -- --host 0.0.0.0` |

Named volumes: `postgres`, `minio`, `api-data`, `vite-modules`.

Every Pawabase service mounts `.:/app`. The source is bind-mounted, so Python edits are visible
without a rebuild and `PAWABASE_RELOAD=true` makes watchfiles restart just the service whose
directory changed.

<Note>
`vite-modules` is a named volume on `/app/studio/frontend/node_modules`. The bind mount would
otherwise shadow the container's `node_modules` with the host's (possibly absent, possibly
platform-mismatched) copy. The named volume keeps container-installed modules intact.
</Note>

### 4.2 The two databases

`docker/postgres/init.sql` is mounted into `/docker-entrypoint-initdb.d/10-databases.sql` and
contains exactly one statement beyond the comment:

```sql
CREATE DATABASE akountz OWNER pawabase;
```

So the bundled Postgres holds **two** databases:

| Database | Owner service | URL in compose |
|---|---|---|
| `pawabase` | api | `postgres://pawabase:pawabase@postgres:5432/pawabase` |
| `akountz` | akountz | `postgres://pawabase:pawabase@postgres:5432/akountz` |

Both URLs hardcode `pawabase:pawabase` in the **dev** file. `docker-compose.yml` uses
`${POSTGRES_PASSWORD}`. If you set `POSTGRES_PASSWORD` in `.env` and run the dev stack, the init
script has already run and your password will not match — see §9.

### 4.3 Resource data is still SQLite

The dev stack gives the API:

```yaml
PAWABASE_DEFAULT_DATA_URL: sqlite:///data/envs/{project}__{env}.db
PAWABASE_STORAGE_ROOT: /data/objects
```

on the `api-data` volume, which `api`, `worker` and `scheduler` all mount. So the platform
database and identity database are Postgres, but **resource data is SQLite on a shared volume**,
one file per project and environment.

That arrangement is deliberate: `worker` and `scheduler` must see the same resource tables the
API writes, and a shared file gives them that without a second Postgres database.

### 4.4 Storage is MinIO

The dev API env points at the bundled MinIO:

```yaml
PAWABASE_STORAGE_ENDPOINT: ${PAWABASE_STORAGE_ENDPOINT:-http://minio:9000}
PAWABASE_STORAGE_PUBLIC_ENDPOINT: ${PAWABASE_STORAGE_PUBLIC_ENDPOINT:-${PAWABASE_STORAGE_ENDPOINT:-http://localhost:9000}}
PAWABASE_STORAGE_BUCKET: ${PAWABASE_STORAGE_BUCKET:-pawabase}
PAWABASE_STORAGE_REGION: ${PAWABASE_STORAGE_REGION:-us-east-1}
PAWABASE_STORAGE_ACCESS_KEY: ${PAWABASE_STORAGE_ACCESS_KEY:-pawabase}
PAWABASE_STORAGE_SECRET_KEY: ${PAWABASE_STORAGE_SECRET_KEY:-pawabase-dev-minio}
PAWABASE_STORAGE_PATH_STYLE: ${PAWABASE_STORAGE_PATH_STYLE:-true}
```

Note that `PAWABASE_STORAGE_PUBLIC_ENDPOINT` defaults to `localhost:9000` while
`PAWABASE_STORAGE_ENDPOINT` defaults to `minio:9000`. The API talks to MinIO over the Docker
network; **browsers** get presigned URLs pointing at the host. Presigned URLs are signed for the
public endpoint, so this difference is required rather than incidental.

To use your own S3-compatible service, set `PAWABASE_STORAGE_ENDPOINT` (and the credentials) in
`.env`, then scale MinIO out: `docker compose -f docker-compose.dev.yml up --scale minio=0`.

### 4.5 What the dev stack does not set

The dev compose file does **not** set `PAWABASE_DB_GENERATE_SCHEMAS`. The API default is `False`
(`api/app/config.py`), so tables are created by the entrypoint running migrations instead — see
§5. If you copy that variable from `dev.sh` into your `.env` you will change which mechanism
provisions your schema.

### 4.6 Startup and rebuild

```bash
# first run builds the image; this takes minutes
docker compose -f docker-compose.dev.yml up

# after a pyproject.toml or uv.lock change only
docker compose -f docker-compose.dev.yml up --build
```

`depends_on` conditions are `service_healthy`, not `service_started`, and the healthcheck allows
`start_period: 20s` with 20 retries at 5s. Services wait for their dependencies to actually answer
`/health`, which is why a cold start looks stalled and then resolves.

## 5. How a service starts, and when migrations run

`docker/entrypoint.sh` installs as `/usr/local/bin/pawabase-service` and dispatches on `$1`.

| `$1` | What runs | Migrations |
|---|---|---|
| `api` | `uvicorn app.main:app` on `${PORT:-8001}` | `migrate api` first |
| `worker` | `python -m app.worker` (cwd `/app/api`) | none |
| `scheduler` | `python -m app.scheduler` (cwd `/app/api`) | none |
| `akountz` | `uvicorn app.main:app` on `${PORT:-8002}` | `migrate akountz` first |
| `angula` | `uvicorn app.main:app` on `${PORT:-8003}` | none |
| `gateway` | `uvicorn app.main:app` on `${PORT:-8080}` | none |
| `studio` | `uvicorn app.main:app` on `${PORT:-8090}` | none |
| `migrate` | nothing — runs both migrations and exits | `migrate api; migrate akountz` |
| anything else | usage message to stderr, `exit 64` | none |

The `migrate` function:

```sh
migrate() {
  if [ "${PAWABASE_MIGRATE:-true}" = "true" ]; then
    (cd "/app/$1" && python -m database.migrate)
  fi
}
```

So **migrations default to running** on `api` and `akountz` start, and `PAWABASE_MIGRATE=false`
opts out. To migrate by hand:

```bash
docker compose run --rm api migrate
```

That command runs the `migrate` branch, which migrates **both** databases and exits. There is no
per-service migration command; the single `migrate` argument always does api then akountz.

<Warning>
`self-hosting/upgrades.mdx` implies you can migrate a single service. You cannot. The `migrate`
branch takes no service name and always runs both, in that order.
</Warning>

Under `PAWABASE_RELOAD=true` (dev only), `serve` adds:

```sh
--reload --reload-dir "/app/$1" --reload-dir /app/pawabase_core \
  --reload-include "*.html" --reload-include "*.json"
```

and `run` wraps the command in `watchfiles --filter python "python $*" /app/api /app/pawabase_core`.
Both reload paths watch `pawabase_core`, which is why editing shared kit code restarts every
service rather than one.

In production `PAWABASE_RELOAD` is unset, so `serve` is a plain `exec uvicorn` with
`--proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}"`.

## 6. Worker and scheduler: two ways to get the same behaviour

This is the single most misread part of the development topology.

`ApiSettings` defaults (`api/app/config.py`):

```python
inline_worker: bool = True
inline_scheduler: bool = False
```

`api/app/bootstrap.py` reads both at startup and starts each in the API process when true; on
shutdown it stops them.

| | `scripts/dev.sh` | dev compose | production compose |
|---|---|---|---|
| `PAWABASE_INLINE_WORKER` | unset → `True` | `"false"` | `"false"` |
| `PAWABASE_INLINE_SCHEDULER` | `true` | `"false"` | `"false"` |
| Worker runs | inside API | `worker` container | `worker` container |
| Scheduler runs | inside API | `scheduler` container | `scheduler` container |

Consequences worth internalising:

- In the no-Docker path, **killing the API kills running jobs and schedules.** There is no
  separate process to survive it.
- In the Docker paths, exactly one `scheduler` container must run. `ARCHITECTURE.md` §12 of
  `docs/sillo-gaps.md` records that Sillo 1.0 has no lock primitive, so nothing stops two
  schedulers from double-firing every schedule. Scale `api`, `worker`, `akountz`, `angula` and
  `gateway` horizontally; keep the scheduler at one.
- `depends_on: api: {condition: service_healthy}` for both `worker` and `scheduler` means they
  never start against an unmigrated database.

## 7. Health and status

`pawabase_core/service.py` registers the health route for every service built by
`create_service`:

```python
app.get("/health", handler=_health(name), name="health", exclude_from_schema=True)
```

`exclude_from_schema=True` keeps it out of generated OpenAPI, which is why `/health` never appears
in a project's API documentation.

The gateway adds an aggregate at `/v1/status`:

```python
@app.get("/v1/status", summary="Health of every Pawabase service", tags=["gateway"])
```

It calls each service's `/health` with `timeout=3` and reports the aggregate. This is the endpoint
`scripts/smoke.sh` uses, and the one to use when you want one answer instead of five.

| Endpoint | Port | Meaning |
|---|---|---|
| `/health` | 8001, 8002, 8003, 8090 | that one service is up |
| `/v1/status` | 8080 | gateway is up, plus the health of every service behind it |

Note there is no `/health` on the gateway itself — `gateway/app/bootstrap.py:85` is the gateway
*calling* `/health` on the others, not defining one.

<Warning>
`self-hosting/production-checklist.mdx` uses `/_health`. The real path is `/health`, no underscore.
</Warning>

## 8. Verifying a running install

`scripts/smoke.sh` is the executable definition of "a Pawabase install works". It takes an admin
email, an admin password, and optionally a gateway URL and a Studio URL (both default to
`127.0.0.1`).

```bash
scripts/smoke.sh admin@pawabase.local 'Pawabase!admin1'
scripts/smoke.sh admin@example.com 'Ci!admin-pass1' https://gw.example.com https://studio.example.com
```

What it asserts, in order:

| Check | Assertion |
|---|---|
| gateway status | `GET {gateway}/v1/status` → `ok` is `True` |
| studio sign-in | `GET {studio}/login` sets a session; `POST {studio}/login` answers **302 or 303** |
| studio reachable | `GET /studio/api/platform/projects` succeeds |
| organization | `POST /studio/api/platform/orgs {"slug","name"}`; then `GET` it → `role` is `owner` |
| project | `POST /studio/api/platform/projects {"ref","org","name","environments":["main"]}` → returns `keys.main.publishable` |
| resource | `POST .../envs/main/resources` with a `notes` resource; then `POST .../resources/notes/migrate` |
| write through gateway | `POST {gateway}/rest/v1/notes` with header `apikey: <key>` |
| read through gateway | `GET {gateway}/rest/v1/notes` → `data[0].text` is `hello` |
| key required | `GET /rest/v1/notes` with no key → **401** |
| invitation | `POST .../orgs/$REF/invitations {"email","role":"viewer"}` → returns a `token` |
| sign-up through gateway | `POST {gateway}/auth/v1/signup` → returns `access_token` or `user` |

Facts this pins down that the prose docs frequently get wrong:

- The gateway accepts the API key in a header literally named **`apikey`**.
- Studio's own API is namespaced under **`/studio/api/platform/…`**.
- A successful Studio sign-in is a **redirect** (302/303), not a 200 with a token.
- A request with no API key is **401**.
- The resource definition posted by the smoke test enables only `list` and `create`, both with
  policy `public` — which proves policy names resolve and that `public` is a real policy.

`XSRF-TOKEN` is read out of the cookie jar and echoed as `X-XSRF-TOKEN` on every Studio POST. That
is the CSRF contract for cookie-authenticated Studio writes.

Running it twice is safe: the reference is `smoke$(date +%s)`, so each run creates a fresh
organization and project.

## 9. Known-bad local configurations

These are the failure modes you will actually hit, each traced to its cause.

**`POSTGRES_PASSWORD` set in `.env` while using the dev compose stack.**
`docker/postgres/init.sql` runs exactly once, when the `postgres` volume is first created. If you
later change `POSTGRES_PASSWORD`, the existing cluster keeps the old password while compose
interpolates the new one into the service URLs, and every service fails to connect. Fix by
removing the `postgres` volume as well, not just restarting.

**`PAWABASE_ADMIN_PASSWORD` that fails the policy.**
The first operator is created on first start. The password must contain upper- and lower-case
letters, a digit and a symbol — `Pawabase!admin1` satisfies it, `pawabase` does not. A rejected
password fails at startup, not at the sign-in form.

**Editing `studio/frontend/src` without `STUDIO_VITE=1`.**
`dev.sh` builds the front end once and then serves the built bundle. Your edits compile into
nothing. Delete `studio/frontend/dist` to force a rebuild, or use `STUDIO_VITE=1`.

**`localhost` and `127.0.0.1` mixed.**
`PAWABASE_PUBLIC_URL` is `127.0.0.1:8080`. Signed-in Studio cookies, OAuth callbacks and presigned
storage URLs are built from it. Reaching the same origin under two names invalidates them.

**Ports already in use.**
`dev.sh` takes no port arguments. Move `8080` or `8090` by exporting `PAWABASE_GATEWAY_PORT` /
`PAWABASE_STUDIO_PORT` (Docker path only), or free the port. For `dev.sh` you must edit the `start`
calls.

**Expecting Redis-backed behaviour from the no-Docker path.**
There is no Redis in `scripts/dev.sh`. Cache, queue, events, rate limits and cross-instance realtime
fan-out all fall back to in-process implementations, so they are per-process and disappear on
restart. Anything you are testing about distributed behaviour needs the Docker path.

**Expecting MinIO or S3 from the no-Docker path.**
`dev.sh` sets `PAWABASE_STORAGE_ROOT=$STATE/objects` and no `PAWABASE_STORAGE_ENDPOINT`, so file
storage is on local disk. Presigned URLs are generated by Pawabase, not by an object store.

## 10. Studio navigation — exact labels

`ENV_NAV` in `studio/frontend/src/components/Layout.jsx` is the per-environment sidebar. These
strings are the real ones; use them verbatim.

**Build**

| Key | Label |
|---|---|
| `overview` | Overview |
| `database` | Database |
| `resources` | Resources |
| `schemas` | Schemas |
| `transformers` | Transformers |
| `policies` | Policies |
| `routes` | Routes |
| `explorer` | API Explorer |
| `functions` | Functions |

**Automate**

| Key | Label |
|---|---|
| `flows` | Flows |
| `subscriptions` | Event subscriptions |
| `schedules` | Schedules |
| `webhooks` | Webhooks |
| `inbound-hooks` | Inbound hooks |

**Services**

| Key | Label |
|---|---|
| `users` | Users & auth |
| `mail` | Mail |
| `storage` | Storage |
| `realtime` | Realtime |

**Operate**

| Key | Label |
|---|---|
| `jobs` | Jobs & queues |
| `events` | Events & runs |
| `observability` | Observability |
| `keys` | API keys |
| `secrets` | Secrets |
| `backups` | Backups |
| `settings` | Settings |

Two labels are easy to get wrong and are worth memorising: **`Event subscriptions`** is under
*Automate* (the events *you* consume), while **`Events & runs`** is under *Operate* (the events the
platform recorded). **`API keys`** is under *Operate*, while **`API Explorer`** is under *Build*.

`SECTION_TONES` maps keys to the pastel used on sheet headers and empty states — a design detail,
not something to document as behaviour.

## 11. Default environments on a new project

`api/routes/platform/projects.py`:

```python
DEFAULT_ENVIRONMENTS = ["development", "production"]
```

**Two** environments, not three.

<Warning>
`README.md` lines 74–75 say a new project "comes with `development`, `staging` and `production`
environments". That is wrong — the constant is a two-element list and `staging` is not created.
</Warning>

`staging` remains a perfectly good name to add yourself; `envTone()` in `Layout.jsx` assigns it a
colour, which only proves the UI anticipates the name, not that the platform creates it.

The `environments` key is settable per project — `scripts/smoke.sh` posts
`{"environments": ["main"]}` and gets a single environment named `main`. So the default is a
default, not a constraint.

## 12. Flow block count

```python
from pawabase_core.flows.blocks import ALL_BLOCKS
len(ALL_BLOCKS)          # 71
len({b.name for b in ALL_BLOCKS})   # 71 — no duplicates
```

**71 built-in blocks.** Confirmed by importing the registry, not by grepping.

| Source | Claim | Verdict |
|---|---|---|
| `concepts/glossary.mdx` | 58 | wrong |
| `DOCS_AUDIT.md` | 64 | wrong |
| `README.md` | "58 blocks" | wrong |
| `ARCHITECTURE.md` | "40+" | not wrong, imprecise |
| `ALL_BLOCKS` | **71** | authoritative |

`ALL_BLOCKS` is assembled as `[*triggers.BLOCKS, *control.BLOCKS, *data.BLOCKS, *platform.BLOCKS]`
and registered by `register()` in the same file, which the `pawabase.blocks` entry point loads.

## 13. Environment variables in local development

`.env.example` is the documented surface. Neither dev path requires a `.env`.

**Required in production, defaulted in development:**

| Variable | Purpose |
|---|---|
| `PAWABASE_INTERNAL_SECRET` | signs service-to-service tokens and the gateway's platform context |
| `PAWABASE_JWT_MASTER_SECRET` | per-environment user token secrets derive from it |
| `PAWABASE_MASTER_KEY` | encrypts environment secrets and webhook signing keys at rest |
| `POSTGRES_PASSWORD` | bundled Postgres |
| `MINIO_ROOT_PASSWORD` | bundled MinIO; Pawabase also uses it as its storage credential. 8+ characters |
| `PAWABASE_ADMIN_EMAIL` | first Studio operator |
| `PAWABASE_ADMIN_PASSWORD` | upper+lower+digit+symbol |

Generate the three secrets with `openssl rand -hex 32`.

**Public URLs and cookies:**

| Variable | Default | Meaning |
|---|---|---|
| `PAWABASE_PUBLIC_URL` | `http://localhost:8080` | where clients and browsers reach the gateway |
| `PAWABASE_PUBLIC_GATEWAY_URL` | `http://localhost:8080` | gateway-specific |
| `PAWABASE_COOKIE_SECURE` | `false` | set `true` behind HTTPS |

### 13.1 `PAWABASE_PUBLIC_URL` cannot be overridden on either local path

Documented in `.env.example`, and supplied by `.env` in production. It does **not** work on either
local path, for two different reasons:

| File | How it is set | Overridable? |
|---|---|---|
| `scripts/dev.sh:21-22` | forced `export`, no `:-` fallback | **no** — the script overwrites your value |
| `docker-compose.dev.yml:34-35` | literal inside the `environment:` block | **no** — `environment:` outranks `env_file:` |
| `docker-compose.yml` | never mentioned; only `env_file: .env` | **yes** |

The dev compose file *does* read `.env` — `env_file: [{path: .env, required: false}]` — so a
`PAWABASE_PUBLIC_URL` in `.env` is accepted without error and then silently discarded, because
Compose resolves `environment:` after `env_file:`. Verified: `grep 'PUBLIC_URL' docker-compose.yml`
returns nothing.

Same pattern elsewhere: production writes `PAWABASE_APP_ENV: ${PAWABASE_APP_ENV:-production}`
(substitutable) while dev hardcodes `PAWABASE_APP_ENV: local`. Dev compose hardcodes
`PAWABASE_PUBLIC_URL`, `PAWABASE_PUBLIC_GATEWAY_URL`, `PAWABASE_RELOAD`, and `WATCHFILES_FORCE_POLLING`'s
default. Only the `${…}` form and `env_file` injection are overridable on the Docker path.

To change it locally you must edit the file: `scripts/dev.sh` lines 21-22, or
`docker-compose.dev.yml` lines 34-35.

This is worth stating in any page that tells a reader to set `PAWABASE_PUBLIC_URL`, because the
instruction is correct for production and inert locally — and the failure is silent.

**Optional:**

| Variable | Meaning |
|---|---|
| `PAWABASE_GATEWAY_PORT` | host port for the gateway |
| `PAWABASE_STUDIO_PORT` | host port for Studio |
| `PAWABASE_DEFAULT_DATA_URL` | resource data when an environment sets no `database_url` in **Settings → Infrastructure** |
| `PAWABASE_STORAGE_ENDPOINT` | your own S3-compatible service |
| `PAWABASE_STORAGE_BUCKET` | default `pawabase` |
| `PAWABASE_STORAGE_REGION` | default `us-east-1`; use `auto` for R2/B2 |
| `PAWABASE_STORAGE_ACCESS_KEY` | |
| `PAWABASE_STORAGE_SECRET_KEY` | |
| `PAWABASE_STORAGE_PATH_STYLE` | `true` for MinIO, `false` for AWS virtual-hosted addressing |
| `PAWABASE_STORAGE_PUBLIC_ENDPOINT` | browser-facing address when it differs from the endpoint |
| `PAWABASE_MINIO_PORT` | MinIO's S3 port on the host |
| `MINIO_ROOT_USER` | commented out in `.env.example`, defaults to `pawabase` |

`.env.example` names **no per-service env var infixes**. The scheme is flat `PAWABASE_*`.

<Warning>
`reference/environment-variables.mdx` and `reference/limits.mdx` invent service-name infixes
(`PAWABASE_AKOUNTZ_*`, `PAWABASE_ANGULA_*`, `PAWABASE_STUDIO_*`). The compose file sets
`PAWABASE_AKOUNTZ_URL`, `PAWABASE_ANGULA_URL`, `PAWABASE_API_URL`, `PAWABASE_GATEWAY_URL` and
`PAWABASE_STUDIO_URL` — five inter-service URLs, flat, with no per-service configuration block.
`reference/troubleshooting.mdx` also calls the Postgres service `db`; the compose service is
`postgres`. And there is no `PAWABASE_SECRET_KEY`.
</Warning>

## 14. Tests and lint

From the repository root:

```bash
uv run pytest -q                                   # pawabase_core only
for s in api akountz angula gateway studio; do (cd $s && uv run pytest -q tests); done
uv run ruff check . && uv run ruff format --check .
```

`testpaths = ["tests"]` and `pythonpath = ["."]` are set in the root `pyproject.toml`;
`asyncio_mode = "auto"` means `async def test_*` needs no marker.

Test counts as of this pass, by `test_*.py` files and `def test_` functions:

| Package | Files | Functions |
|---|---|---|
| root (`tests/`) | 7 | 51 |
| `api` | 15 | 107 |
| `akountz` | 4 | 18 |
| `angula` | 1 | 5 |
| `gateway` | 1 | 9 |
| `studio` | 1 | 18 |

Ruff config: line length 100, target `py311`, `select = ["E","F","I","B","UP","SIM"]`,
`ignore = ["E501","B008","SIM105"]`, migrations and `node_modules` excluded,
`known-first-party = ["app","database","routes","pawabase_core"]`.

CI (`.github/workflows/ci.yml`) runs four jobs: `lint` (ruff check + format --check), `test`
(pytest matrix over `.`, api, akountz, angula, gateway, studio), `studio` (npm ci + npm run
build), and `compose` (build the image, `up -d --wait`, then `scripts/smoke.sh` with freshly
generated secrets). There is no type checker and no coverage threshold.

## 15. What this section may link to

Only pages present in `docs.json`. The relevant neighbours of `installation/local-development`:

- `/installation/docker`
- `/self-hosting/requirements`
- `/self-hosting/configuration`
- `/concepts/projects-and-environments`
- `/concepts/studio`
- `/quickstart`
- `/tutorial/first-project`
- `/reference/environment-variables`
- `/reference/troubleshooting`

## 16. Corrections to the page this ground truth replaces

`installation/local-development.mdx` was audited in `DOCS_AUDIT.md` batch E as **"largely
fabricated … Actively blocks anyone following it today."** Specifically:

| Claim in the old page | Reality |
|---|---|
| a `pawabase` CLI starts the dev environment | no such command; `scripts/dev.sh` or compose only |
| Python 3.12+ | `>=3.11` |
| a Postgres-based local setup | SQLite only; no external database is used or needed |
| (unstated) | there is no Redis in the no-Docker path |
| (unstated) | the worker and scheduler run inline in the API process |
| (unstated) | tables come from `DB_GENERATE_SCHEMAS`, not migrations, on the `dev.sh` path |

Keep this table in mind when reviewing the rewrite: none of the old claims may survive.

## 20. Words to never use

powerful, seamless, effortless, robust, blazing, cutting-edge, magic, supercharged,
"blazingly fast", enterprise-grade, world-class, delightful, "just", "simply".