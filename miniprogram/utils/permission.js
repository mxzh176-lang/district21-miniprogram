const ROLE_ALIASES = {
  superadmin: 'super_admin',
  admin: 'team_admin',
  editor: 'editor',
  member: 'member'
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return ROLE_ALIASES[value] || value
}

const ADMIN_ROLES = ['super_admin', 'federation_admin', 'office_admin', 'region_admin', 'area_admin', 'team_admin']
const EDITOR_ROLES = ADMIN_ROLES.concat(['editor', 'role_manager'])
const MODULE_ALIASES = {
  archives: 'archive',
  contacts: 'member',
  tasks: 'todo',
  honors: 'honor'
}
const ORGANIZATION_ALIASES = {
  district: 'org_region_21_suihua',
  linghang: 'org_team_linghang',
  ailinghang: 'org_team_ailinghang',
  yuanhang: 'org_team_yuanhang',
  jingying: 'org_team_jingying'
}
const ORGANIZATION_ANCESTORS = {
  org_team_linghang: ['org_region_21_suihua'],
  org_team_ailinghang: ['org_region_21_suihua'],
  org_team_yuanhang: ['org_region_21_suihua'],
  org_team_jingying: ['org_region_21_suihua']
}

function roleNames(user) {
  if (!user) return []
  const names = []
  if (user.platformRole) names.push(normalizeRole(user.platformRole))
  if (user.role) names.push(normalizeRole(user.role))
  ;(user.roles || []).forEach(item => names.push(normalizeRole(typeof item === 'string' ? item : item.role)))
  return Array.from(new Set(names.filter(Boolean)))
}

function hasRole(user, roles) {
  const allowed = Array.isArray(roles) ? roles : [roles]
  return roleNames(user).some(role => allowed.includes(role))
}

function isSuperAdmin(user) {
  return hasRole(user, 'super_admin')
}

function canManage(user) {
  return hasRole(user, ADMIN_ROLES)
}

function canEditContent(user) {
  return hasRole(user, EDITOR_ROLES)
}

function canAccessOrganization(user, organization) {
  if (!user || !organization) return false
  if (isSuperAdmin(user)) return true
  const organizationId = typeof organization === 'string' ? organization : organization.cloudId || organization.id
  const equivalentIds = [organizationId, ORGANIZATION_ALIASES[organizationId]].filter(Boolean)
  const canonicalId = ORGANIZATION_ALIASES[organizationId] || organizationId
  const ancestorIds = typeof organization === 'object'
    ? organization.ancestorIds || ORGANIZATION_ANCESTORS[canonicalId] || []
    : ORGANIZATION_ANCESTORS[canonicalId] || []
  return (user.roles || []).some(item =>
    typeof item === 'object' &&
    (equivalentIds.includes(item.organizationId) || ancestorIds.includes(item.organizationId)) &&
    ADMIN_ROLES.includes(normalizeRole(item.role))
  )
}

function canAccessMenu(user, menu) {
  if (isSuperAdmin(user)) return true
  if (hasPortPermission(user, MODULE_ALIASES[menu] || menu, 'read')) return true
  if (hasGrant(user, menu, 'read')) return true
  if ((user.permissions || []).includes(menu)) return true
  if (canManage(user)) return true
  if (canEditContent(user)) return ['archives', 'photos', 'notices'].includes(menu)
  return false
}

function activePortPermissions(user, date = new Date()) {
  if (!user) return []
  const today = date.toISOString().slice(0, 10)
  return (user.portPermissions || []).filter(item =>
    item && item.status === 'active' &&
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today)
  )
}

function portScopeMatches(grant, user, context = {}) {
  const organizationId = context.cloudOrganizationId || context.organizationId || context.teamId || ''
  const positionId = context.positionId || context.categoryId || ''
  if (grant.dataScope === 'district') return true
  if (grant.dataScope === 'team') return grant.teamId === organizationId || String(grant.teamId || '').endsWith(`_${organizationId}`)
  if (grant.dataScope === 'position') {
    const matchesTeam = grant.teamId === organizationId || String(grant.teamId || '').endsWith(`_${organizationId}`)
    const matchesPosition = grant.positionId === positionId || String(grant.positionId || '').endsWith(`_${positionId}`)
    return matchesTeam && matchesPosition
  }
  if (grant.dataScope === 'self') {
    const userId = user.id || user._id
    return [context.creatorId, context.createdBy, context.userId].filter(Boolean).includes(userId)
  }
  return false
}

function hasPortPermission(user, module, action = 'read', context = {}) {
  module = MODULE_ALIASES[module] || module
  const hasScopeContext = Boolean(
    context.organizationId || context.cloudOrganizationId || context.teamId ||
    context.positionId || context.categoryId || context.creatorId || context.createdBy
  )
  return activePortPermissions(user).some(grant =>
    (((grant.permissions || {})[module]) || []).includes(action) &&
    (!hasScopeContext || grant.dataScope === 'self' && action === 'create' || portScopeMatches(grant, user, context))
  )
}

