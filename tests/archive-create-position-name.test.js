const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

test('create page removes committee wording from displayed position names only', () => {
  const script = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/archive/create/index.wxml'), 'utf8')

  assert.match(script, /replace\(\/委员会\/g, ''\)/)
  assert.match(template, /item\.displayName \|\| item\.name/)
  assert.doesNotMatch(template, /class="(?:category|committee)-name">\{\{item\.name\}\}/)
})
