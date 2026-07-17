const test = require('node:test')
const assert = require('node:assert/strict')
const todoDisplay = require('../miniprogram/utils/todo-display')

test('todo card uses a full date and no manager display field', () => {
  const task = todoDisplay.decorateTask({
    title: '月度会议',
    date: '2026-07-20',
    category: '会议培训',
    status: 'pending',
    managerName: '不应展示'
  }, { status: 'approved', platformRole: 'member', roles: [] })

  assert.match(task.dateLabel, /^2026年7月20日 周[日一二三四五六]$/)
  assert.equal(Object.prototype.hasOwnProperty.call(task, 'managerLabel'), false)
  assert.notEqual(task.countdownValue, '')
})

test('todo categories receive matching animated visual symbols', () => {
  const examples = [
    ['公益服务', 'service', '🌱'],
    ['工作会议', 'meeting', '📣'],
    ['生日关爱', 'birthday', '🎂'],
    ['联谊活动', 'social', '🤝'],
    ['婚丧嫁娶', 'visit', '💝'],
    ['培训活动', 'training', '🎓'],
    ['其他', 'default', '📌']
  ]

  examples.forEach(([category, tone, icon]) => {
    const task = todoDisplay.decorateTask({ category, date: '2026-07-20' }, {})
    assert.equal(task.tone, tone)
    assert.equal(task.categoryIcon, icon)
  })
})

test('legacy birthday care category is displayed with the new name', () => {
  const task = todoDisplay.decorateTask({ category: '生日关怀', date: '2026-07-20' }, {})
  assert.equal(task.categoryLabel, '生日关爱')
  assert.equal(task.categoryIcon, '🎂')
})
