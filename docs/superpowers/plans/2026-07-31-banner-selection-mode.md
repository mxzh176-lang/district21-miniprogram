# Banner Selection Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause and stabilize the home carousel while an administrator selects one image for replacement.

**Architecture:** Keep the selection state inside the existing home page. Bind `swiper` autoplay and circular behavior to that state, separate entering selection mode from confirming replacement, and reuse the existing single-file upload/save path after the target is confirmed.

**Tech Stack:** WeChat Mini Program WXML/JavaScript, Node.js built-in test runner, existing `utils/api.js` and `uploadOrgFile()`.

## Global Constraints

- Classification remains `review-risky but mitigated`.
- Pages call APIs only through `miniprogram/utils/api.js`.
- Uploads use `uploadOrgFile()` and retain `file_records` creation.
- Cloud functions remain the authority for write permission checks.
- Do not change unrelated home, task, archive, member, database, or deployment behavior.

---

### Task 1: Lock carousel behavior with a failing test

**Files:**
- Modify: `tests/home-banner-team-admin.test.js`

**Interfaces:**
- Consumes: `bannerSelecting`, `editHomeBanners()`, `changeHeroSlide(event)`.
- Produces: regression assertions for selection-mode entry, pause behavior, confirmation, and exit paths.

- [ ] **Step 1: Write the failing test**

Add assertions that require:

```js
assert.match(homeTemplate, /autoplay="{{!bannerSelecting}}"/)
assert.match(homeTemplate, /circular="{{!bannerSelecting}}"/)
assert.match(homeTemplate, /wx:if="{{bannerSelecting}}"/)
assert.match(homeTemplate, /bindtap="confirmSelectedHomeBanner"/)
assert.match(homeScript, /enterBannerSelection\(\)/)
assert.match(homeScript, /exitBannerSelection\(\)/)
assert.match(homeScript, /confirmSelectedHomeBanner\(\)/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/home-banner-team-admin.test.js`

Expected: FAIL because the swiper is statically autoplay/circular and selection-mode methods do not exist.

### Task 2: Implement stable selection mode

**Files:**
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Test: `tests/home-banner-team-admin.test.js`

**Interfaces:**
- Produces: `enterBannerSelection()`, `exitBannerSelection()`, `confirmSelectedHomeBanner()`.
- Preserves: `saveSelectedHomeBanners(files, { replaceIndex })` and `changeHeroSlide(event)`.

- [ ] **Step 1: Add minimal page state and lifecycle reset**

Add `bannerSelecting: false` to page data. Set it to false from `onHide`, `onUnload`, organization switching, and banner reload when the current target is no longer valid.

- [ ] **Step 2: Separate entry from confirmation**

Change the action-sheet replacement option to call:

```js
enterBannerSelection() {
  this.setData({ bannerSelecting: true })
}
```

Implement `confirmSelectedHomeBanner()` to validate `currentHeroIndex - 1`, call `wx.chooseMedia({ count: 1 })`, and reuse:

```js
await this.saveSelectedHomeBanners(files.slice(0, 1), { replaceIndex: selectedIndex })
```

On successful save, call `exitBannerSelection()` after refreshing banner data. If media selection is cancelled, remain in selection mode.

- [ ] **Step 3: Bind swiper and render selection controls**

Use:

```xml
<swiper autoplay="{{!bannerSelecting}}" circular="{{!bannerSelecting}}" ...>
```

When `bannerSelecting` is true, show guidance, show “替换这张” only on image slides, and provide “取消选择”. Use `catchtap` so controls do not trigger unrelated navigation.

- [ ] **Step 4: Add focused styles**

Add only selection overlay/button styles matching the existing rounded white/blue carousel controls. Do not alter carousel dimensions or other home typography.

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `node --test tests/home-banner-team-admin.test.js`

Expected: all focused tests PASS.

### Task 3: Verify and publish the branch

**Files:**
- Modify: `docs/superpowers/plans/2026-07-31-banner-selection-mode.md` only to mark completed checkboxes if needed.

**Interfaces:**
- Consumes: completed selection-mode implementation.
- Produces: verified commit and pushed feature branch.

- [ ] **Step 1: Run syntax and relevant tests**

Run:

```bash
node --check miniprogram/pages/home/index.js
node --test tests/home-banner-team-admin.test.js tests/permission-service-team-position.test.js
```

Expected: syntax succeeds and all relevant tests pass.

- [ ] **Step 2: Run full regression and whitespace checks**

Run:

```bash
node --test tests/*.test.js
git diff --check
```

Expected: full suite passes and `git diff --check` has no output.

- [ ] **Step 3: Commit and push**

```bash
git add miniprogram/pages/home/index.js miniprogram/pages/home/index.wxml miniprogram/pages/home/index.wxss tests/home-banner-team-admin.test.js docs/superpowers/plans/2026-07-31-banner-selection-mode.md
git commit -m "fix: stabilize banner image selection"
git push -u origin codex/banner-selection-mode
```

- [ ] **Step 4: Report deployment impact**

Report that no cloud function file changes are expected, so API redeployment is not required. A new mini-program version must be uploaded before users receive the interaction fix.
