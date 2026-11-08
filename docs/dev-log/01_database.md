# 01 — Database Setup (`feat/db-setup`)

**Goal of this step:** create a real, persistent database that stores users, documents and sharing permissions, and fill it with demo data so the sharing flow can be tested immediately.

**Design reference:** [`docs/architecture/02_Deep_Dive_Into_Database.pdf`](../architecture/02_Deep_Dive_Into_Database.pdf)

**Result:** 3 tables live on Neon Postgres, seeded with Alice, Bob, Carol and one shared document. The work was committed on `feat/db-setup` and pushed to GitHub.

---

## 0. Order of work (summary)

| # | What was done | Why |
|---|---|---|
| 1 | Created branch `feat/db-setup` from `dev` | GitHub Flow: one feature per branch, so `dev` stays stable |
| 2 | Wrote `prisma/schema.prisma` (the data model) | One source of truth for tables, relations and types |
| 3 | Added database scripts and seed config to `package.json` | Everyone runs the same commands (`npm run db:migrate`, etc.) |
| 4 | Wrote `src/lib/db.ts` (shared Prisma client) | Prevents running out of database connections |
| 5 | Wrote `prisma/seed.ts` (demo data) | Reviewers can test sharing without manual setup |
| 6 | Fixed ESLint to ignore `coverage/` | Lint should check our code, not generated reports |
| 7 | Created the Neon project and `.env` | The app needs a real database reachable from Vercel |
| 8 | Fixed a secrets mistake (`.env.example` vs `.env`) | Secrets must never be committed to a public repo |
| 9 | Ran the first migration (`init`) | Actually created the tables on Neon, with SQL history saved |
| 10 | Ran the seed and verified with a query | Proved the data and relations really exist |
| 11 | Committed and pushed | Saved the work and made it reviewable as a PR |

---

## 1. Branch: `feat/db-setup`

```bash
git checkout -b feat/db-setup     # created from dev
```

**Why a branch:** `dev` should always be in a working state. Database work happens on its own branch and reaches `dev` only through a pull request, which gives a reviewable record of what changed and why.

---

## 2. The data model: `prisma/schema.prisma`

Prisma reads this file to:
1. Generate SQL migrations (create the tables).
2. Generate a **type-safe client**, so `prisma.document.findMany()` is checked by TypeScript.

**Why Prisma (and not raw SQL or Drizzle):** the fastest route from a schema to typed queries, with migrations and seeding built in. The tradeoff is a bit more weight and a code-generation step, which is acceptable for this timebox.

### 2.1 Generator

```prisma
generator client {
  provider = "prisma-client-js"
}
```
**Why:** tells Prisma to generate the JavaScript/TypeScript client that our app imports.

### 2.2 Datasource: two connection strings

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // pooled (runtime)
  directUrl = env("DIRECT_URL")   // direct (migrations)
}
```

| Setting | Used for | Why |
|---|---|---|
| `provider = "postgresql"` | Selects the Postgres dialect | Our data is relational (users ↔ documents ↔ shares), and Postgres enforces foreign keys and unique constraints |
| `url` = **pooled** connection | The running app | Vercel is serverless and may run many copies of our app at once. Each copy opening its own connection can exhaust Postgres's connection limit. Neon's pooler (the `-pooler` host) shares a small number of real connections between them |
| `directUrl` = **direct** connection | Migrations only | Migrations need features (like advisory locks) that don't work reliably through a connection pooler |
| `env(...)` | Reads values from environment variables | Secrets stay out of the code and out of git |

### 2.3 Enum: `ShareRole`

```prisma
enum ShareRole {
  VIEWER
  EDITOR
}
```
**Why an enum instead of a plain text column:** the database itself rejects invalid values like `"ADMIN"` or `"editr"`. TypeScript also knows the only valid values, so typos are caught at compile time.

**Why there's no `OWNER` role:** ownership is stored separately (`documents.owner_id`). See 2.5.

### 2.4 Model: `User`

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  ownedDocuments Document[]      @relation("DocumentOwner")
  shares         DocumentShare[]

  @@map("users")
}
```

| Piece | Why |
|---|---|
| `id String @id @default(uuid()) @db.Uuid` | **UUIDs instead of 1, 2, 3…**: IDs can't be guessed (`/docs/2` won't reveal that `/docs/3` exists), and they're unique across systems. `@db.Uuid` stores them in Postgres's native 16-byte `uuid` type instead of text |
| `email @unique` | Two accounts can't share an email. Sharing looks users up by email, so the lookup must return exactly one person. The unique constraint also creates an index, which keeps that lookup fast |
| `name` | Shown in the UI ("Owned by Alice Johnson") |
| `createdAt @default(now())` | Audit trail: when the account was created |
| `@map("created_at")` | **Code uses camelCase, the database uses snake_case.** TypeScript convention is `createdAt`, while SQL convention is `created_at`. `@map` lets each side follow its own convention |
| `@db.Timestamptz` | Stores time **with time zone**. Without it, a timestamp's meaning depends on the server's time zone, which causes bugs when servers or users are in different zones |
| `ownedDocuments`, `shares` | **Relation fields**: they exist only in Prisma, not as database columns. They let us write `user.ownedDocuments` in code |
| `@@map("users")` | Plural, lowercase table name, following SQL convention |

