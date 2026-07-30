# Archive Person Edit Removal and Service Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every person-name edit button from the archive creation directory and add a persistable “服务事件” archive category.

**Architecture:** Keep archive navigation and authorization unchanged while removing only the create-page edit affordance and its dead client code. Extend the existing shared client category list and matching API normalization whitelist so every current picker/filter consumer receives the new value without duplicate page logic.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS JavaScript, CloudBase Node.js cloud function, Node built-in test runner.

## Global Constraints

- Pages continue to call `miniprogram/utils/api.js`; no direct page database access.
- Cloud functions continue to enforce write permissions.
- No database schema, upload path, audit log, or personal-data behavior changes.
- The change is `review-safe` and remains internal organization/archive management.
- Redeploy `cloudfunctions/api` before testing the saved category in the mini program.

---

### Task 1: Remove Person Edit Controls

**Files:**
- Modify: `tests/archive-create-superadmin-edit.test.js`
- Modify: `miniprogram/pages/archive/create/index.wxml`
- Modify: `miniprogram/pages/archive/create/index.js`
- Modify: `miniprogram/pages/archive/create/index.wxss`

**Interfaces:**
- Consumes: existing archive directory objects with `canMaintain` and position identifiers.
- Produces: the same navigable directory without a person-name edit control or `editPosition` handler.

- [ ] **Step 1: Write the failing test**

Replace the old super-admin edit-control expectations with assertions that the rendered template has no `position-edit`, `child-edit`, or `catchtap="editPosition"`, and that the page script has no `editPosition(event)` handler.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-create-superadmin-edit.test.js`
Expected: FAIL because the current template and script still expose the edit controls.

- [ ] **Step 3: Write minimal implementation**

Remove both edit views, change the section copy to describe event entry only, remove edit-only state/handler logic, and remove `.position-edit`/`.child-edit` styles. Preserve directory filtering using `canMaintain` and existing child visibility.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/archive-create-superadmin-edit.test.js`
Expected: PASS.

### Task 2: Add the Service Event Category

**Files:**
- Modify: `tests/event-category.test.js`
- Modify: `miniprogram/utils/event-category.js`
- Modify: `cloudfunctions/api/index.js`

**Interfaces:**
- Consumes: `EVENT_CATEGORIES`, `normalizeEventCategory(categoryId, categoryName)`, and API `normalizeEventType(value, categoryId, category)`.
- Produces: literal category value `服务事件` accepted unchanged by both client and API.

- [ ] **Step 1: Write the failing test**

Assert that `EVENT_CATEGORIES` includes `服务事件` and add a source-boundary assertion that the API event whitelist contains the same value.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-category.test.js`
Expected: FAIL because neither whitelist currently includes `服务事件`.

- [ ] **Step 3: Write minimal implementation**

Append `服务事件` to the client `EVENT_CATEGORIES` array and cloud API `EVENT_TYPES` array. Do not change legacy inference rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-category.test.js`
Expected: PASS.

### Task 3: Verify and Publish the Feature Branch

**Files:**
- Verify all files changed by Tasks 1–2 and the two design documents.

**Interfaces:**
- Consumes: completed UI and category changes.
- Produces: a verified Git commit on `codex/archive-service-event` pushed to GitHub.

- [ ] **Step 1: Run the complete test suite**

Run: `node --test tests/*.test.js`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Run syntax and whitespace checks**

Run `node --check` for every changed `.js` file and `git diff --check`.
Expected: all commands exit 0.

- [ ] **Step 3: Review the scoped diff**

Run: `git diff --stat && git diff -- miniprogram/pages/archive/create miniprogram/utils/event-category.js cloudfunctions/api/index.js tests`
Expected: only the confirmed edit-control removal, category addition, and matching tests appear.

- [ ] **Step 4: Commit and push**

Stage only the planned files, commit with `feat: refine archive event entry`, and push `codex/archive-service-event` to `origin`.
