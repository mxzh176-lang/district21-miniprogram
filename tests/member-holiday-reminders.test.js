const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const professions = require('../miniprogram/data/yuanhang-professions')
const { buildMemberHolidayTasks } = require('../miniprogram/utils/member-holiday-reminders')

test('education occupations from the spreadsheet are stored as safe profession tags', () => {
  assert.deepEqual(professions, { 刘建鑫: 'teacher', 李珊珊: 'teacher', 胡世领: 'teacher' })
})

test('teacher nurse and doctor holidays generate one reminder within 30 days', () => {
  assert.deepEqual(buildMemberHolidayTasks([{ name: '教师甲', profession: 'teacher' }], new Date(2026, 7, 11)).map(item => item.title), ['教师节关怀提醒'])
  assert.deepEqual(buildMemberHolidayTasks([{ name: '护士甲', profession: 'nurse' }], new Date(2026, 3, 12)).map(item => item.title), ['护士节关怀提醒'])
  assert.deepEqual(buildMemberHolidayTasks([{ name: '医生甲', profession: 'doctor' }], new Date(2026, 6, 20)).map(item => item.title), ['中国医师节关怀提醒'])
})

test('member profession can be maintained and cloud reminders are persisted', () => {
  const editor = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/org/edit/index.wxml'), 'utf8')
  const detail = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/org/detail/index.wxml'), 'utf8')
  const cloud = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/api/index.js'), 'utf8')
  assert.match(editor, /职业类型/)
  assert.match(detail, /professionLabel/)
  assert.match(cloud, /async function ensureMemberHolidayTodos\(\)/)
  assert.match(cloud, /todo_member_holiday_/)
  assert.match(cloud, /await ensureMemberHolidayTodos\(\)/)
})
