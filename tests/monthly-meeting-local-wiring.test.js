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

test('api.call returns the monthly meeting fallback when the cloud listTasks call fails', async () => {
  const storage = {}
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    showToast: () => {},
    cloud: {
      callFunction: async () => { throw new Error('network unavailable') }
    }
  }
  const apiPath = require.resolve('../miniprogram/utils/api')
  delete require.cache[apiPath]
  const api = require(apiPath)

  const result = await api.call('listTasks', { teamId: 'yuanhang' }, { forceRefresh: true })

  assert.ok(result.tasks.some(task => task.monthlyMeeting && task.organizationId === 'org_team_yuanhang'))
  delete require.cache[apiPath]
  delete global.wx
})
