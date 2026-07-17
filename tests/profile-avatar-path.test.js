const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOrgCloudPath } = require('../miniprogram/services/file-upload-service')

test('member avatar is stored under the selected service team', () => {
  const path = buildOrgCloudPath({
    filePath: '/tmp/avatar.jpg',
    organizationId: 'org_team_yuanhang',
    leaderRole: '成员头像',
    eventName: '张明星成员头像',
    resourceType: 'user_avatar'
  })

  assert.equal(
    path,
    '中国狮子联会/哈尔滨代表处/二十一协作区/远航服务队/成员头像/张明星成员头像/张明星成员头像_1.jpg'
  )
})
