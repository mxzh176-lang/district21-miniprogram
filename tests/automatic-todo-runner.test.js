const test = require('node:test')
const assert = require('node:assert/strict')

test('automatic todo runner includes the monthly meeting reconciliation after existing reminders', async () => {
  const { runAutomaticTodoReconciliation } = require('../cloudfunctions/api/automatic-todo-runner')
  const visibleTasks = []

  await runAutomaticTodoReconciliation({
    ensureBirthdayTodos: async () => { visibleTasks.push('birthday') },
    ensureMemberHolidayTodos: async () => { visibleTasks.push('member-holiday') },
    ensureMonthlyMeetingTodo: async () => { visibleTasks.push('monthly-meeting') }
  })

  assert.deepEqual(visibleTasks, ['birthday', 'member-holiday', 'monthly-meeting'])
})

test('automatic todo runner only reconciles the monthly meeting when existing reminders already ran', async () => {
  const { runAutomaticTodoReconciliation } = require('../cloudfunctions/api/automatic-todo-runner')
  const visibleTasks = []

  await runAutomaticTodoReconciliation({
    existingRemindersReady: true,
    ensureBirthdayTodos: async () => assert.fail('birthday reminder must not run twice'),
    ensureMemberHolidayTodos: async () => assert.fail('member holiday reminder must not run twice'),
    ensureMonthlyMeetingTodo: async () => { visibleTasks.push('monthly-meeting') }
  })

  assert.deepEqual(visibleTasks, ['monthly-meeting'])
})
