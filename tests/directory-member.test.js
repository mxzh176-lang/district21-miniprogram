const test = require('node:test')
const assert = require('node:assert/strict')
const data = require('../miniprogram/data/mock-data')

test('Li Lingling is listed as Yuanhang secretary', () => {
  const member = data.members.find(item => item.name === '李玲玲' && item.teamId === 'yuanhang')
  assert.ok(member)
  assert.equal(member.position, '秘书')
})
