const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

test('member list refreshes cloud members for other online users', () => {
  const page = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/org/index.js'), 'utf8')
  assert.match(page, /MEMBER_SYNC_INTERVAL = 5000/)
  assert.match(page, /api\.call\('listOrg', \{\}, \{ forceRefresh: true \}\)/)
  assert.match(page, /startMemberSync\(\)/)
  assert.match(page, /stopMemberSync\(\)/)
})

test('cloud member writes authorize the service team administrator before port restrictions', () => {
  const cloud = fs.readFileSync(path.join(ROOT, 'cloudfunctions/api/index.js'), 'utf8')
  const editor = cloud.slice(cloud.indexOf('async function requireDirectoryMemberEditor'), cloud.indexOf('const ORGANIZATION_ID_ALIASES'))
  assert.ok(editor.indexOf('canAdministerOrganization') < editor.indexOf('portPermissionState'))
  assert.match(cloud, /db\.collection\(COLLECTIONS\.user\)\.add\(\{ data \}\)/)
})
