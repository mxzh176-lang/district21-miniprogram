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

function createDatabase(rows, writes) {
  return {
    command: { in: values => ({ values }) },
    collection(name) {
      const state = { where: {}, skip: 0, limit: Infinity }
      const filteredRows = () => (rows[name] || []).filter(row => matches(row, state.where))
      const query = {
        where(value) { state.where = value || {}; return query },
        orderBy() { return query },
        skip(value) { state.skip = value || 0; return query },
        limit(value) { state.limit = value; return query },
        async count() { return { total: filteredRows().length } },
        async get() {
          return { data: filteredRows().slice(state.skip, state.skip + state.limit) }
        },
        async add({ data }) {
          const stored = { ...data, _id: `${name}-doc-${(rows[name] || []).length + 1}` }
          if (!rows[name]) rows[name] = []
          rows[name].push(stored)
          writes.push({ operation: 'add', name, data: { ...data } })
          return { _id: stored._id }
        },
        doc(id) {
          return {
            async get() {
              return { data: (rows[name] || []).find(row => row._id === id || row.id === id) || null }
            },
            async update({ data }) {
              const stored = (rows[name] || []).find(row => row._id === id || row.id === id)
              if (stored) Object.assign(stored, data)
              writes.push({ operation: 'update', name, id, data: { ...data } })
              return { stats: { updated: stored ? 1 : 0 } }
            }
          }
        }
      }
      return query
    }
  }
}

async function runApiAction(rows, action, payload = {}) {
  const requestedFiles = []
  const writes = []
  const db = createDatabase(rows, writes)
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: 'reader-openid' }),
    async getTempFileURL({ fileList }) {
      requestedFiles.push(...fileList)
      return {
        fileList: fileList.map(fileID => ({
          fileID,
          tempFileURL: `https://temp.example/${fileID.split('/').pop()}`
        }))
      }
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
    return { response: await api.main({ action, ...payload }), requestedFiles, writes }
  } finally {
    Module._load = originalLoad
    delete require.cache[INDEX_PATH]
  }
}

function platformRows(overrides = {}) {
  return {
    user: [{
      _id: 'reader-doc',
      id: 'user-reader',
      openid: 'reader-openid',
      name: '读者',
      status: 'active',
      defaultOrganizationId: 'org_team_yuanhang'
    }],
    user_role: [],
    role_assignment: [],
    permission_grant: [],
    user_permissions: [],
    organization: [],
    ...overrides
  }
}

function legacyRows(overrides = {}) {
  return {
    members: [{ _id: 'legacy-reader', _openid: 'reader-openid', status: 'approved', role: 'member' }],
    ...overrides
  }
}

