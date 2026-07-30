const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const stylesheet = fs.readFileSync(
  path.resolve(__dirname, '../miniprogram/pages/archive/create/index.wxss'),
  'utf8'
)

test('archive create page uses the agreed larger text scale', () => {
  const expectedSizes = {
    'scope-name': 34,
    'quick-create-title': 31,
    'quick-create-desc': 22,
    'section-title': 35,
    'section-desc': 22,
    'category-name': 30,
    'category-person': 33,
    'committee-name': 24,
    'committee-role': 28,
    'category-footer': 21
  }

  Object.entries(expectedSizes).forEach(([className, fontSize]) => {
    assert.match(stylesheet, new RegExp(`\\.${className}\\{[^}]*font-size:${fontSize}rpx`))
  })
})
