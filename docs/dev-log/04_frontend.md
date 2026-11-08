# 04 — Frontend: Document List, Editor and Share Dialog (`feat/editor`)
****Goal of this step:**** give users the actual product in the browser: see their documents, create one, edit it with rich-text formatting, have it saved automatically, and share it with others.

****Builds on:**** the API from step 03 (`docs/dev-log/03_documents.md`). The frontend only calls those endpoints. All permission decisions stay on the server.

****Result:**** home page with "My documents" / "Shared with me" tabs, a TipTap editor with a formatting toolbar and version-checked autosave, read-only mode for viewers, and a share dialog. Type check, lint, 59 tests and the ****production build**** all passed, and the rendered pages were smoke-tested for each user. Merged via PR #5 into `dev`, then released to `main` via PR #6.

---
## 0. Order of work (summary)
| # | What was done | Why |

|---|---|---|

| 1 | Created `feat/editor` ****on top of `feat/documents`**** (PR #4 wasn't merged yet) | Saved time: frontend work started without waiting for the API PR |

| 2 | `AppHeader` component | The same top bar (logo, signed-in user, sign out) on every page |

| 3 | Home page (`src/app/page.tsx`) + `DocumentLists` | The assignment needs a ****visible distinction between owned and shared documents**** |

| 4 | Editor page (`src/app/docs/[id]/page.tsx`) + `not-found.tsx` | Loads the document on the server, with a permission check before anything is shown |

| 5 | `EditorToolbar` | Bold, italic, underline, headings, lists (required formatting) plus undo/redo |

| 6 | `DocumentEditor`: editor, autosave, rename, delete, read-only mode | The core editing experience |

| 7 | `ShareDialog` | The sharing requirement: grant and revoke access from the UI |

| 8 | Editor content styles in `globals.css` | Headings and lists must look like headings and lists |

| 9 | Type check, lint, tests, ****production build**** | The build is exactly what Vercel runs, so it catches deploy failures early |

| 10 | Smoke test of rendered pages as Alice, Bob, Carol | Proves each role sees the right UI |

---
## 1. How the frontend is structured
```

src/app/

├── page.tsx                  Home (server): loads lists → <DocumentLists>

├── login/page.tsx            (from step 02)

└── docs/[id]/

    ├── page.tsx              Editor page (server): permission check, loads doc → <DocumentEditor>

    └── not-found.tsx         Friendly 404

src/components/

├── AppHeader.tsx             Top bar (server-friendly)

├── DocumentLists.tsx         Tabs, rows, "New document" (client)

├── DocumentEditor.tsx        Editor, autosave, rename, delete, read-only (client)

├── EditorToolbar.tsx         Formatting buttons (client)

├── ShareDialog.tsx           Share by email, list/remove collaborators (client)

├── LoginPicker.tsx           (from step 02)

└── SignOutButton.tsx         (from step 02)

```

### The main pattern: server components load data, client components handle interaction
| Server components (`page.tsx`) | Client components (`"use client"`) |

|---|---|

| Run on the server only | Run in the browser |

| Check the user and permissions, query the database directly | Handle clicks, typing, autosave, dialogs |

| Never send database credentials or queries to the browser | Call our API with `fetch` |

**Why:**

- ****Fast first load:**** the page arrives with data already filled in, with no loading spinner while JavaScript fetches lists.

- ****Security:**** permission checks happen on the server **before** any content is sent. A user without access never receives the document, not even hidden in the page.

- ****Less JavaScript in the browser:**** only the interactive parts are shipped as client code.

****Why `export const dynamic = "force-dynamic"` on these pages:**** they depend on the signed-in user (cookies) and live database data, so they must render fresh on every request. Next.js must never cache one user's page and show it to another.

---
## 2. `AppHeader.tsx`
Logo ("Ajaia Docs", links home), "Signed in as ****Name****", and the Sign out button.

| Decision | Why |

|---|---|

| A shared component | Same header on the home and editor pages, with no duplicated markup |

| "Signed in as…" hidden on very small screens (`hidden sm:inline`) | The header doesn't overflow on phones |

| Always shows who is signed in | Essential when testing sharing by switching between Alice, Bob and Carol |

---
## 3. Home page: `src/app/page.tsx` + `DocumentLists.tsx`
### Server part (`page.tsx`)
1. `getCurrentUser()`, redirecting to `/login` if signed out.

2. Runs ****two queries in parallel****: documents I own, and share rows for me (with each document's title and owner name).

3. Converts dates to ISO strings and passes them to `DocumentLists`.

| Decision | Why |

|---|---|

| Query Prisma directly instead of calling our own API | The page already runs on the server, so an HTTP request to itself would only add latency. The queries are the same as in `GET /api/documents` |

| Titles only, no content | Lists don't need content (same reasoning as the API) |

| Dates converted to strings | Data passed from server to client components must be plain JSON. `Date` objects can't cross that boundary |

### Client part (`DocumentLists.tsx`)
| Feature | Detail | Why |

|---|---|---|

| ****Two tabs with counts**** | "My documents (n)" / "Shared with me (n)" | ****The required owned vs. shared distinction****, clear at a glance |

| ****Badges**** | "Owner", "Can edit", "View only" | Users know what they can do before opening a document |

| ****Shared rows show the owner**** | "Shared by Alice Johnson · Edited Nov 8, 1:21 AM" | Users know where a document came from |

| ****"New document" button**** | `POST /api/documents`, then opens the editor | One click to start writing |

| Spinner + disabled button while creating | — | Prevents creating duplicates from double clicks |

| Error message shown if creation fails | — | No silent failures |

| ****Empty states**** | "You don't own any documents yet…", "Nothing has been shared with you yet." | A blank list looks broken; a message explains it |

| Dates in the user's locale (`toLocaleString`) | — | Reads naturally for every user |

| Long titles truncated with `…` | — | Rows stay neat on small screens |

---
## 4. Editor page: `src/app/docs/[id]/page.tsx` + `not-found.tsx`
### Server part
1. Signed out → redirect to `/login`.

2. `getDocumentRole(id, user.id)`. ****No role → `notFound()`.****

3. Loads title, content, version, owner and collaborators.

4. Renders `<DocumentEditor document={…} role={role} />`.

| Decision | Why |

|---|---|

| ****Permission check before loading content**** | Users without access never receive the content. Security is on the server, not "hidden in the UI" |

| ****The same 404 for "doesn't exist" and "no access"**** | Matches the API rule: private documents' existence isn't revealed |

| The role is passed to the client | The UI decides what to **show** (toolbar, Share button). The server still enforces every action |

| The version is passed to the client | The editor sends it with every save (optimistic concurrency) |

### `not-found.tsx`
"Document not found. It may have been deleted, or you don't have access to it." plus a ****Back to documents**** link.

****Why:**** a friendly dead end instead of Next.js's generic 404, and the wording doesn't reveal which of the two cases it is.

---
## 5. `EditorToolbar.tsx`
| Group | Buttons |

|---|---|

| History | Undo, Redo |

| Text | ****Bold**** (Ctrl+B), **Italic** (Ctrl+I), Underline (Ctrl+U) |

| Headings | H1, H2, H3 |

| Lists | Bulleted, Numbered |

| Decision | Why |

|---|---|

| ****These exact formats**** | They're what the assignment asks for (bold, italic, underline, headings, lists). Nothing extra to maintain |

| ****Active state**** (blue when the cursor is in bold text, etc.) | Users see the current formatting, as in Google Docs |

| ****`useEditorState` with a selector**** | The toolbar re-renders only when the formatting under the cursor changes, not on every keystroke |

| ****`onMouseDown={e => e.preventDefault()}`**** | Clicking a button would otherwise take focus away from the editor and lose the text selection, so "select text → click Bold" wouldn't work |

| `editor.chain().focus()…run()` | Returns focus to the editor after each command so typing continues naturally |

| Undo/Redo disabled when there's nothing to undo | Clear feedback, no dead clicks |

| ****Accessibility:**** `role="toolbar"`, `aria-label`, `aria-pressed`, `title` tooltips | Screen readers announce each button and whether it's on. Tooltips show keyboard shortcuts |

| Lucide icons with separators between groups | Compact, familiar, and scannable |

| Hidden for viewers | Viewers can't edit, so they shouldn't see editing tools |

---
## 6. `DocumentEditor.tsx`: the core editing experience
### 6.1 The editor (TipTap)
```ts

useEditor({

  extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],

  content: doc.content,          // the JSON stored in Postgres

  editable: canEdit,             // false for viewers

  immediatelyRender: false,

  ...

})

```

| Decision | Why |

|---|---|

| ****StarterKit**** (TipTap v3) | Includes paragraphs, headings, bold, italic, ****underline****, lists and undo history, which covers everything required in one package |

| Headings limited to levels 1–3 | Matches the toolbar. Fewer levels keep documents clean |

| ****Content loaded as JSON**** (not HTML) | Restores formatting exactly as saved, and no HTML from the database is injected into the page |

| `editable: canEdit` | Viewers truly can't type. The server would reject a save anyway, but the UI shouldn't invite it |

| ****`immediatelyRender: false`**** | Without it, TipTap renders on the server and again in the browser, and Next.js warns about a "hydration mismatch". This renders the editor only in the browser |

| A loading spinner until the editor is ready | No empty white box flashing on load |

| Custom `doc-content` class + `aria-label="Document content"` | Styling hook (section 8) and accessibility |

### 6.2 Autosave: how it works
```

user types ──► onUpdate ──► status "Unsaved changes"

                   │

                   └─► (re)start 800 ms timer ──► save()

save():

  if a save is already in flight → mark "pending" and stop

  PATCH /api/documents/:id { content: editor.getJSON(), version }

    200  → version = response.version, status "Saved"

    409  → stop autosave, status "Conflict", show "Reload latest version"

    403/404 → stop autosave, show "You no longer have edit access"

    other / network error → status "Not saved", show "Retry"

  finally: if "pending" → save again once with the newest content

```

| Decision | Why |

|---|---|

| ****Autosave instead of a Save button**** | Feels like Google Docs, and no one loses work by forgetting to save |

| ****Debounce of 800 ms**** (save after typing pauses) | Saving on every keystroke would flood the server. Waiting too long risks losing work. 0.8 s is a common middle ground |

| ****One request at a time + one follow-up**** | Two overlapping saves could arrive out of order, and the older one would win. Saving strictly in sequence, always with the newest content, prevents that |

| ****Sends the version, updates it from the response**** | Optimistic concurrency: every save says "on top of version N". After success, the client uses the server's new version for the next save |

| ****409 stops autosave and shows "Reload latest version"**** | Someone else saved first. Retrying blindly would fail again, or worse, overwrite them. The user decides |

| ****403/404 stops autosave**** | Access was revoked or the document deleted mid-edit. Retrying is pointless; tell the user |

| ****Network error keeps the content and offers Retry**** | Typing isn't lost when the connection drops. The text stays in the editor until a save succeeds |

| ****Refs (`useRef`) for the timer, version and in-flight flags**** | These change constantly. Storing them in React state would re-render the editor on every keystroke. Refs don't re-render |

| `saveRef` pattern | The editor's `onUpdate` callback is created once. Calling `saveRef.current()` always runs the latest `save` function, avoiding stale values |

| Timer cleared when leaving the page | No save fires after the component is gone |

### 6.3 Save status indicator
| Status | Shown as | Meaning |

|---|---|---|

| `saved` | ✓ ****Saved**** (green) | Everything is stored on the server |

| `dirty` | ****Unsaved changes**** (gray) | Typing; the save will start shortly |

| `saving` | ⟳ ****Saving…**** | Request in progress |

| `error` | ☁︎ ****Not saved**** (red) + Retry | Network or server problem |

| `conflict` | ⚠ ****Conflict**** (amber) + Reload | Someone else saved a newer version |

****Why:**** users always know whether their work is safe, which is the most important trust signal in an editor. `aria-live="polite"` makes screen readers announce changes. Hidden for viewers, who have nothing to save.

### 6.4 Unsaved-changes warning
If you try to close or reload the tab while the status is unsaved, saving or error, the browser asks "Leave site?".

****Why:**** a last safety net against losing the final few seconds of typing.

### 6.5 Rename (inline title)
- The title is an input at the top. Click and type, then press ****Enter**** or click away to save.

- Sends `PATCH { title }` (no version needed; see step 03).

- An empty title reverts to the previous one. If the server rejects it, it reverts and shows the error.

- `maxLength={200}` matches the server and database limit.

- Read-only for viewers.

****Why inline:**** how Google Docs works. No separate "rename" dialog, so it's fewer clicks.

### 6.6 Delete (owner only)
Trash icon, then a confirmation ("Delete "Q4 Plan"? This can't be undone."), then `DELETE`, then back to the home page.

****Why the confirmation:**** deletion is permanent. ****Why owner only:**** the UI mirrors the server rule (editors get 403 anyway).

### 6.7 Role-aware UI
| Element | Owner | Editor | Viewer |

|---|---|---|---|

| Toolbar | ✅ | ✅ | hidden |

| Typing | ✅ | ✅ | disabled |

| Title editable | ✅ | ✅ | read-only |

| Save status | ✅ | ✅ | hidden |

| Share button | ✅ | — | — |

| Delete button | ✅ | — | — |

| "View only" banner | — | — | ✅ |

| Subtitle | "You own this document" | "Owned by Alice Johnson" | "Owned by Alice Johnson" |

****Why:**** each user sees only what they can actually do. ****Important:**** this is user experience, not security. The server enforces every rule independently (see step 03).

### 6.8 Error banner
An amber banner with an icon shows the current problem, with a ****Reload latest version**** button for conflicts and ****Retry**** for recoverable errors. `role="alert"` makes screen readers read it immediately.

---
## 7. `ShareDialog.tsx`
| Feature | Detail | Why |

|---|---|---|

| ****Email + permission picker**** | "Can view" (default) / "Can edit" | Share the way people think about it. ****Least privilege**** by default |

| ****Demo accounts hint**** | "alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev" | Reviewers know exactly what to type |

| ****People with access**** | Name, email, role, and a remove button per person | See and manage access in one place |

| ****Changing a role**** | Share again with a different permission | The API upserts, so the list updates in place with no duplicates |

| ****Remove access**** | `DELETE …/shares/:userId`, then removed from the list | Revoking is as easy as granting |

| ****Server error messages shown**** | e.g. "No user found with email …", "You already own this document." | Clear feedback from the server's validation |

| Spinner + disabled Share button while busy | — | Prevents double submits |

| ****Closes on Escape, on a backdrop click, or the ✕ button**** | — | Standard dialog behavior users expect |

| ****Accessibility:**** `role="dialog"`, `aria-modal`, `aria-labelledby`, labeled inputs | — | Screen readers announce it as a dialog with a title |

| Updates the parent's collaborator list | The "Shared with N people" subtitle updates instantly | No page reload needed |

| Owner only | The dialog only exists for owners | Mirrors the server rule |

---
## 8. Editor content styles: `globals.css`
```css

.doc-content h1 { @apply text-3xl font-bold … }

.doc-content ul { @apply list-disc pl-6; }

.doc-content ol { @apply list-decimal pl-6; }

...

```

**Why this CSS is needed even though we use Tailwind:**

- TipTap generates plain HTML tags (`<h1>`, `<ul>`, `<strong>`) inside the editor, and ****we can't put Tailwind classes on HTML we don't write****.

- Tailwind's base reset removes default browser styles, so without these rules ****headings would look like normal text and lists would have no bullets****.

- The rules still use Tailwind classes via `@apply`, so styling stays consistent with the rest of the app.

- Everything is scoped under `.doc-content`, so it affects only document content.

(One inert rule, the "Start typing…" placeholder, needs TipTap's Placeholder extension to work. It's harmless and could be enabled later.)

---
## 9. Checks
```bash

npm run typecheck   ✅

npm run lint        ✅

npm test            ✅ 59 passed

npm run build       ✅ production build succeeded

```

****Why run the production build:**** `npm run dev` is forgiving. The production build is ****exactly what Vercel runs****, and it catches problems like server/client boundary errors and type errors in pages before deploying.

**Build output (bundle sizes):**

| Route | First load JS |

|---|---|

| `/` (home) | 110 kB |

| `/login` | 105 kB |

| `/docs/[id]` (editor) | 245 kB (TipTap/ProseMirror is the bulk) |

| Middleware | 34 kB |

The editor page is the heaviest because of the editor engine. The editor code loads only on document pages, not on the home or login pages.

---
## 10. Smoke test (production build + real database)
Started the ****production server**** (`next start`), signed in as each user, and checked the rendered HTML:

| Check | Result |

|---|---|

| Alice's home page | "My documents (1)" containing "Welcome to Ajaia Docs" ✅ |

| Bob's home page | "Shared with me (1)" ✅ |

| Alice opens the sample doc | 200, ****Share button**** shown, "You own this document" ✅ |

| Bob opens it (editor) | 200, "Owned by Alice Johnson", ****no**** "View only" banner ✅ |

| Carol opens it (viewer) | 200, ****"View only"**** banner ✅ |

| Carol opens Alice's new private doc | ****404****, "Document not found" page ✅ |

****Not covered by this test (needs a real browser):**** typing, toolbar clicks, autosave timing and the share dialog interactions, because the editor runs only in the browser. These are checked by clicking through manually (see section 12).

---
## 11. How the requirements are now met
| Assignment requirement | Where |

|---|---|

| Create a new document | "New document" button → `POST /api/documents` |

| Rename a document | Inline title → `PATCH { title }` |

| Edit content in the browser | TipTap editor |

| Save and reopen | Autosave → `PATCH { content, version }`. Reopening loads the stored JSON |

| Bold, italic, underline | Toolbar + keyboard shortcuts |

| Headings | H1, H2, H3 |

| Bulleted and numbered lists | Toolbar |

| Document owner | `owner_id`, "You own this document" / "Owned by …" |

| Grant another user access | Share dialog → `POST …/shares` |

| ****Visible distinction between owned and shared**** | Tabs + badges on the home page |

| Formatting preserved after refresh | Stored as TipTap JSON in `JSONB` |

| File upload | ****Next step**** (import `.txt` / `.md` / `.docx`) |

---
## 12. Manual browser test checklist
```bash

npm run dev   # http://localhost:3000

```

1. Sign in as ****Alice****, then ****New document****.

2. Type a heading (H1), a paragraph with ****bold****, **italic** and underline, a bulleted list and a numbered list.

3. Watch the status go "Unsaved changes", then "Saving…", then ****"Saved"****.

4. ****Refresh.**** All formatting is still there.

5. Rename the title, press Enter, refresh, and the new title is kept.

6. ****Share****, then `bob@ajaia.dev` as ****Can edit**** and `carol@ajaia.dev` as ****Can view****.

7. Sign out, sign in as ****Bob****: the doc appears in "Shared with me" with ****Can edit****, and editing works.

8. Sign in as ****Carol****: the doc appears with ****View only****, there's no toolbar, and typing does nothing.

9. ****Conflict test:**** open the same doc as Alice in one browser and Bob in another (or a private window). Bob types and saves. Then Alice types, and she sees ****"Conflict"**** with a ****Reload latest version**** button.

10. Sign in as Alice, delete the doc, confirm, and it's gone from all lists.

---
## 13. Known limitations (honest notes)
- ****No real-time collaboration.**** Two people editing at once get a conflict prompt rather than live merging (by design; see the architecture docs).

- ****A conflict means reload.**** The user's unsaved local changes are lost on reload. A "keep my version / compare" option would be better.

- ****No placeholder text**** in empty documents (the Placeholder extension isn't installed).

- ****No mobile-specific toolbar.**** It wraps on small screens; usable but not optimized.

- ****No automated browser tests**** (Playwright). The editor interactions are verified manually.

- ****The viewer's list of collaborators isn't shown.**** Only owners see the share dialog.

## 14. What I would do next with more time
- Playwright tests for the main flow: create → format → autosave → reload → share → view as another user.

- Conflict resolution UI: show both versions, "keep mine / keep theirs".

- Real-time presence ("Bob is viewing") and later live co-editing with Yjs.

- Placeholder, keyboard shortcut help, and link insertion.

- Optimistic list updates and toast notifications.
