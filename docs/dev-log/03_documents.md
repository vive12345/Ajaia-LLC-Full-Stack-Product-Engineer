# 03 — Permissions, Document API and Sharing API (`feat/documents`)

**Goal of this step:** build the server-side document and sharing features. We need clear rules for who can open, edit, share, or delete each document, and every API route must follow those rules.

**Design references:** [`02_Deep_Dive_Into_Database.pdf`](../architecture/02_Deep_Dive_Into_Database.pdf) (sections 6, 7, 10) and [`03_Authentication_Authorization.pdf`](../architecture/03_Authentication_Authorization.pdf) (section 4)

**Result:** 7 API endpoints, a tested permission matrix, optimistic concurrency (409 on stale saves), and permission re-checked at the moment of writing. 59 unit tests passed, and 24 manual API scenarios passed against a running server. Pushed as PR #4 into `dev`.

---

## 0. Order of work (summary)

| # | What was done | Why |
|---|---|---|
| 1 | Created branch `feat/documents` from `dev` | Keep unfinished changes separate until they are tested and reviewed |
| 2 | `src/lib/access.ts`: the permission rules | Keep every permission rule in one place so different routes do not accidentally behave differently. The rules can also be tested without a database |
| 3 | `src/lib/validation.ts`: input rules | Catch invalid titles, content, IDs, and sharing details before they reach the database |
| 4 | `src/lib/documents.ts`: role lookup + "editable by" filter | Reuse the same database checks rather than rewriting them in every endpoint |
| 5 | `src/lib/http.ts`: added `readJson`, loosened `assertSameOrigin` | Consistent 400 for bad JSON; the CSRF check became testable |
| 6 | `/api/documents`: list + create | The home page needs "My documents" and "Shared with me" |
| 7 | `/api/documents/:id`: open, rename, save, delete | The editor page needs these |
| 8 | `/api/documents/:id/shares` + `/shares/:userId` | The sharing requirement: grant and revoke access |
| 9 | Tests: `access`, `validation`, `http` | Check both allowed and blocked actions before trying the full API |
| 10 | 24 manual API checks as Alice, Bob, Carol | Make sure routes, sessions, permissions, and Neon work together, not just in isolated tests |

---

## 1. Key concepts

