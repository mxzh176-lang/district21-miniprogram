const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

test('all active users can read shared todos while create permission remains restricted', () => {
  const cloud = read('cloudfunctions/api/index.js')
  const viewer = cloud.slice(cloud.indexOf('async function todoViewer'), cloud.indexOf('async function requireTodoCreator'))
  const creator = cloud.slice(cloud.indexOf('async function requireTodoCreator'), cloud.indexOf('async function requireTodoAdmin'))
  assert.match(viewer, /user && user\.status === 'active'/)
  assert.doesNotMatch(viewer, /TODO_ORGANIZATION_ID|isTodoAdmin/)
  assert.match(creator, /TODO_ORGANIZATION_ID/)
  assert.match(creator, /isTodoAdmin/)
  assert.match(cloud, /visibleToAll: true/)
})

test('todo and member views refresh shared cloud data every five seconds', () => {
  assert.match(read('miniprogram/pages/home/index.js'), /TODO_SYNC_INTERVAL = 5000/)
  assert.match(read('miniprogram/pages/home/index.js'), /listTasks', \{ month: 'all' \}/)
  assert.match(read('miniprogram/pages/tasks/index.js'), /TODO_SYNC_INTERVAL = 5000/)
  assert.match(read('miniprogram/pages/tasks/index.js'), /selectedMonth: 'all'/)
  assert.match(read('miniprogram/pages/org/index.js'), /MEMBER_SYNC_INTERVAL = 5000/)
  assert.match(read('miniprogram/pages/org/detail/index.js'), /MEMBER_SYNC_INTERVAL = 5000/)
  assert.match(read('miniprogram/pages/org/detail/index.js'), /该成员已被删除/)
  const editor = read('miniprogram/pages/archive/edit/index.js')
  assert.match(editor, /MEMBER_SYNC_INTERVAL = 5000/)
  assert.match(editor, /refreshParticipantMembers/)
  assert.match(editor, /forceRefresh: true/)
  const cloud = read('cloudfunctions/api/index.js')
  assert.match(cloud, /user\.status !== 'disabled' \? publicDirectoryMember\(user, organizations\) : null/)
})

test('shared todos remain visible when users switch service team scope', () => {
  const home = read('miniprogram/pages/home/index.js')
  const display = read('miniprogram/utils/todo-display.js')
  assert.match(home, /item\.visibleToAll \|\| orgScope\.matchesScope/)
  assert.match(display, /if \(task\.visibleToAll\) return true/)
})
