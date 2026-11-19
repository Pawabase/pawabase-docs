# Pawabase docs overhaul: progress

Resume from this file. It is the single record of the repository-wide overhaul started 2026-11-19.

## Rules (from the person who owns these docs)

- The implementation is the source of truth. Never invent endpoints, SDK methods, options, errors or limits. Mark anything unverified.
- Product pages: Studio for setup, the SDK for app code. Every code example has **TypeScript and Python** tabs using the real SDK (`@pawabase/client`, `pawabase`). No curl/REST examples in product pages (raw HTTP only where there is no SDK: Integrations, the REST reference).
- No separate SDK section: each topic page documents its SDK usage.
- Depth over length: explain concepts, behaviour, options, limits, errors, advanced use and troubleshooting. Don't pad.
- Postgres only: no MySQL/SQLite branches or caveats.
- Escape `{x}` in MDX prose as `\{x\}` (code spans and fences are fine). Validate with `npx mint validate` and `npx mint broken-links`.
- Plain words, no marketing, no "just"/"simply".

## Sources of truth

| What | Where |
| --- | --- |
| Server (gateway, data, auth, storage, realtime, flows, platform API) | `~/sillo.build/pawabase/pawabase_server` |
| Definition bodies (resources, flows, policies, buckets, …) | `pawabase_server/routes/platform/definitions.py` |
| Policy language | `pawabase_server/policies/engine.py` |
| TypeScript SDK (`@pawabase/client` 0.8.3) | `~/sillo.build/_split/js/src` |
| Python SDK (`pawabase` 0.10.3) | `~/sillo.build/_split/python/client/pawabase` |
| IaC (`pawabase-iac`) | `~/sillo.build/_split/python-iac` |
| Studio UI | `~/sillo.build/pawabase-cloud/web/src/studio` |
| Cloud (dashboard, billing, integrations) | `~/sillo.build/pawabase-cloud/backend/pawacloud` |
| Feature inventory (audit 2026-10-31) | `~/sillo.build/pawabase/PAWABASE_FEATURE_INVENTORY.md` |

## Architecture (decided 2026-11-19)

