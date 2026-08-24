const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')
const script = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.js'), 'utf8')
const template = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.wxml'), 'utf8')

test('create page does not render edit controls after person names', () => {
  assert.doesNotMatch(template, /class="position-edit/)
  assert.doesNotMatch(template, /class="[^"]*child-edit/)
  assert.doesNotMatch(template, /catchtap="editPosition"/)
  assert.doesNotMatch(template, /负责人编辑/)
})

test('create page has no person edit navigation handler', () => {
  assert.doesNotMatch(script, /editPosition\(event\)/)
  assert.doesNotMatch(script, /pages\/archive\/position-edit\/index/)
})
