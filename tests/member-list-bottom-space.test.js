const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

test('member list leaves scrollable space above the custom tab bar', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/org/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/org/index.wxss'), 'utf8')
  assert.match(template, /class="contacts-bottom-space"/)
  assert.match(style, /height: calc\(140rpx \+ env\(safe-area-inset-bottom\)\)/)
})
