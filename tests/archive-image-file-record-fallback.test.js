const test = require('node:test')
const assert = require('node:assert/strict')

const {
  selectArchiveImages,
  loadArchiveImages
} = require('../cloudfunctions/api/archive-image-fallback')

const RECORDS = [
  { id: 'event_primary', organizationId: 'org_team_yuanhang' },
  { id: 'event_fallback', organizationId: 'org_team_yuanhang' }
]

test('event_image remains primary when both image sources exist', () => {
  const selected = selectArchiveImages(
    RECORDS.map(record => record.id === 'event_primary' ? { ...record, imageCount: 1 } : record),
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

test('partial primary images append only missing fallback rows up to imageCount', () => {
  const selected = selectArchiveImages(
    [{ id: 'event_partial', organizationId: 'org_team_yuanhang', imageCount: 2 }],
    [{
      eventId: 'event_partial',
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileId: 'cloud://primary',
      sortOrder: 5
    }],
    [
      {
        resourceType: 'event_record',
        resourceId: 'event_partial',
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileType: 'image/jpeg',
        fileID: 'cloud://primary',
        sortOrder: 1
      },
      {
        resourceType: 'event_record',
        resourceId: 'event_partial',
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileType: 'image/jpeg',
        fileID: 'cloud://missing',
        sortOrder: 2
      }
    ]
  )

  assert.deepEqual(selected.event_partial.map(item => item.fileId), [
    'cloud://primary',
    'cloud://missing'
  ])
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

test('loader recovers fallback images when event_image lookup fails', async () => {
  const requestedOrganizations = []
  const warnings = []
  const selected = await loadArchiveImages(RECORDS, {
    listEventImages: async () => { throw new Error('event_image unavailable') },
    listFileRecords: async organizationId => {
      requestedOrganizations.push(organizationId)
      return [{
        resourceType: 'event_record',
        resourceId: 'event_fallback',
        organizationId,
        status: 'active',
        fileType: 'image/jpeg',
        fileID: 'cloud://fallback'
      }]
    },
    attachImageUrls: async images => images.map(image => ({
      ...image,
      imageUrl: `https://temp.example/${image.fileId.slice('cloud://'.length)}`
    })),
    warn: (message, error) => warnings.push(`${message}: ${error.message}`)
  })

  assert.deepEqual(requestedOrganizations, ['org_team_yuanhang'])
  assert.equal(selected.event_fallback[0].imageUrl, 'https://temp.example/fallback')
  assert.deepEqual(warnings, ['event_image list unavailable: event_image unavailable'])
})

test('archive loader starts primary and fallback reads concurrently', async () => {
  const started = []
  let releasePrimary
  let releaseFallback
  const primaryGate = new Promise(resolve => { releasePrimary = resolve })
  const fallbackGate = new Promise(resolve => { releaseFallback = resolve })
  const pending = loadArchiveImages([
    { id: 'event_1', organizationId: 'org_team_yuanhang' }
  ], {
    listEventImages: async () => { started.push('primary'); await primaryGate; return [] },
    listFileRecords: async () => { started.push('fallback'); await fallbackGate; return [] },
    attachImageUrls: async rows => rows
  })

  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(started.sort(), ['fallback', 'primary'])
  releasePrimary()
  releaseFallback()
  await pending
})

test('loader keeps primary images when file_records lookup fails', async () => {
  const warnings = []
  const selected = await loadArchiveImages(
    [{ id: 'event_primary', organizationId: 'org_team_yuanhang' }],
    {
      listEventImages: async () => [{
        eventId: 'event_primary',
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileId: 'cloud://primary'
      }],
      listFileRecords: async () => { throw new Error('file_records unavailable') },
      attachImageUrls: async images => images.map(image => ({ ...image, imageUrl: 'https://temp.example/primary' })),
      warn: (message, error) => warnings.push(`${message}: ${error.message}`)
    }
  )

  assert.equal(selected.event_primary[0].imageUrl, 'https://temp.example/primary')
  assert.deepEqual(warnings, ['file_records list unavailable: file_records unavailable'])
})

test('archive list image budget resolves only the images needed by each card', async () => {
  const records = [
    { id: 'event_1', organizationId: 'org_team_yuanhang' },
    { id: 'event_2', organizationId: 'org_team_yuanhang' }
  ]
  const resolvedFileIds = []
  const selected = await loadArchiveImages(records, {
    listEventImages: async eventIds => eventIds.flatMap(eventId => [1, 2, 3].map(sortOrder => ({
      eventId,
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileId: `cloud://${eventId}/${sortOrder}`,
      sortOrder
    }))),
    listFileRecords: async () => [],
    maxImagesPerRecord: 1,
    attachImageUrls: async images => {
      resolvedFileIds.push(...images.map(image => image.fileId))
      return images.map(image => ({ ...image, imageUrl: `https://temp.example/${image.fileId}` }))
    }
  })

  assert.deepEqual(resolvedFileIds, [
    'cloud://event_1/1',
    'cloud://event_2/1'
  ])
  assert.equal(selected.event_1.length, 1)
  assert.equal(selected.event_2.length, 1)
})

test('loader requests every visible event id so images after legacy query limits remain visible', async () => {
  const records = Array.from({ length: 1001 }, (_, index) => ({
    id: `event_${index + 1}`,
    organizationId: 'org_team_yuanhang'
  }))
  const requestedPrimaryIds = []
  const requestedFallbackIds = []
  const selected = await loadArchiveImages(records, {
    listEventImages: async eventIds => {
      requestedPrimaryIds.push(eventIds.slice())
      return eventIds.map(eventId => ({
        eventId,
        organizationId: 'org_team_yuanhang',
        status: 'active',
        fileId: `cloud://primary/${eventId}`
      }))
    },
    listFileRecords: async (organizationId, eventIds) => {
      requestedFallbackIds.push({ organizationId, eventIds: eventIds.slice() })
      return []
    },
    attachImageUrls: async images => images
  })

  assert.equal(requestedPrimaryIds.flat().length, 1001)
  assert.equal(requestedPrimaryIds.flat().at(-1), 'event_1001')
  assert.equal(requestedFallbackIds.length, 1)
  assert.equal(requestedFallbackIds[0].organizationId, 'org_team_yuanhang')
  assert.equal(requestedFallbackIds[0].eventIds.length, 1001)
  assert.equal(requestedFallbackIds[0].eventIds.at(-1), 'event_1001')
  assert.equal(selected.event_1001[0].fileId, 'cloud://primary/event_1001')
})

test('archive query adapter paginates only visible event ids for primary and fallback images', async () => {
  const { createArchiveImageQueryAdapter } = require('../cloudfunctions/api/archive-image-query')
  const eventIds = Array.from({ length: 73 }, (_, index) => `event_${index + 1}`)
  const rows = {
    event_image: eventIds.map(eventId => ({ eventId, organizationId: 'org_team_yuanhang', status: 'active' })),
    file_records: eventIds.map(resourceId => ({ resourceId, organizationId: 'org_team_yuanhang', resourceType: 'event_record', status: 'active' }))
  }
  const queries = []
  const db = {
    command: { in: values => ({ values }) },
    collection(name) {
      return {
        where(where) {
          return {
            skip(skip) {
              return {
                limit(limit) {
                  return {
                    get: async () => {
                      queries.push({ name, where, skip, limit })
                      const filtered = rows[name].filter(row => Object.entries(where).every(([key, value]) => {
                        if (value && value.values) return value.values.includes(row[key])
                        return row[key] === value
                      }))
                      return { data: filtered.slice(skip, skip + limit) }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  const adapter = createArchiveImageQueryAdapter({
    db,
    collections: { eventImage: 'event_image', fileRecord: 'file_records' },
    idBatchSize: 17,
    pageSize: 10
  })

  const [primary, fallback] = await Promise.all([
    adapter.listEventImages(eventIds),
    adapter.listFileRecords('org_team_yuanhang', eventIds)
  ])

  assert.equal(primary.length, 73)
  assert.equal(fallback.length, 73)
  assert.ok(queries.some(query => query.skip > 0))
  queries.filter(query => query.name === 'event_image').forEach(query => {
    assert.deepEqual(Object.keys(query.where), ['eventId'])
    assert.ok(query.where.eventId.values.every(eventId => eventIds.includes(eventId)))
  })
  queries.filter(query => query.name === 'file_records').forEach(query => {
    assert.deepEqual(Object.keys(query.where), ['resourceId'])
    assert.ok(query.where.resourceId.values.every(eventId => eventIds.includes(eventId)))
  })
})
