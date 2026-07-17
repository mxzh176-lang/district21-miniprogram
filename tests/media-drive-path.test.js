const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOrgCloudPath } = require('../miniprogram/services/file-upload-service')

test('media drive paths are separated by service team and category', () => {
  const path = buildOrgCloudPath({
    filePath: '/tmp/activity.mp4',
    organizationId: 'org_team_yuanhang',
    eventName: '七月联谊会',
    eventDate: '2026-07-14',
    categoryName: '联谊照片',
    resourceType: 'media_album'
  })
  assert.match(path, /^中国狮子联会\/哈尔滨代表处\/二十一协作区\/远航服务队\/服务队云盘\/联谊照片\/2026\/七月联谊会\//)
  assert.match(path, /\.mp4$/)
})

test('unclassified media uses the unclassified folder', () => {
  const path = buildOrgCloudPath({
    filePath: '/tmp/photo.jpg',
    organizationId: 'org_team_linghang',
    eventName: '未分类相册',
    eventDate: '2026-07-14',
    categoryName: '',
    resourceType: 'media_album'
  })
  assert.match(path, /领航服务队\/服务队云盘\/未分类\/2026\/未分类相册\//)
})

test('media uploads receive unique object keys', () => {
  const input = {
    filePath: '/tmp/photo.jpg',
    organizationId: 'org_team_jingying',
    eventName: '服务活动',
    eventDate: '2026-07-14',
    categoryName: '服务记录',
    resourceType: 'media_album'
  }
  assert.notEqual(buildOrgCloudPath(input), buildOrgCloudPath(input))
})
