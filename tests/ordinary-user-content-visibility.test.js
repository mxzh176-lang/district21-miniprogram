const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

function functionBody(source, name, nextName) {
  return source.slice(
    source.indexOf(`async function ${name}`),
    source.indexOf(`async function ${nextName}`)
  )
}

test('completed ordinary profiles become active immediately and existing pending profiles self-heal', () => {
  const cloud = read('cloudfunctions/api/index.js')
  const session = functionBody(cloud, 'getPlatformSession', 'saveUserMemberCode')
  const saveProfile = functionBody(cloud, 'saveMyProfile', 'listProfileOrganizations')

  assert.match(session, /user\.status === 'pending' && hasCompleteAuthorizationProfile\(user\)/)
  assert.match(session, /data: \{ status: 'active'/)
  assert.match(saveProfile, /profileCompleted: true,\s+status: 'active'/)
  assert.match(saveProfile, /status: data\.status/)
})

test('ordinary read access is independent from administrator write access', () => {
  const cloud = read('cloudfunctions/api/index.js')
  const eventRead = functionBody(cloud, 'getEventRecord', 'archiveEventRecord')
  const mediaRead = functionBody(cloud, 'mediaPermission', 'mediaPermissionSummary')
  const todoRead = functionBody(cloud, 'todoViewer', 'requireTodoCreator')

  assert.match(eventRead, /requirePlatformUser\(openid\)/)
  assert.doesNotMatch(eventRead, /requireEventEditor|requirePlatformEditor/)
  assert.match(mediaRead, /if \(action === 'read'\) return/)
  assert.match(todoRead, /user && user\.status === 'active'/)
  assert.doesNotMatch(todoRead, /isTodoAdmin|TODO_ORGANIZATION_ID/)

  assert.match(cloud, /async function requireEventEditor/)
  assert.match(cloud, /async function requireTodoAdmin/)
  assert.match(cloud, /if \(await canAdministerOrganization\(user\.id, organizationId\)\)/)
})
