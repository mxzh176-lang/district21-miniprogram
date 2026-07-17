const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const homeTemplate = fs.readFileSync(
  path.resolve(__dirname, '../miniprogram/pages/home/index.wxml'),
  'utf8'
)

test('home hides care shortcuts, organization summary and latest archive cards', () => {
  assert.doesNotMatch(homeTemplate, /class="care-row"/)
  assert.doesNotMatch(homeTemplate, /class="stats"/)
  assert.doesNotMatch(homeTemplate, /本月生日|查看服务事件|年度照片|当前服务队/)
  assert.doesNotMatch(homeTemplate, /historyTitle|goActivities|class="event-scroll"|wx:for="{{activities}}"/)
})
