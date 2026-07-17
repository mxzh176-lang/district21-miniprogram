const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')
const template = fs.readFileSync(path.join(ROOT, 'miniprogram/components/todo-task-card/index.wxml'), 'utf8')
const style = fs.readFileSync(path.join(ROOT, 'miniprogram/components/todo-task-card/index.wxss'), 'utf8')

test('birthday task renders an animated cake with sparkles', () => {
  assert.match(template, /task\.categoryIcon/)
  assert.match(template, /cake-spark-left/)
  assert.match(template, /cake-spark-right/)
  assert.match(style, /@keyframes cake-bounce/)
  assert.match(style, /@keyframes cake-sparkle/)
})

test('other task types use restrained category motion and completed tasks stop moving', () => {
  ;['sprout-sway', 'notice-shake', 'social-float', 'care-beat', 'cap-lift', 'pin-pulse'].forEach(name => {
    assert.match(style, new RegExp(`@keyframes ${name}`))
  })
  assert.match(style, /\.done \.category-glyph,.done \.cake-spark \{ animation: none; \}/)
})