### 2.5 Model: `Document`

```prisma
model Document {
  id        String   @id @default(uuid()) @db.Uuid
  ownerId   String   @map("owner_id") @db.Uuid
  title     String   @db.VarChar(200)
  content   Json     @default("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}")
  version   Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  owner  User            @relation("DocumentOwner", fields: [ownerId], references: [id])
  shares DocumentShare[]

  @@index([ownerId, updatedAt(sort: Desc)], map: "idx_documents_owner_updated")
  @@map("documents")
}
```

| Piece | Why |
|---|---|
| `ownerId` (required) | **Every document has exactly one owner.** Ownership is a column, not a share row, because ownership is required and unique while shares are optional and many. It also makes the "My documents" query a simple `WHERE owner_id = ?` |
| `title @db.VarChar(200)` | A length limit in the database itself, so a buggy or malicious client can't store a 10 MB title. The API checks it too (with Zod), and the database is the last line of defense |
| `content Json` → Postgres `JSONB` | **Stores the TipTap editor's JSON** exactly as produced. Formatting (bold, headings, lists) comes back exactly as saved. JSONB is stored in a binary format that's efficient to read. We don't store HTML, which avoids injecting raw HTML from the database (an XSS risk) |
| `content @default(...)` | A new document starts as a valid empty editor document (one empty paragraph), never `null` and never invalid. The editor can always open it |
| `version Int @default(1)` | **Optimistic concurrency control.** Each save sends the version it loaded. The server updates only `WHERE version = loadedVersion` and increments it. If someone else saved in between, the versions don't match and the API returns **409 Conflict** instead of silently overwriting their work. That's a small cost for preventing "lost updates" (see the PDF, section 10) |
| `updatedAt @updatedAt` | Prisma sets this automatically on every update. Used to sort lists by "recently edited" |
| `owner @relation(...)` | Creates the **foreign key** `owner_id → users.id`. The database rejects a document whose owner doesn't exist |
| `@@index([ownerId, updatedAt DESC])` | **Speeds up the most frequent query:** "my documents, newest first". Postgres jumps straight to this user's rows, already sorted, instead of scanning and sorting the whole table |

### 2.6 Model: `DocumentShare` (the permissions table)

```prisma
model DocumentShare {
  id         String    @id @default(uuid()) @db.Uuid
  documentId String    @map("document_id") @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  role       ShareRole @default(VIEWER)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([documentId, userId], map: "unique_document_share")
  @@index([userId, documentId], map: "idx_shares_user_document")
  @@map("document_shares")
}
```

| Piece | Why |
|---|---|
| A separate table at all | Sharing is **many-to-many**: one document can be shared with many users, and one user can receive many documents. A join table models that. An array of emails on the document can't hold roles, can't be validated with foreign keys, and is awkward to query ("what's shared with Bob?") |
| `role @default(VIEWER)` | **Least privilege:** if no role is given, grant the weaker one |
| `onDelete: Cascade` (document) | Deleting a document automatically deletes its share rows, so there are no orphaned permissions pointing at nothing |
| `onDelete: Cascade` (user) | Deleting a user removes their access grants |
| `@@unique([documentId, userId])` | **The same person can't be shared the same document twice.** The database guarantees it even if two share requests arrive at the same moment. It also creates the index used for "does Bob have access to doc X?" |
| `@@index([userId, documentId])` | Speeds up the "Shared with me" list (`WHERE user_id = ?`). The unique index above starts with `document_id`, so it can't serve lookups by `user_id`, which is why this second index exists |

### 2.7 Deliberate differences from the design PDF

| PDF had | We did | Why |
|---|---|---|
| `DEFAULT gen_random_uuid()` in the database | UUIDs generated by Prisma | Simpler with Prisma. All inserts go through Prisma anyway |
| `CHECK (length(trim(title)) > 0)` | Checked in the API with Zod | Prisma doesn't support CHECK constraints in the schema. API validation gives a clear 400 error message |
| `updated_at DEFAULT NOW()` | `@updatedAt` (set by Prisma on every update) | Solves the PDF's own warning that `DEFAULT NOW()` only sets the *initial* value |
| No rule against sharing with yourself | Checked in the API | It's a business rule ("owner can't be a share recipient"), easier to express and explain in code |
| No `version` column (offered as an improvement) | `version` included from the start | Cheap now, much harder to add later. Protects against lost updates |

