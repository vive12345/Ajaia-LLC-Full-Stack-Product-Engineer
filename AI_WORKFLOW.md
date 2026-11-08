# AI Workflow Note

> **Draft. Edit into your own words before submitting.**

## AI tools used

- **Claude Code (in VS Code)**: planning and architecture discussion, writing code and tests, running checks and git/GitHub commands, and drafting documentation.
- <!-- Add any other tools you used, e.g. for the design PDFs -->



## What I changed or rejected

- **Design before code.** I stopped the AI from scaffolding immediately and required an architecture discussion first. I then wrote my own design documents (system, database, auth) and used them to steer the implementation, e.g. permission checks inside the `UPDATE` and a `version` column for conflict detection.
- **Scope cuts:** dropped shadcn/ui in favor of plain Tailwind to save time.
- **Git discipline:** the AI used `git add -A`, which swept my in-progress notes into a feature commit. I set a rule to stage files by explicit path and to commit dev logs only when I say so.
- **Rewrote AI-generated PR descriptions** in simpler, clearer language.
- **Secrets:** caught real credentials pasted into the committed `.env.example`, moved them to the git-ignored `.env`, and verified git history was clean. The password will be rotated.

## How I verified correctness, UX quality and reliability

- **Automated tests (71)** with coverage thresholds that **failed the build** until real gaps were tested, rather than lowering the bar.
- **Tests caught real bugs in AI-written code:** an email validated *before* trimming (so `" Bob@Ajaia.dev "` was rejected), a type error, and a lint error. All fixed properly.
- **An AI-written test script had its own bug** (a zsh variable named `path` broke `curl`). A reminder to verify the verifier.
- **CI on every PR** (lint, type check, tests) and **Vercel preview builds** before merging.
- **Manual end-to-end checks** with real cookies against the real database, then against production: 401/403/404/409 behavior, cookie flags (HttpOnly, Secure).
- **Manual browser testing** of the editor, autosave, conflict handling, sharing and import, which automated tests don't cover.
