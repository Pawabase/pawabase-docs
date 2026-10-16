# Ground truth — Authentication (Akountz)

Every `auth/*` page must be written ONLY from this brief plus the source it cites.
If a fact is not here and not in source, do not invent it.

## Source of truth (read these, do not guess)

- `/Users/admin/sillo.build/pawabase/akountz/`
  - `app/environment.py` — `AuthConfig`, defaults, `redirect_allowed`, `enabled_providers`
  - `app/accounts.py` — email normalisation, password policy, create/present, lockout
  - `app/sessions.py` — session start/refresh/revoke, `KEEP`, membership, event logging
  - `app/mfa.py`, `app/oauth.py`, `app/links.py`, `app/emails.py`, `app/rbac.py`, `app/config.py`
  - `routes/auth.py`, `routes/security.py`, `routes/recovery.py`, `routes/orgs.py`, `routes/admin.py`
  - `database/models/users.py`, `database/models/framework.py`, `database/models/orgs.py`
- `/Users/admin/sillo.build/pawabase/pawabase_core/`
  - `auth.py` (`ProjectUserBackend`, `OperatorBackend`, `ServiceKeyBackend`, `ContextMiddleware`)
  - `tokens.py` (`issue_user_token`, `verify_user_token`, `peek_claims`, `TokenInvalid`)
  - `ulid_auth.py` (`issue_token_pair`, `refresh_token_pair`, family theft detection)
  - `principal.py`, `context.py`, `settings.py`
- `/Users/admin/sillo.build/pawabase/studio/frontend/src/pages/Env/Users.jsx` — the Studio UI

## THE CENTRAL MENTAL MODEL

Authentication in Pawabase is **not one service and one database**. It is layered,
and almost every confusing behaviour falls out of which layer you are looking at.

| Layer | What it owns |
| --- | --- |
| **Akountz** (identity) | Users, passwords, identities, sessions, MFA, orgs, roles. Owns `akz_users`, `akz_sessions`, `akz_login_events`, `permissions`, `perm_*`, `jwt_tokens`, `token_blacklist`. |
| **The API** (project config) | Owns each environment's `auth` settings block. Akountz *reads* it and never owns it. |
| **Gateway / `pawabase_core`** | Verifies bearer tokens at every other service. Issues nothing. |

The single most useful idea for a reader: **every user belongs to exactly one
`project` + `env` pair.** An email address may hold an account in `acme/production`
and a completely separate account in `acme/staging`, with different passwords,
different roles, and separate sessions. This is the tenancy rule that makes the
whole system coherent, and it is enforced on nearly every query.

Corollary that trips people up: a token is only valid for the environment that
issued it, because `ProjectUserBackend` reads `project`/`env` from the request
context and passes them to `verify_user_token`.
## `AuthConfig` — the real fields and defaults

From `app/environment.py`. These are the exact keys a reader writes into the
environment's `auth` block, and the exact keys Studio's Configuration tab edits.

| Field | Default | Meaning |
| --- | --- | --- |
| `project` | — | Project slug. Not part of the config payload; supplied by the caller. |
| `env` | — | Environment name. Same. |
| `project_name` | `""` | Display name used in emails. |
| `signup_enabled` | `True` | Whether `POST /auth/v1/signup` creates accounts. |
| `require_email_verification` | `False` | Unverified users cannot sign in. |
| `password_policy` | `"basic"` | `basic` = length rule only; `strict` = Sillo's full validator. |
| `password_min_length` | `8` | Characters. |
| `access_ttl` | `900` | Seconds. 15 minutes. |
| `refresh_ttl` | `2592000` | Seconds. 30 days. |
| `magic_link_enabled` | `True` | |
| `mfa_enabled` | `True` | Lets users enrol TOTP. |
| `site_url` | `""` | The application's base URL. Magic-link and OAuth redirects land here. |
| `redirect_urls` | `[]` | Extra allowed redirect prefixes. |
| `providers` | `{}` | Per-provider OAuth config, keyed by name. |
| `default_roles` | `[]` | Roles granted at account creation. |
| `emails` | `{}` | Per-message subject/text overrides. |
| `public_url` | `""` | Where Akountz itself is reachable. Falls back to its own setting. |

