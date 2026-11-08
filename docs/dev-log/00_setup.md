# 00 — Repository Setup for Ajaia Docs

## 1. What are we setting up, and why?

Before building the document editor, we need a repository that is easy to understand, run, test, and review. This step is about organizing the project, not implementing the editor yet.

Our goal is simple: when someone opens the repository, they should quickly understand where the code lives, how to start the app, how we test changes, and where to find our design decisions.

We will use **Next.js, TypeScript, Prisma, GitHub, and Vercel**. The structure below is a plan; some files and folders will be created later as we build features.

## 2. Planned folder structure

```text
ajaia-docs/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                 # Automatically checks our code
│   └── pull_request_template.md  # Explains each change before merging
├── docs/
│   ├── architecture/             # High-level design, database, auth PDFs
│   ├── dev-log/                  # Notes on what we built and learned
│   └── screenshots/              # Images for README and submission
├── prisma/
│   ├── schema.prisma             # Database models
│   ├── migrations/               # History of database changes
│   └── seed.ts                   # Sample users and document for local testing
├── src/
│   ├── app/                      # Pages and API routes
│   │   ├── login/
│   │   ├── docs/[id]/
│   │   ├── api/
│   │   └── page.tsx
│   ├── components/               # Reusable UI: editor, toolbar, share dialog
│   └── lib/                      # Database, authentication, permissions, validation
├── tests/                        # Automated tests
├── .env.example                  # Example environment variables, no secrets
├── .gitignore                    # Files Git should not upload
├── .nvmrc                        # Node.js 22
├── README.md                     # How to install, run, and test
├── ARCHITECTURE.md               # Short explanation of our design
├── AI_WORKFLOW.md                # How AI tools helped during development
├── SUBMISSION.md                 # What we are submitting
└── VIDEO_URL.txt                 # Demo video link
```

### Why divide the code this way?

- **`src/app/` handles requests and pages.** Next.js uses this folder for routing. A document page goes in `docs/[id]/`, while server endpoints go in `api/`. We want API routes to stay small: receive a request, check it, call the correct logic, and return a response.
- **`src/lib/` holds the important logic.** For example, `lib/access.ts` can answer: “Can Alice edit this document?” Keeping this logic outside the page makes it easier to reuse and test. We do not want to accidentally implement different permission rules in different API endpoints.
- **`src/components/` holds reusable UI.** The toolbar or sharing dialog may appear in multiple places. A component should not need to know how our database works.
- **`prisma/` tracks our database design.** `schema.prisma` describes tables and relationships. Migrations record changes so another developer can build the same database. Seed data gives us predictable sample users (Alice, Bob, Carol) and a document to test with.
- **`tests/` checks behavior.** We especially need tests for access rules and file imports because mistakes there could expose documents or accept bad inputs.
- **`docs/` keeps explanations separate from code.** The PDFs explain why we chose the architecture; the development log records what actually happened. This is useful when reviewing decisions or discussing the project in an interview.
- **Root files are easy for reviewers to find.** README, architecture summary, AI workflow, submission instructions, and video link should not be hidden several folders deep.

## 3. Basic project settings

| Setting | What we will do | Why |
|---|---|---|
| Secrets | Keep real values in local `.env` files and Vercel settings; commit only `.env.example` | Passwords and keys should never be pushed to GitHub |
| `.gitignore` | Ignore dependencies, build output, local secrets, and `.claude/`; allow `.env.example` | Git should track source code, not generated files or private settings |
| Node.js | Put `22` in `.nvmrc` and set a compatible `engines.node` range in `package.json` | Helps developers and CI use compatible runtimes |
| npm scripts | Add `dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`, and `db:reset` as the tools are configured | Everyone uses the same simple commands |
| Linting | Keep ESLint | Catches common coding problems early |
| Formatting | Skip adding Prettier for now | Avoid extra setup while the project is small |
| Pre-commit hooks | Skip Husky for now | GitHub CI can run checks without adding another local tool |

**Important:** `.env.example` should contain names and fake/example values only. The `!.env.example` rule in `.gitignore` is useful if a broader `.env*` pattern would otherwise ignore it. Also, `db:reset` should only be used on a local development database because it can delete data.

### Scripts we want eventually

```text
npm run dev          Start the app locally
npm run build        Check that a production build works
npm run lint         Find common code problems
npm run typecheck    Find TypeScript type errors
npm test             Run automated tests
npm run db:migrate   Apply database changes
npm run db:seed      Add sample data
npm run db:reset     Reset a LOCAL development database
```

We should add each script with a real implementation. A script that only prints “success” without running a check would give reviewers a false sense of confidence.

## 4. How we will use Git and GitHub

We will follow **GitHub Flow** because it is simple for a small project.

1. Keep `main` as our stable branch. Vercel will deploy production from `main` once deployment is configured.
2. Create a short-lived branch for each feature, such as `feat/auth` or `fix/editor-save`.
3. Make small commits that explain what changed, such as `feat(editor): add formatting toolbar`.
4. Open a pull request (PR). Explain **what changed, why we made the change, and how we tested it**.
5. Run automated checks. Fix failures before merging.
6. Squash-merge the PR and delete the feature branch. This keeps `main` easy to read.

**Why not write everything directly on `main`?** A feature branch gives us a place to experiment without breaking the stable version. PRs also create a readable history of our decisions, even if only one person is developing the project.

## 5. Continuous integration (CI)

CI means GitHub automatically runs checks whenever we open or update a pull request, and whenever code is pushed to `main`.

Our workflow will:

1. Check out the code.
2. Set up Node.js 22.
3. Install the exact dependency versions from the lockfile using `npm ci`.
4. Run ESLint.
5. Run the TypeScript type check.
6. Run automated tests.

**Why do this if the code already works on our laptop?** A clean CI environment can catch missing dependencies, accidental local assumptions, and mistakes we forgot to test. It also gives reviewers visible evidence that our basic checks pass.

Some database tests may need a test database or mocks. We should configure those intentionally rather than giving CI production database credentials. The workflow can be added early, but it will only turn green after the scripts and tests actually exist.
