const test = require('node:test')
const assert = require('node:assert/strict')

const { archiveListRequest } = require('../miniprogram/services/event-service')

test('archive list request carries bounded event and image counts to the cloud function', () => {
  assert.deepEqual(archiveListRequest({
    organizationId: 'yuanhang',
    categoryId: 'secretary',
    eventCategory: '例会事件',
    eventMonth: '2026-08',
    status: 'archived',
    limit: 30,
    imageLimit: 5
  }), {
    organizationId: 'org_team_yuanhang',
    categoryId: 'secretary',
    eventType: '例会事件',
    eventMonth: '2026-08',
    status: 'archived',
    limit: 30,
    imageLimit: 5
  })
})

test('archive list request defaults to one cover image and clamps unsafe limits', () => {
  assert.deepEqual(archiveListRequest({ organizationId: 'yuanhang', limit: 999, imageLimit: 99 }), {
    organizationId: 'org_team_yuanhang',
    categoryId: undefined,
    eventType: undefined,
    eventMonth: undefined,
    status: 'published',
    limit: 100,
    imageLimit: 5
  })
  assert.equal(archiveListRequest({ organizationId: 'yuanhang' }).imageLimit, 1)
})