| Term | Meaning |
|---|---|
| **Authorization** | Deciding what a signed-in user may do with a specific document |
| **Role** | `OWNER` (from `documents.owner_id`), `EDITOR` or `VIEWER` (from `document_shares.role`), or `null` (no access) |
| **Action** | `view`, `edit` (includes rename), `share`, `delete` |
| **Optimistic concurrency** | Don't lock the document while someone edits. Instead, every save says "I'm saving on top of version N", and the save only succeeds if the document is still at version N |
| **Race condition** | Two things happen at almost the same moment and the result depends on which goes first (e.g. Alice removes Bob's access exactly as Bob saves) |

---

## 2. `src/lib/access.ts`: the permission rules

### The permission matrix

| Action | Owner | Editor | Viewer | No access |
|---|---|---|---|---|
| view | ✅ | ✅ | ✅ | **404** |
| edit / rename | ✅ | ✅ | **403** | **404** |
| share | ✅ | **403** | **403** | **404** |
| delete | ✅ | **403** | **403** | **404** |

### The functions

| Function | What it does |
|---|---|
| `can(role, action)` | Returns `true` or `false` by looking the role up in the permission table |
| `getRole(doc, userId)` | Returns `OWNER` if the user owns the document, otherwise their share role, otherwise `null` |
| `assertCan(role, action)` | Throws **404** if the role is `null`, **403** if the role isn't allowed, otherwise does nothing |

### Decisions and why

| Decision | Why |
|---|---|
| **All rules in one file** | No risk of different endpoints quietly enforcing different rules. To change a permission, change one line |
| **Rules as a table (`PERMISSIONS`)**, not a chain of `if` statements | Reads like the matrix above, so it's easy to review and hard to get wrong |
| **Pure functions** (no database, no Next.js) | Every rule is unit tested in milliseconds, with no mocking |
| **404 for no access, not 403** | A 403 would confirm that a private document exists. A 404 reveals nothing, and looks the same as a document that never existed |
| **403 when the role is too low** | The user can already see the document, so there's nothing to hide. A clear message helps them understand why |
| **Specific messages** ("You have view-only access…", "Only the owner can share…") | The frontend can show them directly, so users understand what happened |
| **Owner wins over a share row** | If a share row for the owner somehow exists, `getRole` still returns `OWNER`. Ownership is checked first, defensively |
| **`asserts role is Role`** | TypeScript knows that after `assertCan()` the role can't be `null`, so later code needs no extra checks |

---

## 3. `src/lib/validation.ts`: input rules

| Schema | Rules | Why |
|---|---|---|
| `titleSchema` | Trimmed, 1–200 characters | No blank or whitespace-only titles (the design PDF's `CHECK` constraint, done in the API). The 200 limit matches the database column |
| `editorContentSchema` | Must be an object with `type: "doc"` and an array of child nodes. Max **500 KB** | Stops garbage like HTML strings or random JSON from being stored as a document, which would break the editor when reopened. The size cap stops someone storing huge payloads |
| `.loose()` on content | Extra fields TipTap adds are allowed | We check the essential structure without rejecting valid editor output |
| `createDocumentSchema` | Optional title and content | "New document" works with an empty body. Import (later) can pass content |
| `updateDocumentSchema` | Title and/or content. **A version is required when content is sent.** Rejects an empty update | **Enforces optimistic concurrency at the API boundary**: you can't save content without saying which version you're saving on top of |
| `shareSchema` | Email trimmed, lowercased, then validated. Role is `VIEWER` or `EDITOR`, **default `VIEWER`** | `" Bob@Ajaia.dev "` matches `bob@ajaia.dev`. A default of `VIEWER` is **least privilege** |
| `idSchema` | Must be a UUID | Invalid IDs get a clean 404 instead of a database error |
| `EMPTY_DOCUMENT` | One empty paragraph | New documents always open in the editor |

**Why titles don't need a version:** renaming doesn't overwrite anyone's text, and requiring a version would make renames fail whenever someone else was typing. Content saves are where lost work happens, so that's where the version check is.

---

## 4. `src/lib/documents.ts`: shared database helpers

### `getDocumentRole(documentId, userId)`

\- Returns `null` immediately if the ID isn't a UUID. **Why:** Postgres would throw an error on a non-UUID value for a `uuid` column, and we want a clean 404.

\- Loads **only** `ownerId` plus **this user's** share row, never the content or other users' shares. **Why:** the permission check is fast and fetches no unnecessary data.

### `editableBy(userId)`

A Prisma filter: "owner is me **OR** I have an `EDITOR` share". It's used **inside** the `UPDATE` statement (see section 7). **Why it's a function:** the same rule is reused, and it mirrors the SQL in the design PDF (section 6E).

---

## 5. `src/lib/http.ts`: small additions

| Change | Why |
|---|---|
| `readJson(req)` | Malformed JSON gives a **400** "Request body must be valid JSON." instead of a 500. Used by every endpoint that reads a body |
| `assertSameOrigin` now accepts any request with headers | Can be tested with a plain `Request` object, no Next.js needed. Behavior is unchanged |

---

## 6. `GET` and `POST /api/documents`

### `GET /api/documents`: my lists

Returns:

```json

{

  "owned":  [{ "id"*,* "title"*,* "updatedAt" }],

  "shared": [{ "id"*,* "title"*,* "updatedAt"*,* "role"*,* "owner": { "name"*,* "email" } }]

}

```

| Decision | Why |
|---|---|
| **Two separate lists** | The assignment requires a **visible distinction between owned and shared documents** |
| **No `content` in lists** | A list only shows titles. Loading every document's full content wastes bandwidth and memory (projection, from PDF section 6B) |
| **Owner name in the shared list** | Users see **who** shared it with them |
| **`role` in the shared list** | The UI can label "Can edit" / "View only" |
| **Newest first** (`updatedAt desc`) | Recently edited documents are what users want most. It also uses the `(owner_id, updated_at DESC)` index |
| **Both queries run in parallel** (`Promise.all`) | Faster: two independent queries at once |

### `POST /api/documents`: create

| Decision | Why |
|---|---|
| **`ownerId` always comes from the session**, never the request body | Otherwise Bob could create documents "owned" by Alice (PDF section 6A) |
| Default title "Untitled document", default empty content | One click creates a usable document |
| **201 Created** | The correct status for creating something |
| CSRF check (`assertSameOrigin`) | Creating changes state |

---

## 7. `/api/documents/:id`: open, rename, save, delete

### `GET`: open a document

Returns the full document (title, content, version, owner, collaborators) **plus the caller's role**.

| Decision | Why |
|---|---|
| Check `view` permission first | Outsiders get 404 before any content is loaded |
| Return `role` | The UI knows whether to show the toolbar, read-only mode, or the Share button |
| Return `version` | The editor must send it back when saving |
| Return the collaborator list | The share dialog shows who has access |

### `PATCH`: rename and/or save (the most important endpoint)

Step by step:

1. CSRF check, sign-in check, validate the body.

2. **First permission check:** `assertCan(role, "edit")`. Gives a fast, clear 404 or 403 in normal cases.

3. Build the update: `title` if sent; `content` + **`version: { increment: 1 }`** if content was sent.

4. **The write itself re-checks permission and version:**

   ```

   UPDATE documents SET ...

   WHERE id = :id

     AND (owner_id = :me OR EXISTS (share with :me AND role = 'EDITOR'))

     AND version = :clientVersion        -- only when saving content

   ```

5. If **0 rows** were updated, work out why:

   \- Check the role again. If access was revoked, the response is **403**; if the document was deleted, **404**.

   \- Otherwise the version didn't match, so **409 Conflict**: "This document was changed by someone else. Reload to see the latest version."

6. Return the new `version` and `updatedAt`. The client uses the new version for its next save.

| Decision | Why |
|---|---|
| **Optimistic concurrency (version check)** | Without it, Bob's save could silently erase Alice's changes ("lost update", PDF section 10). With it, the stale save is **rejected with 409** and nobody's work disappears |
| **Permission re-checked inside the `UPDATE`** | **Closes a race condition:** (1) Bob passes the permission check, (2) Alice revokes his access, (3) Bob's write runs. Because the database checks permission at the moment of writing, step 3 changes nothing (PDF section 7) |
| **Also check before the write** | Gives fast, specific errors (403 vs 404) in the common case |
| **Version incremented by the database** (`increment: 1`) | Two saves can't both produce the same version number. The database does it atomically |
| **`updateMany` instead of `update`** | `update` only filters by unique fields. `updateMany` allows our extra conditions (version, permission) and tells us how many rows changed |
| **Diagnose after 0 rows** | Users get the **right** message: no access, deleted, or someone else saved first |

### `DELETE`: delete a document

| Decision | Why |
|---|---|
| Owner only (`assertCan(role, "delete")`) | Editors can change content, but not destroy the document |
| `deleteMany where { id, ownerId: me }` | Ownership is checked in the delete itself too (race-safe) |
| Shares removed automatically | `ON DELETE CASCADE` in the database, so no orphaned permissions |
| **204 No Content** | Success with nothing to return |

---

## 8. Sharing API

### `POST /api/documents/:id/shares` `{ email, role }`

1. CSRF check, sign-in check, validate the email and role.

2. Owner only (`assertCan(role, "share")`).

3. Reject sharing with yourself: **400** "You already own this document."

4. Look up the recipient by email. If not found: **400** "No user found with email …".

5. **Upsert** the share: create it, or update the role if a share already exists.

6. Return **201** with the recipient's name, email and role.

| Decision | Why |
|---|---|
| **Share by email** | That's how people think about sharing ("share with bob@…"), and it matches Google Docs |
| **Upsert** | Sharing again with the same person changes their role (e.g. viewer to editor) instead of failing. The database's unique `(document_id, user_id)` constraint guarantees there's never a duplicate |
| **Self-share check** | The owner already has full access. A share row for them would be confusing (PDF section 4 noted the database doesn't prevent this, so the API does) |
| **400 for an unknown email** | Clear feedback. In a real product this might send an invitation instead |
| **Owner only** | Matches the permission matrix: editors can edit but can't give others access |

### `DELETE /api/documents/:id/shares/:userId`

Owner only. Removes that user's share. Returns **204**. After this, the user gets **404** for the document, and it disappears from their "Shared with me" list.

---

## 9. Tests (59 total, all passing)

### `tests/access.test.ts`

| Test | Proves |
|---|---|
| `getRole` for Alice, Bob, Carol, Dave | Owner, editor, viewer and no-access are all detected correctly |
| Owner wins over a share row | Defensive ownership check |
| **The full 16-cell matrix** (4 roles × 4 actions) | Every rule in the permission table, exactly |
| `assertCan` returns 404 for no access | Private documents stay hidden |
| `assertCan` returns 403 for a low role | Viewer edit, editor share, editor delete |
| `assertCan` passes when allowed | No false denials |
| Helpful view-only message | The UI can show it as-is |

### `tests/validation.test.ts`

Title trimming, blank rejected, over 200 characters rejected. Rename without a version accepted. Content save with a version accepted, **without a version rejected**. Empty update rejected. Non-document content rejected (`{type:"html"}`, raw HTML string). Oversized content rejected. Email normalized, role defaults to VIEWER. Invalid email or unknown role rejected.

### `tests/http.test.ts`

| Test | Proves |
|---|---|
| Same origin allowed | Normal requests work |
| **Cross-site blocked with 403** | CSRF defense |
| `x-forwarded-host` respected | Works behind Vercel's proxy |
| No `Origin` header allowed | `curl` and scripts work |
| Malformed `Origin` gives 403 | Defensive parsing |
| `HttpError` becomes its status + message | Consistent error format |
| Zod error becomes 400 + first message | Clear validation errors |
| **Unexpected error becomes a generic 500, with no details leaked** | Internal errors never reach the browser |
| Malformed JSON gives 400 | `readJson` works |

**Coverage:** `http.ts` added to the coverage list. All thresholds (80% lines and functions, 75% branches) passed.

---

## 10. Manual end-to-end verification (24 scenarios, real server + Neon)

Signed in as Alice (owner), Bob and Carol in separate cookie jars. Alice created a fresh "Q4 Plan" document so the seed data wasn't touched.

| # | Scenario | Result |
|---|---|---|
| 1 | List while signed out | **401** ✅ |
| 2 | Bob's list | "Welcome to Ajaia Docs" under **shared**, role EDITOR, owner Alice ✅ |
| 3 | Alice creates "Q4 Plan" | **201**, version 1 ✅ |
| 4 | Carol opens it (not shared) | **404** ✅ |
| 5 | Alice shares with `Carol@Ajaia.dev` as VIEWER | **201** (email normalized) ✅ |
| 6 | Alice shares with Bob as EDITOR | **201** ✅ |
| 7 | Carol opens it | **200**, role VIEWER ✅ |
| 8 | Carol tries to save | **403** "view-only access" ✅ |
| 9 | Bob saves at version 1 | **200**, version is now **2** ✅ |
| 10 | **Alice saves at stale version 1** | **409 Conflict** ✅ |
| 11 | Bob renames | **200** ✅ |
| 12 | Bob tries to delete | **403** "Only the owner can delete" ✅ |
| 13 | Bob tries to share | **403** "Only the owner can share" ✅ |
| 14 | Alice shares with herself | **400** ✅ |
| 15 | Alice shares with an unknown email | **400** ✅ |
| 16 | Alice sets a blank title | **400** "Title can't be empty." ✅ |
| 17 | Alice sends malformed JSON | **400** ✅ |
| 18 | Alice opens `/api/documents/not-a-uuid` | **404** ✅ |
| 19 | Alice removes Carol's access | **204** ✅ |
| 20 | Carol opens it after removal | **404** ✅ |
| 21 | Carol's list after removal | Document **no longer listed** ✅ |
| 22 | Alice reopens it | Content `"hi"` and version 2 persisted ✅ |
| 23 | Alice deletes it | **204** ✅ |
| 24 | Bob opens it after deletion | **404** (shares removed by cascade) ✅ |

**Why test manually in addition to unit tests:** unit tests prove the rules. This proves the rules, the database queries, the cookies and the routes all work **together** on real data.

---

## 11. API reference (for the frontend)

| Method & path | Who | Body | Success | Errors |
|---|---|---|---|---|
| `GET /api/documents` | Signed in | — | 200 `{ owned, shared }` | 401 |
| `POST /api/documents` | Signed in | `{ title?, content? }` | 201 `{ document }` | 400, 401, 403 (CSRF) |
| `GET /api/documents/:id` | Any role | — | 200 `{ document, role }` | 401, 404 |
| `PATCH /api/documents/:id` | Owner, editor | `{ title?, content?, version? }` | 200 `{ document }` (new version) | 400, 401, 403, 404, **409** |
| `DELETE /api/documents/:id` | Owner | — | 204 | 401, 403, 404 |
| `POST /api/documents/:id/shares` | Owner | `{ email, role? }` | 201 `{ share }` | 400, 401, 403, 404 |
| `DELETE /api/documents/:id/shares/:userId` | Owner | — | 204 | 401, 403, 404 |

---

## 12. Known limitations (honest notes)

\- **409 doesn't merge changes.** It prevents overwriting, but the user must reload. Real-time merging (Yjs) is a future step.

\- **Sharing works only with existing users.** No email invitations.

\- **No pagination** on lists. Fine for a demo; needed at scale.

\- **Content is checked for shape, not every node type.** The editor itself ignores unknown nodes.

\- **Viewers see the collaborator list.** Acceptable (Google Docs does the same), but could be limited to the owner.

## 13. Improvements I would consider later

\- Integration tests against a separate Neon branch, proving cascade delete, unique shares and the revoke-during-save race on a real database.

\- Return the latest version and content with a 409, so the UI can show a "compare and merge" view.

\- Email invitations for unknown users, link sharing, and an audit log of sharing changes.

\- Pagination and search on document lists.

