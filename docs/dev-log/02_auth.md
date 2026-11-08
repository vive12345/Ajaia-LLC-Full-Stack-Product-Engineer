# 02 — Authentication (`feat/auth`)
**Goal of this step:** know **who** is making each request. Every later feature (permissions, sharing, saving) depends on a trustworthy answer to "who is this?"

**Design reference:** [`docs/architecture/03_Authentication_Authorization.pdf`](../architecture/03_Authentication_Authorization.pdf)

**Result:** users pick a seeded demo account (Alice, Bob or Carol) and receive a signed, HttpOnly session cookie. Every API route can now call `requireUser()` to get the current user or reject the request with **401**. 14 unit tests passed, plus a manual end-to-end check against a running server.

---

## 0. What we did, in order
| # | What was done | Why |
|---|---|---|
| 1 | Synced `dev` and created `feat/auth` | Start from the latest merged work (database) |
| 2 | `src/lib/session.ts`: sign and verify tokens | The core security logic, kept pure so it's easy to test |
| 3 | `src/lib/session-cookie.ts`: cookie name only | Middleware runs on the Edge runtime, which can't load `node:crypto` |
| 4 | `src/lib/http.ts`: error helpers, CSRF check, route wrapper | Every API returns the same error format and handles failures safely |
| 5 | `src/lib/auth.ts`: current user, sessions | One place that knows how auth works, so swapping in real auth later changes only this file |
| 6 | `src/app/api/session/route.ts`: sign in, sign out, who am I | The HTTP endpoints for sessions |
| 7 | Login page + `LoginPicker` component | Reviewers switch users in one click to test sharing |
| 8 | Home page + `SignOutButton` | Shows who is signed in and lets you switch accounts |
| 9 | `src/middleware.ts`: redirect signed-out visitors | Better user experience: no blank or broken pages when signed out |
| 10 | `tests/session.test.ts` + coverage config | Prove forged, expired and malformed tokens are rejected |
| 11 | Fixed a coverage gap and a lint error | The quality gates caught real gaps, and we fixed them instead of lowering the bar |
| 12 | Manual end-to-end test with `curl` on a real server | Unit tests check functions; this checks the whole request flow |
| 13 | Commit and push | Saved and ready for a PR into `dev` |

---

## 1. Important concepts
| Term | Meaning in our app |
|---|---|
| **Authentication (AuthN)** | **Who are you?** Answered by the session cookie. Failure gives **401 Unauthorized** |
| **Authorization (AuthZ)** | **What can you do with this document?** Answered by ownership and share roles (next step). Failure gives **403 Forbidden** or **404 Not Found** |
| **Session** | Proof that the browser already signed in, so it doesn't have to sign in on every request |
| **Cookie** | A small value the browser stores and automatically sends with every request to our site |
| **HMAC signature** | A code computed from the cookie's contents plus a secret only the server knows. If anyone changes the contents, the code no longer matches |

**Why we chose demo authentication:** the assignment explicitly allows mocked auth. Reviewers need to test sharing between several users quickly, and a one-click user switch is the fastest way. Time saved on login flows goes into the editor and sharing, which is what's being graded.

**What this does not protect against:** anyone can choose any demo user, so it's **not real identity verification**. What **is** real is the session mechanism: cookies can't be forged or edited. Real auth (Auth.js / SSO) would replace only the sign-in step.

---

## 2. `src/lib/session.ts`: signed session tokens
### What a token looks like
```

eyJ1aWQiOiIwMDAw...In0 . k3J9xQ2v...Zp8

└──── payload ─────┘   └─ signature ─┘

base64url(JSON)         base64url(HMAC-SHA256(payload, SESSION_SECRET))

```

Payload: `{ "uid": "\<user id>", "exp": \<expiry in seconds> }`

### The functions
| Function | What it does |
|---|---|
| `createSessionToken(userId, secret, now)` | Builds the payload with a 7-day expiry, encodes it and appends the signature |
| `verifySessionToken(token, secret, now)` | Returns the payload **only if** the signature matches, the shape is valid and it hasn't expired. Otherwise returns `null` |
| `getSessionSecret()` | Reads `SESSION_SECRET` and **throws if it's missing or shorter than 32 characters** |

