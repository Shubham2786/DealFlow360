# DealFlow360 — Codebase Documentation

> Developer reference for the code built so far (Modules 1–4: foundation, database
> bootstrap, API/web shells, Auth + RBAC). It explains **what** libraries/tools are used,
> **why**, **what each function does**, and **how requests are routed and where functions
> are used**. Updated as modules land.

---

## 1. Technology Choices & Rationale

### Tooling

| Tool | Version | Why |
|------|---------|-----|
| **pnpm workspaces** | 11.x | Monorepo without heavy orchestration (Turbo/Nx). Symlinks shared code; single install. pnpm 11 requires `allowBuilds` in `pnpm-workspace.yaml` to run native build scripts. |
| **TypeScript** | 5.x | Type safety across api/web/shared; one shared type source. |
| **Docker Compose** | — | Local PostgreSQL, reproducible, no host install needed. |
| **Git** | — | Per-module commit history. |

### Backend (`apps/api`)

| Library | Why |
|---------|-----|
| **NestJS** | Structured DI, modules, guards, decorators — enforces the controllers → services → engines layering. |
| **Prisma** | Type-safe DB client + migrations against PostgreSQL. |
| **@nestjs/jwt** | Sign/verify JWT access & refresh tokens. |
| **argon2** | Password hashing (memory-hard, current best practice over bcrypt). |
| **cookie-parser** | Parse HTTP-only auth cookies into `req.cookies`. |
| **class-validator / class-transformer** | Declarative DTO validation at the HTTP boundary via the global `ValidationPipe`. |
| **@nestjs/config** | Env config (`.env`) available app-wide. |

### Frontend (`apps/web`)

| Library | Why |
|---------|-----|
| **Next.js (App Router)** | React framework, file-based routing, server/client components. |
| **TanStack Query** | Server-state caching, loading/error states, mutations — avoids ad-hoc fetch state. |
| **Tailwind CSS** | Utility-first styling for a consistent design system. |

### Shared (`packages/shared`)

- Plain TS + **Zod**. Holds domain **enums** and **DTO schemas** so api and web never
  drift. Compiled to `dist` and consumed via the workspace symlink (`@dealflow/shared`).

---

## 2. Repository Map

```text
apps/
  api/                      NestJS backend
    src/
      main.ts               bootstrap (prefix, pipes, CORS, cookies)
      app.module.ts         root module wiring
      prisma/               PrismaService + global module
      health/               health check endpoint
      auth/                 auth service/controller, guards, decorators, DTOs
  web/                      Next.js frontend
    app/                    routes (App Router)
      layout.tsx            root layout + providers
      page.tsx              redirects → /dashboard
      providers.tsx         React Query provider
      dashboard/page.tsx    dashboard (auth-guarded)
      auth/login/page.tsx   login form
      auth/signup/page.tsx  signup form
    components/app-shell.tsx sidebar + header layout
    lib/api.ts              typed fetch client
    lib/use-auth.ts         auth hooks (useCurrentUser, useRequireAuth)
packages/shared/src/        enums.ts, contracts.ts, index.ts
prisma/                     schema.prisma, migrations/, seed.ts
docker-compose.yml          local PostgreSQL (host port 5433)
```

---

## 3. Backend — Functions, Routing & Usage

### 3.1 `apps/api/src/main.ts` — `bootstrap()`
The API entry point. Steps and why:
1. `NestFactory.create(AppModule)` — builds the DI container.
2. `app.setGlobalPrefix('api')` — every route is served under `/api`.
3. `app.use(cookieParser())` — populates `req.cookies` so guards can read auth cookies.
4. `useGlobalPipes(new ValidationPipe({ whitelist, transform, forbidNonWhitelisted }))` —
   validates/sanitizes all incoming DTOs; strips unknown fields and rejects extras.
5. `enableCors({ origin: WEB_ORIGIN, credentials: true })` — allows the browser to send
   cookies cross-origin from the Next.js app.
6. `app.listen(API_PORT)` — starts HTTP server (default `3001`).

**Used by:** the `start`/`start:dev`/`start:prod` scripts. Nothing calls it directly.

### 3.2 `apps/api/src/app.module.ts` — `AppModule`
Root module. Imports `ConfigModule.forRoot({ isGlobal: true })` (env), `PrismaModule`
(DB), `AuthModule` (auth); registers `HealthController`. This is the composition root —
new feature modules get imported here as they are built.

### 3.3 `apps/api/src/prisma/`
- **`PrismaService`** extends `PrismaClient` and implements:
  - `onModuleInit()` → `this.$connect()` (opens the DB connection at startup; logs it).
  - `onModuleDestroy()` → `this.$disconnect()` (clean shutdown).
  It is the single DB access point injected into every service.
- **`PrismaModule`** is `@Global()` and exports `PrismaService`, so any module can inject
  it without re-importing.

**Used by:** `HealthController`, `AuthService`, and all future services.

