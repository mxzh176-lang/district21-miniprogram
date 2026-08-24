const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const INDEX_PATH = path.resolve(__dirname, '../cloudfunctions/api/index.js')

function matches(row, where) {
  return Object.entries(where || {}).every(([key, expected]) => {
    if (expected && Array.isArray(expected.values)) return expected.values.includes(row[key])
    return row[key] === expected
  })
}

function createDatabase(rows, queryExecutions) {
  return {
    command: { in: values => ({ values }) },
    collection(name) {
      const state = { where: {}, skip: 0, limit: Infinity }
      const query = {
        where(value) { state.where = value || {}; return query },
        orderBy() { return query },
        skip(value) { state.skip = value || 0; return query },
        limit(value) { state.limit = value; return query },
        async get() {
          queryExecutions.push({ collection: name, where: { ...state.where } })
          if (rows.__errors && rows.__errors[name]) throw rows.__errors[name]
          const data = (rows[name] || []).filter(row => matches(row, state.where))
          return { data: data.slice(state.skip, state.skip + state.limit) }
        }
      }
      return query
    }
  }
}

async function runApiAction(rows, action, event = {}) {
  const requestedFiles = []
  const queryExecutions = []
  const db = createDatabase(rows, queryExecutions)
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: 'reader-openid' }),
    async getTempFileURL({ fileList }) {
      requestedFiles.push(...fileList)
      return { fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp.example/${fileID}` })) }
    }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud
    if (request === 'jszip') return class JSZip {}
    if (request === 'otplib') return { authenticator: {} }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[INDEX_PATH]
  try {
    const api = require(INDEX_PATH)
    const response = await api.main({ action, ...event })
    return { response, requestedFiles, queryExecutions }
  } finally {
    Module._load = originalLoad
    delete require.cache[INDEX_PATH]
  }
}

async function runListEventRecords(rows, event = {}) {
  return runApiAction(rows, 'listEventRecords', event)
}

function baseRows(permission) {
  return {
    user: [{ id: 'user_reader', openid: 'reader-openid', status: 'active', defaultOrganizationId: 'org_team_yuanhang' }],
    user_role: [],
    role_assignment: [],
    user_permissions: [permission].filter(Boolean),
    organization: [
      { id: 'org_region_21_suihua', status: 'active', ancestorIds: [] },
      { id: 'org_team_yuanhang', status: 'active', ancestorIds: ['org_region_21_suihua'] },
      { id: 'org_team_jingying', status: 'active', ancestorIds: ['org_region_21_suihua'] }
    ],
    event_record: [
      { id: 'event_yuanhang_captain', organizationId: 'org_team_yuanhang', categoryId: 'captain', status: 'published' },
      { id: 'event_yuanhang_secretary', organizationId: 'org_team_yuanhang', categoryId: 'secretary', status: 'published' },
      { id: 'event_jingying', organizationId: 'org_team_jingying', categoryId: 'captain', status: 'published' }
    ],
    event_image: [
      { eventId: 'event_yuanhang_captain', organizationId: 'org_team_yuanhang', status: 'active', fileId: 'cloud://yuanhang-captain' },
      { eventId: 'event_yuanhang_secretary', organizationId: 'org_team_yuanhang', status: 'active', fileId: 'cloud://yuanhang-secretary' },
      { eventId: 'event_jingying', organizationId: 'org_team_jingying', status: 'active', fileId: 'cloud://jingying' }
    ],
    file_records: []
  }
}

const permissionBase = {
  id: 'permission_reader',
  userId: 'user_reader',
  status: 'active',
  permissions: { history: ['read'] },
  startDate: '2000-01-01',
  endDate: '2099-12-31'
}

test('listEventRecords filters another organization before resolving image URLs', async () => {
  const rows = baseRows({ ...permissionBase, dataScope: 'team', teamId: 'org_team_yuanhang' })
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.equal(response.ok, true)
  assert.deepEqual(response.data.map(item => item.id), ['event_yuanhang_captain', 'event_yuanhang_secretary'])
  assert.deepEqual(requestedFiles.sort(), ['cloud://yuanhang-captain', 'cloud://yuanhang-secretary'])
})

test('listEventRecords applies position-scoped history permission', async () => {
  const rows = baseRows({
    ...permissionBase,
    dataScope: 'position',
    teamId: 'org_team_yuanhang',
    positionId: 'captain'
  })
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.deepEqual(response.data.map(item => item.id), ['event_yuanhang_captain'])
  assert.deepEqual(requestedFiles, ['cloud://yuanhang-captain'])
})

test('listEventRecords denies an expired term instead of treating it as unrestricted', async () => {
  const rows = baseRows({
    ...permissionBase,
    dataScope: 'team',
    teamId: 'org_team_yuanhang',
    endDate: '2000-01-02'
  })
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.deepEqual(response.data, [])
  assert.deepEqual(requestedFiles, [])
})

test('ordinary active users without grants are limited to their default organization', async () => {
  const rows = baseRows()
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.deepEqual(response.data.map(item => item.id), ['event_yuanhang_captain', 'event_yuanhang_secretary'])
  assert.deepEqual(requestedFiles.sort(), ['cloud://yuanhang-captain', 'cloud://yuanhang-secretary'])
})

test('permission-store failure fails closed before archive image URLs are created', async () => {
  const rows = baseRows()
  rows.__errors = { user_permissions: new Error('permission store unavailable') }
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.equal(response.ok, false)
  assert.deepEqual(requestedFiles, [])
})

test('active scoped administrators retain history read access for descendant organizations', async () => {
  const rows = baseRows({
    ...permissionBase,
    permissions: { todo: ['read'] },
    dataScope: 'team',
    teamId: 'org_team_yuanhang'
  })
  rows.user_role = [{
    userId: 'user_reader',
    status: 'active',
    role: 'region_admin',
    organizationId: 'org_region_21_suihua',
    startDate: '2000-01-01',
    endDate: '2099-12-31'
  }]
  const { response, requestedFiles } = await runListEventRecords(rows)

  assert.deepEqual(response.data.map(item => item.id), [
    'event_yuanhang_captain',
    'event_yuanhang_secretary',
    'event_jingying'
  ])
  assert.deepEqual(requestedFiles.sort(), [
    'cloud://jingying',
    'cloud://yuanhang-captain',
    'cloud://yuanhang-secretary'
  ])
})

test('getEventRecord restores same-organization file records after history authorization', async () => {
  const rows = baseRows()
  rows.event_image = []
  rows.file_records = [{
    resourceType: 'event_record',
    resourceId: 'event_yuanhang_captain',
    organizationId: 'org_team_yuanhang',
    status: 'active',
    fileType: 'image/jpeg',
    fileID: 'cloud://yuanhang-fallback'
  }]
  const { response, requestedFiles } = await runApiAction(rows, 'getEventRecord', {
    id: 'event_yuanhang_captain'
  })

  assert.equal(response.ok, true)
  assert.equal(response.data.images[0].imageUrl, 'https://temp.example/cloud://yuanhang-fallback')
  assert.deepEqual(requestedFiles, ['cloud://yuanhang-fallback'])
})

test('list and detail append a missing fallback image after a partial primary result', async () => {
  const rows = baseRows()
  rows.event_record[0].imageCount = 2
  rows.file_records = [
    {
      resourceType: 'event_record',
      resourceId: 'event_yuanhang_captain',
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileType: 'image/jpeg',
      fileID: 'cloud://yuanhang-captain',
      sortOrder: 1
    },
    {
      resourceType: 'event_record',
      resourceId: 'event_yuanhang_captain',
      organizationId: 'org_team_yuanhang',
      status: 'active',
      fileType: 'image/jpeg',
      fileID: 'cloud://yuanhang-missing',
      sortOrder: 2
    }
  ]

  const listResult = await runApiAction(rows, 'listEventRecords', { categoryId: 'captain' })
  const detailResult = await runApiAction(rows, 'getEventRecord', { id: 'event_yuanhang_captain' })

  assert.deepEqual(listResult.response.data[0].images.map(item => item.fileId), [
    'cloud://yuanhang-captain',
    'cloud://yuanhang-missing'
  ])
  assert.deepEqual(detailResult.response.data.images.map(item => item.fileId), [
    'cloud://yuanhang-captain',
    'cloud://yuanhang-missing'
  ])
  assert.deepEqual(listResult.requestedFiles, [
    'cloud://yuanhang-captain',
    'cloud://yuanhang-missing'
  ])
  assert.deepEqual(detailResult.requestedFiles, [
    'cloud://yuanhang-captain',
    'cloud://yuanhang-missing'
  ])
})

test('getEventRecord rejects an out-of-scope event before resolving images', async () => {
  const rows = baseRows()
  const { response, requestedFiles, queryExecutions } = await runApiAction(rows, 'getEventRecord', {
    id: 'event_jingying'
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'PERMISSION_DENIED')
  assert.deepEqual(requestedFiles, [])
  assert.equal(queryExecutions.filter(item => item.collection === 'event_image').length, 0)
  assert.equal(queryExecutions.filter(item => item.collection === 'file_records').length, 0)
})