### Every decision and why
| Decision | Why |
|---|---|
| **Signed token instead of a sessions table in the database** | No database lookup is needed to check the signature, and there's no extra table or cleanup job. The tradeoff: a single session can't be revoked before it expires. Acceptable for a demo; a production system might add a sessions table |
| **HMAC-SHA256** | The standard way to detect tampering, built into Node (`node:crypto`), so no extra library is needed |
| **The payload is readable (not encrypted)** | It only contains a user ID and an expiry, nothing secret. What matters is that it **can't be changed**, and the signature guarantees that |
| **`base64url` encoding** | Safe to put in a cookie (no `+`, `/` or `=` characters that would need escaping) |
| **Expiry (`exp`) inside the signed payload** | An attacker can't extend their session, because changing `exp` breaks the signature. A stolen cookie also stops working after 7 days |
| **`timingSafeEqual` for comparing signatures** | A normal `===` stops at the first wrong character, so response timing could leak how many characters were right, letting an attacker guess the signature piece by piece. A constant-time comparison takes the same time regardless |
| **Length check before `timingSafeEqual`** | That function throws if the inputs have different lengths, so we check first and return `null` |
| **Validate the payload shape after verifying** | Even a correctly signed token must contain a string `uid` and a numeric `exp`. Defensive coding against our own future bugs |
| **`try/catch` around `JSON.parse`** | Malformed input must return `null` (treated as signed out), never crash the request |
| **`now` passed in as a parameter** | Tests can simulate "7 days later" without waiting or mocking the system clock |
| **No Next.js or database imports** | **Pure functions**, so they're trivial to unit test |
| **`getSessionSecret()` fails loudly** | A missing secret would otherwise create cookies signed with `undefined`, which anyone could forge. Crashing at startup is much safer than running insecurely |

---

## 3. `src/lib/session-cookie.ts`: just the cookie name
```ts

export const SESSION_COOKIE = "ajaia_session";

```

**Why it's a separate file:** `middleware.ts` runs on Next.js's **Edge runtime**, which doesn't include Node's `crypto` module. If the middleware imported `session.ts`, the build would fail. Putting the name in its own file means the middleware imports only what it needs. `session.ts` re-exports it so other code has one import location.

**Why the name `ajaia_session`:** app-specific, so it won't collide with cookies from other apps on `localhost` during development.

---

## 4. `src/lib/http.ts`: shared HTTP helpers
### `HttpError` and shortcuts
```ts

throw unauthorized();        // 401 "You need to sign in."

throw forbidden();           // 403

throw notFound();            // 404

throw badRequest("...");     // 400

throw conflict("...");       // 409 (used later for stale saves)

```

**Why we did this:** routes stay short and readable. A check like `if (!user) throw unauthorized()` reads like the rule it enforces. Status codes and messages are consistent across the whole API.

### `route(handler)` wrapper
Wraps every API handler and converts:

| Thrown | Response |
|---|---|
| `HttpError` | Its status plus `{ "error": message }` |
| `ZodError` (invalid input) | **400** plus the first validation message |
| Anything else | **500** "Something went wrong" (details go to the server log only) |

**Why we did this:**

- **Consistent format:** the frontend always reads `data.error`.

- **No leaked internals:** stack traces and database errors never reach the browser, where they could help an attacker.

- **No repeated try/catch** in every route.

### `assertSameOrigin(req)`: CSRF protection
**The attack it prevents (CSRF):** you're signed in to Ajaia Docs, then visit `evil.com`. That page silently submits a request to our API. Browsers attach cookies automatically, so without protection the request would run **as you**.

**Our two layers:**

1. **`SameSite=Lax` cookie** (see section 5): browsers don't send the cookie on cross-site POST, PATCH or DELETE requests.

2. **Origin check:** browsers always send an `Origin` header on those requests. If it doesn't match our host, we return **403**.

**Why requests without an `Origin` header are allowed:** they come from non-browser clients like `curl` or server scripts. A malicious website can't make a victim's browser send a request without `Origin`, so these requests can't carry a victim's cookies.

**Why `x-forwarded-host` is checked first:** on Vercel, requests pass through a proxy, so the original host arrives in `x-forwarded-host`.

---

## 5. `src/lib/auth.ts`: the auth module
| Function | What it does | Used by |
|---|---|---|
| `getCurrentUser()` | Reads the cookie, verifies it, **looks the user up in the database**, and returns `{ id, email, name }` or `null` | Pages (to show the name or redirect) |
| `requireUser()` | Same, but **throws a 401** instead of returning `null` | Every protected API route |
| `startSession(userId)` | Sets the signed cookie | Sign in |
| `endSession()` | Deletes the cookie | Sign out |

### Why look the user up in the database after verifying the token?
A valid signature proves **we** issued the token, not that the user **still exists**. If a user is deleted, their old cookie should stop working. It costs one fast primary-key lookup per request.

