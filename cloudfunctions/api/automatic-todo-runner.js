async function runAutomaticTodoReconciliation(dependencies = {}) {
  if (!dependencies.existingRemindersReady) {
    await dependencies.ensureBirthdayTodos()
    await dependencies.ensureMemberHolidayTodos()
  }
  await dependencies.ensureMonthlyMeetingTodo()
}

module.exports = { runAutomaticTodoReconciliation }