### 3.4 `apps/api/src/health/health.controller.ts`
- **Route:** `GET /api/health`
- **`check()`** runs `SELECT 1` via Prisma. Returns `{ status, db, timestamp }`:
  `status: 'ok'` when the DB responds, `'degraded'` otherwise. Never throws — it reports
  connectivity rather than failing.

**Used by:** the web dashboard's API-connectivity card (`api.health()`), and manual
uptime checks.

### 3.5 Auth module (`apps/api/src/auth/`)

#### DTOs — `dto/auth.dto.ts`
- **`LoginDto`** `{ email, password(min8), rememberMe? }`
- **`SignupDto`** `{ email, password(min8), name, role? }`
Decorated with class-validator rules; the global `ValidationPipe` enforces them before a
controller method runs. Invalid input → `400`.

#### Guards
- **`JwtAuthGuard.canActivate(ctx)`** (`guards/jwt-auth.guard.ts`)
  - `extract(req)` reads the token from the `df_access` cookie, falling back to a
    `Bearer` header.
  - Verifies it with `JWT_ACCESS_SECRET`. On success attaches
    `req.user = { id, email, role, name }` and returns `true`. On failure throws
    `401 Unauthorized`.
  - Exposes cookie-name constants `ACCESS_COOKIE = 'df_access'`, `REFRESH_COOKIE = 'df_refresh'`.
  - **Used by:** any route with `@UseGuards(JwtAuthGuard)` (currently `GET /auth/me`; all
    future protected routes).
- **`RolesGuard.canActivate(ctx)`** (`guards/roles.guard.ts`)
  - Reads required roles from the `@Roles(...)` metadata via `Reflector`.
  - If none are required → allow. Otherwise allow when the user's role matches or the user
    is `ADMIN` (universal access). Else throws `403 Forbidden`.
  - **Used by:** future role-restricted routes, paired with `JwtAuthGuard`.

#### Decorators
- **`@Roles(...roles)`** (`decorators/roles.decorator.ts`) attaches required-role metadata
  read by `RolesGuard`.
- **`@CurrentUser(field?)`** (`decorators/current-user.decorator.ts`) pulls `req.user`
  (set by `JwtAuthGuard`) into a handler param; optional `field` returns one property.

#### Service — `auth.service.ts` (business logic)
Private helpers:
- **`sha256(value)`** — hashes refresh tokens before storing them (never store raw tokens).
- **`issueTokens(user)`** — signs an access token (`JWT_ACCESS_SECRET`, short TTL) and a
  refresh token (`JWT_REFRESH_SECRET`, long TTL, random `jti`), stores the **hashed**
  refresh token in `refresh_tokens`, and returns the pair. Central to login/signup/refresh.

Public methods:
- **`signup(dto)`** — rejects duplicate email (`409`), hashes the password with argon2,
  creates the `User`, returns tokens.
- **`login(dto)`** — looks up the user, checks `active`, verifies the password with
  `argon2.verify`; invalid → `401`; else returns tokens.
- **`refresh(refreshToken)`** — verifies the refresh JWT, confirms the hashed token exists
  and is not revoked/expired, **rotates** it (marks the old one revoked), and issues a new
  pair. Missing/invalid → `401`.
- **`logout(refreshToken)`** — revokes the stored refresh token (idempotent; safe if
  already gone).
- **`me(userId)`** — returns the safe user projection (no `passwordHash`).

#### Controller — `auth.controller.ts` (HTTP + cookies)
Cookie helpers:
- **`setCookies(res, tokens)`** — writes `df_access` and `df_refresh` as `httpOnly`,
  `sameSite=lax`, `secure` in production, with TTL-based `maxAge`.
- **`clearCookies(res)`** — removes both cookies on logout.

Routes (all under `/api/auth`):

| Method & Route | Handler | Guard | What it does |
|----------------|---------|-------|--------------|
| `POST /auth/signup` | `signup()` | — | Creates account, sets cookies, `{ ok: true }` |
| `POST /auth/login` | `login()` | — | Authenticates, sets cookies |
| `POST /auth/refresh` | `refresh()` | — | Rotates tokens using `df_refresh` cookie |
| `POST /auth/logout` | `logout()` | — | Revokes refresh token, clears cookies |
| `GET /auth/me` | `me()` | `JwtAuthGuard` | Returns current user (via `@CurrentUser`) |

#### `AuthModule`
Imports `JwtModule.register({})` (secrets/TTL passed per-call in the service), declares
`AuthController`, provides/exports `AuthService`, `JwtAuthGuard`, `RolesGuard` so other
modules can guard their routes.

---

## 4. Frontend — Functions, Routing & Usage

### 4.1 Routing (Next.js App Router)

| Route | File | Notes |
|-------|------|-------|
| `/` | `app/page.tsx` | Server redirect → `/dashboard` |
| `/dashboard` | `app/dashboard/page.tsx` | Auth-guarded operational overview |
| `/auth/login` | `app/auth/login/page.tsx` | Login form |
| `/auth/signup` | `app/auth/signup/page.tsx` | Signup form |

The sidebar (`app-shell.tsx`) also links to future routes (quotations, approvals, etc.).

