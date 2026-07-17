const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('media drive exposes nested folders, internal shares and exports through api service', () => {
  const service = read('miniprogram/services/media-drive-service.js')
  ;['createMediaShare', 'getMediaShare', 'createMediaExport'].forEach(action => assert.match(service, new RegExp(`'${action}'`)))

  const cloud = read('cloudfunctions/api/index.js')
  assert.match(cloud, /parentId/)
  assert.match(cloud, /mediaDescendantAlbumIds/)
  assert.match(cloud, /async function createMediaShare/)
  assert.match(cloud, /async function createMediaExport/)
  assert.match(cloud, /mediaPermission\(openid, album\.organizationId, 'export'\)/)
})

test('media upload pages use a repeatable queue and the unified upload service', () => {
  const rootPage = read('miniprogram/pages/media-drive/index.js')
  const folderPage = read('miniprogram/pages/media-drive/album/index.js')
  assert.match(rootPage, /pendingFiles/)
  assert.match(rootPage, /mediaDriveService\.uploadMedia/)
  assert.match(folderPage, /chooseMoreFiles/)
  assert.match(folderPage, /mediaDriveService\.uploadMedia/)
  assert.doesNotMatch(rootPage, /wx\.cloud\.uploadFile/)
  assert.doesNotMatch(folderPage, /wx\.cloud\.uploadFile/)
})

test('portable schema contains folder, share and export metadata', () => {
  const schema = JSON.parse(read('cloudbase/schema.json'))
  const byName = new Map(schema.collections.map(item => [item.name, item]))
  assert.equal(byName.get('media_album').fields.parentId, 'string | empty')
  assert.ok(byName.has('media_share'))
  assert.ok(byName.has('media_export'))
  assert.match(byName.get('file_records').fields.resourceType, /media_export/)
})
