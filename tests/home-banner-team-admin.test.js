const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const homeScript = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/home/index.js'), 'utf8')
const cloudScript = fs.readFileSync(path.join(ROOT, 'cloudfunctions/api/index.js'), 'utf8')

test('home banner edit button uses exact service-team administrator permission', () => {
  assert.match(homeScript, /permission\.canManageTeamHomeBanner\(session, bannerOrganizationId\(currentOrg\)\)/)
  assert.doesNotMatch(homeScript, /hasPortPermission\(session, 'home'/)
})

test('cloud reauthorizes both banner upload and banner replacement as exact team admin', () => {
  const calls = cloudScript.match(/canManageTeamHomeBanner\(user\.id, organizationId\)/g) || []
  assert.equal(calls.length, 2)
  assert.match(cloudScript, /item\.role === 'team_admin'/)
  assert.match(cloudScript, /canonicalOrganizationId\(item\.organizationId\) === organizationId/)
})