### Cookie settings and why each one matters
| Setting | Value | Why |
|---|---|---|
| `httpOnly` | `true` | **JavaScript on the page can't read the cookie.** If an XSS bug ever let an attacker run script on our page, they still couldn't steal the session. This is why we use a cookie and not `localStorage` |
| `sameSite` | `"lax"` | Not sent on cross-site POST, PATCH or DELETE (CSRF defense), but still sent when you follow a normal link to our site, so you stay signed in |
| `secure` | `true` in production | The cookie travels over **HTTPS only**, so it can't be read on public Wi-Fi. It's off in development because `localhost` uses plain HTTP |
| `path` | `"/"` | Sent to every page and API route |
| `maxAge` | 7 days | Matches the token's own expiry. The browser discards it, and the server would reject it anyway |

### Why all auth logic lives in one file
**Swapping in real authentication later (Auth.js, Google SSO) changes only this file.** API routes just call `requireUser()` and don't care how the user was identified.

---

## 6. `src/app/api/session/route.ts`: session endpoints
| Method | Purpose | Success | Failures |
|---|---|---|---|
| `GET /api/session` | Who am I? | 200 `{ user }` | 401 if signed out |
| `POST /api/session` `{ userId }` | Sign in as a demo user | 200 `{ user }` + cookie | 400 bad JSON, bad UUID or unknown user · 403 cross-site |
| `DELETE /api/session` | Sign out | 204 (no content) | 403 cross-site |
| Decision | Why |
|---|---|
| **Zod schema `z.uuid()`** | Rejects garbage before touching the database, with a clear message |
| **Invalid JSON gives a 400, not a crash** | `req.json()` throws on bad input, and we convert that into a helpful error |
| **Check the user exists before signing** | You can't create a session for a made-up user ID |
| **Sign in by user ID instead of email** | The login page already has the IDs from the database, so there's nothing to type and no typos |
| **`assertSameOrigin` on POST and DELETE** | These change state, so they need CSRF protection. GET only reads |
| **204 for sign-out** | The standard "success, nothing to return" status |
| **Wrapped in `route()`** | Consistent errors, no leaked internals |

---

## 7. Login page: `src/app/login/page.tsx` + `src/components/LoginPicker.tsx`
**Server component (`page.tsx`):**

- If you're already signed in, it redirects to `/`, since there's no reason to see the login page.

- Loads the users **directly from the database** on the server, so no extra API call is needed.

- Shows an amber notice: **"Demo authentication: accounts are seeded and no password is required…"**, explaining who owns, edits and views the sample document.

**Client component (`LoginPicker.tsx`):** one button per user, "Continue as Alice Johnson".

| Decision | Why |
|---|---|
| **Server component for the data, client component for clicks** | The database query stays on the server (credentials never reach the browser). Only the interactive part ships JavaScript |
| **`export const dynamic = "force-dynamic"`** | The page depends on cookies and the database, so it must render on every request. Next.js must not cache it at build time |
| **Spinner on the clicked button, all buttons disabled while pending** | Prevents double submits and shows that something is happening |
| **Shows the error message from the API** | The user sees **why** sign-in failed instead of nothing happening |
| **"No demo users found. Run `npm run db:seed`"** | A helpful message if someone runs the app without seeding |
| **`router.replace("/")` + `router.refresh()`** | `replace` means the back button doesn't return to the login page. `refresh` re-renders server components with the new cookie |
| **The demo-auth notice is visible on screen** | Honest about the limitation, and tells reviewers exactly how to test sharing |

---

## 8. Home page and sign out: `src/app/page.tsx` + `SignOutButton.tsx`
- The home page (still a placeholder) checks `getCurrentUser()`, redirects to `/login` if signed out, and shows **"Signed in as Bob Smith"** with a **Sign out** button.

- `SignOutButton` calls `DELETE /api/session`, then goes to `/login`.

**Why the home page checks the user too, when the middleware already redirects:** the middleware only checks that a cookie **exists**. The page verifies it's **valid**. Defense in depth means each layer does its own job.

---

## 9. `src/middleware.ts`: redirect signed-out visitors
```ts

if (!req.cookies.has(SESSION_COOKIE)) redirect("/login");

matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"]

```

| Decision | Why |
|---|---|
| **Checks only that the cookie exists, not its signature** | Middleware runs on the Edge runtime (no `node:crypto`). It's a **convenience for users, not a security boundary**. Real verification happens in `getCurrentUser()` and `requireUser()` on every request |
| **Skips `/login`** | Otherwise signed-out users would be redirected forever |
| **Skips `/api`** | APIs should return a **401 JSON error**, not an HTML redirect that the frontend can't handle |
| **Skips static assets** | Images and scripts must load on the login page too |
| **Clears the query string on redirect** | Keeps the URL clean |

---

## 10. Tests: `tests/session.test.ts`
**14 tests, all passing:**