### 4.2 `app/layout.tsx` — `RootLayout`
Wraps every page in `<Providers>` and imports global styles. Sets page metadata.

### 4.3 `app/providers.tsx` — `Providers`
Creates one `QueryClient` (memoized in `useState`) and supplies `QueryClientProvider`.
Defaults: 1 retry, no refetch-on-focus, 30s stale time. Enables all data hooks.

### 4.4 `lib/api.ts` — typed fetch client
- **`apiFetch<T>(path, init)`** — wraps `fetch` with `credentials: 'include'` (sends auth
  cookies), JSON headers, `no-store`. On non-2xx, parses the error body and throws
  **`ApiError(status, message)`**. Returns parsed JSON (or `undefined` for `204`).
- **`ApiError`** — error type carrying HTTP `status`; lets callers branch on `401`, etc.
- **`api`** object — grouped callers used across the UI:
  - `api.health()` → `GET /health`
  - `api.auth.login(email, password)` → `POST /auth/login`
  - `api.auth.signup(input)` → `POST /auth/signup`
  - `api.auth.logout()` → `POST /auth/logout`
  - `api.auth.me()` → `GET /auth/me`

### 4.5 `lib/use-auth.ts` — auth hooks
- **`useCurrentUser()`** — `useQuery(['me'])` calling `api.auth.me()`; returns `null` on
  `401` (treats "not logged in" as data, not an error), rethrows other errors.
- **`useRequireAuth()`** — builds on `useCurrentUser`; when resolved to `null`, redirects
  to `/auth/login`. Returns the query so pages can render loading states.
  **Used by:** `dashboard/page.tsx` and every future protected page.

### 4.6 `components/app-shell.tsx` — `AppShell`
Presentational layout: fixed sidebar nav (`NAV` array of links) + top header +
scrollable content area. Wraps authenticated pages for consistent chrome.

### 4.7 Pages
- **`dashboard/page.tsx` — `DashboardPage`**: calls `useRequireAuth()` (guard + user) and
  `useQuery(['health'])`. Shows a loading state until auth resolves, greets the user, and
  renders an API-connectivity card from the health response.
- **`auth/login/page.tsx` — `LoginPage`**: controlled email/password form; `useMutation`
  → `api.auth.login`; on success invalidates `['me']` and routes to `/dashboard`; shows
  server error text; disables the button while pending (prevents double submit).
- **`auth/signup/page.tsx` — `SignupPage`**: same pattern for `api.auth.signup`.

---

## 5. Request Flow Examples (end-to-end)

**Login:**
```text
LoginPage form submit
  → useMutation → api.auth.login(email,password) → apiFetch POST /api/auth/login (credentials: include)
    → ValidationPipe validates LoginDto
    → AuthController.login → AuthService.login (argon2.verify) → issueTokens → store hashed refresh
    → setCookies(df_access, df_refresh)  ← Set-Cookie
  → onSuccess: invalidate ['me'] → router.replace('/dashboard')
```

**Protected access:**
```text
DashboardPage → useRequireAuth → api.auth.me() → GET /api/auth/me (df_access cookie)
  → JwtAuthGuard verifies token, sets req.user
  → AuthController.me(@CurrentUser) → AuthService.me → safe user JSON
  → 401 ⇒ useCurrentUser returns null ⇒ redirect /auth/login
```

**Token refresh (rotation):**
```text
POST /api/auth/refresh (df_refresh cookie)
  → AuthService.refresh: verify JWT → check stored hash (not revoked/expired)
  → revoke old token → issueTokens → setCookies (new pair)
```

---

## 6. Data Model (current)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Accounts | `email` (unique), `passwordHash`, `role` (enum), `active` |
| `refresh_tokens` | Session refresh with rotation/revocation | `tokenHash` (unique), `userId`, `expiresAt`, `revoked` |
| `app_settings` | Key/value system settings (used later by Admin) | `key` (unique), `value` |

Enums (`UserRole`, `QuotationStatus`, `FulfillmentStatus`, …) are declared in
`schema.prisma` and mirrored in `packages/shared/src/enums.ts` so the DB and app agree.

---

## 7. Configuration & Environment

`.env` (from `.env.example`) drives everything:
- `DATABASE_URL` — Prisma → PostgreSQL (host port **5433** to avoid a native 5432 server).
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `*_TTL` — token signing and lifetimes.
- `API_PORT` (3001), `WEB_ORIGIN` (CORS), `NEXT_PUBLIC_API_URL` (web → api base URL).

`pnpm-workspace.yaml` lists workspaces and `allowBuilds` (Prisma/argon2 native builds).

---

## 8. Conventions

- Controllers validate + translate HTTP only; services hold logic; engines (coming) are
  pure. No business logic in the frontend.
- Secrets never hashed-in-plaintext: passwords via argon2, refresh tokens stored as SHA-256.
- Every protected route uses `JwtAuthGuard` (+ `RolesGuard` when role-restricted).
- Shared enums/DTOs live in `@dealflow/shared` — never duplicated per app.
