# Ajaia Docs

A lightweight collaborative document editor inspired by Google Docs. Create documents, edit them with rich-text formatting, have them saved automatically, and share them with other users as viewers or editors.

**🌐 Live app:** https://ajaia-llc-full-stack-product-engine-seven.vercel.app/

---

## Try it in 1 minute (no setup)

Open the live app and pick a demo account. There are no passwords; this is mocked authentication, as the assignment allows.

| Account | Email | Role on the sample document "Welcome to Ajaia Docs" |
|---|---|---|
| **Alice Johnson** | alice@ajaia.dev | **Owner**: can edit, share and delete |
| **Bob Smith** | bob@ajaia.dev | **Editor**: can read and edit |
| **Carol Lee** | carol@ajaia.dev | **Viewer**: read only |

**Suggested walkthrough:**
1. Sign in as **Alice**, then **New document**. Type, and use the toolbar for **bold**, *italic*, underline, headings and lists. Watch the status change to **Saved**, then refresh: the formatting is kept.
2. Click **Share**, then add `bob@ajaia.dev` as **Can edit** and `carol@ajaia.dev` as **Can view**.
3. **Sign out**, then sign in as **Bob**. The document is under **Shared with me**, and he can edit it.
4. Sign in as **Carol**. She sees a **View only** banner and can't edit.
5. Back as Alice, click **Import file** on the home page and choose a `.txt`, `.md` or `.docx` file. It opens as a new editable document.

To switch users, use **Sign out** in the top-right corner.

---

## Features

| Area | What works |
|---|---|
| **Documents** | Create, rename (inline title), edit, delete (owner only), reopen with formatting intact |
| **Rich text** | Bold, italic, underline, headings (H1–H3), bulleted and numbered lists, undo/redo, keyboard shortcuts |
| **Autosave** | Saves 0.8 s after you stop typing, with a "Saving… / Saved / Not saved / Conflict" status and a warning before leaving with unsaved changes |
| **Conflict protection** | Each save is version-checked. If someone else saved first, you get a *Reload latest version* prompt instead of silently overwriting their work (HTTP 409) |
| **Sharing** | Share by email as **Viewer** or **Editor**, see who has access, remove access |
| **Owned vs. shared** | Home page tabs: **My documents** and **Shared with me**, with role badges |
| **Access control** | Enforced on the server for every request. Users without access get 404, users with too low a role get 403 |
| **Sessions** | Signed, HttpOnly, SameSite=Lax cookie (Secure in production), plus CSRF origin checks |
| **File import** | **Import file** on the home page turns a **`.txt`, `.md` or `.docx`** file (max **4 MB**) into a new editable document titled after the file. Headings, paragraphs, lists, bold, italic and underline are kept. Images, tables, colors and other formatting are dropped. Unsafe HTML (e.g. `<script>`) is removed |

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router) + **TypeScript** (frontend and API in one app) |
| Editor | **TipTap v3** (ProseMirror). Content stored as JSON |
| Database | **PostgreSQL** (Neon in the cloud), accessed through **Prisma 6** |
| Validation | **Zod** |
| Styling | **Tailwind CSS v4** + lucide-react icons |
| Tests | **Vitest** (with coverage) |
| CI | **GitHub Actions**: lint, type check, tests + coverage on every PR |
| Hosting | **Vercel** (app) + **Neon** (Postgres), both free tiers |