function activeGrants(user, date = new Date()) {
  if (!user) return []
  const today = date.toISOString().slice(0, 10)
  return (user.grants || []).filter(item =>
    item && item.status === 'active' &&
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today)
  )
}

function grantMatchesScope(grant, context = {}) {
  if (grant.scopeType === 'global') return true
  const organizationId = context.cloudOrganizationId || context.organizationId || context.teamId || ''
  const organizationIds = [organizationId]
    .concat(context.organizationAncestorIds || context.ancestorIds || [])
    .filter(Boolean)
  if (grant.scopeType === 'organization') return grant.organizationId === organizationId
  if (grant.scopeType === 'organization_tree') return organizationIds.includes(grant.organizationId)
  if (grant.organizationId !== organizationId) return false
  const positionIds = [context.positionId]
    .concat(context.parentPositionId || [])
    .concat(context.positionAncestorIds || [])
    .filter(Boolean)
  const matchesPosition = positionId =>
    grant.scopeId === positionId || String(grant.scopeId || '').endsWith(`_${positionId}`)
  if (grant.scopeType === 'position') return matchesPosition(context.positionId)
  if (grant.scopeType === 'position_tree') return positionIds.some(matchesPosition)
  return false
}

function hasGrant(user, module, action = 'read', context = {}) {
  if (isSuperAdmin(user)) return true
  const hasScopeContext = Boolean(
    context.organizationId || context.cloudOrganizationId || context.teamId || context.positionId
  )
  return activeGrants(user).some(grant =>
    (grant.module === 'all' || grant.module === module) &&
    (grant.actions || []).includes(action) &&
    (!hasScopeContext || grantMatchesScope(grant, context))
  )
}

function canPerform(user, module, action = 'read', context = {}) {
  if (isSuperAdmin(user)) return true
  if (activePortPermissions(user).length) return hasPortPermission(user, module, action, context)
  const organization = {
    id: context.organizationId || context.teamId,
    cloudId: context.cloudOrganizationId,
    ancestorIds: context.organizationAncestorIds || context.ancestorIds || []
  }
  if (canManage(user) && (!organization.id || canAccessOrganization(user, organization))) return true
  return hasGrant(user, module, action, context)
}

function canManageAssignments(user) {
  return hasRole(user, ['super_admin', 'region_admin', 'area_admin'])
}

function canEditServiceTeamPositions(user, organization = {}) {
  if (!user || !organization) return false
  const organizationId = typeof organization === 'string'
    ? ORGANIZATION_ALIASES[organization] || organization
    : organization.cloudId || ORGANIZATION_ALIASES[organization.id] || organization.id
  const isTeam = typeof organization === 'string'
    ? String(organizationId || '').includes('_team_')
    : organization.type === 'team' || String(organizationId || '').includes('_team_')
  if (!isTeam) return false
  if (isSuperAdmin(user)) return true
  const ancestorIds = typeof organization === 'object'
    ? organization.ancestorIds || ORGANIZATION_ANCESTORS[organizationId] || []
    : ORGANIZATION_ANCESTORS[organizationId] || []
  return (user.roles || []).some(item => {
    if (!item || typeof item !== 'object' || !isActiveAssignment(item)) return false
    const role = normalizeRole(item.role)
    if (role === 'team_admin') return item.organizationId === organizationId
    if (role === 'area_admin') return item.organizationId === organizationId || ancestorIds.includes(item.organizationId)
    return false
  })
}

function isActiveAssignment(assignment, date = new Date()) {
  if (!assignment || assignment.status === 'inactive') return false
  const today = date.toISOString().slice(0, 10)
  return (!assignment.startDate || assignment.startDate <= today) &&
    (!assignment.endDate || assignment.endDate >= today)
}

function isActiveRoleManager(user, organizationId, positionId) {
  if (!user || !organizationId || !positionId) return false
  const today = new Date().toISOString().slice(0, 10)
  const userId = user.id || user._id
  const canonicalOrganizationId = ORGANIZATION_ALIASES[organizationId] || organizationId
  return (user.roles || []).some(role => {
    if (!role || typeof role !== 'object' || normalizeRole(role.role) !== 'role_manager') return false
    const assignmentUserId = role.memberId || role.userId
    const assignmentOrganizationId = ORGANIZATION_ALIASES[role.organizationId] || role.organizationId
    const matchesPosition = role.positionId === positionId ||
      String(role.positionId || '').endsWith(`_${positionId}`)
    return role.status === 'active' &&
      assignmentUserId === userId &&
      assignmentOrganizationId === canonicalOrganizationId &&
      matchesPosition &&
      Boolean(role.startDate) && role.startDate <= today &&
      (!role.endDate || role.endDate >= today)
  })
}