Tabs: **Guides** (welcome, concepts, quickstarts, tutorials) · **Products** (features you build with) · **Platform** (environments, activity, secrets & backups, Cloud) · **Developers** (overview, blueprints, SDK clients, IaC, MCP) · **Integrations** (building on Pawabase for other people's organizations) · **Reference** (errors, keys, REST API). Old `/tools/*` URLs redirect.

## Status key

`todo` not reviewed · `audited` read and checked against code, notes recorded · `rewritten` deepened and verified · `ok` reviewed, already adequate (reason noted)

## Inventory (269 pages at start; lines = length at start)

### index (1 pages, 108 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `index` | 108 | todo | |

### concepts (2 pages, 132 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `concepts/definitions-and-data` | new | rewritten | NEW: definition kinds (Studio nav verified), schema plans, promote/blueprint/backup/IaC table |
| `concepts/request-lifecycle` | new | rewritten | NEW: gateway checks (edge/policy.py, admission.py), per-KEY rate limit, token, rules, validation, async events, error map |
| `concepts/projects-and-environments` | new | rewritten | NEW: isolation, names, env selection (keys.choose), keys' reach, promote |
| `concepts/how-pawabase-fits-together` | 60 | rewritten | Now 'How Pawabase works': system map, keys/users, definitions→APIs, rules, events, responsibilities, glossary |
| `concepts/studio-tour` | 72 | ok | Matches ENV_NAV; fixed Events label, added MCP, Connect |

### quickstarts (5 pages, 497 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `quickstarts/agent` | 72 | rewritten | Studio labels from AgentBuilder/Models; run statuses running/waiting/done/failed; thread; stream {type:'text',text}; secret-key caveat |
| `quickstarts/javascript` | 84 | rewritten | Full Vite app: owner field + Access quick set, auth state, CRUD, live query, error classes (SDK verified) |
| `quickstarts/node` | 76 | rewritten | 3 identities, secret-key job with pages(), per-request accessToken client + getUser, admin client, flows.run/routes, error classes, retry {retries} |
| `quickstarts/python` | 119 | rewritten | as_user per-request view (FastAPI), pages()/all(), FileSessionStore, async gather, error→class map (errors.failure) |
| `quickstarts/react` | 146 | rewritten | env vars, useSession (INITIAL_SESSION/ready), MFA sign-in, useLive hook (25/conn, 1–200, 0.1s), typed DB (pawabase-types --env FULL name), SSR per-request client |

### guides (10 pages, 1380 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `guides/agent-with-permissions` | 121 | audited | All Studio labels verified in AgentBuilder/Knowledge |
| `guides/environments-workflow` | 113 | audited | 'pin' → Keep this one |
| `guides/event-driven-workflow` | 118 | audited | Fixed Events/Flows/Webhooks paths (Studio moved views out of Activity) |
| `guides/organizations` | 222 | audited | Deep already (org claims, named rules); fixed Data path; SDK names pass |
| `guides/overview` | 32 | rewritten | Connect path; points newcomers to concepts + quickstart |
| `guides/private-files` | 192 | audited | Consistent with verified storage facts (signed_downloads no Studio switch); fixed Data path |
| `guides/production-checklist` | 102 | audited | Paths valid (Activity → Routes/Errors/Audit log) |
| `guides/realtime-chat` | 145 | audited | Matches channel API and rules; Realtime → Overview path |
| `guides/scheduled-jobs` | 102 | rewritten | FIXED: SQL needs $1::text::timestamptz; scheduled_at = run start (not missed slot), absent when payload set (automation/scheduler.py) |
| `guides/signed-in-app` | 233 | audited | Deep already; fixed Studio paths; server part → accessToken/as_user + getUser |

### auth (40 pages, 5147 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `auth/account-recovery` | 136 | audited | reset link → /auth/callback?type=recovery, or built-in page without Site URL; reset clears lockout |
| `auth/attack-protection` | 55 | rewritten | Lockout mechanics from routes/identity/auth.py (locked → 429 before password check; only password+MFA failures count; reset clears lock); 30/min per address on token/signup/email-code/magic-link/recover/verify |
| `auth/auth-webhooks` | 83 | audited | Event table completed from emitted names (invitation.*, machine.*, sso_*, token_profile.issued, data_exported/erased); removed false 'reuse warnings' claim |
| `auth/authentication-flow` | 81 | rewritten | Map kept; settings() fields from routes/identity/auth.settings |
| `auth/bot-protection` | 208 | todo | |
| `auth/configuring-auth` | 84 | rewritten | Groups fixed; token lifetimes 900s/30d (identity/environment.py); Sign out everywhere / End session |
| `auth/data-requests` | 89 | rewritten | identity/privacy.py: full export/erase table incl. org audit, emails; what neither covers (own tables, files, events/runs/webhooks until retention, backups); record fields; REST; erase vs delete. Server fixes below |
| `auth/devices` | 78 | rewritten | FACT: device key = x-device-id header / pb_device cookie / UA fingerprint (identity/devices.identify); SDKs send no x-device-id → remember-device never works without app-sent header; trusted-device sessions are aal1 (fail mfa rule + org require_mfa) |
| `auth/email-and-password` | 204 | rewritten | routes/identity/auth.check_password order (unknown→SSO→locked→wrong→disabled/verify/expired/MFA); identifiers username/phone; TS 400 = ValidationError; sign-up form problems are a string list (NOT byField); terms 422; 409 reveals existence; create-users fix |
| `auth/email-codes` | 113 | rewritten | identity/codes.py: 10 min fixed, newest code only, 5 wrong tries per code, account made at verify (verified, default roles, restrictions), no lockout counting, captcha errors, code vs link table, full form with cooldown |
| `auth/email-templates` | 47 | rewritten | identity/emails.py: 9 kinds + values per kind, common values (project, email, brand), fallback to default, text overrides keep layout, branding via settings |
| `auth/email-verification` | 105 | audited | flow fixed: link → /auth/callback?type=verify (or Pawabase page + fragment) |
| `auth/enterprise-connections` | 267 | todo | |
| `auth/enterprise-roles-and-access` | 152 | todo | |
| `auth/enterprise-sign-in` | 228 | todo | |
| `auth/guests` | 83 | rewritten | FIXED: guests have placeholder email guest-…@guest.invalid (old doc said none); detect via is_anonymous / $auth.claims.app.anonymous; upgrade always sends verify; purge = 30d after last sign-in (refresh doesn't count) → guests deleted ~30d after start |
| `auth/how-auth-works` | 235 | audited | Fixed: revoked session keeps access token until expiry; passkey=aal2; refresh token renews. Added 'Verify tokens on your server' (HMAC access tokens can't be verified externally → /auth/v1/user, token profiles, routes) |
| `auth/import-and-export` | 43 | rewritten | identity/backup.py: contents, merge-by-email vs replace (one transaction), ids kept when free, MFA box is installation key, dry run = Check the file; bcrypt/argon2/pbkdf2 hashes from other systems verify (tested) |
| `auth/invitations` | 92 | audited | FACT: invite links need a Site URL (open_link handles only verify/magic/email_change/recovery) |
| `auth/linked-accounts` | 74 | rewritten | Auto-link only on verified email (routes/identity/security.finish_federated), email_unverified_conflict, identity_already_linked, 409 last-method guard |
| `auth/machines` | 269 | todo | |
| `auth/organizations` | 402 | todo | |
| `auth/overview` | 67 | rewritten | Studio map from lib/authNavigation.js (People/Sign-in/Protection/Access/Records + SSO, Bot protection) |
| `auth/passkeys` | 107 | rewritten | identity/passkeys.py: rp_id default site_url host → public_url; allowed origins = site/public/redirect URLs on domain (Android apk origins refused); passkey sign-in is aal2 (routes/identity/passkeys.authenticate_verify); discoverable + UV required; ticket 300s; full failure table incl 409/501 |
| `auth/password-policy` | 79 | rewritten | FIXED: failure = 422 {message, problems} (TS issues empty → read body.problems; Py error.problems); expired = 403 password_expired; 'strict' = Sillo validate_password character classes (NOT common-password list); where each check runs (accounts.set_password/create_account) |
| `auth/protect-your-forms` | 188 | todo | |
| `auth/react` | 127 | todo | |
| `auth/redirect-urls` | 67 | rewritten | Now 'Redirect URLs and email links'. FACT: with Site URL, email links go to <site>/auth/callback?token&type (identity/links.py) → app finishes (verifyEmail/verifyMagicLink/confirmEmailChange/resetPassword/acceptInvitation); no Site URL → Pawabase link page → redirect_to#tokens. Matching = prefix at / or ? boundary (environment.redirect_allowed). Social fragments incl. errors (routes/identity/security.py) |
| `auth/roles` | 73 | rewritten | Was truncated (Plan changes section empty) + wrong wildcard claim. FACT: permissions exact match or '*' only (core/principal.has_permission, engine _shorthand); role name ^[a-z][a-z0-9_:-]{0,62}$; roles+perms in token; role list ANY / permission list ALL |
| `auth/sessions` | 151 | rewritten | Token anatomy, sliding refresh window, end-cause table, access tokens stateless (revoked session usable ≤ access_ttl), theft protection, admin revoke (sessions.list/revoke, users.revokeSessions), events, troubleshooting. FIXED: getSession may refresh; signOut others keeps this device; session.revoked not fired on expiry |
| `auth/sign-in-activity` | 108 | rewritten | All LoginEvent kinds/methods/reasons from log_event calls (added refresh, mfa_verify, profile_updated, captcha); admin events/stats fields; retention 3/30/90/180/365 (seed.py; old doc said 7 Free); attack-pattern table. FIXED Studio: When column read created_at but API returns `at` (blank column) |
| `auth/sign-in-links` | 111 | audited | Site URL vs no Site URL finish (verifyMagicLink in /auth/callback) |
| `auth/sign-up-form-and-attributes` | 96 | rewritten | identity/signup_form.py: identifiers (username/phone required+unique, normalisation), standard attr keys+storage, custom (12, key rules, types, ask:false), validation table, FIXED: errors are a string list in `problems` (not byField); locked enforcement on profile update; token `meta` claim all/listed (user-editable, don't trust); data keys not on form are stored unchecked; form not public |
| `auth/sign-up-restrictions` | 73 | rewritten | FIXED wrong error class (domain refusal is 403, not 422). Refusal table from routes/identity/auth.signup + accounts.create_account; admin create bypasses restrictions (enforce_restrictions=False) |
| `auth/social-sign-in` | 133 | rewritten | routes/identity/security.finish_federated: account find/link/create table, email-vouching per provider (Microsoft/Facebook never → email_unverified_conflict), full #error code list incl sillo_oauth codes, provider-side errors go to Site URL, SSR fragment recipe, custom server subject keys. REMOVED exchangeCode flow (no server endpoint) |
| `auth/token-profiles` | 111 | rewritten | identity/token_profiles.py: FIXED JWKS URL (/auth/v1/token-keys/{env}/jwks, not /auth/v1/jwks) and issuer (<api>/auth/v1/token-profiles/<full env>); all sources, reserved claims, limits (ttl 30–3600, 32 claims, 8KB resolved, 16KB profile, 50 profiles), refusal table, 60/min, no revocation, settings JSON. FIXED Studio snippet (called nonexistent auth.getToken) |
| `auth/two-step-verification` | 197 | rewritten | identity/mfa.py + routes/identity/security.py: aal table (passkey=aal2, remembered device=aal1), strategies (one TOTP + email, ±1 step, no reuse, backup code format), enrol elevates session, recovery codes empty when some remain, challenge 5 min / setup 15 min, email-only auto-send, 10/min, admins = admin/owner/superadmin/staff/org owner|admin, grace from creation, disable accepts backup code but regenerate doesn't, reset recipe. FIXED server: /mfa/totp/enroll ignored the Authenticator-app switch (test added) |
| `auth/user-api-keys` | 82 | rewritten | FIXED field: answer is `key` not `secret` (routes/identity/directory.make_key); scopes narrow perms not roles; ':*' scope wildcard; aal1; 45s revoke cache; key can't create keys |
| `auth/user-profile` | 155 | rewritten | routes/identity/auth.update_me: shallow merge, null kept, partial form check + locked, 422 problems, limits, email change pending (409), current_password rules, API key can't change pwd/email (403), other sessions stay. FIXED server: password change while signed in never sent the Password changed email (now follows recovery.notify_change; test added; Studio label updated) |
| `auth/users` | 94 | rewritten | routes/identity/admin.py: filters, create (verified by default, no email sent, bypass restrictions not policy), action table, metadata/roles REPLACE on update, no admin email change, refusals, timeline next_before, support recipes. Studio New-user hint fixed (implied an email is sent; none is) |

### database (28 pages, 3740 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `database/access` | 90 | todo | |
| `database/api-explorer` | 66 | todo | |
| `database/bulk-writes` | 250 | todo | |
| `database/caching-and-rate-limits` | 82 | todo | |
| `database/columns-and-types` | 105 | todo | |
| `database/events-and-realtime` | 69 | todo | |
| `database/filter` | 388 | todo | |
| `database/how-data-works` | 73 | todo | |
| `database/ids-and-timestamps` | 74 | todo | |
| `database/import-and-export` | 51 | todo | |
| `database/indexes` | 78 | todo | |
| `database/migrations-and-history` | 89 | todo | |
| `database/overview` | 78 | todo | |
| `database/patterns` | 107 | todo | |
| `database/quickstart` | 74 | todo | |
| `database/read` | 503 | todo | |
| `database/relations` | 115 | todo | |
| `database/rest-api` | 163 | todo | |
| `database/schemas` | 44 | todo | |
| `database/sort-and-page` | 283 | todo | |
| `database/sql-editor` | 64 | todo | |
| `database/table-editor` | 76 | todo | |
| `database/table-settings` | 134 | todo | |
| `database/tables-and-resources` | 105 | todo | |
| `database/topology` | 32 | todo | |
| `database/troubleshooting` | 92 | todo | |
| `database/typescript-types` | 118 | todo | |
| `database/write` | 337 | todo | |

### storage (14 pages, 1928 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `storage/access` | 208 | todo | |
| `storage/browse-files` | 65 | todo | |
| `storage/bucket-settings` | 97 | todo | |
| `storage/buckets` | 64 | todo | |
| `storage/download` | 293 | todo | |
| `storage/files-and-records` | 98 | todo | |
| `storage/images` | 128 | todo | |
| `storage/overview` | 72 | todo | |
| `storage/patterns` | 76 | todo | |
| `storage/quickstart` | 68 | todo | |
| `storage/share-links` | 102 | todo | |
| `storage/troubleshooting` | 79 | todo | |
| `storage/upload` | 336 | todo | |
| `storage/urls-and-links` | 242 | todo | |

### realtime (14 pages, 1947 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `realtime/channel-rules` | 131 | todo | |
| `realtime/channels` | 329 | todo | |
| `realtime/connection` | 264 | todo | |
| `realtime/history` | 165 | todo | |
| `realtime/monitoring` | 70 | todo | |
| `realtime/overview` | 91 | todo | |
| `realtime/patterns` | 69 | todo | |
| `realtime/playground` | 55 | todo | |
| `realtime/presence` | 209 | todo | |
| `realtime/protocols` | 37 | todo | |
| `realtime/publishing` | 78 | todo | |
| `realtime/quickstart` | 67 | todo | |
| `realtime/record-changes` | 318 | todo | |
| `realtime/troubleshooting` | 64 | todo | |

### logic (14 pages, 1843 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `logic/blocks/ai` | 136 | todo | |
| `logic/blocks/auth` | 66 | todo | |
| `logic/blocks/control` | 156 | todo | |
| `logic/blocks/data` | 285 | todo | |
| `logic/blocks/flows` | 106 | todo | |
| `logic/blocks/integrations` | 107 | todo | |
| `logic/blocks/overview` | 93 | todo | |
| `logic/blocks/resources` | 114 | todo | |
| `logic/blocks/storage-cache` | 145 | todo | |
| `logic/blocks/triggers` | 119 | todo | |
| `logic/flows` | 146 | todo | |
| `logic/overview` | 70 | todo | |
| `logic/patterns` | 155 | todo | |
| `logic/routes` | 145 | todo | |

### ai (19 pages, 1580 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `ai/agents/approvals-and-limits` | 72 | todo | |
| `ai/agents/create` | 59 | todo | |
| `ai/agents/overview` | 51 | todo | |
| `ai/agents/run-from-app` | 199 | todo | |
| `ai/agents/runs` | 56 | todo | |
| `ai/agents/tools` | 110 | todo | |
| `ai/apps/overview` | 65 | todo | |
| `ai/embeddings` | 106 | todo | |
| `ai/flows` | 88 | todo | |
| `ai/gateway` | 77 | todo | |
| `ai/knowledge/documents` | 96 | todo | |
| `ai/knowledge/overview` | 61 | todo | |
| `ai/mcp` | 7 | todo | |
| `ai/overview` | 69 | todo | |
| `ai/patterns` | 90 | todo | |
| `ai/pgvector` | 26 | todo | |
| `ai/troubleshooting` | 53 | todo | |
| `ai/use-it` | 180 | todo | |
| `ai/vector-search` | 115 | todo | |

### policies (28 pages, 2274 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `policies/api-keys-and-scopes` | 53 | todo | |
| `policies/code-rules` | 92 | todo | |
| `policies/combining` | 61 | todo | |
| `policies/common-mistakes` | 90 | todo | |
| `policies/condition-builder` | 98 | todo | |
| `policies/context` | 114 | todo | |
| `policies/debugging` | 90 | todo | |
| `policies/events` | 46 | todo | |
| `policies/how-rules-are-evaluated` | 85 | todo | |
| `policies/how-rules-work` | 101 | todo | |
| `policies/named-rules` | 61 | todo | |
| `policies/operators` | 73 | todo | |
| `policies/overview` | 79 | todo | |
| `policies/policies-in-studio` | 88 | todo | |
| `policies/quickstart` | 55 | todo | |
| `policies/realtime` | 61 | todo | |
| `policies/recipes-content` | 82 | todo | |
| `policies/recipes-ownership` | 105 | todo | |
| `policies/recipes-roles` | 95 | todo | |
| `policies/recipes-sensitive-actions` | 78 | todo | |
| `policies/recipes-teams` | 95 | todo | |
| `policies/routes-and-functions` | 49 | todo | |
| `policies/rule-references` | 52 | todo | |
| `policies/shorthands` | 92 | todo | |
| `policies/storage` | 85 | todo | |
| `policies/tables` | 81 | todo | |
| `policies/testing` | 116 | todo | |
| `policies/values-and-paths` | 97 | todo | |

### automation (11 pages, 1640 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `automation/event-catalogue` | 117 | todo | |
| `automation/events` | 233 | todo | |
| `automation/flow-editor` | 158 | todo | |
| `automation/inbound-hooks` | 148 | todo | |
| `automation/jobs` | 142 | todo | |
| `automation/overview` | 118 | todo | |
| `automation/reliability` | 99 | todo | |
| `automation/schedules` | 158 | todo | |
| `automation/webhook-deliveries` | 134 | todo | |
| `automation/webhook-signatures` | 112 | todo | |
| `automation/webhooks` | 221 | todo | |

### mail (9 pages, 1179 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `mail/activity` | 136 | todo | |
| `mail/brand-kit` | 105 | todo | |
| `mail/deliverability` | 89 | todo | |
| `mail/delivery` | 127 | todo | |
| `mail/overview` | 107 | todo | |
| `mail/sending` | 178 | todo | |
| `mail/template-language` | 177 | todo | |
| `mail/templates` | 171 | todo | |
| `mail/troubleshooting` | 89 | todo | |

### environments (7 pages, 545 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `environments/api-keys` | 67 | todo | |
| `environments/api-versions` | 47 | todo | |
| `environments/custom-domains` | 90 | todo | |
| `environments/overview` | 74 | todo | |
| `environments/previews` | 110 | todo | |
| `environments/promote` | 92 | todo | |
| `environments/settings` | 65 | todo | |

### activity (6 pages, 775 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `activity/alarms` | 192 | todo | |
| `activity/audit-log` | 83 | todo | |
| `activity/background-work` | 134 | todo | |
| `activity/overview` | 101 | todo | |
| `activity/requests` | 130 | todo | |
| `activity/status-page` | 135 | todo | |

### secrets (1 pages, 54 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `secrets/overview` | 54 | todo | |

### backups (3 pages, 330 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `backups/automatic` | 146 | todo | |
| `backups/overview` | 80 | todo | |
| `backups/restore` | 104 | todo | |

### cloud (4 pages, 249 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `cloud/billing` | 58 | todo | |
| `cloud/overview` | 66 | todo | |
| `cloud/plans-and-limits` | 57 | todo | |
| `cloud/team` | 68 | todo | |

### developers (4 pages, 1182 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `developers/admin-client` | 250 | todo | |
| `developers/blueprints` | 338 | todo | |
| `developers/management-client` | 542 | todo | |
| `developers/overview` | 52 | todo | |

### iac (25 pages, 1743 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `iac/agents` | 129 | todo | |
| `iac/buckets` | 53 | todo | |
| `iac/ci-cd` | 109 | todo | |
| `iac/commands` | 64 | todo | |
| `iac/emulate` | 40 | todo | |
| `iac/events` | 62 | todo | |
| `iac/examples` | 43 | todo | |
| `iac/fields` | 104 | todo | |
| `iac/flow-blocks` | 71 | todo | |
| `iac/flows` | 74 | todo | |
| `iac/limits` | 39 | todo | |
| `iac/mail-templates` | 45 | todo | |
| `iac/overview` | 73 | todo | |
| `iac/plan-and-deploy` | 82 | todo | |
| `iac/policies` | 92 | todo | |
| `iac/project` | 100 | todo | |
| `iac/quickstart` | 104 | todo | |
| `iac/relations-and-indexes` | 68 | todo | |
| `iac/roles` | 38 | todo | |
| `iac/routes` | 49 | todo | |
| `iac/schemas` | 31 | todo | |
| `iac/secrets-and-env` | 52 | todo | |
| `iac/tables` | 86 | todo | |
| `iac/validate` | 61 | todo | |
| `iac/webhooks` | 74 | todo | |

### mcp (10 pages, 524 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `mcp/claude-code` | 48 | todo | |
| `mcp/claude-desktop` | 37 | todo | |
| `mcp/codex` | 55 | todo | |
| `mcp/cursor` | 38 | todo | |
| `mcp/custom-client` | 73 | todo | |
| `mcp/keys` | 75 | todo | |
| `mcp/overview` | 57 | todo | |
| `mcp/self-hosted` | 46 | todo | |
| `mcp/troubleshooting` | 40 | todo | |
| `mcp/vscode` | 55 | todo | |

### integrations (12 pages, 3145 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `integrations/connected-apps` | 95 | todo | |
| `integrations/errors` | 174 | todo | |
| `integrations/example-app` | 491 | todo | |
| `integrations/management-api` | 468 | todo | |
| `integrations/oauth-flow` | 481 | todo | |
| `integrations/overview` | 134 | todo | |
| `integrations/personal-tokens` | 197 | todo | |
| `integrations/platform-apps` | 240 | todo | |
| `integrations/project-api` | 383 | todo | |
| `integrations/register-an-app` | 185 | todo | |
| `integrations/scopes-and-roles` | 146 | todo | |
| `integrations/security` | 151 | todo | |

### reference (2 pages, 386 lines)

| Page | Lines | Status | Notes |
| --- | --- | --- | --- |
| `reference/errors` | 204 | todo | |
| `reference/keys-and-security` | 182 | todo | |

## Findings to act on (other sections)

- automation/event-catalogue: missing `file.uploaded` / `file.deleted` (infra/storage/manager.py EVENT_NAMES).
- Rate limit is per API key (edge/admission.limit_key): document wherever limits are discussed (cloud/plans-and-limits, environments/api-keys).
- Key revocation takes up to ~30 s (key_cache_ttl); stale use up to ~60 s more during DB outage.
- Studio nav names: Develop(Data, API Explorer) · Security(Users & auth, Policies, Secrets) · Build(Flows, Routes, Schedules, Events, Webhooks) · Services(Mail, Storage, Realtime, AI) · Monitor(Activity, Usage & plan, Status page) · Manage(API versions, Backups, Settings, MCP).
- Studio pages with tabs (lib/sidebarSections.js): Events = Event log · Subscriptions · Event map · Insights; Flows = Flows · Runs · Insights; Activity = Overview · Traffic(Routes, Errors, Requests, Locations, Bandwidth) · Jobs · Logs(Logs, Alarms, Metrics) · Audit log; Settings = Project · Usage and limits · Environment · API access · API keys; Realtime = Workbench · Overview · Channels · Connections · Subscriptions · Protocols · Settings; AI = Overview · Models · Playground · Use in your app · Usage · Agents · Knowledge · Connections · Search by meaning. Old 'Activity → Events/Flow runs/Webhooks/Mail/Realtime' paths replaced repo-wide 2026-11-19.
- Email links: with a Site URL, links go to `<site_url>/auth/callback?token=…&type=verify|magic|email_change|recovery|invite[&redirect_to=]` — EVERY page that mentions email links must say the app handles /auth/callback (check sign-in-links, email-verification, account-recovery, invitations).
- Studio column types: Text (short), Text (long), Integer, Number, Yes / no, Choice, Multiple choice, Date & time, Date, UUID, ULID, Email, URL, JSON, List, Object, Schema reference, Vector (AI), Relation.
- Table Access quick sets: Private (service) · Signed-in read+change (authenticated) · Anyone reads (public list/get) · Owner (owner + authenticated create). Owner field is on the table's Settings tab.
- require_email_verification defaults to False (sign-up signs in at once). Studio label: 'Require a verified email'.

## Conventions

- Studio paths in bold, starting at the sidebar page: **Users & auth → Sign-in & registration**, **Data → Create table**. Add the sidebar group (Develop, Security, Build, Services, Monitor, Manage) only on introductory pages.
- Terms: *table* in Studio context, *resource* in API/SDK context; *access rule* in prose, *policy* when naming Studio's Policies page or the API field.

## Tooling

- `python3 scripts/check-sdk-names.py [files]`: flags `.method(` calls in TS/Python examples that exist nowhere in the SDK/IaC sources. Run on every rewritten page.

## SDK bugs found (report, don't document around)

- Python `admin.roles.put` docstring says permissions are `resource:action` patterns with `*` wildcards; the server matches exactly (only bare `*`). TS calls it `roles.define`, Python `roles.put` (inconsistent naming).

- TS `Identity.id` and `unlinkIdentity(identityId: number)` are typed `number`; server ids are ULID strings.

- SDKs don't send `x-device-id`: device tracking falls back to a UA fingerprint and remember-device never takes effect unless the app sets the header. Consider generating/persisting a device id in the SDKs.

- Studio Password policy labels `strict` as "Also refuse common passwords", but `strict` runs Sillo's `validate_password` (upper+lower+digit+special); no common-password list exists.

- TS `auth.apiKeys.create` return type says `secret`; the server answers the key as `key`.

- Guest purge (identity/guests.purge) uses last_login, which refresh never updates → active guests are deleted 30 days after starting. Probably should use last refresh/session activity.

- TS `auth.exchangeCode` / Python `auth.exchange_code` POST `/auth/v1/token/exchange`, which the server doesn't implement (no PKCE/code flow; social returns put tokens in the fragment). Dead API: remove from SDKs or implement on the server.

- Invitation links have no Pawabase fallback page (routes/identity/recovery.open_link kinds exclude `invite`): without a Site URL invitations can't be accepted from the email.

## Server fixes made during the audit (uncommitted in ~/sillo.build/pawabase)

- **Refresh-token expiry was never enforced** (core/ulid_auth.UlidJWTUserMixin.refresh_token_pair): rotation used `verify_no_expire` and never checked the row's `expires_at`, and rotated pairs got a hardcoded 15m/7d instead of the environment's `access_ttl`/`refresh_ttl`. Now: expired rows are refused, and identity/sessions.refresh_session passes the env lifetimes (sliding window). Test: tests/identity/test_accounts.py::test_refresh_refuses_expired_tokens_and_slides_the_window. Same bug exists upstream in Sillo's JWTUserMixin.refresh_token_pair (report to Sillo).
- **Any signed-in person could revoke another person's session by id** (identity/sessions.revoke_session revoked the JWT family without an owner check). Now checks the family belongs to the user. Test: test_a_person_cannot_revoke_someone_elses_session.
- **Erasure left personal data behind**: uploaded avatar file stayed in the avatars bucket (delete-user too), and mail logs kept the address, body and template data. Now: routes/identity/admin.privacy_erase + delete remove the avatar file; identity/privacy.erase_user strips the address from MailLog.to (parseaddr match) and clears html/text/data/attachments (`result.emails`). Test extended in tests/identity/test_privacy.py.

## Findings fixed outside auth

- IaC PASSWORD_POLICIES was (basic, strong, custom); server only knows basic/strict → fixed to (basic, strict) in _split/python-iac/pawabase_iac/environment/settings.py. IaC conformance tests already failing before (new server kind; flows `tags` not sent): handle in IaC section.

- cloud/plans-and-limits retention table was wrong (Free sign-in/audit 7→3, flow runs 3→1) and incomplete: replaced with all 10 kinds from pawabase-cloud/backend/pawacloud/seed.py; retention sweep runs daily (automation/scheduler TASKS).

## Log

- 2026-11-19: auth/sessions rewritten; two server fixes (refresh expiry, cross-user session revoke) with tests; identity+edge suites 253 green.

- 2026-11-19: Guides tab finished (tutorials audited: Studio paths, code names, SQL/scheduler facts).
- 2026-11-19: all 5 quickstarts rewritten and checked against SDK source (fixed invented iterate(), accessToken, retry.attempts, error.details in drafts).
- 2026-11-19: concepts section rebuilt (4 deep pages + tour); JavaScript quickstart rewritten.
- 2026-11-19: inventory made; navigation restructured (Platform, Developers, Integrations tabs; Reference merged with REST API).