Design rationale and tradeoffs: [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/architecture/`](docs/architecture/).

---

## Run it locally

### Prerequisites
- **Node.js 22+** (see `.nvmrc`; with nvm, run `nvm use`)
- **A PostgreSQL database.** Either:
  - **Option A (no install):** a free [Neon](https://neon.tech) project, or
  - **Option B:** a local Postgres 14+ (e.g. `brew install postgresql@16 && brew services start postgresql@16`)

### 1. Clone and install
```bash
git clone https://github.com/vive12345/Ajaia-LLC-Full-Stack-Product-Engineer.git
cd Ajaia-LLC-Full-Stack-Product-Engineer
npm install            # also runs `prisma generate`
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Then edit `.env`:

| Variable | Option A: Neon | Option B: local Postgres |
|---|---|---|
| `DATABASE_URL` | **Pooled** connection string (host contains `-pooler`) | `postgresql://localhost:5432/ajaia_docs` |
| `DIRECT_URL` | **Direct** connection string (Connection pooling off) | `postgresql://localhost:5432/ajaia_docs` |
| `SESSION_SECRET` | Output of `openssl rand -base64 32` | Same |

For option B, create the database first: `createdb ajaia_docs`.

`.env` is git-ignored. Never commit real credentials.

### 3. Create the tables and the demo data
```bash
npm run db:deploy      # applies the migrations in prisma/migrations
npm run db:seed        # creates Alice, Bob, Carol + a sample shared document
```
The seed is safe to run more than once; it never creates duplicates.

### 4. Start the app
```bash
npm run dev
```
Open **http://localhost:3000**. You'll be redirected to the login page with the three demo accounts.

### Troubleshooting
| Problem | Fix |
|---|---|
| Login page says "No demo users found" | Run `npm run db:seed` |
| Error mentioning `SESSION_SECRET` | Set it in `.env` (at least 32 characters) |
| Database connection errors | Check both URLs in `.env`. Neon URLs need `?sslmode=require` |
| Strange "module not found" errors after switching branches | Stop the server, run `rm -rf .next`, start again |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run all unit tests |
| `npm run test:coverage` | Tests + coverage report (fails below the thresholds) |
| `npm run db:migrate` | Create and apply a new migration (development) |
| `npm run db:deploy` | Apply existing migrations (safe for production) |
| `npm run db:seed` | Insert the demo users and sample document |
| `npm run db:reset` | ⚠️ Drop and recreate the database, **local only** |

---

## Tests

```bash
npm test               # 71 tests
npm run test:coverage  # with coverage table
```

| Test file | What it proves |
|---|---|
| `tests/access.test.ts` | The full permission matrix: owner, editor, viewer and no access × view, edit, share, delete. 404 vs. 403 behavior |
| `tests/session.test.ts` | Session tokens: valid round-trip; **forged identity**, wrong secret, expired and malformed tokens rejected; weak secrets refused |
| `tests/validation.test.ts` | Title rules, editor-content shape and size limit, version required for saves, email normalization |
| `tests/http.test.ts` | CSRF origin check, error-to-JSON mapping, no internal details leaked in 500s, malformed JSON gives 400 |
| `tests/import.test.ts` | `.txt` / `.md` / `.docx` import keeps headings, lists, bold and italic; `<script>` is stripped; unsupported, empty, oversized, blank and corrupted files are rejected |

CI runs lint, type check and tests with coverage on every pull request.

---

## Deployment (cloud)

The live app runs on **Vercel**, with its database on **Neon Postgres**.

| Piece | Where |
|---|---|
| App (pages, API routes, middleware) | Vercel, deployed automatically from the `main` branch |
| Database | Neon Postgres (free tier, US East) |
| Secrets | Vercel environment variables: `DATABASE_URL` (pooled), `DIRECT_URL`, `SESSION_SECRET` |

**To deploy your own copy:**
1. Create a Neon project, put its URLs in `.env`, then run `npm run db:deploy && npm run db:seed`.
2. On vercel.com: **Add New → Project →** import this repo. The preset is detected as **Next.js**; keep the default build settings.
3. Add the three environment variables above, then **Deploy**. Skip the optional "Prisma Postgres" integration, since you already have a database.
4. Every push to `main` redeploys. Every PR gets its own preview URL.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                  Home: My documents / Shared with me
│   ├── login/                    Demo account picker
│   ├── docs/[id]/                Editor page (+ not-found)
│   └── api/
│       ├── session/              Sign in / sign out / who am I
│       └── documents/            List, create, get, rename, save, delete
│           └── [id]/shares/      Share and revoke access
├── components/                   DocumentEditor, EditorToolbar, ShareDialog, DocumentLists, …
├── lib/
│   ├── access.ts                 Permission rules (single source of truth)
│   ├── auth.ts, session.ts       Signed-cookie sessions
│   ├── validation.ts             Zod input rules
│   ├── documents.ts              Role lookup, "editable by" filter
│   ├── http.ts                   Errors, CSRF check, route wrapper
│   └── db.ts                     Shared Prisma client
└── middleware.ts                 Redirect signed-out visitors to /login
prisma/                           Schema, migrations, seed
tests/                            Unit tests
docs/
├── architecture/                 Design documents (system, database, auth)
└── dev-log/                      Step-by-step development log with rationale
```

---

## API overview

All endpoints use JSON and the session cookie. Errors are returned as `{ "error": "message" }`.

| Method & path | Who | Notes |
|---|---|---|
| `POST /api/session` | Anyone | `{ userId }`, signs in as a demo user |
| `DELETE /api/session` | Signed in | Signs out |
| `GET /api/documents` | Signed in | `{ owned, shared }` |
| `POST /api/documents` | Signed in | Create a document |
| `GET /api/documents/:id` | Any role | Document + your role |
| `PATCH /api/documents/:id` | Owner, editor | `{ title?, content?, version? }`. A stale `version` returns **409** |
| `DELETE /api/documents/:id` | Owner | |
| `POST /api/documents/:id/shares` | Owner | `{ email, role: "VIEWER" \| "EDITOR" }` |
| `DELETE /api/documents/:id/shares/:userId` | Owner | Revoke access |
| `POST /api/import` | Signed in | Multipart field `file` (`.txt` / `.md` / `.docx`, max 4 MB), creates a new document |

---

## Known limitations

- **Demo authentication:** anyone can sign in as any seeded user. This is intentional for reviewing.
- **No real-time co-editing:** simultaneous edits are protected by version checks (conflict prompt), not merged live.
- **One shared Neon database** serves both local development and the live demo.
- See [`SUBMISSION.md`](SUBMISSION.md) for what's incomplete and what I'd build next.

## More documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md): what I prioritized and why
- [`AI_WORKFLOW.md`](AI_WORKFLOW.md): how AI tools were used and verified
- [`SUBMISSION.md`](SUBMISSION.md): what's included, what works, what's next
- [`docs/dev-log/`](docs/dev-log/): detailed step-by-step development log
