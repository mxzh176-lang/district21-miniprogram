const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

test('archive page does not show the promotional hero module', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/archive/index.wxml'), 'utf8')
  assert.doesNotMatch(template, /让狮爱有迹可循|ARCHIVE DIRECTORY|class="archive-hero"/)
})
