# 全链路图片可见性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复经 `uploadOrgFile()` 上传的图片在历史事件及其他已有业务页面中偶发或批量不显示的问题，不为具体事件或图片写特例。

**Architecture:** 云函数先按现有权限得到可见资源，再仅按资源 ID 分批查询图片关联，回程在内存中严格校验组织、资源类型、状态和文件类型。提取一个云文件展示解析器，统一兼容 `fileId` / `fileID` / `imageUrl`，并发处理分批临时链接且允许部分成功。历史事件、轮播、云盘、头像和旧活动照片共用这一解析边界，页面继续只使用现有 API 返回模型。

**Tech Stack:** WeChat Mini Program JavaScript, WeChat CloudBase cloud functions, Node.js `node:test`, CommonJS.

## Global Constraints

- 审核影响结论为 `review-safe`；不新增公开发布、社交、评论或开放式 UGC。
- 页面继续通过 `miniprogram/utils/api.js` 调用 API，不直连 CloudBase 或数据库。
- 所有上传继续使用 `miniprogram/services/file-upload-service.js` 的 `uploadOrgFile(params)` 并创建 `file_records`。
- 不修改生产数据，不迁移、重写或删除旧记录。
- 不放宽组织、角色、岗位或任期权限；云函数仍是最终鉴权边界。
- 不将有时效的临时 URL 写回数据库，API 返回中保留稳定云文件标识。
- 本计划修改 `cloudfunctions/api`；实现验证后必须明确提醒重新部署 `api`。
- 未经用户另行确认，不部署云函数，不上传体验版，不提审，不发布。

---

### Task 1: 统一云文件展示链接解析

**Files:**
- Create: `cloudfunctions/api/image-display-resolver.js`
- Create: `tests/image-display-resolver.test.js`
- Modify: `cloudfunctions/api/index.js:134-156`

**Interfaces:**
- Produces: `fileIdOf(record) -> string`
- Produces: `resolveImageDisplayUrls(records, { getTempFileURL, batchSize, warn }) -> Promise<Array<object>>`
- `resolveImageDisplayUrls` returns each original record plus normalized `fileId` and a displayable `imageUrl`; a successful temporary URL wins, then an existing HTTP(S) URL, then the stable cloud file ID.

- [ ] **Step 1: Read the test-writing reference before changing tests**

Run:

```bash
sed -n '1,360p' /Users/a0000/.codex/plugins/cache/superpowers-dev/superpowers/6.2.0/skills/test-driven-development/writing-good-tests.md
```

Expected: the complete test-quality guidance is read before the first test edit.

- [ ] **Step 2: Write failing resolver tests**

Create `tests/image-display-resolver.test.js` with tests equivalent to:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { fileIdOf, resolveImageDisplayUrls } = require('../cloudfunctions/api/image-display-resolver')

test('resolver accepts fileId and legacy fileID while preserving external imageUrl', async () => {
  const rows = await resolveImageDisplayUrls([
    { id: 'a', fileId: 'cloud://env/a' },
    { id: 'b', fileID: 'cloud://env/b' },
    { id: 'c', imageUrl: 'https://static.example/c.jpg' }
  ], {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp.example/${fileID.slice(-1)}` }))
    })
  })

  assert.equal(fileIdOf({ fileID: 'cloud://env/b' }), 'cloud://env/b')
  assert.deepEqual(rows.map(row => row.imageUrl), [
    'https://temp.example/a',
    'https://temp.example/b',
    'https://static.example/c.jpg'
  ])
  assert.equal(rows[1].fileID, 'cloud://env/b')
  assert.equal(rows[1].fileId, 'cloud://env/b')
})

test('resolver keeps successful batches and stable ids when one batch fails', async () => {
  const warnings = []
  const rows = await resolveImageDisplayUrls([
    { fileId: 'cloud://env/1' },
    { fileId: 'cloud://env/2' },
    { fileId: 'cloud://env/3' }
  ], {
    batchSize: 1,
    getTempFileURL: async ({ fileList }) => {
      if (fileList[0].endsWith('/2')) throw new Error('batch failed')
      return { fileList: [{ fileID: fileList[0], tempFileURL: `https://temp.example/${fileList[0].slice(-1)}` }] }
    },
    warn: (message, details) => warnings.push({ message, details })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    'https://temp.example/1',
    'cloud://env/2',
    'https://temp.example/3'
  ])
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].details.batchSize, 1)
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
node --test tests/image-display-resolver.test.js
```

Expected: FAIL because `cloudfunctions/api/image-display-resolver.js` does not exist.

- [ ] **Step 4: Implement the minimal resolver**

Create `cloudfunctions/api/image-display-resolver.js` with these behaviors:

```js
function fileIdOf(record = {}) {
  return String(record.fileId || record.fileID || '').trim()
}

