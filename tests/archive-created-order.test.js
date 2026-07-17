const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

test('archive pages prioritize creation time over event date and edit time', () => {
  const archiveHome = read('miniprogram/pages/archive/index.js')
  const archiveList = read('miniprogram/pages/archive/list/index.js')

  assert.match(archiveHome, /item\.createdAt \|\| item\.updatedAt \|\| item\.date/)
  assert.match(archiveList, /item\.createdAt \|\| item\.updatedAt \|\| item\.date/)
  assert.match(archiveList, /archiveCreatedTimestamp\(b\) - archiveCreatedTimestamp\(a\)/)
  assert.doesNotMatch(archiveList, /\(a\.order \|\| 0\) - \(b\.order \|\| 0\)/)
})

test('cloud and adapter preserve creation time before sorting records', () => {
  const cloud = read('cloudfunctions/api/index.js')
  const service = read('miniprogram/services/event-service.js')
  const api = read('miniprogram/utils/api.js')

  assert.match(cloud, /b\.createdAt \|\| b\.updatedAt \|\| b\.eventDate/)
  assert.match(service, /createdAt: record\.createdAt \|\| ''/)
  assert.match(api, /createdAt: item\.createdAt \|\| ''/)
})
