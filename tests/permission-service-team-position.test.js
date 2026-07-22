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

test('team admin can create members in the assigned team even with restricted port permissions', () => {
  const user = {
    roles: [{ role: 'team_admin', organizationId: 'org_team_yuanhang', status: 'active' }],
    portPermissions: [{
      status: 'active',
      dataScope: 'team',
      teamId: 'org_team_yuanhang',
      permissions: { archive: ['read'] }
    }]
  }
  assert.equal(permission.canPerform(user, 'contacts', 'create', {
    organizationId: 'org_team_yuanhang',
    cloudOrganizationId: 'org_team_yuanhang',
    teamId: 'yuanhang'
  }), true)
  assert.equal(permission.canPerform(user, 'contacts', 'create', {
    organizationId: 'org_team_linghang',
    cloudOrganizationId: 'org_team_linghang',
    teamId: 'linghang'
  }), false)
})

test('super admin and assigned team admin can manage team home banners', () => {
  assert.equal(permission.canManageTeamHomeBanner({ platformRole: 'super_admin' }, yuanhang), false)
  assert.equal(permission.canManageTeamHomeBanner({
    roles: [{ role: 'team_admin', organizationId: 'org_team_yuanhang', status: 'active' }]
  }, yuanhang), true)
  assert.equal(permission.canManageTeamHomeBanner({
    roles: [{ role: 'team_admin', organizationId: 'org_team_linghang', status: 'active' }]
  }, yuanhang), false)
  assert.equal(permission.canManageTeamHomeBanner({
    roles: [{ role: 'role_manager', organizationId: 'org_team_yuanhang', status: 'active' }]
  }, yuanhang), false)
  assert.equal(permission.canManageTeamHomeBanner({
    roles: [],
    portPermissions: [{
      status: 'active',
      dataScope: 'team',
      teamId: 'org_team_yuanhang',
      permissions: { home: ['create', 'update', 'delete', 'upload'] }
    }]
  }, yuanhang), true)
})

test('members remain read only while admins can edit non-team directories', () => {
  assert.equal(permission.canEditServiceTeamPositions({ platformRole: 'member', roles: [] }, yuanhang), false)
  assert.equal(permission.canEditServiceTeamPositions({ platformRole: 'super_admin' }, {
    id: 'district',
    cloudId: 'org_region_21_suihua',
    type: 'region'
  }), true)
})

test('yuanhang members can create but cannot manage todo items', () => {
  const member = {
    status: 'approved',
    platformRole: 'member',
    organizationId: 'org_team_yuanhang',
    roles: []
  }
  assert.equal(permission.canCreateTodo(member), true)
  assert.equal(permission.canOpenArchiveCreate(member), false)
  assert.equal(permission.canOpenCreateCenter(member), true)
  assert.equal(permission.canManageTodo(member), false)
  assert.equal(permission.canCompleteTodo(member), false)
})

test('yuanhang admins can create, edit and complete todo items', () => {
  const admin = {
    status: 'approved',
    roles: [{ role: 'team_admin', organizationId: 'org_team_yuanhang', status: 'active' }]
  }
  assert.equal(permission.canCreateTodo(admin), true)
  assert.equal(permission.canManageTodo(admin), true)
  assert.equal(permission.canCompleteTodo(admin), true)
})

test('members from another team cannot create yuanhang todo items', () => {
  const member = {
    status: 'approved',
    platformRole: 'member',
    organizationId: 'org_team_linghang',
    roles: []
  }
  assert.equal(permission.canCreateTodo(member), false)
})

test('a position grant exposes create entry only for the assigned archive position', () => {
  const secretaryAdmin = {
    status: 'approved',
    platformRole: 'member',
    roles: [],
    grants: [{
      module: 'archives',
      actions: ['read', 'create', 'update', 'upload', 'delete'],
      organizationId: 'org_team_yuanhang',
      scopeType: 'position',
      scopeId: 'position_org_team_yuanhang_secretary',
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2027-06-30'
    }]
  }
  const organization = {
    ...yuanhang,
    categories: [
      { id: 'secretary', positionId: 'position_org_team_yuanhang_secretary', name: '秘书' },
      { id: 'tamer', positionId: 'position_org_team_yuanhang_tamer', name: '纠察' }
    ]
  }

  assert.equal(permission.canOpenArchiveCreate(secretaryAdmin), true)
  assert.equal(permission.canMaintainArchive(secretaryAdmin, organization, 'secretary', 'create'), true)
  assert.equal(permission.canMaintainArchive(secretaryAdmin, organization, 'tamer', 'create'), false)
})

test('members without archive position permission do not see the create entry', () => {
  assert.equal(permission.canOpenArchiveCreate({
    status: 'approved',
    platformRole: 'member',
    roles: [],
    grants: []
  }), false)
})