function batches(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function resolveImageDisplayUrls(records = [], dependencies = {}) {
  const normalized = records.map(record => ({ ...record, fileId: fileIdOf(record) }))
  const ids = Array.from(new Set(normalized.map(fileIdOf).filter(value => value.startsWith('cloud://'))))
  const urlMap = {}
  const batchSize = Math.max(1, Number(dependencies.batchSize) || 50)
  const warn = typeof dependencies.warn === 'function' ? dependencies.warn : () => {}
  await Promise.all(batches(ids, batchSize).map(async fileList => {
    try {
      const response = await dependencies.getTempFileURL({ fileList })
      ;(response.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
    } catch (error) {
      warn('image temp url batch failed', { batchSize: fileList.length, error })
    }
  }))
  return normalized.map(record => ({
    ...record,
    imageUrl: urlMap[fileIdOf(record)] || record.imageUrl || record.src || record.url || fileIdOf(record)
  }))
}

module.exports = { fileIdOf, resolveImageDisplayUrls }
```

In `cloudfunctions/api/index.js`, require `resolveImageDisplayUrls` and replace the local batching logic in `attachImageUrls` with:

```js
async function attachImageUrls(images = []) {
  if (typeof cloud.getTempFileURL !== 'function') return images.map(item => ({ ...item }))
  return resolveImageDisplayUrls(images, {
    getTempFileURL: payload => cloud.getTempFileURL(payload),
    warn: (message, details) => console.warn(message, {
      batchSize: details.batchSize,
      error: details.error && details.error.message
    })
  })
}
```

- [ ] **Step 5: Run focused tests and syntax checks**

Run:

```bash
node --test tests/image-display-resolver.test.js tests/archive-image-file-record-fallback.test.js tests/archive-event-read-authorization.test.js
node --check cloudfunctions/api/image-display-resolver.js
node --check cloudfunctions/api/index.js
```

Expected: all selected tests pass and both syntax checks exit 0.

- [ ] **Step 6: Commit the shared resolver**

```bash
git add cloudfunctions/api/image-display-resolver.js cloudfunctions/api/index.js tests/image-display-resolver.test.js
git commit -m "fix: normalize cloud image display urls"
```

---

### Task 2: 修复历史事件的关联查询与详情回退

**Files:**
- Modify: `cloudfunctions/api/archive-image-query.js`
- Modify: `cloudfunctions/api/archive-image-fallback.js`
- Modify: `cloudfunctions/api/index.js:2068-2200`
- Modify: `tests/archive-image-file-record-fallback.test.js`
- Modify: `tests/archive-event-read-authorization.test.js`

**Interfaces:**
- Consumes: `attachImageUrls(images)` backed by Task 1's resolver.
- Produces: `createArchiveImageQueryAdapter(...).listEventImages(eventIds)` and `.listFileRecords(organizationId, eventIds)` that query only authorized IDs and leave organization/resource/status validation to `selectArchiveImages`.
- Produces: both `listEventRecords` and `getEventRecord` use `loadArchiveImages` so list, homepage archive cards, detail and edit-backfill receive the same image result.

- [ ] **Step 1: Add failing query-shape and concurrency tests**

Update `tests/archive-image-file-record-fallback.test.js` so the query adapter assertion requires only the ID predicate in database `where` clauses:

```js
queries.filter(query => query.name === 'event_image').forEach(query => {
  assert.deepEqual(Object.keys(query.where), ['eventId'])
})
queries.filter(query => query.name === 'file_records').forEach(query => {
  assert.deepEqual(Object.keys(query.where), ['resourceId'])
})
```

Add a loader test that starts primary and fallback reads before either promise is released:

```js
test('archive loader starts primary and fallback reads concurrently', async () => {
  const started = []
  let releasePrimary
  let releaseFallback
  const primaryGate = new Promise(resolve => { releasePrimary = resolve })
  const fallbackGate = new Promise(resolve => { releaseFallback = resolve })
  const pending = loadArchiveImages([
    { id: 'event_1', organizationId: 'org_team_yuanhang' }
  ], {
    listEventImages: async () => { started.push('primary'); await primaryGate; return [] },
    listFileRecords: async () => { started.push('fallback'); await fallbackGate; return [] },
    attachImageUrls: async rows => rows
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(started.sort(), ['fallback', 'primary'])
  releasePrimary()
  releaseFallback()
  await pending
})
```

Extend the authorization fixture so `getEventRecord` has no `event_image` row but does have a valid same-organization `file_records` image, and assert the detail response includes it while a wrong-organization row remains excluded.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/archive-image-file-record-fallback.test.js tests/archive-event-read-authorization.test.js
```

Expected: FAIL because the adapter still adds compound filters, loader reads sequentially, and detail reads only `event_image`.

- [ ] **Step 3: Make ID queries index-independent and keep fail-closed filtering**

In `archive-image-query.js`, make both collection queries contain only the authorized ID predicate:

```js
return {
  listEventImages: eventIds => readByEventIds(collections.eventImage, 'eventId', eventIds),
  listFileRecords: (_organizationId, eventIds) => readByEventIds(collections.fileRecord, 'resourceId', eventIds)
}
```

Run ID batches with `Promise.all`, flatten the results, and retain pagination inside each batch. Do not remove any checks from `selectArchiveImages`; it must continue rejecting wrong organization, wrong resource type, inactive status, non-image MIME type and hidden resource IDs.

In `archive-image-fallback.js`, start the primary query and all per-organization fallback queries together with `Promise.allSettled`. Convert each rejection into the existing sanitized warning and retain rows from successful sources.

- [ ] **Step 4: Route event detail through the same fallback**

In `getEventRecord`, keep the existing record lookup and authorization behavior, then replace the direct `event_image` query with the same adapter and loader used by `listEventRecords`:

```js
const imageQueries = createArchiveImageQueryAdapter({ db, collections: COLLECTIONS })
const resolvedImageMap = await loadArchiveImages([record], {
  listEventImages: imageQueries.listEventImages,
  listFileRecords: imageQueries.listFileRecords,
  attachImageUrls,
  warn: (message, error) => console.warn(message, error.message)
})
return {
  ...record,
  eventType: normalizeEventType(record.eventType, record.categoryId, record.category),
  images: resolvedImageMap[record.id] || []
}
```

- [ ] **Step 5: Run focused and security tests**

Run:

```bash
node --test tests/archive-image-file-record-fallback.test.js tests/archive-event-read-authorization.test.js tests/archive-position-permission.test.js tests/archive-team-admin.test.js
node --check cloudfunctions/api/archive-image-query.js
node --check cloudfunctions/api/archive-image-fallback.js
node --check cloudfunctions/api/index.js
```

Expected: all tests pass, including cross-organization rejection and detail fallback.

- [ ] **Step 6: Commit the archive read fix**

```bash
git add cloudfunctions/api/archive-image-query.js cloudfunctions/api/archive-image-fallback.js cloudfunctions/api/index.js tests/archive-image-file-record-fallback.test.js tests/archive-event-read-authorization.test.js
git commit -m "fix: restore authorized archive images reliably"
```

---

### Task 3: 对齐轮播、云盘、头像和旧活动图片读链路

**Files:**
- Create: `tests/uploaded-image-read-contract.test.js`
- Modify: `cloudfunctions/api/index.js:930-1090`
- Modify: `cloudfunctions/api/index.js:2658-2770`
- Modify: `cloudfunctions/api/index.js:3405-3435`
- Modify: `cloudfunctions/api/index.js:3864-3990`
- Modify: `cloudfunctions/api/index.js:4197-4235`

**Interfaces:**
- Consumes: Task 1 `attachImageUrls(records)` with normalized `fileId` and `imageUrl`.
- Produces: home banners retain `{ fileId, imageUrl, src }`; media files retain original `fileID` plus `url`; member/profile models retain `avatarUrl`; legacy activities retain `coverUrl` and each photo gains `url` without changing endpoint names.

- [ ] **Step 1: Add failing read-contract tests**

Create `tests/uploaded-image-read-contract.test.js`. Use pure fixtures through `resolveImageDisplayUrls` for field compatibility and source-level contract assertions for endpoint wiring:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { resolveImageDisplayUrls } = require('../cloudfunctions/api/image-display-resolver')

const apiSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8')

test('every upload-backed read model uses the shared image resolver', () => {
  const body = (name, nextName) => apiSource.slice(
    apiSource.indexOf(`async function ${name}`),
    apiSource.indexOf(`async function ${nextName}`)
  )
  assert.match(body('mediaAlbumCoverMap', 'listMediaAlbums'), /attachImageUrls/)
  assert.match(body('getMediaAlbum', 'saveMediaAlbum'), /attachImageUrls/)
  assert.match(body('getPlatformSession', 'saveUserMemberCode'), /attachImageUrls/)
  assert.match(body('directoryMembers', 'listDirectoryMembers'), /attachImageUrls/)
  assert.match(body('listActivities', 'getActivity'), /attachImageUrls/)
  assert.match(body('getActivity', 'saveActivity'), /attachImageUrls/)
})

test('more than fifty album covers are all resolved', async () => {
  const records = Array.from({ length: 73 }, (_, index) => ({ fileID: `cloud://env/${index + 1}` }))
  const calls = []
  const result = await resolveImageDisplayUrls(records, {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList)
      return { fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp.example/${fileID.split('/').pop()}` })) }
    }
  })
  assert.equal(calls.length, 2)
  assert.equal(result[72].imageUrl, 'https://temp.example/73')
})
```

Also assert existing page-facing field names remain present so this server change cannot silently break frontend renderers.

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```bash
node --test tests/uploaded-image-read-contract.test.js
```

Expected: FAIL because media covers/files, avatars and legacy activity photos do not all use the shared resolver.

- [ ] **Step 3: Replace duplicate media URL conversion**

Change `mediaAlbumCoverMap` to pass all cover records to `attachImageUrls` and build the map from normalized `fileId` to `imageUrl`; remove `.slice(0, 50)` and the local `cloud.getTempFileURL` loop.

Use this mapping shape:

```js
const resolved = await attachImageUrls(albums
  .map(item => ({ fileId: cleanText(item.coverFileID, 1000) }))
  .filter(item => item.fileId))
return resolved.reduce((map, item) => {
  map[item.fileId] = item.imageUrl || item.fileId
  return map
}, {})
```

In `getMediaAlbum`, pass page files to `attachImageUrls`, then return:

```js
files: resolvedFiles.map(item => ({
  ...item,
  url: item.imageUrl || item.fileID || item.fileId || ''
}))
```

Keep `mediaPermission`, organization matching, pagination and delete permissions unchanged.

- [ ] **Step 4: Resolve avatar and legacy activity display URLs**

Before returning a platform session, resolve the current user's avatar through `attachImageUrls([{ fileId: user.avatar }])` and place only the resolved `imageUrl` in `avatarUrl`; keep `user.avatar` unchanged in storage.

Use one-record resolution without changing the stored user object:

```js
const avatarRows = user.avatar
  ? await attachImageUrls([{ fileId: user.avatar }])
  : []
const avatarUrl = avatarRows[0] ? avatarRows[0].imageUrl : ''
```

In `directoryMembers`, resolve all non-empty member avatar identifiers in one batched call, then replace only each public row's `avatarUrl` with the matching resolved address.

In `listActivities`, resolve selected cover records in one call before producing `coverUrl`. In `getActivity`, resolve the ordered photo rows once and return each photo with `url`, while setting `activity.coverUrl` from the corresponding resolved row. Keep activity and photo authorization unchanged.

`listHomeBanners` already calls `attachImageUrls`; retain it and extend the contract test to prove `fileId` remains stable while `src` uses the resolved `imageUrl`.

- [ ] **Step 5: Run module and permission regression tests**

Run:

```bash
node --test tests/uploaded-image-read-contract.test.js tests/home-banner-team-admin.test.js tests/media-drive-folders.test.js tests/media-drive-path.test.js tests/profile-avatar-path.test.js tests/permission-service-team-position.test.js
node --check cloudfunctions/api/index.js
```

Expected: all tests pass and endpoint field names remain compatible with existing pages.

- [ ] **Step 6: Commit the remaining image read paths**

```bash
git add cloudfunctions/api/index.js tests/uploaded-image-read-contract.test.js
git commit -m "fix: align uploaded image read paths"
```

---

### Task 4: 全量验证、审查与交付准备

**Files:**
- Review scope: all files listed in Tasks 1-3 and their tests; this task does not add a new implementation file.
- Verify: `docs/superpowers/specs/2026-08-01-image-display-reliability-design.md`
- Verify: `docs/DEVELOPMENT_GUARDRAILS.md`

**Interfaces:**
- Consumes: all Task 1-3 commits.
- Produces: a clean, pushed feature branch with automated evidence and an explicit `api` redeployment requirement; no production deployment or mini-program upload occurs in this task.

- [ ] **Step 1: Run syntax checks for every changed JavaScript file**

Run:

```bash
node --check cloudfunctions/api/image-display-resolver.js
node --check cloudfunctions/api/archive-image-query.js
node --check cloudfunctions/api/archive-image-fallback.js
node --check cloudfunctions/api/index.js
node --check tests/image-display-resolver.test.js
node --check tests/archive-image-file-record-fallback.test.js
node --check tests/archive-event-read-authorization.test.js
node --check tests/uploaded-image-read-contract.test.js
```

Expected: every command exits 0.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
node --test tests/*.test.js
```

Expected: all tests pass with zero failures, skips caused by this change or unhandled rejections.

- [ ] **Step 3: Run repository safety checks**

Run:

```bash
git diff --check
rg -n "<<<<<<<|=======|>>>>>>>" miniprogram cloudfunctions tests docs
rg -n "wx\.cloud\.database\(" miniprogram/pages
rg -n "uploadFile\(|cloudPath" miniprogram/pages miniprogram/services --glob '*.js'
git status --short --branch
```

Expected: no conflict markers, no page-level database calls, no new upload path outside `file-upload-service.js`, and only intended files are modified.

- [ ] **Step 4: Review authorization and scope explicitly**

Inspect the final diff and confirm:

```text
- every association query starts from already-visible resource IDs
- selectArchiveImages still rejects wrong organization/resource/status/MIME
- media, avatar and activity permission functions are unchanged
- no production collection write or migration was added
- no event ID, image ID, user name or organization-specific exception was added
```

Run the archive authorization tests once more after review:

```bash
node --test tests/archive-event-read-authorization.test.js tests/archive-position-permission.test.js tests/archive-team-admin.test.js
```

Expected: all security tests pass.

- [ ] **Step 5: Request code review and address only verified findings**

Use `superpowers:requesting-code-review` against the feature branch diff from `5b65ca9` through `HEAD`. Any finding must be reproduced or traced before changing code; use `superpowers:receiving-code-review` for reviewer feedback.

- [ ] **Step 6: Commit verified review corrections or record that none were needed**

When review produces a reproduced correction, stage the complete allowed correction set; Git ignores unchanged paths:

```bash
git add cloudfunctions/api/image-display-resolver.js cloudfunctions/api/archive-image-query.js cloudfunctions/api/archive-image-fallback.js cloudfunctions/api/index.js tests/image-display-resolver.test.js tests/archive-image-file-record-fallback.test.js tests/archive-event-read-authorization.test.js tests/uploaded-image-read-contract.test.js
git commit -m "fix: harden image display reliability"
```

If review has no actionable finding, do not create an empty commit.

- [ ] **Step 7: Push and report deployment boundary**

Run:

```bash
git push origin codex/image-display-reliability
git status --short --branch
git log -5 --oneline --decorate
```

Expected: push succeeds and the worktree is clean.

Report all changed files, exact test count, branch and commits, and state:

```text
需要重新部署 cloudfunctions/api，代码才能在云端验证。
本次未部署 API，未修改生产数据，未上传小程序体验版。
```

- [ ] **Step 8: After separate deployment approval, perform read-only cloud acceptance**

Only after the user explicitly approves deploying `api`:

1. Deploy `cloudfunctions/api` to `cloud1-d6ghj5dev32a15a81`.
2. Call the authorized archive list/detail API and verify event `event_1784125629224_b253uo` returns exactly two non-empty display URLs.
3. Read-check one additional historical event, one home banner, one media album and one member avatar.
4. Issue an unauthorized organization request and verify it remains rejected or returns no out-of-scope image.
5. Do not write production records and do not upload a mini-program version.

Expected: authorized images resolve, unauthorized images remain inaccessible, and the user separately decides whether to upload a new experience version.
