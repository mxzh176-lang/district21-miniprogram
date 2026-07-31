# Effective Banner Data and Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible carousel image replaceable and reduce the editor menu to add, replace-current, and clear-all.

**Architecture:** Normalize cloud and fallback carousel responses into one effective source/value pair during home-banner loading. Keep the existing selection-mode UI and upload path, but validate and save against the effective stable values rather than a possibly empty raw source array.

**Tech Stack:** WeChat Mini Program JavaScript/WXML, Node.js built-in test runner, existing `utils/api.js` and `uploadOrgFile()`.

## Global Constraints

- Classification remains `review-risky but mitigated`.
- Pages call APIs only through `miniprogram/utils/api.js`.
- Every upload continues through `uploadOrgFile()` and creates `file_records`.
- Cloud functions remain the authority for write permissions.
- Do not modify cloud functions, database schemas, or unrelated home modules.
- Keep the maximum carousel size at 9 images.

---

### Task 1: Add failing regression tests

**Files:**
- Modify: `tests/home-banner-team-admin.test.js`

**Interfaces:**
- Consumes: `loadHomeBannersForScope()`, `confirmSelectedHomeBanner()`, `editHomeBanners()`.
- Produces: regression assertions for effective fallback values and the three-action menu.

- [ ] **Step 1: Write menu and data-source assertions**

Add tests requiring:

```js
assert.match(homeScript, /itemList: \['新增轮播图', '替换当前轮播图', '清空全部轮播图'\]/)
assert.doesNotMatch(homeScript, /替换全部轮播图/)
assert.doesNotMatch(homeScript, /chooseHomeBanners\('replace'\)/)
assert.match(homeScript, /const effectiveSources = configured \? sources :/)
assert.match(homeScript, /const effectiveValues = configured \? values : effectiveSources/)
assert.match(homeScript, /banners: effectiveSources/)
assert.match(homeScript, /bannerValues: effectiveValues/)
```

Add an assertion that the replacement boundary uses `bannerValues.length`, not `banners.length`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/home-banner-team-admin.test.js`

Expected: FAIL because the four-action menu and mismatched raw/fallback arrays still exist.

### Task 2: Normalize effective banners and simplify menu

**Files:**
- Modify: `miniprogram/pages/home/index.js`
- Test: `tests/home-banner-team-admin.test.js`

**Interfaces:**
- Produces: aligned `banners`, `bannerValues`, and `heroSlides` arrays with identical ordering.
- Preserves: `enterBannerSelection()`, `confirmSelectedHomeBanner()`, `saveSelectedHomeBanners()`.

- [ ] **Step 1: Normalize successful banner reads**

After obtaining `sources` and `values`, derive:

```js
const effectiveSources = configured
  ? sources
  : (sources.length ? sources : this.data.baseBanners)
const effectiveValues = configured
  ? values
  : effectiveSources.slice()
```

Write `effectiveSources` to `banners`, `effectiveValues` to `bannerValues`, and build `heroSlides` from `effectiveSources`.

- [ ] **Step 2: Keep fallback state aligned**

In the read-error branch, copy `baseBanners` into both `banners` and `bannerValues`, and build `heroSlides` from the same array.

- [ ] **Step 3: Validate replacement against stable values**

Use:

```js
const editableBanners = this.data.bannerValues.length
  ? this.data.bannerValues
  : this.data.banners
if (selectedIndex < 0 || selectedIndex >= editableBanners.length) {
  wx.showToast({ title: '请滑动选择图片', icon: 'none' })
  return
}
```

The existing save function continues replacing only `editableBanners[selectedIndex]` through its current `replaceIndex` option.

- [ ] **Step 4: Reduce the action sheet to three items**

Use exactly:

```js
itemList: ['新增轮播图', '替换当前轮播图', '清空全部轮播图']
```

Map index 0 to append, index 1 to selection mode, and index 2 to `clearHomeBanners()`. Remove the `replace` call path; keep `chooseHomeBanners()` append-only.

- [ ] **Step 5: Update clear-all copy**

Keep the existing `saveHomeBanners` call with `banners: []` and change the success toast to `已清空全部轮播`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/home-banner-team-admin.test.js`

Expected: all focused tests pass.

### Task 3: Verify, commit, and push

**Files:**
- Verify: `miniprogram/pages/home/index.js`
- Verify: `tests/home-banner-team-admin.test.js`

**Interfaces:**
- Consumes: normalized effective banner state and three-action menu.
- Produces: verified Git commit and pushed feature branch.

- [ ] **Step 1: Run syntax and relevant tests**

```bash
node --check miniprogram/pages/home/index.js
node --test tests/home-banner-team-admin.test.js tests/permission-service-team-position.test.js
```

Expected: syntax succeeds and all relevant tests pass.

- [ ] **Step 2: Compile in WeChat DevTools**

Open the current worktree, compile the home page, and verify zero WXML/JavaScript compilation errors. Manually confirm the menu contains only the three specified actions and that a fallback image enters the media picker when “替换这张” is clicked.

- [ ] **Step 3: Run full regression and whitespace checks**

```bash
node --test tests/*.test.js
git diff --check
```

Expected: full suite passes and `git diff --check` has no output.

- [ ] **Step 4: Commit and push**

```bash
git add miniprogram/pages/home/index.js tests/home-banner-team-admin.test.js docs/superpowers/plans/2026-07-31-banner-effective-data-menu.md
git commit -m "fix: align editable home banners"
git push -u origin codex/banner-effective-data-menu
```

- [ ] **Step 5: Report deployment impact**

Report that API redeployment is not required because no `cloudfunctions/` files changed. A new mini-program version must be uploaded before users receive the fix.