`from_api` copies every key above except `project`, `env`, `project_name` and
`public_url` straight out of the environment payload's `auth` object, ignoring
`None`. So **an unset key silently falls back to the default above** — that is the
answer to "why didn't turning this off work".

`platform_config` is the reserved `_platform` environment (Studio's own operators).
It is hardcoded, not editable: `signup_enabled=False`, `password_policy="strict"`,
`password_min_length=10`, `access_ttl=3600`, `refresh_ttl=7*24*3600`,
`magic_link_enabled=False`.

## Config caching

`load_config` caches each environment's config under `authcfg:{project}:{env}` for
`config_ttl` seconds (Akountz setting, default **10**). **Editing auth settings in
Studio can take up to 10 seconds to take effect.** This surprises people and belongs
in any page about changing behaviour.

## Passwords — the exact behaviour

`check_password_policy`:
- `password_policy == "strict"` → `validate_password(password, min_length=config.password_min_length)` (Sillo's validator).
- anything else → length-only check against `password_min_length`.
- Either way, over **1024** characters appends `"Password is too long."`.
- Problems produce `422` with body `{"message": "the password does not meet the policy", "problems": [...]}` — a *list* of problems, not one string. Clients should render all of them.

Email: `normalise_email` strips and lowercases, then requires
`^[^@\s]+@[^@\s]+\.[^@\s]+$` and length ≤ 255, else `422 "a valid email address is required"`.
Because of the `.lower()`, **all lookups are lowercase**.

## Sessions and tokens

`issue_token_pair` returns `{access_token, refresh_token, token_type: "bearer", token_family}`.
Both tokens carry a `jti` that also exists as a row in `jwt_tokens`. Refresh
looks the row up **by that jti**.

`refresh_token_pair` theft detection — the behaviour worth explaining carefully:
- Unknown jti → `ValueError("Unknown refresh token")`.
- Row already `revoked` → **revoke the entire family**, raise `"Token family has been revoked — possible token theft"`.
- Row already `consumed_at` → **revoke the entire family**, raise `"Refresh token already consumed — possible token theft"`.

So a reused refresh token does not merely fail: it invalidates every session in the
family, on the assumption the token was stolen and the legitimate client is still
holding one. Rotation is single-use and per-family.

`SessionInfo` (`akz_sessions`) rows carry `family`, `user`, `project`, `env`,
`method`, `aal` (`"aal1"` default), `org`, `ip`, `user_agent`, `last_refreshed_at`,
`revoked_at`. **The `family` column is what `session_id` refers to** — it is the
token family hex string, not a surrogate id.

`revoke_all_tokens()` revokes every token for a user; `active_token_count()`
counts unexpired, unrevoked rows. Both exist for the Studio session UI.

`start_session` calls `require_membership` first (403 `you are not a member of that
organization` for a slug the user isn't in), issues the pair with
`secret=refresh_secret(project, env)`, writes `SessionInfo`, then `record_success`.

`elevate` raises an existing session's AAL after MFA. MFA grants `aal2`; the
default is `aal1`.

## The token response shape

`_response` in `routes/auth.py` — this exact shape, and it is stable across
password, refresh, magic link and MFA completion:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 900,
  "expires_at": 1750000000,
  "session_id": "<token family hex>",
  "org": null,
  "org_role": null,
## OAuth — the real provider set

Shipped in `sillo-oauth`, mapped in `app/oauth.py`:

| Key | Class |
| --- | --- |
| `google` | `GoogleOAuthProvider` |
| `github` | `GithubOAuthProvider` |
| `discord` | `DiscordOAuthProvider` |
| `microsoft` | `MicrosoftOAuthProvider` (accepts `tenant`) |

Any other name becomes a generic `OAuthProvider` and **must** supply
`authorize_endpoint`, `token_endpoint` and `userinfo_endpoint` — otherwise
`500 "provider {name!r} needs authorize, token and userinfo endpoints"`.
OIDC when `openid` is among `scopes`.

There is no Apple, Facebook or LinkedIn provider. Say so directly rather than
listing providers that do not exist.

`callback_url` = `{public_url}/auth/v1/callback/{project}/{env}/{provider}`, and
both `project` and `env` are **in the path** because these are browser navigations,
not context-scoped API calls. A shipped provider may still be overridden with
generic endpoint keys.

`build_provider` raises `404 "the {name!r} provider is not enabled"` when
`enabled` is falsey or `client_id` is missing — and `enabled_providers()` (what
`GET /auth/v1/settings` reports) filters on exactly `enabled is not False and
client_id` being set. So **a provider with no `client_id` is invisible to clients
and 404s on use**, even if you think you enabled it.

The callback's account-resolution order is the substance of social sign-in, and
should be explained as a decision tree:
1. If `link_token` in state, consume it and attach to that user; if the identity
   already belongs to a different user → `identity_already_linked`.
2. Else look up `Identity` by `(project, env, provider, subject)`.
3. Else **only if `profile.email_verified` is true**, match an existing account by email.
4. Else create an account — but only if `signup_enabled`, else `signup_disabled`;
   an existing unverified account → `signup_unverified_conflict`; no email →
   `email_required`.
5. `user.is_disabled` → `account_disabled`.

The verified-email rule at step 3 is the security-relevant line: an unverified
provider email never attaches itself to an existing account.

Errors return via `_error_redirect`, which redirects to `redirect_to` with
`#error=<code>` in the fragment, or raises `400 "sign-in failed: {code}"` when
there is no target. **Codes travel in the URL fragment, not the query string.**
Success payloads are also fragment-encoded (`#access_token=...`), because fragments
are not sent to servers or written to access logs on the redirect hop.

`identity.linked` and `user.created` events are emitted via `akountz.emit`.

## MFA

Real storage: `MfaFactor` and `RecoveryCode` on the user. `AuthUser.mfa_enabled`
is the boolean flag. There is **no `MFARecoveryCode` model** and recovery codes
are stored **hashed only** — the raw code is returned once at generation and never
recoverable.

`regenerate_recovery_codes` deletes existing rows then creates
`RECOVERY_CODE_COUNT` codes, each `secrets.token_hex(5)` split into
`{first5}-{last5}`. `remaining_recovery_codes` counts unused rows.
## Organizations and teams

Real models in `database/models/orgs.py`: `Organization`, `Membership`,
`Team`, `TeamMember`, `Invitation`. **Not** `Org`/`OrgMember`, and there is no
per-org AAL override.

`Membership.role` is a string. `membership_role` returns `None` for an unknown org
or a non-member — a `None` role is what makes `org` collapse to `null` in the
token response.

Routes cover orgs, members, invitations (create/list/revoke/accept) and teams
(create/add member/remove member). Invitation emails use the `invite` template
with `{organization}` and `{role}` placeholders.

## Email messages

Exactly five kinds in `app/emails.py`: `verify`, `recovery`, `magic`, `invite`,
`email_change`. Each has default subject and text; an environment overrides them
under `emails: {kind: {subject, text}}`.

Placeholders: `{project}`, `{link}`, `{email}`, plus `{organization}` and `{role}`
for invitations. An unknown placeholder is left literal rather than raising, so a
typo shows up in the delivered mail instead of failing silently.

Delivery goes through the API's mail service, so it uses the **environment's**
SMTP settings. The plain-text template is also HTML-escaped and newlines become
`<br>`, with the `{link}` value wrapped in an anchor.

## One-time tokens (`app/links.py`)

`OneTimeToken` rows carry `id`, `project`, `env`, `purpose`, `expires_at`,
`used_at`. Purposes seen in routes: `verify`, `recovery`, `magic`, `mfa`, `link`,
and invitation purposes.

`consume` verifies the signature with a per-purpose max age, then checks the row.
**Consumption uses a conditional update**: `filter(id=..., used_at=None).update(...)`
and if it matched zero rows the token was already used. A token that is already
`used_at`, expired, or missing all raise the same `invalid` error, and
`peek=True` skips the consume so a page can render the form before submission.
## Studio UI — real labels

`studio/frontend/src/pages/Env/Users.jsx`, layout title **"Users & auth"**,
description: *"End users of this environment, managed by Akountz: accounts,
sessions, MFA, roles and organizations."*

Tabs, in order: **Users**, **Roles**, **Organizations**, **Sign-in activity**,
**Configuration**.

- **Users** — search input placeholder **"Search email or name"**; **"New user"**
  modal with fields **Email**, **Name**, **Password**, whose hint reads
  *"Leave empty to have the user set one through a recovery link."*; per-user
  modal titled by the user's email, with an active-sessions table whose empty state
  is *"No active sessions."*
- **Roles** — **"New role"** button; modal fields **Name**, **Description**,
  **Permissions**; toast **"Roles saved"**; Name is disabled when editing an
  existing role; the placeholder for a new role is `editor`.
- **Organizations** — columns **Name**, **Slug**, **Members**, **Created**.
- **Sign-in activity** — a **failures only** checkbox; columns **When**, **Event**,
  **Email**, **Result**, **IP**. The Result badge renders `ok` in green, else the
  `reason` string in red.
- **Configuration** — card titled **"Akountz configuration"** with `Section`s:
  - **Sign-up** — *"Who can create an account, and whether their email must be
    confirmed first."* Switches **Sign-up enabled** (hint *"Turn off to invite-only
    new accounts."*) and **Require email verification** (hint *"Unverified users
    can't sign in until they confirm."*). Field **Default roles**, hint
    *"Granted automatically at sign-up."*
  - **Passwords** — *"Password strength and how long sessions last."* **Policy**
    (segmented **Basic** / **Strict**), **Minimum length** (hint "Characters."),
    **Access token lifetime** (hint "Seconds. How long a bearer token works before
    it needs refreshing."), **Refresh token lifetime** (hint "Seconds. How long a
    signed-out-of-band session stays resumable.").
  - **Sign-in methods** — **Magic links** (hint *"Passwordless sign-in by emailed
    one-time link."*), **MFA (TOTP)** (hint *"Let users add an authenticator app
    for aal2."*).
  - **URLs** — *"Where a browser is allowed to land after an OAuth or magic-link
    redirect."* **Site URL** (placeholder `https://app.example.com`),
    **Additional allowed redirect URLs**.
  - **OAuth providers** — *"Social sign-in. Reference credentials as secret://NAME
    rather than pasting them here."* Per provider: **Enabled** switch, **Client
    ID**, **Client secret** (placeholder `secret://GITHUB_SECRET`), **Authorize
    endpoint**, **Token endpoint**, **Userinfo endpoint**. Remove uses an icon
    button labelled `Remove {name}`.
  - **Email templates** — **Passwords**, **Email change**, **Organization invite**,
    and magic-link copy; per-message subject and body overrides.

User-modal actions that exist: **Disable**, **Enable**, **Verify email** /
**Marked verified**, **MFA reset**, **Signed out everywhere**, **Session revoked**,
**Password set**, **New password**, **New role** (a **Role** field, hint
*"Comma-separated role names from the Roles tab."*), toasts **User created**,
**Saved**.

Credentials are referenced as `secret://NAME`, never pasted.

## Paths and prefixes

Auth routes are mounted under `/auth/v1`. OAuth browser routes are
`/auth/v1/authorize/...` and `/auth/v1/callback/...` with the project and env in
the path. Admin routes are under a service-key-authenticated base that Studio
calls with its own management key.

## What the client actually sends

Headers: `Authorization: Bearer <access_token>`; `apikey: <key>` for service
keys; `X-Pawabase-Context` (a gateway-signed context token, `CONTEXT_HEADER` in
`context.py`) carries project/env; `x-pawabase-service` is the service header.

`ContextMiddleware` **drops** an unverifiable context header rather than rejecting
the request, so public routes keep working; routes needing a project call
`require_context`.

**There is no first-party SDK.** `clients/overview.mdx` is the canonical statement
of this and the quality bar for how to write about client code. So: show `fetch`
and `httpx`/requests, hand-written refresh handling, and storage advice. Never
show `createClient`, `@pawabase/sdk`, or a `PawabaseClient` class — those are
fabrications, and `auth/client-integration.mdx` currently contains them and must be
rewritten out.

## Internal names to avoid leaking

Do not mention `ContextMiddleware`, `AkountzSettings` as an API, `DataSourcePool`,
`TelemetryRecorder`, `RecordFailedJobRepository`, `adopt()`, or any `_`-prefixed
method. Name behaviour, not internals — except `AuthConfig`, `AuthUser`,
`Identity`, `SessionInfo`, `LoginEvent`, `OneTimeToken`, `MfaFactor`,
`RecoveryCode`, `Organization`, `Membership`, `Team`, `Invitation`, `Permission`,
`Group`, which are the real public data model and are worth naming.

## Shared link targets (all exist)

`/auth/overview`, `/auth/configuration`, `/auth/passwords`,
`/auth/tokens-and-sessions`, `/auth/email-verification`,
`/auth/password-recovery`, `/auth/magic-links`, `/auth/social-login`,
`/auth/mfa`, `/auth/managing-users`, `/auth/roles-and-permissions`,
`/auth/organizations`, `/auth/auth-in-policies`, `/auth/client-integration`,
`/auth/security-model`, `/concepts/mental-model`, `/concepts/organizations`,
`/concepts/credentials`, `/concepts/definitions-as-data`, `/concepts/studio`,
`/concepts/request-lifecycle`, `/policies/overview`, `/policies/conditions`,
`/policies/context`, `/data/field-types`, `/clients/overview`,
`/clients/javascript`, `/clients/python`, `/clients/errors`,
`/operate/api-keys`, `/operate/secrets`, `/operate/environments-and-promotion`,
`/operate/audit-log`, `/operate/rate-limits-and-cors`, `/storage/overview`,
`/flows/overview`, `/events/overview`, `/reference/errors`, `/reference/limits`,
`/reference/environment-variables`, `/installation/docker`, `/self-hosting/tls`.

`link()` builds the URL a message points at: with a `site_url` it goes to the
application at `{site_url}/auth/callback?token=...&type=...`, otherwise to
Akountz's own page at `{public_url}/auth/v1/links/{project}/{env}/{kind}?...`.
`redirect_to` is added when present. **An environment without a `site_url` gets
Akountz-hosted pages**, which is a real and visible difference.

# WRITING CONTRACT — applies to every page in this rewrite

## Length
**≥1,500 lines per page. Target 1,500–1,900.** Every auth page gets this
treatment, including small ones like `auth/magic-links.mdx`. Depth comes from
reference tables, exhaustive field/response/error coverage, worked examples,
decision reasoning, and Studio walkthroughs — never from padding.

## Never pad
No duplicated paragraphs. A previous pass replicated paragraphs 5×; that is the
failure mode being fixed. Every paragraph must be uniquely useful. If you catch
yourself restating something in different words, delete the weaker one.

## No "Step 1 / Step 2" instruction lists
Never write `Step 1: ...`. Never make the spine "First do X. Then do Y."
Procedural content is allowed **as prose and reference tables**, not as an
imperative checklist. `<Steps>` may wrap genuinely sequential UI walkthroughs, but
its steps must be titled with what happens, not numbered imperatives, and the page
must not read as a recipe.

## Explain, don't enumerate
Every section answers "why would I care?" **before** "what are the fields?".
Lead each section with the decision or consequence, then give the reference detail.
A table of fields with no framing above it is not acceptable on its own.

## Studio perspective is mandatory
Name the real UI labels, the real nav path, the real panel — quoted above. Every
page should tell the reader where to click and what they will see, alongside the
API equivalent.

## User conception is mandatory
Lead with the mental model a developer needs before any mechanism. Each page
opens by situating itself in the layered model in this brief.

## Frontmatter
Exactly three lines, then `---`:

```
---
title: "Passwords"
description: "..."
icon: "lock"
---
```

Quotes on `title` and `description`. Pick a real Font Awesome icon name consistent
with the page's subject.

## Components available
`<Note>`, `<Warning>`, `<Info>`, `<Tip>`, `<CardGroup cols={2|3}>`,
`<Card title icon href>`, `<ResponseField name>`, `<Accordion>`,
`<AccordionGroup>`, `<Steps>`, `<CodeGroup>`. Use them where they carry meaning —
a `<Warning>` for a real footgun, an `<Accordion>` for genuine optional depth —
not as filler to hit a component count. Every page should use several, chosen well.

## Code fences
Only: ```json, ```python, ```bash, ```sql, ```text. No ```typescript and no
bare ```shells. JavaScript/curl examples must use ```json, ```bash or ```text as
fits.

## Links
Absolute-from-root only: `/data/field-types`, `/policies/overview`. Link only to
pages that exist — the list is above and `docs.json`. Link **generously**: a reader
moving between related auth pages should rarely hit a dead end.

## Voice
Direct and specific. No hype words — no "powerful", "seamless", "robust",
"effortless", "enterprise-grade", "cutting-edge", "beautiful", "delightful",
" blazing fast". No marketing voice. No exclamation marks. Write to someone
debugging at 2am who wants the actual behaviour.

## Tables are encouraged
They are the densest correct way to convey this material. Use them heavily for
fields, defaults, claims, error codes, reasons, routes, and UI labels.

## Structure that works
A reliable shape, adapted per page: opening mental model → a `CardGroup` orienting
the reader → why the design is what it is → how it's configured (with Studio
labels) → the reference surface (fields, routes, responses) → what goes wrong
(troubleshooting as prose + table) → how it interacts with the rest of the system.
Default lifetimes are in `LIFETIMES`; the recovery copy says one hour and the magic
copy says 15 minutes.
`disable(user)` deletes factors **and** recovery codes, then clears `mfa_enabled`.

There is no `require_aal` directive and no TOML anywhere in auth config —
configuration is JSON throughout.

## Roles and permissions — the real model

Sillo's models, re-keyed to ULIDs in `database/models/framework.py`. The real
tables are `permissions`, `perm_groups`, `user_permissions`, `perm_user_groups`,
`perm_group_permissions`.

`Permission` / `Group` / `UserPermission` / `UserGroup` / `GroupPermission`.

**There is no `Role` model and no `RoleAssignment`.** A "role" is a `Group` plus
its permissions. There is no `has_permission()` helper and no TOML policy
expression syntax — policies are JSON.

`Group.get_or_create` is overridden because Sillo's implementation calls
`super(cls, cls)`, which on a subclass lands back in the override. Worth a note as
a subclassing hazard.

`unique_together`: `UserGroup` on `(user_id, group)`, `GroupPermission` on
`(group, permission)`.

Roles are managed in Studio's **Roles** tab, with a "New role" button and a
`Name` / `Description` / `Permissions` modal. `admin.py` exposes
`GET/PUT/DELETE {base}/roles` and grant/revoke of direct user permissions.
  "user": { }
}
```

`org_role` is read **at issue time**, so a membership change only lands on the
next refresh. If the user is not a member of the requested org, `org` and
`org_role` both come back `null` rather than erroring — except when the org was
named on the request, where `require_membership` raises 403 first.

## `POST /auth/v1/token` — one endpoint, three grants

`TokenRequest.grant_type` is `Literal["password", "refresh_token", "mfa"]`. This
single endpoint is the whole grant surface; readers looking for `/oauth/token` or
`grant_type=authorization_code` will not find them.

- `password` — needs `email` + `password`.
- `refresh_token` — needs `refresh_token`; optional `org`.
- `mfa` — needs `mfa_token` + `code`.

The optional `org` field: names an organization slug for the tokens. On refresh it
**switches** the session's org; `null` leaves it unchanged; **omit it entirely to
keep it**. That three-way distinction is expressed by a module-level sentinel
`KEEP` in `sessions.py`. This is genuinely subtle and worth a table.

Sign-in failures return specific `reason` strings that land in `akz_login_events`
and are what the Studio "Sign-in activity" tab renders in its Result column.

## Rate limits

From `rate_limit_middleware` calls: `/signup` and `/token` share
`{"limit": 30, "window": 60}` under key `akz:auth`. MFA endpoints use
`{"limit": 10, "window": 60}` under `akz:mfa`. Backed by `redis_url`.
Hashing is Sillo's `UserBaseModel` (`passlib`; bcrypt by default,
`pbkdf2_sha256` fallback). Do not claim a specific cost factor that isn't in source.

An account created without a password gets `set_unusable_password()`, so
password sign-in cannot succeed until a recovery link sets one. This is the
normal state for OAuth-only and admin-created users.

`unique_username`: base = the email local part (or the supplied name) with
`[^a-z0-9_.-]` stripped, truncated to 40, defaulting to `"user"`; on collision,
appends `secrets.randbelow(10_000)`.

## Lockout

`is_locked` = `locked_until is not None and locked_until > now`.
`record_failure` increments `failed_logins` and locks at
`lockout_threshold` (default **10**) for `lockout_minutes` (default **15**).
These are Akountz *installation* settings, not per-environment auth config — an
important distinction, because they are global across all environments on that
instance while the account counters live per environment. `record_success` resets
the counters on a successful sign-in.