# Task 1 Integration Report — 2026-07-31

## Scope and compliance classification

- Classification: **review-safe**. This recovery integrates previously scoped internal archive-image recovery and internal Yuanhang monthly meeting reminders. It adds no public posting, social/UGC behavior, payment, sensitive-data collection, production-data mutation, or changed external API contract.
- Baseline: `be477f4` (`fix: align editable home banners`).
- No deployment, upload, database write, production-data change, or change outside this recovery worktree was performed.

## Integrated source commits

| Source commit | Resulting commit | Subject |
| --- | --- | --- |
| `82bfa86` | `0f0d146` | design: archive image fallback |
| `161348c` | `0ef7ea2` | plan: archive image fallback |
| `f7aba39` | `fd35ba0` | test: archive image fallback |
| `605f1fc` | `c7d3d67` | fix: archive images from file records |
| `1491cd2` | `50130c9` | design: monthly meeting todo |
| `08aaff2` | `5697c4c` | plan: monthly meeting todo |
| `e18caf1` | `3d19753` | test: monthly meeting reminders |
| `6a21690` | `1cfab4f` | feat: local monthly meeting reminder |
| `35e22e7` | `4bfae3b` | feat: schedule monthly Yuanhang meeting todo |

## Conflict resolution

`cloudfunctions/api/index.js` conflicted while applying `35e22e7`. The resolved file keeps both imports and both integrations:

- `loadArchiveImages` remains used by `listEventRecords`, retaining the `event_image` primary source with organization-scoped active `file_records` image fallback.
- `reconcileMonthlyMeetingTodo` remains used by `ensureMonthlyMeetingTodo`, which is called after the existing birthday and member-holiday automatic todo generators.

The following protected baseline behavior was verified unchanged against `be477f4`:

- home banner permission, selection, editing, autoplay and interaction files;
- seven archive event categories, including `服务事件`;
- homepage 30-day todo presentation;
- archive entry text-size behavior.

The mini-program still routes local fallback construction through `miniprogram/utils/api.js`; no page was changed to call CloudBase or a database directly. Cloud-side writes for the monthly task continue through the existing audit writer.

## Verification evidence

Executed in `/Users/a0000/Documents/21的事小程序开发-recover-complete-20260731` after conflict resolution:

1. `node --check cloudfunctions/api/index.js cloudfunctions/api/archive-image-fallback.js cloudfunctions/api/monthly-meeting-todo.js miniprogram/utils/api.js miniprogram/utils/monthly-meeting-todo.js` — exit 0.
2. `node --test tests/*.test.js` — 82 tests passed, 0 failed, 0 skipped/cancelled.
3. `git diff --check be477f4..HEAD` — exit 0.
4. `rg -n '^(<<<<<<<|=======|>>>>>>>)'` (excluding the pre-existing untracked recovery plan) — no conflict markers.
5. Protected-file comparison against `be477f4` — no differences in the listed banner, event-category, home-todo, or archive-font files.

## Release handoff and concern

`cloudfunctions/api/` changed. The affected `api` cloud function **must be redeployed before testing these cloud-backed recovery features**. Redeployment is intentionally outside Task 1 and was not performed. The pre-existing untracked approved plan `docs/superpowers/plans/2026-07-31-recover-complete-release.md` was intentionally left untouched and excluded from this task's commit.