test('listHomeBanners keeps the file id and exposes the temporary URL in both display fields', async () => {
  const rows = platformRows({
    home_banners: [
      { id: 'banner-1', organizationId: 'org_team_yuanhang', status: 'active', fileId: 'cloud://env/home/banner.jpg', sortOrder: 1 },
      { id: 'banner-other', organizationId: 'org_team_jingying', status: 'active', fileId: 'cloud://env/home/unrelated.jpg', sortOrder: 1 }
    ]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'listHomeBanners', {
    organizationId: 'org_team_yuanhang'
  })

  assert.equal(response.ok, true)
  assert.deepEqual(response.data.banners, [{
    id: 'banner-1',
    fileId: 'cloud://env/home/banner.jpg',
    imageUrl: 'https://temp.example/banner.jpg',
    src: 'https://temp.example/banner.jpg',
    sortOrder: 1
  }])
  assert.deepEqual(requestedFiles, ['cloud://env/home/banner.jpg'])
})

test('listMediaAlbums resolves only covers in the authorized organization result', async () => {
  const rows = platformRows({
    user_role: [{ userId: 'user-reader', role: 'super_admin', status: 'active' }],
    media_album: [
      { id: 'album-1', title: '服务相册', organizationId: 'org_team_yuanhang', status: 'active', parentId: '', category: 'service', coverFileID: 'cloud://env/media/cover.jpg' },
      { id: 'album-other', title: '其他队相册', organizationId: 'org_team_jingying', status: 'active', parentId: '', category: 'service', coverFileID: 'cloud://env/media/unrelated.jpg' }
    ],
    file_records: []
  })

  const { response, requestedFiles } = await runApiAction(rows, 'listMediaAlbums', {
    organizationId: 'org_team_yuanhang'
  })

  assert.equal(response.ok, true)
  assert.equal(response.data.albums.length, 1)
  assert.equal(response.data.albums[0].id, 'album-1')
  assert.equal(response.data.albums[0].coverUrl, 'https://temp.example/cover.jpg')
  assert.deepEqual(requestedFiles, ['cloud://env/media/cover.jpg'])
})

test('getMediaAlbum preserves fileID and resolves only files in the authorized album page', async () => {
  const rows = platformRows({
    user_role: [{ userId: 'user-reader', role: 'super_admin', status: 'active' }],
    media_album: [
      { id: 'album-1', title: '服务相册', organizationId: 'org_team_yuanhang', status: 'active', parentId: '', category: 'service' },
      { id: 'album-other', title: '其他相册', organizationId: 'org_team_yuanhang', status: 'active', parentId: '', category: 'service' }
    ],
    file_records: [
      { id: 'file-1', resourceType: 'media_album', resourceId: 'album-1', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://env/media/photo.jpg' },
      { id: 'file-other', resourceType: 'media_album', resourceId: 'album-other', status: 'active', fileType: 'image/jpeg', fileID: 'cloud://env/media/unrelated.jpg' }
    ]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'getMediaAlbum', { id: 'album-1' })

  assert.equal(response.ok, true)
  assert.equal(response.data.files.length, 1)
  assert.equal(response.data.files[0].fileID, 'cloud://env/media/photo.jpg')
  assert.equal(response.data.files[0].url, 'https://temp.example/photo.jpg')
  assert.deepEqual(requestedFiles, ['cloud://env/media/photo.jpg'])
})

test('getMediaAlbum resolves every authorized child-folder cover beyond one platform batch', async () => {
  const childFolders = Array.from({ length: 51 }, (_, index) => ({
    id: `child-${index + 1}`,
    title: `子文件夹 ${index + 1}`,
    organizationId: 'org_team_yuanhang',
    status: 'active',
    parentId: 'album-1',
    category: 'service',
    coverFileID: `cloud://env/media/child-${index + 1}.jpg`
  }))
  const rows = platformRows({
    user_role: [{ userId: 'user-reader', role: 'super_admin', status: 'active' }],
    media_album: [
      { id: 'album-1', title: '服务相册', organizationId: 'org_team_yuanhang', status: 'active', parentId: '', category: 'service' },
      ...childFolders,
      { id: 'unrelated', title: '其他队相册', organizationId: 'org_team_jingying', status: 'active', parentId: 'album-1', category: 'service', coverFileID: 'cloud://env/media/unrelated.jpg' }
    ],
    file_records: []
  })

  const { response, requestedFiles } = await runApiAction(rows, 'getMediaAlbum', { id: 'album-1' })

  assert.equal(response.ok, true)
  assert.equal(response.data.childFolders.length, 51)
  assert.equal(response.data.childFolders[50].coverUrl, 'https://temp.example/child-51.jpg')
  assert.equal(requestedFiles.length, 51)
  assert.equal(requestedFiles.includes('cloud://env/media/child-51.jpg'), true)
  assert.equal(requestedFiles.includes('cloud://env/media/unrelated.jpg'), false)
})

test('getPlatformSession resolves the current avatar without mutating the stored user fixture', async () => {
  const storedUser = {
    _id: 'reader-doc',
    id: 'user-reader',
    openid: 'reader-openid',
    name: '读者',
    avatar: 'cloud://env/avatar/current.jpg',
    status: 'active',
    defaultOrganizationId: 'org_team_yuanhang'
  }
  const rows = platformRows({ user: [storedUser] })
  const before = { ...storedUser }

  const { response, requestedFiles } = await runApiAction(rows, 'getPlatformSession')

  assert.equal(response.ok, true)
  assert.equal(response.data.avatarFileId, 'cloud://env/avatar/current.jpg')
  assert.equal(response.data.avatarUrl, 'https://temp.example/current.jpg')
  assert.deepEqual(storedUser, before)
  assert.deepEqual(requestedFiles, ['cloud://env/avatar/current.jpg'])
})

test('listMembers resolves public member avatars without resolving filtered users', async () => {
  const rows = legacyRows({
    user: [
      { id: 'member-1', name: '张明星', status: 'active', defaultOrganizationId: 'org_team_yuanhang', avatar: 'cloud://env/avatar/member.jpg' },
      { id: 'hidden-1', name: '待认证用户-0001', status: 'pending', defaultOrganizationId: 'org_team_yuanhang', avatar: 'cloud://env/avatar/unrelated.jpg' }
    ],
    organization: [{ id: 'org_team_yuanhang', name: '远航服务队', shortName: '远航', type: 'team' }]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'listMembers')
  const member = response.data.find(item => item.id === 'member-1')

  assert.equal(response.ok, true)
  assert.ok(member)
  assert.equal(member.avatarFileId, 'cloud://env/avatar/member.jpg')
  assert.equal(member.avatarUrl, 'https://temp.example/member.jpg')
  assert.deepEqual(requestedFiles, ['cloud://env/avatar/member.jpg'])
})

test('getMember preserves the stable avatar id and resolves only the authorized member avatar', async () => {
  const rows = platformRows({
    user: [
      {
        _id: 'reader-doc',
        id: 'user-reader',
        openid: 'reader-openid',
        name: '读者',
        status: 'active',
        defaultOrganizationId: 'org_team_yuanhang'
      },
      {
        _id: 'member-doc',
        id: 'member-1',
        name: '张明星',
        status: 'active',
        defaultOrganizationId: 'org_team_yuanhang',
        avatar: 'cloud://env/avatar/member-detail.jpg'
      },
      {
        _id: 'unrelated-doc',
        id: 'member-unrelated',
        name: '其他成员',
        status: 'active',
        defaultOrganizationId: 'org_team_yuanhang',
        avatar: 'cloud://env/avatar/unrelated.jpg'
      }
    ],
    user_role: [{ userId: 'user-reader', role: 'super_admin', status: 'active' }],
    members: [{ _id: 'legacy-reader', _openid: 'reader-openid', status: 'approved', role: 'member' }],
    organization: [{ id: 'org_team_yuanhang', name: '远航服务队', shortName: '远航', type: 'team', status: 'active' }]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'getMember', { id: 'member-1' })

  assert.equal(response.ok, true)
  assert.equal(response.data.member.avatarFileId, 'cloud://env/avatar/member-detail.jpg')
  assert.equal(response.data.member.avatarUrl, 'https://temp.example/member-detail.jpg')
  assert.deepEqual(requestedFiles, ['cloud://env/avatar/member-detail.jpg'])
})

test('saveMember persists avatarFileId instead of a temporary avatarUrl', async () => {
  const rows = platformRows({
    user_role: [{ userId: 'user-reader', role: 'super_admin', status: 'active' }],
    organization: [{ id: 'org_team_yuanhang', name: '远航服务队', shortName: '远航', type: 'team', status: 'active' }]
  })

  const { response, writes } = await runApiAction(rows, 'saveMember', {
    member: {
      name: '稳定头像成员',
      organizationId: 'org_team_yuanhang',
      avatarFileId: 'cloud://env/avatar/stable.jpg',
      avatarUrl: 'https://temp.example/expiring.jpg'
    }
  })
  const userWrite = writes.find(item => item.operation === 'add' && item.name === 'user')

  assert.equal(response.ok, true)
  assert.ok(userWrite)
  assert.equal(userWrite.data.avatar, 'cloud://env/avatar/stable.jpg')
  assert.notEqual(userWrite.data.avatar, 'https://temp.example/expiring.jpg')
})

test('listActivities resolves only active activity covers', async () => {
  const rows = legacyRows({
    activities: [
      { _id: 'activity-1', title: '内部服务', date: '2026-07-20' },
      { _id: 'activity-deleted', title: '已归档', date: '2026-07-19', deletedAt: '2026-07-21' }
    ],
    photos: [
      { _id: 'photo-1', activityId: 'activity-1', fileID: 'cloud://env/activity/cover.jpg', isCover: true },
      { _id: 'photo-2', activityId: 'activity-1', fileID: 'cloud://env/activity/secondary.jpg' },
      { _id: 'photo-deleted-activity', activityId: 'activity-deleted', fileID: 'cloud://env/activity/unrelated.jpg', isCover: true }
    ]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'listActivities')

  assert.equal(response.ok, true)
  assert.deepEqual(response.data.map(item => item._id), ['activity-1'])
  assert.equal(response.data[0].coverUrl, 'https://temp.example/cover.jpg')
  assert.deepEqual(requestedFiles, ['cloud://env/activity/cover.jpg'])
})

test('getActivity preserves legacy photo fileID values and adds resolved display URLs', async () => {
  const rows = legacyRows({
    activities: [{ _id: 'activity-1', title: '内部服务', date: '2026-07-20' }],
    photos: [
      { _id: 'photo-2', activityId: 'activity-1', fileID: 'cloud://env/activity/second.jpg', order: 2 },
      { _id: 'photo-1', activityId: 'activity-1', fileID: 'cloud://env/activity/cover.jpg', order: 1, isCover: true },
      { _id: 'photo-other', activityId: 'activity-other', fileID: 'cloud://env/activity/unrelated.jpg', order: 1 }
    ]
  })

  const { response, requestedFiles } = await runApiAction(rows, 'getActivity', { id: 'activity-1' })

  assert.equal(response.ok, true)
  assert.equal(response.data.activity.coverUrl, 'https://temp.example/cover.jpg')
  assert.deepEqual(response.data.photos.map(item => ({ fileID: item.fileID, url: item.url })), [
    { fileID: 'cloud://env/activity/cover.jpg', url: 'https://temp.example/cover.jpg' },
    { fileID: 'cloud://env/activity/second.jpg', url: 'https://temp.example/second.jpg' }
  ])
  assert.deepEqual(requestedFiles, [
    'cloud://env/activity/cover.jpg',
    'cloud://env/activity/second.jpg'
  ])
})
