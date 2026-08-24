# Selected Banner Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one selected carousel image and allow only super administrators to manage the district carousel.

**Architecture:** Track the active swiper index in the home page, reuse unified file upload, and replace only that array element before calling the existing save API. Extend client and cloud permission helpers with a district-only super-admin branch while retaining team-scoped behavior.

**Tech Stack:** WeChat Mini Program, CommonJS JavaScript, CloudBase API cloud function, Node test runner.

## Global Constraints

- Uploads must use `uploadOrgFile()` and create `file_records`.
- Cloud functions must reauthorize every write.
- Do not change existing append, replace-all, clear-all, team permissions, or unrelated modules.
- API must be redeployed before production cleanup and testing.

---

### Task 1: Add Failing Interaction and Permission Tests

- [ ] Test the new action, swiper index tracking, one-file selection and single-array-position replacement.
- [ ] Test district visibility for super admin and denial for ordinary/team/area roles.
- [ ] Test cloud district authorization requires active `super_admin`.
- [ ] Run focused tests and confirm failure.

### Task 2: Implement Selected Replacement

- [ ] Bind `swiper` change and store `currentHeroIndex`.
- [ ] Add “替换当前轮播图” without changing other menu actions.
- [ ] Upload exactly one image and replace only `banners[currentHeroIndex - 1]`.
- [ ] Run focused tests and confirm success.

### Task 3: Implement District Super-Admin Authorization

- [ ] Return true for district only when the client session is super admin.
- [ ] Require an active cloud `super_admin` role for district uploads and saves.
- [ ] Preserve existing service-team authorization.
- [ ] Run permission and full regression tests.

### Task 4: Publish and Clean Production Data

- [ ] Commit and push the feature branch.
- [ ] Deploy `cloudfunctions/api`.
- [ ] Upload a new mini-program version.
- [ ] Through the authenticated API, save only the district carousel's current first image.
- [ ] Verify API is active and district carousel contains one image.
