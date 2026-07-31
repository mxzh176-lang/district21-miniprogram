const test = require('node:test')
const assert = require('node:assert/strict')

const {
  selectArchiveImages
} = require('../cloudfunctions/api/archive-image-fallback')

const RECORDS = [
  { id: 'event_primary', organizationId: 'org_team_yuanhang' },
  { id: 'event_fallback', organizationId: 'org_team_yuanhang' }
]

test('event_image remains primary when both image sources exist', () => {
  const selected = selectArchiveImages(
    RECORDS,
    [{
      eventId: 'event_primary',
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileId: 'cloud://primary',
      sortOrder: 3
    }],
    [{
      resourceType: 'event_record',
      resourceId: 'event_primary',
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileType: 'image/jpeg',
      fileID: 'cloud://must-not-mix',
      sortOrder: 1
    }]
  )

  assert.deepEqual(selected.event_primary.map(item => item.fileId), ['cloud://primary'])
})

test('active image file records restore events without primary images', () => {
  const selected = selectArchiveImages(
    RECORDS,
    [],
    [
      {
        resourceType: 'event_record',
        resourceId: 'event_fallback',
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileType: 'image/png',
        fileID: 'cloud://second',
        sortOrder: 2
      },
      {
        resourceType: 'event_record',
        resourceId: 'event_fallback',
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileType: 'image/jpeg',
        fileID: 'cloud://first',
        sortOrder: 1
      }
    ]
  )

  assert.deepEqual(selected.event_fallback.map(item => item.fileId), [
    'cloud://first',
    'cloud://second'
  ])
  assert.equal(selected.event_fallback[0].eventId, 'event_fallback')
})

test('fallback excludes records outside the authorized image boundary', () => {
  const selected = selectArchiveImages(
    [{ id: 'event_fallback', organizationId: 'org_team_yuanhang' }],
    [],
    [
      { resourceType: 'event_record', resourceId: 'event_fallback', organizationId: 'org_team_jingying', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://wrong-org' },
      { resourceType: 'media_album', resourceId: 'event_fallback', organizationId: 'org_team_yuanhang', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://wrong-resource' },
      { resourceType: 'event_record', resourceId: 'event_fallback', organizationId: 'org_team_yuanhang', status: 'deleted', fileType: 'image/jpeg', fileID: 'cloud://deleted' },
      { resourceType: 'event_record', resourceId: 'event_fallback', organizationId: 'org_team_yuanhang', status: 'active', fileType: 'video/mp4', fileID: 'cloud://video' },
      { resourceType: 'event_record', resourceId: 'event_hidden', organizationId: 'org_team_yuanhang', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://hidden-event' }
    ]
  )

  assert.deepEqual(selected.event_fallback, [])
  assert.equal(selected.event_hidden, undefined)
})
