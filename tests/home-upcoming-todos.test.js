const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const todoDisplay = require(path.resolve(__dirname, '../miniprogram/utils/todo-display'))

function visibleTasks(tasks) {
  return todoDisplay.buildHomeGroups(tasks).flatMap(group => group.tasks)
}

test('home expands every unfinished todo within the next 30 days', () => {
  const tasks = Array.from({ length: 8 }, (_, index) => ({
    id: `upcoming-${index}`,
    difference: index + 1,
    inThisWeek: index < 3,
    completed: false
  }))
  assert.deepEqual(visibleTasks(tasks).map(item => item.id), tasks.map(item => item.id))
})

test('home keeps summary limits for later and undated todos', () => {
  const tasks = [31, 32, 33, 34].map(difference => ({
    id: `later-${difference}`,
    difference,
    inThisWeek: false,
    completed: false
  }))
  tasks.push({ id: 'undated', difference: null, inThisWeek: false, completed: false })
  assert.deepEqual(visibleTasks(tasks).map(item => item.id), ['later-31', 'later-32'])
})

test('completed todos remain excluded from the home list', () => {
  assert.deepEqual(visibleTasks([
    { id: 'pending', difference: 30, inThisWeek: false, completed: false },
    { id: 'completed', difference: 1, inThisWeek: true, completed: true }
  ]).map(item => item.id), ['pending'])
})
