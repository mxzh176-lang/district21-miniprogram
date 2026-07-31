const test = require('node:test')
const assert = require('node:assert/strict')

test('local listTasks result includes the Yuanhang monthly meeting fallback', async () => {
  const storage = {}
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    showToast: () => {}
  }
  const api = require('../miniprogram/utils/api')

  const result = await api.__test.localCall('listTasks', { teamId: 'yuanhang' })

  assert.ok(result.tasks.some(task => task.monthlyMeeting && task.organizationId === 'org_team_yuanhang'))
  delete global.wx
})
