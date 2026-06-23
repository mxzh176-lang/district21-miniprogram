#!/bin/zsh

set -u

readonly REPO_DIR="/Users/xz/Documents/Codex/district21-miniprogram"
readonly BRANCH="codex/main"
readonly REMOTE="origin"
readonly LOCK_DIR="/tmp/district21-git-auto-sync.lock"
readonly LOG_DIR="$HOME/Library/Logs"
readonly LOG_FILE="$LOG_DIR/district21-git-sync.log"

mkdir -p "$LOG_DIR"
exec >> "$LOG_FILE" 2>&1

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "skip: another sync is running"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

cd "$REPO_DIR" || exit 1

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  log "stop: expected branch $BRANCH, found ${current_branch:-detached HEAD}"
  exit 0
fi

if [[ -f .git/MERGE_HEAD || -d .git/rebase-merge || -d .git/rebase-apply ]]; then
  log "stop: merge or rebase is already in progress"
  exit 0
fi

log "sync started"
git fetch --quiet "$REMOTE" "$BRANCH" || { log "stop: fetch failed"; exit 1; }

if [[ "${GIT_AUTO_SYNC_DRY_RUN:-0}" == "1" ]]; then
  log "dry run: $(git status --porcelain | wc -l | tr -d ' ') changed paths"
  log "dry run completed"
  exit 0
fi

git add -A
if ! git diff --cached --quiet; then
  commit_message="chore(sync): auto backup $(date '+%Y-%m-%d %H:%M')"
  git commit -m "$commit_message" || { log "stop: commit failed"; exit 1; }
  log "created commit: $commit_message"
fi

remote_ref="$REMOTE/$BRANCH"
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "$remote_ref")"
base_head="$(git merge-base HEAD "$remote_ref")"

if [[ "$local_head" == "$remote_head" ]]; then
  log "up to date"
  exit 0
fi

if [[ "$local_head" == "$base_head" ]]; then
  git merge --ff-only "$remote_ref" || { log "stop: fast-forward failed"; exit 1; }
  log "fast-forwarded from GitHub"
  exit 0
fi

if [[ "$remote_head" != "$base_head" ]]; then
  if ! git rebase "$remote_ref"; then
    git rebase --abort || true
    log "stop: remote conflict detected; local commit preserved"
    exit 1
  fi
  log "rebased local backup onto GitHub"
fi

git push --quiet "$REMOTE" "HEAD:$BRANCH" || { log "stop: push failed"; exit 1; }
log "push completed: $(git rev-parse --short HEAD)"