---

## 3. `package.json`: database scripts and seed config

```json
"scripts": {
  "build": "prisma generate && next build",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "db:reset": "prisma migrate reset",
  "postinstall": "prisma generate"
},
"prisma": { "seed": "tsx prisma/seed.ts" }
```

| Script | What it does | Why |
|---|---|---|
| `db:migrate` | Creates a new migration from schema changes and applies it (local development) | One memorable command |
| `db:deploy` | Applies existing migrations without creating new ones | The safe command for production (Vercel/Neon). It never generates or resets anything |
| `db:seed` | Runs `prisma/seed.ts` | Repeatable demo data |
| `db:reset` | Drops everything, reapplies migrations, reseeds | **Local only.** It deletes data |
| `postinstall` | Runs `prisma generate` after every `npm install` | Vercel and CI get a generated client automatically. Without it, the build fails with "Prisma Client not generated" |
| `build` → `prisma generate &&` | Generates the client before building | Belt and braces for deployment |
| `"prisma": { "seed": ... }` | Tells Prisma how to run the seed (`tsx` runs TypeScript directly) | The seed is written in TypeScript, so it shares types with the app |

**Why Prisma is pinned to v6:** Prisma 7 changes the configuration format (`prisma.config.ts`). Pinning avoids surprise breakage mid-project. The warning about `package.json#prisma` being deprecated only matters when upgrading to v7.

---

## 4. `src/lib/db.ts`: one shared database client

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

| Piece | Why |
|---|---|
| A single exported `prisma` | Every API route imports the same client instead of creating its own, so there's one connection pool |
| Stored on `globalThis` in development | **Next.js hot reload re-runs modules on every file save.** Without this, each save would create a new client and new database connections, and after a few minutes of coding you'd hit "too many connections". `globalThis` survives reloads, so the client is reused |
| Not stored globally in production | Production doesn't hot reload, so each server instance simply creates one client |
| Quieter logging in production | Development shows warnings to help debugging. Production logs only errors to avoid noise |

---

## 5. `prisma/seed.ts`: demo data

Creates:

| User | Email | Relationship to the sample document |
|---|---|---|
| Alice Johnson | alice@ajaia.dev | **Owner** |
| Bob Smith | bob@ajaia.dev | **Editor**: can read and edit |
| Carol Lee | carol@ajaia.dev | **Viewer**: read only |

Plus one document, **"Welcome to Ajaia Docs"**, with a heading, a paragraph using **bold**, *italic* and underline, a subheading, and a bulleted list of things to try.

