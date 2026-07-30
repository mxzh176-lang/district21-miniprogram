# Service First and Larger Archive Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put “服务事件” first and improve create-page readability without changing layout or behavior.

**Architecture:** Reorder the existing shared client category constant and scale only explicit font-size declarations in the archive create-page stylesheet. Protect both outcomes with focused source-boundary tests.

**Tech Stack:** WeChat Mini Program WXSS, CommonJS JavaScript, Node test runner.

## Global Constraints

- Do not change permissions, APIs, layout dimensions, spacing, colors, copy, or other pages.
- Keep the change `review-safe`.
- No cloud function deployment is required.

---

### Task 1: Add Failing Ordering and Typography Tests

**Files:**
- Modify: `tests/event-category.test.js`
- Create: `tests/archive-create-font-size.test.js`

- [ ] Assert the exact category order begins with `服务事件`.
- [ ] Assert representative create-page text classes use the agreed approximately 10% larger sizes.
- [ ] Run both tests and confirm they fail for the missing changes.

### Task 2: Apply Minimal Client Changes

**Files:**
- Modify: `miniprogram/utils/event-category.js`
- Modify: `miniprogram/pages/archive/create/index.wxss`

- [ ] Move `服务事件` to the first array position.
- [ ] Scale only existing `font-size` values by approximately 10%, rounded to integer rpx.
- [ ] Run focused tests and confirm they pass.

### Task 3: Verify and Publish Branch

- [ ] Run all tests, JavaScript syntax checks, JSON parsing and `git diff --check`.
- [ ] Confirm the runtime diff contains only the category reorder and font-size changes.
- [ ] Commit and push `codex/archive-service-first-larger-text`.
