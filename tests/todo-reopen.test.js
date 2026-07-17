const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

test('completed todo can be reopened from the task page', () => {
  const page = read('miniprogram/pages/tasks/index.js')
  const template = read('miniprogram/pages/tasks/index.wxml')
  const component = read('miniprogram/components/todo-task-card/index.js')
  const componentTemplate = read('miniprogram/components/todo-task-card/index.wxml')
  const service = read('miniprogram/services/todo-service.js')

  assert.match(page, /async reopenTask\(event\)/)
  assert.match(page, /api\.call\('reopenTask', \{ id \}\)/)
  assert.match(template, /bind:reopen="reopenTask"/)
  assert.doesNotMatch(template, /reopen-button|重新待办/)
  assert.match(component, /task\.completed[\s\S]*task\.canComplete[\s\S]*triggerEvent\('reopen'/)
  assert.match(componentTemplate, /task\.canComplete && \(!readonly \|\| task\.completed\)/)
  assert.match(service, /'reopenTask'/)
})

test('cloud reopens the same todo with administrator authorization', () => {
  const cloud = read('cloudfunctions/api/index.js')
  const start = cloud.indexOf('async function reopenTask')
  const end = cloud.indexOf('async function listOrg', start)
  const body = cloud.slice(start, end)

  assert.match(body, /requireTodoAdmin\(openid\)/)
  assert.match(body, /\['done', 'completed'\]\.includes\(task\.status\)/)
  assert.match(body, /status: 'pending'/)
  assert.match(body, /completedAt: null/)
  assert.match(body, /archiveMonth: ''/)
  assert.match(cloud, /completeTask,\s+reopenTask,/)
})