| Test | What it proves |
|---|---|
| Round-trip | A token we create verifies correctly and returns the right user and expiry |
| **Tampered payload** (Bob's signature, Alice's ID) | **Identity swapping is impossible** |
| Wrong secret | Tokens from another server or secret are rejected |
| Expired | Tokens stop working after 7 days |
| 6 malformed inputs (`undefined`, `null`, `""`, `garbage`, `a.b.c`, `only-one-part.`) | Junk input returns `null` instead of crashing |
| Correctly signed but wrong shape | Defensive payload validation works |
| `getSessionSecret()`: valid, missing, too short | The app refuses to run with a missing or weak secret |

**Why we test `session.ts` and not the route itself:** this is where the security logic lives. Pure functions need no database, no server and no mocking, so the tests are fast and reliable in CI.

**Coverage config:** added `src/lib/session.ts` to the coverage list in `vitest.config.ts`.

---

## 11. Problems caught by our checks
| Problem | How it was caught | Fix |
|---|---|---|
| Coverage at 77%, below the 80% threshold | `npm run test:coverage` failed | `getSessionSecret()` had no tests, so we added them. Coverage went to **96%** |
| `require()` used in a test | ESLint error | Switched to a normal `import { createHmac } from "node:crypto"` |

**Why this matters:** we fixed the gaps instead of lowering the threshold or disabling the rule. The checks exist to catch exactly this.

---

## 12. Manual end-to-end verification
Started the real dev server and tested the full flow with `curl`:

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Visit `/` while signed out | Redirect to login | **307 → /login** ✅ |
| 2 | `GET /api/session` while signed out | 401 | **401** "You need to sign in." ✅ |
| 3 | Sign in with `userId: "nope"` | 400 | **400** "Invalid user id." ✅ |
| 4 | Sign in from `Origin: https\://evil.example` | 403 | **403** "Cross-site request blocked." ✅ |
| 5 | Sign in as Bob | 200 + cookie | **200**, cookie marked **HttpOnly** ✅ |
| 6 | `GET /api/session` as Bob | Bob's details | **200** Bob Smith ✅ |
| 7 | Home page as Bob | Shows his name | **200**, "Bob Smith" ✅ |
| 8 | **Forged cookie**: Alice's ID with Bob's signature | 401 | **401** ✅ |
| 9 | Sign out | 204 | **204** ✅ |
| 10 | `GET /api/session` after sign-out | 401 | **401** ✅ |
| 11 | Login page lists users | 3 buttons | Alice Johnson, Bob Smith, Carol Lee ✅ |

**Why test manually as well:** unit tests prove the functions work. This proves cookies, middleware, routes and the database all work **together** in a real server.

---

## 13. Commit and push
```bash

git commit -m "feat(auth): signed-cookie sessions with seeded demo users"

git push -u origin feat/auth

```

**Files:**

| File | Status |
|---|---|
| `src/lib/session.ts`, `session-cookie.ts`, `auth.ts`, `http.ts` | New |
| `src/app/api/session/route.ts` | New |
| `src/app/login/page.tsx`, `src/components/LoginPicker.tsx`, `SignOutButton.tsx` | New |
| `src/middleware.ts` | New |
| `tests/session.test.ts` | New |
| `src/app/page.tsx` | Changed (shows the signed-in user) |
| `vitest.config.ts` | Changed (coverage includes `session.ts`) |
| `docs/dev-log/01_database.md` | Changed. Note: edits to the database log were accidentally included in this commit because `git add -A` staged everything. **Lesson:** check `git status` and stage files deliberately |

---

## 14. HTTP status codes used (reference)
| Status | Meaning | Example |
|---|---|---|
| 200 | OK | Signed in, or "who am I" |
| 204 | OK, no content | Signed out |
| 307 | Temporary redirect | Signed-out visitor sent to `/login` |
| 400 | Bad request | Invalid JSON or user ID |
| 401 | Not signed in | No cookie, or a forged or expired one |
| 403 | Forbidden | Cross-site request (later: viewer tries to edit) |
| 500 | Server error | Unexpected failure (details only in server logs) |

---

## 15. Current limitations
- **Demo identity:** anyone can choose any seeded user. Not suitable for production.

- **No early revocation:** a session stays valid until it expires (7 days) unless the user signs out. Changing `SESSION_SECRET` invalidates all sessions at once.

- **The middleware doesn't verify signatures** (Edge runtime limitation). This is by design; servers verify every request.

- **No rate limiting** on sign-in. It would matter with real passwords.

## 16. What we would change for production
- Replace demo sign-in with **Auth.js** (Google/GitHub) or company **SSO**. Only `lib/auth.ts` changes.

- Add a **sessions table** for revocation ("sign out of all devices").

- Add **rate limiting** and audit logging for sign-ins.

- Rotate `SESSION_SECRET` periodically, supporting two secrets during a rotation.

