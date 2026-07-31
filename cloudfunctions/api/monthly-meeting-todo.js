const TODO_ORGANIZATION_ID = 'org_team_yuanhang'
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

function parseDateText(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error('reference date must use YYYY-MM-DD')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.toISOString().slice(0, 10) !== value) throw new Error('reference date is invalid')
  return { year, month, day }
}

function buildMonthlyMeetingTarget(referenceDateText) {
  let { year, month, day } = parseDateText(referenceDateText)
  if (day > 5) {
    month += 1
    if (month > 12) {
      year += 1
      month = 1
    }
  }
  const monthText = String(month).padStart(2, '0')
  return {
    id: `todo_yuanhang_monthly_meeting_${year}_${monthText}`,
    date: `${year}-${monthText}-05`,
    month: `${year}-${monthText}`,
    title: `远航${MONTH_NAMES[month - 1]}例会+联谊`
  }
}

function matchesMonthlyMeetingTodo(todo = {}, target = {}) {
  if (todo.organizationId !== TODO_ORGANIZATION_ID || todo.date !== target.date) return false
  return todo.title === '远航第二次例会' || todo.title === target.title
}

module.exports = {
  TODO_ORGANIZATION_ID,
  buildMonthlyMeetingTarget,
  matchesMonthlyMeetingTodo
}
