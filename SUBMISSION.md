# Submission — Ajaia Docs

**Candidate:** Vipsa Kamani
**Live app:** https://ajaia-llc-full-stack-product-engine-seven.vercel.app/
<br>
**Source:** https://github.com/vive12345/Ajaia-LLC-Full-Stack-Product-Engineer
<br>
**Walkthrough video:** see [`VIDEO_URL.txt`](VIDEO_URL.txt)

## Test accounts (no password, pick one on the login page)

| Account | Email | Role on "Welcome to Ajaia Docs" |
|---|---|---|
| Alice Johnson | alice@ajaia.dev | Owner |
| Bob Smith | bob@ajaia.dev | Editor |
| Carol Lee | carol@ajaia.dev | Viewer |

Use **Sign out** (top right) to switch users. 
<br>
To test file import, use **Import file** on the home page with a `.txt`, `.md` or `.docx` file (max 4 MB).

## What's included

| Item | Location |
|---|---|
| Source code | This repository (`src/`, `prisma/`, `tests/`) |
| Setup and run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| This file | `SUBMISSION.md` |
| Walkthrough video link | [`VIDEO_URL.txt`](VIDEO_URL.txt) |
| Detailed design documents | [`docs/architecture/`](docs/architecture/) |
| Step-by-step development log | [`docs/dev-log/`](docs/dev-log/) |
| Automated tests (71) | [`tests/`](tests/) |
| CI pipeline | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## What is working (end to end, on the live URL)

- **Documents:** create, rename, edit, delete (owner), reopen with formatting preserved.
- **Rich text:** bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo.
- **Autosave** with Saving / Saved / Not saved / Conflict status; warning before leaving with unsaved changes.
- **Conflict protection:** version-checked saves; a stale save gets a "Reload latest version" prompt (HTTP 409) instead of overwriting.
- **Sharing:** share by email as Viewer or Editor, list collaborators, revoke access.
- **Owned vs. shared:** "My documents" and "Shared with me" tabs with role badges.
- **Access control on the server:** 404 for no access, 403 for insufficient role, re-checked at write time.
- **File import:** `.txt`, `.md`, `.docx` → new editable document; unsupported or unsafe content dropped; clear errors.
- **Persistence:** PostgreSQL (Neon). Documents, formatting and shares survive refreshes and redeploys.
- **Quality:** 71 unit tests, CI on every PR, Vercel preview builds.

## What is incomplete or simplified

- **Authentication is mocked** (seeded users, no passwords), as allowed by the brief. Sessions are real signed cookies.
- **No real-time co-editing.** Simultaneous edits are detected and blocked (409), not merged.
- **On conflict, unsaved local changes are lost on reload.** There's no "keep mine / compare" view.
- **Import is one-way and lossy** for complex Word formatting (tables, images, colors); original files aren't stored.
- **One Neon database** serves both local development and the live demo.
- **No browser end-to-end tests** (Playwright). The editor UI is verified manually.

## What I would build next with another 2–4 hours

1. **Playwright end-to-end tests** for the main flow: create → format → autosave → reload → share → view as another user.
2. **Version history:** snapshots on save plus a restore button (the `version` column is already in place).
3. **Better conflict handling:** return the latest content with the 409 and offer "keep mine / keep theirs".
4. **Export to Markdown / PDF**, reusing the JSON → HTML conversion from import.
5. **Containerize** (multi-stage Dockerfile + docker-compose with Postgres) for one-command local setup and portability to AWS ECS Fargate.
