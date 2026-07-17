const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')
const script = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.js'), 'utf8')
const template = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.wxml'), 'utf8')

test('only super admin sees position edit controls on the create page', () => {
  assert.match(script, /const canEditPositionDirectory = permission\.isSuperAdmin\(session\)/)
  assert.doesNotMatch(script, /canEditServiceTeamPositions\(session, organization\)/)
  assert.match(template, /wx:if="{{item\.canEditDirectory}}"[^>]*class="position-edit"/)
  assert.match(template, /负责人编辑仅超级管理员可见/)
})

test('create page blocks direct edit navigation for non-super admins', () => {
  const start = script.indexOf('editPosition(event)')
  const body = script.slice(start, script.indexOf('\n  }', start) + 4)
  assert.match(body, /if \(!permission\.isSuperAdmin\(this\.data\.session\)\) return/)
  assert.match(body, /pages\/archive\/position-edit\/index/)
})
