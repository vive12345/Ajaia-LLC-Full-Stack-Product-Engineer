# Architecture Note

Detailed design documents: [`docs/architecture/`](docs/architecture/). Step-by-step reasoning: [`docs/dev-log/`](docs/dev-log/).

## What I prioritized and why

The brief rewards **a coherent, working product slice** over broad, shallow coverage. I prioritized:

1. **Correct access control.** Sharing is where a bug would leak someone's data, so permissions live in one place, are enforced on the server for every request, and are covered by the most tests.
2. **An editing experience that doesn't lose work.** Autosave with a visible status, plus **version-checked saves** so two people editing at once can't silently overwrite each other.
3. **A live deployment early**, so the product could be tested end to end instead of only locally.
4. **Clear communication:** README, dev logs, PR descriptions and honest limitations.

## System overview


![alt text](image.png)

Every API request follows the same path: **authenticate → validate → authorize → act**.

## Key decisions and tradeoffs

| Decision | Why | Tradeoff accepted |
|---|---|---|
| **Next.js monolith** (UI + API in one app) | One language, shared types, one deploy, fastest to ship | Frontend and backend can't be scaled separately |
| **TipTap**, content stored as **JSON in Postgres `jsonb`** | Required formatting is built in; formatting round-trips exactly; no raw HTML stored | Content isn't full-text searchable without extra work |
| **Postgres + Prisma** | Data is relational; foreign keys, unique `(document, user)` shares and cascade deletes enforce integrity | An external database to manage |
| **Owner column + `document_shares(role)`** | Exactly one owner; simple owned/shared queries; Viewer/Editor roles for one extra column | No groups, folders or link sharing |
| **404 for no access, 403 for too low a role** | Doesn't reveal that private documents exist | Slightly less explicit for outsiders |
| **Optimistic concurrency** (`version`; stale save → 409) | Prevents lost updates without real-time infrastructure | Users must reload on a conflict; edits aren't merged |
| **Permission re-checked inside the `UPDATE`** | Closes the race where access is revoked mid-save | Slightly more complex queries |
| **Seeded users + signed cookie** (mocked auth, allowed by the brief) | Reviewers switch users in one click to test sharing; cookie can't be forged | Not real identity verification. Only `lib/auth.ts` changes for real auth |
| **Import → new document** (`.txt`, `.md`, `.docx`, 4 MB) | Most product-relevant upload; converted with the editor's own schema, so unsafe or unsupported content is dropped | Images, tables and rich Word styling are lost; originals aren't stored |
| **Vercel + Neon (free tiers)** | Live URL in minutes, no cost for reviewers | Serverless (no WebSockets); dev and prod share one database |

## Deliberately out of scope

Real-time co-editing and presence, comments and suggestions, version history, real authentication, images and tables inside documents, Docker/AWS packaging. Each was cut to keep depth in editing, sharing and correctness.

## Quality

- **71 unit tests** (Vitest) covering the full permission matrix, session tokens, validation, CSRF/error handling and file import, with coverage thresholds enforced.
- **CI** (GitHub Actions) runs lint, type check and tests on every PR; **Vercel preview deploys** confirm the production build.
- Manual end-to-end checks of every permission case against the real database and the live URL.

## What I'd build next

See [`SUBMISSION.md`](SUBMISSION.md#what-i-would-build-next-with-another-24-hours) for the next 2–4 hours, and [`docs/architecture/`](docs/architecture/) for the longer-term scaling path (Docker on AWS ECS Fargate, then real-time collaboration with Yjs, Redis and Aurora).