function canMaintainPosition(user, context = {}, action = 'update') {
  if (!user) return false
  if (hasGrant(user, 'archives', action, context)) return true
  const organization = {
    id: context.organizationId,
    cloudId: context.cloudOrganizationId,
    ancestorIds: context.organizationAncestorIds || []
  }
  if (canManage(user) && (isSuperAdmin(user) || canAccessOrganization(user, organization))) return true
  const userId = user.id || user._id
  const nickname = user.name || user.nickname
  const organizationIds = [context.organizationId, context.cloudOrganizationId].filter(Boolean)
  if (context.person && nickname && context.person === nickname) return true
  return (user.roles || []).some(role =>
    typeof role === 'object' &&
    normalizeRole(role.role) === 'role_manager' &&
    role.positionId === context.positionId &&
    (!role.organizationId || organizationIds.includes(role.organizationId)) &&
    (!role.userId || role.userId === userId) &&
    isActiveAssignment(role)
  )
}

function canMaintainLedger(user, context = {}, action = 'update') {
  if (activePortPermissions(user).length) return hasPortPermission(user, 'finance', action, context)
  return canMaintainPosition(user, { ...context, positionId: context.positionId || 'treasurer' }, action)
}

function canMaintainHonors(user, context = {}, action = 'create') {
  if (activePortPermissions(user).length) return hasPortPermission(user, 'honor', action, context)
  return canPerform(user, 'honors', action, context) || canMaintainPosition(user, context, action)
}

function findArchivePosition(organization, categoryId) {
  for (const category of (organization && organization.categories) || []) {
    if (category.id === categoryId) return category
    const child = (category.children || []).find(item => item.id === categoryId)
    if (child) return { ...child, parentPositionId: category.positionId || category.id }
  }
  return null
}

function canMaintainArchive(user, organization, categoryId, action = 'update') {
  const position = findArchivePosition(organization, categoryId)
  if (!position) return false
  const context = {
    organizationId: organization.id,
    cloudOrganizationId: organization.cloudId,
    organizationAncestorIds: organization.ancestorIds || [],
    positionId: position.positionId || position.id,
    parentPositionId: position.parentPositionId,
    person: position.person
  }
  if (activePortPermissions(user).length) return hasPortPermission(user, 'history', action, context)
  return categoryId === 'treasurer'
    ? canMaintainLedger(user, context, action)
    : canMaintainPosition(user, context, action)
}

function canCompleteTodo(user, todo = {}) {
  if (!user) return false
  const userId = user.id || user._id
  if (activePortPermissions(user).length) {
    return hasPortPermission(user, 'todo', 'complete', {
      organizationId: todo.organizationId || todo.teamId,
      teamId: todo.teamId,
      positionId: todo.positionId || todo.categoryId,
      creatorId: todo.createdBy
    })
  }
  if (todo.createdBy && todo.createdBy === userId) return true
  if (hasGrant(user, 'tasks', 'update', {
    organizationId: todo.organizationId || todo.teamId,
    teamId: todo.teamId,
    positionId: todo.positionId || todo.categoryId
  })) return true
  if (canManage(user) && (isSuperAdmin(user) || canAccessOrganization(user, todo.organizationId || todo.teamId))) return true
  return canMaintainPosition(user, {
    organizationId: todo.organizationId || todo.teamId,
    positionId: todo.positionId || todo.categoryId,
    person: todo.owner
  })
}

function isAdministrativeRoleValue(role) {
  return ['superadmin', 'admin', 'editor'].includes(role)
}

function decorateAdminMember(item) {
  const permissions = item.permissions || []
  return {
    ...item,
    roleLabel: item.role === 'admin' ? '管理员' : '内容管理员',
    canTasks: permissions.includes('tasks'),
    canArchives: permissions.includes('archives'),
    canContacts: permissions.includes('contacts'),
    canPhotos: permissions.includes('photos'),
    canNotices: permissions.includes('notices')
  }
}

function defaultMenuPermissions(role, allOptions = []) {
  return role === 'admin' ? allOptions.slice() : ['archives', 'photos', 'notices']
}

function displayRole(user) {
  if (!user || user.status === 'readonly') return '只读访客'
  if (isSuperAdmin(user)) return '超级管理员'
  if (canManage(user)) return '组织管理员'
  if (hasRole(user, 'role_manager')) return '岗位负责人'
  return '内部成员'
}

module.exports = {
  roleNames,
  hasRole,
  isSuperAdmin,
  canManage,
  canEditContent,
  canAccessOrganization,
  canAccessMenu,
  activeGrants,
  activePortPermissions,
  hasPortPermission,
  hasGrant,
  canPerform,
  canManageAssignments,
  canEditServiceTeamPositions,
  isActiveAssignment,
  isActiveRoleManager,
  canMaintainPosition,
  canMaintainLedger,
  canMaintainHonors,
  findArchivePosition,
  canMaintainArchive,
  canCompleteTodo,
  isAdministrativeRoleValue,
  decorateAdminMember,
  defaultMenuPermissions,
  displayRole
}
