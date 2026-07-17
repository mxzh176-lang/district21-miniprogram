const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

test('archive page shows ten events before expanding', () => {
  const page = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/index.js'), 'utf8')
  assert.match(page, /const visibleLimit = 10/)
  assert.match(page, /entries\.slice\(0, visibleLimit\)/)
})

test('archive history expand control stays clear of the bottom navigation', () => {
  const style = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/index.wxss'), 'utf8')
  assert.match(style, /\.history-panel\s*\{\s*padding-bottom: 190rpx;/)
})
