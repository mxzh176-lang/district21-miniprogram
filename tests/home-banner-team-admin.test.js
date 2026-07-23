const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const homeScript = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/home/index.js'), 'utf8')
const cloudScript = fs.readFileSync(path.join(ROOT, 'cloudfunctions/api/index.js'), 'utf8')
const grantScript = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/admin/permission-grants/index.js'), 'utf8')

test('home banner edit button uses exact service-team administrator permission', () => {
  assert.match(homeScript, /permission\.canManageTeamHomeBanner\(session, bannerOrganizationId\(currentOrg\)\)/)
  assert.doesNotMatch(homeScript, /hasPortPermission\(session, 'home'/)
})

test('permission center offers a service-team banner-only administrator preset', () => {
  assert.match(grantScript, /value: 'home', label: '首页轮播'/)
  assert.match(grantScript, /label: '服务队轮播管理员', module: 'home', scopeType: 'organization', actions: \['create', 'update', 'upload', 'delete'\]/)
})

test('cloud reauthorizes banner upload and replacement with team-scoped banner permission', () => {
  const calls = cloudScript.match(/canManageTeamHomeBanner\(user\.id, organizationId,/g) || []
  assert.equal(calls.length, 2)
  assert.match(cloudScript, /item\.role === 'team_admin'/)
  assert.match(cloudScript, /canonicalOrganizationId\(item\.organizationId\) === organizationId/)
  assert.match(cloudScript, /portPermissionAllowed\(portGrants, userId, 'home', action, \{ organizationId \}\)/)
})

test('home banner reads use the current platform user model', () => {
  const listHandler = cloudScript.match(/async function listHomeBanners[\s\S]*?\n}\n\nasync function saveHomeBanners/)
  assert.ok(listHandler)
  assert.match(listHandler[0], /await requirePlatformUser\(openid\)/)
  assert.doesNotMatch(listHandler[0], /requireApproved\(openid\)/)
})
