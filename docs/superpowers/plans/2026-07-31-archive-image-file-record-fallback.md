# Archive Image File Record Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore authorized historical-event images when the upload exists in `file_records` but the corresponding `event_image` association is missing.

**Architecture:** Add a pure selector that prefers valid `event_image` rows and falls back to matching active image `file_records` only for already-authorized event records. `listEventRecords` will query both collections independently, merge through the selector, then resolve CloudBase temporary URLs through the existing `attachImageUrls()` path.

**Tech Stack:** WeChat Cloud Functions, CloudBase database, CommonJS, Node.js built-in test runner.

## Global Constraints

- Classification is `审核安全`; no public content or new personal data.
- Pages continue to call `miniprogram/utils/api.js`; no direct database calls are added to pages.
- Existing organization and history-read permission filtering remains the security boundary.
- `event_image` remains primary; `file_records` is fallback only.
- No existing image, file record, audit record, or cloud file is deleted or rewritten.
- Any `cloudfunctions/` change requires redeploying the `api` cloud function before online verification.

---

### Task 1: Select safe event images from primary and fallback records

**Files:**
- Create: `cloudfunctions/api/archive-image-fallback.js`
- Create: `tests/archive-image-file-record-fallback.test.js`

**Interfaces:**
- Consumes: visible event records with `id` and `organizationId`, `event_image` rows, and `file_records` rows.
- Produces: `selectArchiveImages(records, eventImages, fileRecords) -> Record<string, Array<object>>` keyed by event business ID.
- Produces: `loadArchiveImages(records, dependencies) -> Promise<Record<string, Array<object>>>`, where dependencies provide `listEventImages()`, `listFileRecords(organizationId)`, `attachImageUrls(images)`, and `warn(message, error)`.

- [ ] **Step 1: Write the failing selector tests**

Create fixtures proving primary rows win, valid `file_records.fileID` rows fill only empty events, and deleted/non-image/wrong-organization/wrong-resource rows are ignored.

```js
const selected = selectArchiveImages(
  [{ id: 'event_1', organizationId: 'org_team_yuanhang' }],
  [],
  [{ resourceType: 'event_record', resourceId: 'event_1', organizationId: 'org_team_yuanhang', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://fallback', sortOrder: 2 }]
)
assert.equal(selected.event_1[0].fileId, 'cloud://fallback')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/archive-image-file-record-fallback.test.js`

Expected: FAIL because `cloudfunctions/api/archive-image-fallback.js` does not exist.

- [ ] **Step 3: Implement the minimal pure selector**

Normalize `fileID`/`fileId`, restrict both sources to visible event IDs and matching organizations, sort by `sortOrder`, and use fallback rows only when an event has no valid primary rows.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/archive-image-file-record-fallback.test.js`

Expected: all selector cases PASS.

- [ ] **Step 5: Commit the selector**

```bash
git add cloudfunctions/api/archive-image-fallback.js tests/archive-image-file-record-fallback.test.js
git commit -m "test: cover archive image fallback"
```

### Task 2: Load both sources independently and wire the result into the authorized archive list

**Files:**
- Modify: `cloudfunctions/api/index.js` near `attachImageUrls()` and `listEventRecords()`
- Modify: `tests/archive-image-file-record-fallback.test.js`

**Interfaces:**
- Consumes: `loadArchiveImages(records, dependencies)` from Task 1 and existing `attachImageUrls(images)`.
- Produces: `listEventRecords()` records whose `images` include temporary URLs from the primary or fallback source.

- [ ] **Step 1: Add failing loader behavior tests**

Execute `loadArchiveImages()` with in-memory dependency functions. Prove that it requests fallback rows only for visible organization IDs, converts selected images through the supplied URL resolver, and still returns fallback images when the primary loader rejects (and vice versa). Assert warnings by captured values, not mock call existence.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/archive-image-file-record-fallback.test.js`

Expected: FAIL because `loadArchiveImages()` is not implemented.

- [ ] **Step 3: Implement minimal CloudBase wiring**

Implement `loadArchiveImages()` with independent source error handling. Then import it in `cloudfunctions/api/index.js`, provide CloudBase loaders that query active `event_record` file records per visible organization, pass the existing `attachImageUrls()`, and reconstruct each record's `images` array without changing record visibility.

- [ ] **Step 4: Verify focused and complete tests**

Run:

```bash
node --check cloudfunctions/api/archive-image-fallback.js
node --check cloudfunctions/api/index.js
node --test tests/archive-image-file-record-fallback.test.js
node --test tests/*.test.js
git diff --check
```

Expected: syntax checks exit 0, all tests pass, and `git diff --check` is empty.

- [ ] **Step 5: Commit the integration**

```bash
git add cloudfunctions/api/index.js tests/archive-image-file-record-fallback.test.js
git commit -m "fix: recover archive images from file records"
```

### Task 3: Final branch verification and publication

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: pushed branch `codex/archive-image-file-record-fallback`.

- [ ] **Step 1: Review the complete diff against the design**

Run: `git diff codex/main...HEAD --check && git status --short --branch`

- [ ] **Step 2: Run fresh release-gate verification**

Run: `node --check cloudfunctions/api/index.js && node --test tests/*.test.js && git diff --check`

- [ ] **Step 3: Push the feature branch**

Run: `git push -u origin codex/archive-image-file-record-fallback`

- [ ] **Step 4: Report deployment requirements**

Report that `cloudfunctions/api` changed, so API redeployment is required before testing; no production deployment is performed without separate confirmation.
