const test = require('node:test')
const assert = require('node:assert/strict')

const cloudMonthlyMeeting = require('../cloudfunctions/api/monthly-meeting-todo')
const localMonthlyMeeting = require('../miniprogram/utils/monthly-meeting-todo')

const TARGET_CASES = [
  ['2026-07-31', { id: 'todo_yuanhang_monthly_meeting_2026_08', date: '2026-08-05', month: '2026-08', title: '远航八月例会+联谊' }],
  ['2026-08-05', { id: 'todo_yuanhang_monthly_meeting_2026_08', date: '2026-08-05', month: '2026-08', title: '远航八月例会+联谊' }],
  ['2026-08-06', { id: 'todo_yuanhang_monthly_meeting_2026_09', date: '2026-09-05', month: '2026-09', title: '远航九月例会+联谊' }],
  ['2026-12-06', { id: 'todo_yuanhang_monthly_meeting_2027_01', date: '2027-01-05', month: '2027-01', title: '远航一月例会+联谊' }]
]

test('cloud and local builders use the fifth day of the next non-past natural month', () => {
  TARGET_CASES.forEach(([referenceDate, expected]) => {
    assert.deepEqual(cloudMonthlyMeeting.buildMonthlyMeetingTarget(referenceDate), expected)
    assert.deepEqual(localMonthlyMeeting.buildMonthlyMeetingTarget(referenceDate), expected)
  })
})

test('legacy meeting matching is limited to the same Yuanhang date', () => {
  const target = cloudMonthlyMeeting.buildMonthlyMeetingTarget('2026-07-31')

  assert.equal(cloudMonthlyMeeting.matchesMonthlyMeetingTodo({
    organizationId: 'org_team_yuanhang',
    date: '2026-08-05',
    title: '远航第二次例会'
  }, target), true)
  assert.equal(cloudMonthlyMeeting.matchesMonthlyMeetingTodo({
    organizationId: 'org_team_yuanhang',
    date: '2026-08-05',
    title: '远航八月例会+联谊'
  }, target), true)
  assert.equal(cloudMonthlyMeeting.matchesMonthlyMeetingTodo({
    organizationId: 'org_team_jingying',
    date: '2026-08-05',
    title: '远航第二次例会'
  }, target), false)
  assert.equal(cloudMonthlyMeeting.matchesMonthlyMeetingTodo({
    organizationId: 'org_team_yuanhang',
    date: '2026-09-05',
    title: '远航第二次例会'
  }, target), false)
})
