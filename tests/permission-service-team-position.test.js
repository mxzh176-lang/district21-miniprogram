const test = require('node:test')
const assert = require('node:assert/strict')
const permission = require('../miniprogram/utils/permission')

const yuanhang = {
  id: 'yuanhang',
  cloudId: 'org_team_yuanhang',
  type: 'team',
  ancestorIds: ['org_region_21_suihua']
}

test('super admin can edit service team positions', () => {
  assert.equal(permission.canEditServiceTeamPositions({ platformRole: 'super_admin' }, yuanhang), true)
})

test('area admin can edit a service team under the area', () => {
  const user = { roles: [{ role: 'area_admin', organizationId: 'org_region_21_suihua', status: 'active' }] }
  assert.equal(permission.canEditServiceTeamPositions(user, yuanhang), true)
  assert.equal(permission.canEditServiceTeamPositions(user, {
    id: 'district',
    cloudId: 'org_region_21_suihua',
    type: 'region'
  }), true)
})

test('team admin can only edit the assigned service team', () => {
  const user = { roles: [{ role: 'team_admin', organizationId: 'org_team_yuanhang', status: 'active' }] }
  assert.equal(permission.canEditServiceTeamPositions(user, yuanhang), true)
  assert.equal(permission.canEditServiceTeamPositions(user, {
    id: 'linghang',
    cloudId: 'org_team_linghang',
    type: 'team',
    ancestorIds: ['org_region_21_suihua']
  }), false)
})

test('members remain read only while admins can edit non-team directories', () => {
  assert.equal(permission.canEditServiceTeamPositions({ platformRole: 'member', roles: [] }, yuanhang), false)
  assert.equal(permission.canEditServiceTeamPositions({ platformRole: 'super_admin' }, {
    id: 'district',
    cloudId: 'org_region_21_suihua',
    type: 'region'
  }), true)
})
