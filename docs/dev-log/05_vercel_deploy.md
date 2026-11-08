# 05 — Deploying to Vercel

**Goal of this step:** put the app on a public URL that reviewers can open and test, as the assignment requires ("a working deployment reviewers can access").

**Result:** the Vercel project was created from the GitHub repo's `main` branch, environment variables were configured, and a deployment was started. It uses the same Neon database that was migrated and seeded in step 01.

**Live URL:** https://ajaia-llc-full-stack-product-engine-seven.vercel.app/

---

## 0. Order of work (summary)

| # | What was done | Why |

|---|---|---|

| 1 | Imported the GitHub repo into Vercel (Hobby plan) | Vercel builds and hosts Next.js apps with no server setup |

| 2 | Kept the defaults: root `./`, preset **Next.js**, default build settings | Our `build` script already includes `prisma generate` |

| 3 | Added 3 environment variables (`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`) | The app can't reach the database or sign sessions without them |

| 4 | **Declined** the "Prisma Postgres" integration | We already have Neon. Adding it would create a second, empty database |

| 5 | Clicked **Deploy** | Builds and publishes the app |

---

## 1. Why Vercel

| Option | Why / why not |

|---|---|

| **Vercel** ✅ | Made by the creators of Next.js: zero configuration, free Hobby plan, deploys automatically on every push to `main`, preview URLs for branches, HTTPS included |

| Cloudflare Workers | Considered in the architecture phase. CPU-time and code-size limits on the free plan, and less mature Next.js support, made it riskier for this timebox |

| Render | Free tier sleeps when idle, so the first visit takes 30–60 s. Bad for reviewers |

| AWS / self-hosted | Too much setup for a take-home |

**The requirement it satisfies:** "Do not require reviewers to pay for a dependency or service." Vercel Hobby and Neon Free are both free, and reviewers just open a URL.

---

## 2. Creating the Vercel project

**Steps:** vercel.com → sign in with GitHub → **Add New → Project** → import `vive12345/Ajaia-LLC-Full-Stack-Product-Engineer` (branch `main`).

| Setting | Value | Why |

|---|---|---|

| Vercel Team | Personal (Hobby, free) | No cost for reviewers or for us |

| Project name | `ajaia-llc-full-stack-product-engineer` (or shortened to `ajaia-docs`) | A shorter name gives a cleaner URL (`ajaia-docs.vercel.app`) |

| Root directory | `./` | The Next.js app is at the repo root |

| Application preset | **Next.js** (auto-detected) | Vercel knows how to build and serve it |

| Build and output settings | **Defaults** | The default build runs `npm run build`, which is `prisma generate && next build` in our `package.json`. Install runs `npm install`, which triggers `postinstall: prisma generate` |

**Why `prisma generate` must run during the build:** the Prisma client is generated code. It doesn't live in git and must be created on Vercel's build machine. Without it the build fails with "Prisma Client not generated". We ensured it runs in **two** places (`postinstall` and `build`) for safety.

---

## 3. Environment variables

| Key | Value from | Used for |

|---|---|---|

| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`) | All app queries at runtime |

| `DIRECT_URL` | Neon **direct** connection string | Prisma migrations (and required by the schema's `directUrl`) |

| `SESSION_SECRET` | The 32-byte random secret from `openssl rand -base64 32` | Signing session cookies (HMAC) |

**Environments:** Production and Preview.

### How they were added

The **Import .env** button opens a file picker, but **macOS hides files that start with a dot**, so `.env` didn't appear. Two ways around it:

1. In the file picker, press **⌘ Cmd + ⇧ Shift + .** to show hidden files, then select `.env`, or

2. Open `.env` in VS Code, copy everything (**⌘A, ⌘C**), and paste it into the **Key** field. Vercel splits the lines into separate variables automatically.

### Checks after adding

\- Exactly three variables. Any leftover empty `EXAMPLE_NAME` row removed.

\- Values **without surrounding quotes** (quotes would become part of the value and break the connection string).

| Decision | Why |

|---|---|

| **Secrets only in Vercel's encrypted settings**, never in git | The repo is public. `.env` is git-ignored; `.env.example` holds placeholders only |

| **Pooled URL for the app** | Vercel runs many serverless instances at once. Without pooling they'd exhaust Neon's connection limit |

| **Same `SESSION_SECRET` format as locally** | `getSessionSecret()` refuses to run if the secret is missing or shorter than 32 characters, so a misconfiguration fails loudly instead of running insecurely |

---

## 4. Declined: the "Prisma Postgres" integration

Vercel detected Prisma in the project and offered **Prisma Postgres, "Free autoscaling Postgres"**, with an **Add** button.

**We did not add it.** Why:

\- We already have a working, migrated and seeded database on **Neon**.

\- Adding it would create a **second, empty** database and could **overwrite `DATABASE_URL`**, leaving the live site with no tables and no demo users. Login would break.

\- One database is simpler to reason about, document and explain.

---

## 5. Database for production

**No extra migration step was needed for this first deploy.**

| Question | Answer |

|---|---|

| Are the tables on the production database? | Yes. Migration `20261108064441_init` was applied to this Neon database in step 01 |

| Is the demo data there? | Yes. The seed created Alice, Bob, Carol and the sample shared document |

| What about future schema changes? | Run `npm run db:deploy` (`prisma migrate deploy`) against production. It applies only committed migrations and never resets data |

**Honest note:** development and production currently **share one Neon database**. That's fine for a demo, but anything created while testing locally also appears on the live site. In a real project you'd use separate databases, or **Neon branches** (a copy of the database per environment).

---

## 6. Deploy

Clicked **Deploy**. Vercel:

1. Clones `main` from GitHub (a clean copy, nothing from the local machine).

2. Runs `npm install` → `postinstall` → `prisma generate`.

3. Runs `npm run build` → `prisma generate && next build`.

4. Publishes static assets to the CDN and API routes, pages and middleware as serverless functions.

5. Gives the production URL, with HTTPS automatically.

**Why we expect it to succeed:** the same `npm run build` passed locally in step 04 (production build), and CI passes on every PR.

---

## 7. Verification checklist (on the live URL)

| # | Check | Expected |

|---|---|---|

| 1 | Open the live URL | Redirect to `/login`, three demo users listed |

| 2 | Continue as **Alice** | Home page, "My documents (1)" with "Welcome to Ajaia Docs" |

| 1 | Open the sample doc | Editor loads with formatting, Share and Delete buttons visible |

| 2 | Type something | Status: Saving… → **Saved**. Refresh, and the change is still there |

| 3 | Sign in as **Bob** | "Shared with me", Can edit, editing works |

| 4 | Sign in as **Carol** | View only banner, no toolbar |

| 5 | Browser DevTools → Cookies | `ajaia_session` is **HttpOnly** and **Secure** (HTTPS in production) |

| 8 | Open `/docs/\<random-uuid>` | "Document not found" |

**Results (automated `curl` run against the live URL):**

| # | Check | Result |

|---|---|---|

| 1 | `/` while signed out | **307 → /login** ✅ |

| 2 | Login page | 200, Alice, Bob and Carol listed ✅ |

| 1 | Sign in as Alice, Bob, Carol | 200 / 200 / 200 ✅ |

| 2 | Session cookie flags | **HttpOnly** and **Secure = TRUE** (HTTPS in production) ✅ |

| 3 | Alice's home page | "My documents (1)" with "Welcome to Ajaia Docs" ✅ |

| 4 | Bob's home page | "Shared with me" lists shared docs ✅ |

| 5 | Alice opens the sample doc | 200, "You own this document" ✅ |

| 8 | Carol opens the sample doc | 200, **"View only"** ✅ |

| 9 | Create a document | 201, version 1 ✅ |

| 10 | Save at v1, then a stale save at v1 | **200**, then **409 Conflict** ✅ |

| 11 | Carol opens Alice's private doc | **404** ✅ |

| 12 | Cross-site POST (`Origin: evil.example`) | **403** ✅ |

| 13 | Delete the test doc | 204 ✅ |

Bob's "Shared with me" showed 2 documents rather than 1, because a document shared with him during local testing also exists in the shared dev/prod database (see section 5).

**Still to check manually in a browser:** typing, the toolbar, autosave timing and the share dialog (the editor runs only in the browser).

---

## 8. How future deploys work

| Event | What Vercel does |

|---|---|

| Push or merge to `main` | **Production deploy** to the live URL |

| Push to any other branch / open a PR | **Preview deploy** with its own URL (shown on the PR). Great for testing before merging |

| A build fails | The previous production version stays live. Nothing breaks for users |

**Why that's a good fit with our workflow:** GitHub Flow + CI + Vercel previews means every change is checked (CI) and viewable (preview URL) before it reaches production.

---

## 9. Security notes for deployment

\- **HTTPS everywhere**, so the session cookie gets the `Secure` flag in production (`NODE_ENV=production`).

\- **Secrets live only in Vercel's encrypted environment variables.**

\- **Remaining action:** the Neon password was shared during setup. **Reset it** (Neon → Roles → `neondb_owner` → Reset password), then update `DATABASE_URL` and `DIRECT_URL` in **both** `.env` and **Vercel → Settings → Environment Variables**, and **redeploy** (Vercel only reads new values on the next deploy). Rotating `SESSION_SECRET` the same way is also recommended; it signs everyone out, which is fine.

## 10. Known limitations

\- **Shared dev/prod database:** local testing data shows up on the live site.

\- **The Neon free tier** may pause after inactivity, so the first request after a long idle period can take about a second longer.

\- **No custom domain:** the default `*.vercel.app` URL is used.

\- **No monitoring or alerts** (Sentry, uptime checks). Next step for production.