| Design choice | Why |
|---|---|
| Seed data at all | Reviewers can test **every permission level in under a minute**. They sign in as each user and see the difference, with no manual setup |
| **Fixed IDs** (`00000000-…-0001`) | Rerunning the seed updates the same rows instead of creating duplicates. Tests and demos can also refer to known IDs |
| **`upsert`** (update if it exists, otherwise insert) | Makes the seed **idempotent**: running it twice gives the same result as running it once. Safe to run on every deploy or after a reset |
| One user per role | Covers owner, editor, viewer and outsider. Carol is an outsider for any document not shared with her |
| Content uses every required format | The seed document also demonstrates that formatting survives storage (it's stored as JSONB and renders correctly) |
| `ShareRole.EDITOR` enum values, not strings | Type-checked: a typo won't compile |
| `.catch` → `process.exit(1)` and `.finally` → `$disconnect()` | A failed seed exits with an error code (so CI notices), and connections are always closed |

---

## 6. `eslint.config.mjs`: ignore `coverage/`

```js
ignores: [ ..., "coverage/**" ]
```
**Why:** running tests with coverage generates an HTML report in `coverage/`. ESLint was linting those generated files and printing warnings. Lint should only check code we write.

---

## 7. Neon project and environment variables

**Neon settings chosen:**

| Setting | Choice | Why |
|---|---|---|
| Project name | `ajaia-docs` | Matches the app |
| Region | AWS US East 2 (Ohio) | US East is close to Vercel's default region (Washington, D.C.), so queries stay fast |
| Services | **Postgres only**. Object storage, functions, AI gateway, realtime and Better Auth all **off** | We only need a database. Our auth is custom (seeded users + signed cookie), imported files are converted into documents rather than stored, and real-time collaboration is out of scope. Fewer services, less to configure and explain |

**Files:**

| File | Contains | In git? | Why |
|---|---|---|---|
| `.env` | Real `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` | **No** (ignored by `.gitignore`) | Secrets must never be committed, especially to a public repo |
| `.env.example` | Placeholder values only | **Yes** | Tells another developer (or a reviewer) which variables to set, without exposing ours |

`SESSION_SECRET` was generated with `openssl rand -base64 32`. **Why:** the session cookie is signed with this secret. It must be long and random, or someone could forge a valid cookie.

---

## 8. Incident: secrets pasted into the wrong file

**What happened:** the real Neon connection strings and the session secret were pasted into `.env.example`. That file **is tracked by git**, and the repo is **public**.

**What we did:**
1. Moved the real values into `.env` (ignored by git).
2. Restored `.env.example` to placeholders.
3. Verified that git ignores `.env` (`git check-ignore -v .env`) and that **no commit in history contains the password** (`git log --all -p -- .env.example | grep npg_` returned 0 matches).
4. Removed a stray space in `DIRECT_URL= "..."` while moving it.

**Remaining action:** the password was also pasted into an AI chat. **Reset the Neon password before submitting** (Neon → Roles → `neondb_owner` → Reset password), then update `.env` and Vercel. Rotating `SESSION_SECRET` is also good practice.

**Lesson:** real values go in `.env`, placeholders go in `.env.example`. Check `git status` before every commit.

---

## 9. First migration: `init`

```bash
npm run db:migrate -- --name init
```

**What happened:**
1. Prisma compared the schema with the (empty) Neon database.
2. It generated `prisma/migrations/20261108064441_init/migration.sql`.
3. It applied that SQL to Neon using the **direct** connection.
4. It regenerated the Prisma client.

**What the SQL created:**
- Enum `ShareRole` (`VIEWER`, `EDITOR`)
- Tables `users`, `documents`, `document_shares`, each with a UUID primary key
- Unique index `users_email_key`, plus `idx_documents_owner_updated`, `idx_shares_user_document`, and the unique index `unique_document_share`
- Foreign keys:
  - `documents.owner_id → users.id`: **ON DELETE RESTRICT**, so a user who still owns documents can't be deleted (their documents would be left without an owner)
  - `document_shares.document_id → documents.id`: **ON DELETE CASCADE**
  - `document_shares.user_id → users.id`: **ON DELETE CASCADE**

**Why migrations are committed to git:**
- They're the **history of database changes**. Anyone (a teammate, CI, production) can rebuild the identical database with `prisma migrate deploy`.
- They're reviewable: the PR shows the exact SQL that will run.
- `migration_lock.toml` records the database type (`postgresql`) so migrations aren't accidentally applied to a different kind of database.

---

## 10. Seed and verification

```bash
npm run db:seed
# → Seeded 3 users and 1 shared document.
```

**Verification:** a one-off script (kept outside the repo) queried Neon and returned:
- 3 users: Alice Johnson, Bob Smith, Carol Lee
- 1 document, "Welcome to Ajaia Docs", owner **Alice**, `version: 1`
- Shares: **Bob → EDITOR**, **Carol → VIEWER**

**Why verify instead of trusting "success":** a success message only means the script finished. Querying the data proves the rows, relations and roles are really correct in the database the app will use.

---

## 11. Checks, commit and push

```bash
npm run typecheck   # ✅ passed
npm run lint        # ✅ passed
git add -A          # 5 files, confirmed: no .env, no secrets
git commit -m "feat(db): add prisma client, seed data and initial migration"
git push -u origin feat/db-setup
```

**Files in the commit:**
| File | Purpose |
|---|---|
| `prisma/migrations/20261108064441_init/migration.sql` | The SQL that created the tables |
| `prisma/migrations/migration_lock.toml` | Locks migrations to PostgreSQL |
| `prisma/seed.ts` | Demo data |
| `src/lib/db.ts` | Shared Prisma client |
| `eslint.config.mjs` | Ignore `coverage/` |

(`prisma/schema.prisma` and the `package.json` scripts were committed earlier in the project-setup commit on `dev`.)

**Why the commit message looks like that:** Conventional Commits (`feat(db): …`) make the history easy to scan and show the type and area of each change.

---

## 12. What this step makes possible

- **Persistence:** documents survive refreshes and redeploys (an assignment requirement).
- **Sharing demo:** owner, editor and viewer accounts exist from the start.
- **Data integrity enforced by the database:** valid owners, no duplicate shares, automatic cleanup on delete, valid roles only.
- **Lost-update protection** is ready (the `version` column) for the save API.
- **Fast core queries** thanks to indexes matched to real access patterns.

## 13. Known limitations (honest notes)

- Auth is mocked (seeded users), so anyone can sign in as any demo user. That's acceptable per the brief and covered in the next step.
- The database checks that content is valid JSON, not that it's a **valid TipTap document**. The API will check its structure.
- The "can't share with yourself" rule lives in the API, not the database.
- One shared Neon database is used for development and the demo. A production setup would use separate databases or branches (Neon supports branching).

## Next step

`feat/auth`: signed-cookie sessions, a login page for the seeded users, and 401 for signed-out requests. See [`docs/architecture/03_Authentication_Authorization.pdf`](../architecture/03_Authentication_Authorization.pdf).
