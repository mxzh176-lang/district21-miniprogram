const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const homeScript = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/home/index.js'), 'utf8')
const homeTemplate = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/home/index.wxml'), 'utf8')
const cloudScript = fs.readFileSync(path.join(ROOT, 'cloudfunctions/api/index.js'), 'utf8')
const grantScript = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/admin/permission-grants/index.js'), 'utf8')

test('home banner edit button uses exact service-team administrator permission', () => {
  assert.match(homeScript, /permission\.canManageTeamHomeBanner\(session, bannerOrganizationId\(currentOrg\)\)/)
  assert.doesNotMatch(homeScript, /hasPortPermission\(session, 'home'/)
})

test('home banner editor can append multiple images without replacing existing slides', () => {
  assert.match(homeScript, /itemList: \['新增轮播图', '替换当前轮播图', '替换全部轮播图', '清空当前轮播图'\]/)
  assert.match(homeScript, /count: remainingCount/)
  assert.match(homeScript, /uploadedValues = uploaded\.map\(item => item\.fileID\)\.filter\(Boolean\)/)
  assert.match(homeScript, /existingBanners\.concat\(uploadedValues\)/)
  assert.match(homeScript, /\.slice\(0, 9\)/)
})

test('home banner editor pauses autoplay while selecting one image slide', () => {
  assert.match(homeTemplate, /autoplay="{{!bannerSelecting}}"/)
  assert.match(homeTemplate, /circular="{{!bannerSelecting}}"/)
  assert.match(homeTemplate, /bindchange="changeHeroSlide"/)
  assert.match(homeTemplate, /wx:if="{{bannerSelecting}}"/)
  assert.match(homeTemplate, /catchtap="confirmSelectedHomeBanner"/)
  assert.match(homeTemplate, /catchtap="exitBannerSelection"/)
  assert.match(homeScript, /enterBannerSelection\(\)/)
  assert.match(homeScript, /exitBannerSelection\(\)/)
  assert.match(homeScript, /confirmSelectedHomeBanner\(\)/)
  assert.match(homeScript, /changeHeroSlide\(event\)/)
  assert.match(homeScript, /count: 1/)
  assert.match(homeScript, /replaceIndex: selectedIndex/)
  assert.match(homeScript, /banners\[replaceIndex\] = replacement/)
})

test('home banner selection mode exits on lifecycle and scope changes', () => {
  const exitCalls = homeScript.match(/this\.exitBannerSelection\(\)/g) || []
  assert.ok(exitCalls.length >= 4)
  assert.match(homeScript, /onHide\(\) \{[\s\S]*?this\.exitBannerSelection\(\)/)
  assert.match(homeScript, /onUnload\(\) \{[\s\S]*?this\.exitBannerSelection\(\)/)
  assert.match(homeScript, /chooseOrgScope\(\) \{[\s\S]*?this\.exitBannerSelection\(\)/)
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

test('cloud limits district banner writes to active super administrators', () => {
  const permissionHandler = cloudScript.match(/async function canManageTeamHomeBanner[\s\S]*?\n}\n\nasync function canEditServiceTeamPositions/)
  assert.ok(permissionHandler)
  assert.match(permissionHandler[0], /if \(organizationId === 'org_region_21_suihua'\)/)
  assert.match(permissionHandler[0], /item\.status === 'active' && item\.role === 'super_admin'/)
})

test('home banner reads use the current platform user model', () => {
  const listHandler = cloudScript.match(/async function listHomeBanners[\s\S]*?\n}\n\nasync function saveHomeBanners/)
  assert.ok(listHandler)
  assert.match(listHandler[0], /await requirePlatformUser\(openid\)/)
  assert.doesNotMatch(listHandler[0], /requireApproved\(openid\)/)
})
