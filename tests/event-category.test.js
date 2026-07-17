const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { EVENT_CATEGORIES, inferEventCategory } = require('../miniprogram/utils/event-category')

const ROOT = path.resolve(__dirname, '..')

test('event categories contain the six selectable archive types', () => {
  assert.deepEqual(EVENT_CATEGORIES, ['例会事件', '联谊事件', '关爱事件', '纠察事件', '培训事件', '会员发展'])
})

test('legacy archive positions automatically receive an event category', () => {
  assert.equal(inferEventCategory('fellowship-committee'), '联谊事件')
  assert.equal(inferEventCategory('care-committee'), '关爱事件')
  assert.equal(inferEventCategory('tamer'), '纠察事件')
  assert.equal(inferEventCategory('leadership-training'), '培训事件')
  assert.equal(inferEventCategory('member-retention'), '会员发展')
  assert.equal(inferEventCategory('secretary'), '例会事件')
})

test('archive list provides event category filtering', () => {
  const script = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/list/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/list/index.wxml'), 'utf8')
  const cloud = fs.readFileSync(path.join(ROOT, 'cloudfunctions/api/index.js'), 'utf8')

  assert.match(script, /changeEventCategory/)
  assert.match(template, /事件分类/)
  assert.match(cloud, /eventType: normalizeEventType/)
  assert.match(cloud, /!eventType \|\| item\.eventType === eventType/)
})
