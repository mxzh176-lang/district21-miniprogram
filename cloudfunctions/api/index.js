const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const JSZip = require('jszip')
const { authenticator } = require('otplib')
const { loadArchiveImages } = require('./archive-image-fallback')
const { createArchiveImageQueryAdapter } = require('./archive-image-query')
const { ensureMonthlyMeetingTodo: reconcileMonthlyMeetingTodo } = require('./monthly-meeting-todo')
const { createMonthlyMeetingQueryAdapter } = require('./monthly-meeting-query')
const { runAutomaticTodoReconciliation } = require('./automatic-todo-runner')
const { resolveImageDisplayUrls } = require('./image-display-resolver')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const HONOR_LEADER_PENDING_STATUSES = ['pending_confirm', 'pending_leader_confirm']
const HONOR_VERIFY_PENDING_STATUSES = ['pending_honor_verify', 'need_recheck']
const HONOR_WALL_STATUSES = ['honor_verified', 'granted']
const HONOR_CHAIR_POSITION_CODE = 'honor-chair'

const COLLECTIONS = {
  organization: 'organization',
  user: 'user',
  userRole: 'user_role',
  permissionGrant: 'permission_grant',
  userPermissions: 'user_permissions',
  position: 'position',
  roleAssignment: 'role_assignment',
  eventRecord: 'event_record',
  eventImage: 'event_image',
  mediaAlbum: 'media_album',
  mediaShare: 'media_share',
  mediaExport: 'media_export',
  fileRecord: 'file_records',
  operationLog: 'operation_log',
  ledgerRecord: 'ledger_record',
  honorRecord: 'honor_record',
  homeBanner: 'home_banners',
  members: 'members',
  tasks: 'todo',
  org: 'org_units',
  activities: 'activities',
  photos: 'photos',
  notices: 'notices',
  history: 'history',
  auditLogs: 'audit_logs'
  ,adminAccount: 'admin_accounts'
  ,adminSession: 'admin_sessions'
}

const success = (data = null) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })
const cleanText = (value, maxLength = 200) => String(value || '').trim().slice(0, maxLength)
const activeItems = items => items.filter(item => !item.deletedAt)
const now = () => new Date()

const MEDIA_CATEGORIES = [
  { id: 'meeting', name: '会议照片' },
  { id: 'fellowship', name: '联谊照片' },
  { id: 'care', name: '关爱记录' },
  { id: 'service', name: '服务记录' },
  { id: 'uncategorized', name: '未分类' }
]
const MEDIA_CATEGORY_NAMES = MEDIA_CATEGORIES.reduce((result, item) => {
  result[item.id] = item.name
  return result
}, {})
const MEDIA_TEAM_NAMES = {
  org_team_linghang: '领航服务队',
  org_team_ailinghang: '爱领航服务队',
  org_team_yuanhang: '远航服务队',
  org_team_jingying: '精英服务队'
}
const MEDIA_EXPORT_MAX_FILES = 80
const MEDIA_EXPORT_MAX_BYTES = 100 * 1024 * 1024

const ADMIN_ACCESS_TTL = 30 * 60 * 1000
const ADMIN_REFRESH_TTL = 7 * 24 * 60 * 60 * 1000
const ADMIN_MAX_FAILURES = 5
const WEB_ADMIN_ACTIONS = new Set([
  'adminLogin', 'adminRefresh', 'adminLogout', 'adminChangePassword', 'adminGraph',
  'adminGrantPreflight', 'adminGrantCommit', 'adminGrantRevoke',
  'adminSaveUserPermissions', 'adminRevokeUserPermissions', 'adminDeleteUser'
])

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function passwordMatches(password, stored) {
  const [salt, expected] = String(stored || '').split(':')
  if (!salt || !expected) return false
  const actual = crypto.scryptSync(String(password), salt, 64)
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer)
}

function businessId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function cleanParticipants(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 4).map(group => {
    const members = Array.isArray(group.members)
      ? group.members.slice(0, 300).map(member => ({
        id: cleanText(member.id || member._id, 100),
        name: cleanText(member.name || member.nickname, 40)
      })).filter(member => member.id && member.name)
      : []
    return {
      teamId: cleanText(group.teamId, 100),
      teamName: cleanText(group.teamName, 80),
      members
    }
  }).filter(group => group.teamId && group.teamName && group.members.length)
}

async function attachImageUrls(images = []) {
  if (typeof cloud.getTempFileURL !== 'function') return images.map(item => ({ ...item }))
  return resolveImageDisplayUrls(images, {
    getTempFileURL: payload => cloud.getTempFileURL(payload),
    warn: (message, details) => console.warn(message, {
      batchIndex: details.batchIndex,
      batchCount: details.batchCount,
      batchSize: details.batchSize,
      resolvedCount: details.resolvedCount,
      unresolvedCount: details.unresolvedCount,
      error: details.error && details.error.message
    })
  })
}

function avatarFileIdOf(user = {}) {
  return [user.avatarFileId, user.avatar, user.avatarUrl]
    .map(value => cleanText(value, 1000))
    .find(value => value.startsWith('cloud://')) || ''
}

function monthLabel(month) {
  if (!month || !month.includes('-')) return month || ''
  const [year, value] = month.split('-')
  return `${year}年${Number(value)}月`
}

async function findMember(openid) {
  const result = await db.collection(COLLECTIONS.members).where({ _openid: openid }).limit(1).get()
  return result.data[0] || null
}

async function requireApproved(openid) {
  let member = await findMember(openid)
  if (!member) {
    const now = new Date()
    const data = {
      _openid: openid,
      nickname: '微信成员',
      avatarUrl: '',
      status: 'approved',
      role: 'member',
      createdAt: now,
      updatedAt: now
    }
    const result = await db.collection(COLLECTIONS.members).add({ data })
    member = { ...data, _id: result._id }
  } else if (member.status !== 'approved') {
    await db.collection(COLLECTIONS.members).doc(member._id).update({
      data: { status: 'approved', updatedAt: new Date() }
    })
    member.status = 'approved'
  }
  return member
}

async function requireEditor(openid) {
  const member = await requireApproved(openid)
  if (!['superadmin', 'editor', 'admin'].includes(member.role)) {
    throw Object.assign(new Error('仅内容管理员可执行此操作'), { code: 'EDITOR_REQUIRED' })
  }
  return member
}

async function requireAdmin(openid) {
  const member = await requireApproved(openid)
  if (!['superadmin', 'admin'].includes(member.role)) {
    throw Object.assign(new Error('仅超级管理员可执行此操作'), { code: 'ADMIN_REQUIRED' })
  }
  return member
}

async function requireSuperAdmin(openid) {
  const member = await requireApproved(openid)
  if (member.role !== 'superadmin') {
    throw Object.assign(new Error('仅超级管理员可调整管理员身份'), { code: 'SUPERADMIN_REQUIRED' })
  }
  return member
}

async function requireAssignmentAdmin(openid) {
  const user = await requirePlatformUser(openid)
  const roles = await platformRoles(user.id)
  const allowed = roles.some(item =>
    item.status === 'active' &&
    (item.role === 'super_admin' ||
      (['region_admin', 'area_admin'].includes(item.role) && item.organizationId === 'org_region_21_suihua'))
  )
  if (!allowed) {
    throw Object.assign(new Error('仅协作区超级管理员或协作区管理员可管理岗位授权'), { code: 'AREA_ADMIN_REQUIRED' })
  }
  return user
}

async function writeAudit(member, action, targetType, targetId, targetTitle = '') {
  await db.collection(COLLECTIONS.auditLogs).add({
    data: {
      action,
      targetType,
      targetId,
      targetTitle: cleanText(targetTitle, 100),
      operatorOpenid: member._openid,
      operatorName: member.nickname,
      createdAt: new Date()
    }
  })
}

function publicMember(member) {
  if (!member) return { status: 'new', role: 'member' }
  return {
    _id: member._id,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    status: member.status,
    role: member.role || 'member'
  }
}

async function getSession(openid) {
  return publicMember(await requireApproved(openid))
}

async function findPlatformUser(openid) {
  const result = await db.collection(COLLECTIONS.user).where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function requirePlatformUser(openid) {
  const user = await findPlatformUser(openid)
  if (!user || user.status !== 'active') {
    throw Object.assign(new Error('当前用户尚未完成新权限体系初始化'), { code: 'PLATFORM_USER_REQUIRED' })
  }
  return user
}

function hasCompleteAuthorizationProfile(user) {
  const name = cleanText(user && user.name, 30)
  return Boolean(
    user && user.status !== 'disabled' && name &&
    !name.startsWith('待认证用户-') && cleanText(user.defaultOrganizationId, 100)
  )
}

async function requireAuthorizationTarget(userId) {
  const result = await db.collection(COLLECTIONS.user).where({ id: userId }).limit(1).get()
  const user = result.data[0]
  if (!hasCompleteAuthorizationProfile(user)) {
    throw Object.assign(new Error('该用户尚未填写姓名和所属组织，暂不能授权'), { code: 'USER_PROFILE_INCOMPLETE' })
  }
  await requireActiveOrganization(user.defaultOrganizationId)
  return user
}

async function resolvePositionDirectoryMember(userId, memberName = '') {
  try {
    return await requireAuthorizationTarget(userId)
  } catch (error) {
    const organizations = await organizationNameMap()
    const directoryMember = findStaticDirectoryMember(userId, organizations)
    if (!directoryMember) throw error
    const name = cleanText(memberName, 40)
    if (name && directoryMember.name !== name) {
      throw Object.assign(new Error('所选成员与负责人姓名不一致'), { code: 'POSITION_MEMBER_MISMATCH' })
    }
    const linkedUser = await db.collection(COLLECTIONS.user)
      .where({
        defaultOrganizationId: directoryMember.defaultOrganizationId,
        name: directoryMember.name
      })
      .limit(1)
      .get()
    if (hasCompleteAuthorizationProfile(linkedUser.data[0])) return linkedUser.data[0]
    return {
      id: directoryMember.id,
      name: directoryMember.name,
      defaultOrganizationId: directoryMember.defaultOrganizationId,
      status: 'active',
      directoryOnly: true
    }
  }
}

async function requireActiveOrganization(organizationId) {
  const result = await db.collection(COLLECTIONS.organization)
    .where({ id: organizationId, status: 'active' })
    .limit(1)
    .get()
  const organization = result.data[0]
  if (!organization) {
    throw Object.assign(new Error('所选组织不存在或已停用'), { code: 'INVALID_AUTHORIZATION_ORGANIZATION' })
  }
  return organization
}

async function requirePlatformEditor(openid) {
  const user = await requirePlatformUser(openid)
  const result = await db.collection(COLLECTIONS.userRole)
    .where({ userId: user.id, status: 'active' })
    .limit(100)
    .get()
  const allowed = ['super_admin', 'federation_admin', 'office_admin', 'region_admin', 'team_admin']
  if (!result.data.some(item => allowed.includes(item.role))) {
    throw Object.assign(new Error('当前用户没有纪事管理权限'), { code: 'PLATFORM_EDITOR_REQUIRED' })
  }
  return user
}

async function canAdministerOrganization(userId, organizationId) {
  const roles = await platformRoles(userId)
  if (roles.some(item => item.status === 'active' && item.role === 'super_admin')) return true
  organizationId = canonicalOrganizationId(organizationId)
  const organizationResult = await db.collection(COLLECTIONS.organization)
    .where({ id: organizationId, status: 'active' })
    .limit(1)
    .get()
  const organization = organizationResult.data[0]
  if (!organization) return false
  const scopeIds = [organization.id].concat(organization.ancestorIds || [])
  if (roles.some(item =>
    item.status === 'active' &&
    ['federation_admin', 'office_admin', 'region_admin', 'area_admin', 'team_admin'].includes(item.role) &&
    scopeIds.includes(item.organizationId)
  )) return true
  if (organization.type !== 'team') return false
  const assignments = await activeRoleAssignments(userId)
  return assignments.some(item =>
    item.organizationId === organization.id &&
    ['captain', 'secretary'].some(code => positionIdMatches(item.positionId, code))
  )
}

async function canManageTeamHomeBanner(userId, organizationId, actions = ['create', 'update', 'delete', 'upload']) {
  organizationId = canonicalOrganizationId(organizationId)
  if (!HOME_BANNER_ALLOWED_ORGANIZATIONS.includes(organizationId)) return false
  const roles = await platformRoles(userId)
  if (organizationId === 'org_region_21_suihua') {
    return roles.some(item => item.status === 'active' && item.role === 'super_admin')
  }
  if (roles.some(item =>
    item.status === 'active' &&
    item.role === 'team_admin' &&
    canonicalOrganizationId(item.organizationId) === organizationId
  )) return true
  const portGrants = await enforcingPortPermissions(userId)
  return actions.every(action => portPermissionAllowed(portGrants, userId, 'home', action, { organizationId }))
}

async function canEditServiceTeamPositions(userId, organizationId) {
  return canAdministerOrganization(userId, organizationId)
}

async function requireEventEditor(openid, record = {}, action = 'update') {
  const user = await requirePlatformUser(openid)
  const permissionContext = {
    organizationId: record.organizationId || record.teamId,
    positionId: record.positionId || record.categoryId,
    creatorId: record.creatorId || record.createdBy
  }
  const portState = await portPermissionState(user.id, 'history', action, permissionContext)
  if (portState.allowed) return user
  if (portState.configured) {
    throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
  }
  if (await canAdministerOrganization(user.id, record.organizationId)) return user
  if (await hasPlatformGrant(user.id, 'archives', action, permissionContext)) return user
  const assignments = await activeRoleAssignments(user.id)
  const positionId = cleanText(record.positionId || record.categoryId, 140)
  const allowed = assignments.some(item =>
    item.organizationId === record.organizationId &&
    (item.positionId === positionId || item.positionId.endsWith(`_${positionId}`))
  )
  if (!allowed) {
    throw Object.assign(new Error('当前用户只能维护自己有效授权岗位的档案'), { code: 'POSITION_PERMISSION_REQUIRED' })
  }
  return user
}

async function platformRoles(userId) {
  const result = await db.collection(COLLECTIONS.userRole)
    .where({ userId, status: 'active' })
    .limit(100)
    .get()
  const today = new Date().toISOString().slice(0, 10)
  return result.data.filter(item =>
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today) &&
    (!item.expiresAt || item.expiresAt >= today)
  )
}

async function activeRoleAssignments(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const result = await db.collection(COLLECTIONS.roleAssignment)
      .where({ userId, status: 'active' })
      .limit(100)
      .get()
    return result.data.filter(item =>
      (!item.startDate || item.startDate <= today) &&
      (!item.endDate || item.endDate >= today)
    )
  } catch (error) {
    console.warn('role_assignment unavailable', error.message)
    return []
  }
}

async function checkActiveRoleManager(openid, organizationId, positionId) {
  const user = await findPlatformUser(openid)
  organizationId = canonicalOrganizationId(organizationId)
  positionId = cleanText(positionId, 140)
  if (!user || !organizationId || !positionId) return false
  const today = new Date().toISOString().slice(0, 10)
  const result = await db.collection(COLLECTIONS.roleAssignment)
    .where({ organizationId, status: 'active' })
    .limit(500)
    .get()
  return result.data.some(assignment =>
    (assignment.memberId === user.id || assignment.userId === user.id) &&
    positionIdMatches(assignment.positionId, positionId) &&
    Boolean(assignment.startDate) && assignment.startDate <= today &&
    (!assignment.endDate || assignment.endDate >= today)
  )
}

const TEAM_ROLE_SUPERVISORS = {
  secretary: ['captain', 'secretary'],
  treasurer: ['captain', 'secretary'],
  admin: ['captain', 'secretary'],
  tamer: ['captain', 'secretary'],
  'member-retention': ['captain', 'secretary', 'first-vp'],
  'leadership-training': ['captain', 'secretary', 'first-vp'],
  'external-exchange': ['captain', 'secretary', 'first-vp'],
  'service-plan': ['captain', 'secretary', 'second-vp'],
  'news-publicity': ['captain', 'secretary', 'second-vp'],
  'fundraising-plan': ['captain', 'secretary', 'second-vp'],
  'care-committee': ['captain', 'secretary', 'third-vp'],
  'fellowship-committee': ['captain', 'secretary', 'third-vp'],
  'annual-meeting': ['captain', 'secretary', 'third-vp']
}

async function canConfirmPersonnelRole(openid, organizationId, targetPositionId) {
  const user = await findPlatformUser(openid)
  organizationId = canonicalOrganizationId(organizationId)
  targetPositionId = cleanText(targetPositionId, 140)
  if (!user || !organizationId || !targetPositionId) return false
  const roles = await platformRoles(user.id)
  if (roles.some(item => item.role === 'super_admin')) return true
  const organization = await requireActiveOrganization(organizationId)
  const scopeIds = [organization.id].concat(organization.ancestorIds || [])
  if (roles.some(item =>
    (item.role === 'team_admin' && item.organizationId === organization.id) ||
    (item.role === 'area_admin' && scopeIds.includes(item.organizationId)))) return true
  const assignments = await activeRoleAssignments(user.id)
  if (assignments.some(item =>
    (organization.ancestorIds || []).includes(item.organizationId) &&
    ['area-coordinator', 'area-officer'].some(code => positionIdMatches(item.positionId, code)))) return true
  const supervisors = TEAM_ROLE_SUPERVISORS[targetPositionId] || ['captain', 'secretary']
  return assignments.some(item =>
    item.organizationId === organization.id &&
    supervisors.some(code => positionIdMatches(item.positionId, code))
  )
}

async function activePermissionGrants(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const result = await db.collection(COLLECTIONS.permissionGrant)
      .where({ userId, status: 'active' })
      .limit(500)
      .get()
    return result.data.filter(item =>
      (!item.startDate || item.startDate <= today) &&
      (!item.endDate || item.endDate >= today)
    )
  } catch (error) {
    console.warn('permission_grant unavailable', error.message)
    return []
  }
}

const PORT_PERMISSION_ACTIONS = {
  home: ['read', 'create', 'update', 'delete', 'upload'],
  history: ['read', 'create', 'update', 'delete', 'upload'],
  archive: ['read', 'update', 'upload', 'delete'],
  contacts: ['read', 'create', 'update', 'delete'],
  todo: ['read', 'create', 'update', 'complete', 'delete'],
  finance: ['read', 'create', 'update', 'delete'],
  member: ['read', 'create', 'update', 'delete'],
  honor: ['read', 'create', 'update', 'delete'],
  permission: ['read', 'create', 'update', 'delete']
}
const PORT_DATA_SCOPES = ['district', 'team', 'position', 'self']

async function loadConfiguredUserPermissions(userId) {
  const result = await db.collection(COLLECTIONS.userPermissions)
    .where({ userId, status: 'active' })
    .limit(100)
    .get()
  return result.data
}

async function configuredUserPermissions(userId) {
  try {
    return await loadConfiguredUserPermissions(userId)
  } catch (error) {
    console.warn('user_permissions unavailable', error.message)
    return []
  }
}

async function activeUserPermissions(userId) {
  const today = new Date().toISOString().slice(0, 10)
  const permissions = await configuredUserPermissions(userId)
  return permissions.filter(item =>
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today)
  )
}

function portScopeMatches(grant, userId, context = {}) {
  const organizationId = canonicalOrganizationId(context.organizationId || context.teamId)
  const positionId = cleanText(context.positionId || context.categoryId, 140)
  if (grant.dataScope === 'district') return true
  if (grant.dataScope === 'team') return canonicalOrganizationId(grant.teamId) === organizationId
  if (grant.dataScope === 'position') {
    return canonicalOrganizationId(grant.teamId) === organizationId &&
      positionIdMatches(grant.positionId, positionId)
  }
  if (grant.dataScope === 'self') {
    return [context.creatorId, context.createdBy, context.userId].filter(Boolean).includes(userId)
  }
  return false
}

async function portPermissionState(userId, module, action, context = {}) {
  const roles = await platformRoles(userId)
  if (roles.some(item => item.role === 'super_admin')) return { configured: true, allowed: true }
  const organizationId = canonicalOrganizationId(context.organizationId || context.teamId)
  if (organizationId) {
    const assignments = await activeRoleAssignments(userId)
    if (assignments.some(item =>
      item.organizationId === organizationId &&
      ['captain', 'secretary'].some(code => positionIdMatches(item.positionId, code)))) {
      return { configured: true, allowed: true }
    }
  }
  const grants = await activeUserPermissions(userId)
  const allowed = portPermissionAllowed(grants, userId, module, action, context)
  return { configured: grants.length > 0, allowed }
}

async function enforcingPortPermissions(userId) {
  const roles = await platformRoles(userId)
  if (roles.some(item => item.role === 'super_admin')) return []
  return activeUserPermissions(userId)
}

function portPermissionAllowed(grants, userId, module, action, context = {}) {
  return grants.some(grant =>
    ((grant.permissions || {})[module] || []).includes(action) &&
    (grant.dataScope === 'self' && action === 'create' || portScopeMatches(grant, userId, context))
  )
}

async function historyReadPermissionSnapshot(user) {
  const [roles, assignmentResult, configuredGrants, organizationResult] = await Promise.all([
    platformRoles(user.id),
    db.collection(COLLECTIONS.roleAssignment)
      .where({ userId: user.id, status: 'active' })
      .limit(100)
      .get(),
    loadConfiguredUserPermissions(user.id),
    db.collection(COLLECTIONS.organization)
      .where({ status: 'active' })
      .limit(500)
      .get()
  ])
  if (roles.some(item => item.role === 'super_admin')) {
    return { canRead: () => true }
  }
  const today = new Date().toISOString().slice(0, 10)
  const assignments = assignmentResult.data.filter(item =>
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today)
  )
  const activeGrants = configuredGrants.filter(item =>
    (!item.startDate || item.startDate <= today) &&
    (!item.endDate || item.endDate >= today)
  )
  const historyPermissionConfigured = configuredGrants.some(item =>
    ((item.permissions || {}).history || []).length > 0
  )
  const organizations = new Map(organizationResult.data.map(item => [canonicalOrganizationId(item.id), item]))
  const scopedAdminRoles = roles.filter(item =>
    ['federation_admin', 'office_admin', 'region_admin', 'area_admin', 'team_admin'].includes(item.role)
  )
  const defaultOrganizationId = canonicalOrganizationId(user.defaultOrganizationId)
  return {
    canRead(context = {}) {
      const organizationId = canonicalOrganizationId(context.organizationId || context.teamId)
      const organization = organizations.get(organizationId)
      const scopeIds = organization ? [organizationId].concat(organization.ancestorIds || []).map(canonicalOrganizationId) : []
      const isScopedAdmin = scopedAdminRoles.some(item =>
        scopeIds.includes(canonicalOrganizationId(item.organizationId))
      )
      if (isScopedAdmin) return true
      const isCurrentTeamOfficer = assignments.some(item =>
        canonicalOrganizationId(item.organizationId) === organizationId &&
        ['captain', 'secretary'].some(code => positionIdMatches(item.positionId, code))
      )
      if (isCurrentTeamOfficer) return true
      if (!historyPermissionConfigured && organization && organizationId === defaultOrganizationId) return true
      return portPermissionAllowed(activeGrants, user.id, 'history', 'read', context)
    }
  }
}

async function requireLegacyPortEditor(openid, module, action, context = {}) {
  const platformUser = await findPlatformUser(openid)
  if (platformUser && platformUser.status === 'active') {
    const scopedContext = {
      ...context,
      organizationId: context.organizationId || context.teamId || platformUser.defaultOrganizationId
    }
    const portState = await portPermissionState(platformUser.id, module, action, scopedContext)
    if (portState.allowed) return requireApproved(openid)
    if (portState.configured) {
      throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
    }
  }
  return requireEditor(openid)
}

async function requireDirectoryMemberEditor(openid, action, organizationId) {
  const platformUser = await findPlatformUser(openid)
  organizationId = canonicalOrganizationId(organizationId)
  if (platformUser && platformUser.status === 'active') {
    const context = { organizationId }
    if (await canAdministerOrganization(platformUser.id, organizationId)) return platformUser
    const portState = await portPermissionState(platformUser.id, 'contacts', action, context)
    if (portState.allowed) return platformUser
    if (portState.configured) {
      throw Object.assign(new Error('无权限维护该服务队成员'), { code: 'PERMISSION_DENIED' })
    }
    if (await hasPlatformGrant(platformUser.id, 'contacts', action, context)) return platformUser
    throw Object.assign(new Error('无权限维护该服务队成员'), { code: 'PERMISSION_DENIED' })
  }
  return requireEditor(openid)
}

const ORGANIZATION_ID_ALIASES = {
  district: 'org_region_21_suihua',
  linghang: 'org_team_linghang',
  ailinghang: 'org_team_ailinghang',
  yuanhang: 'org_team_yuanhang',
  jingying: 'org_team_jingying'
}

function canonicalOrganizationId(value) {
  const id = cleanText(value, 100)
  return ORGANIZATION_ID_ALIASES[id] || id
}

function positionIdMatches(grantPositionId, positionId) {
  if (!grantPositionId || !positionId) return false
  return grantPositionId === positionId || grantPositionId.endsWith(`_${positionId}`)
}

function positionCodeFromId(positionId) {
  const value = cleanText(positionId, 160)
  const match = TEAM_POSITIONS.find(([code]) => value === code || value.endsWith(`_${code}`) || value.endsWith(`:${code}`))
  return match ? match[0] : value
}

function honorLabel(level) {
  return HONOR_LEVEL_LABELS[level] || ''
}

function honorStatusLabel(status) {
  return {
    pending_confirm: '待直属上级确认',
    pending_leader_confirm: '待直属上级确认',
    pending_honor_verify: '待荣誉主席核准',
    honor_verified: '已核准入榜',
    need_recheck: '需复核',
    granted: '已核准入榜',
    not_granted: '暂不授予',
    none: ''
  }[status] || ''
}

function normalizeHonorRequestedLevel(level) {
  const value = cleanText(level, 20)
  return HONOR_LEVELS.includes(value) ? value : 'none'
}

function normalizeHonorGrantLevel(level) {
  const value = cleanText(level, 20)
  return HONOR_GRANT_LEVELS.includes(value) ? value : 'good'
}

function activeOnDate(item, dateText) {
  return (!item.startDate || item.startDate <= dateText) && (!item.endDate || item.endDate >= dateText)
}

async function getActiveAssignmentByPosition(positionId) {
  const today = new Date().toISOString().slice(0, 10)
  const result = await db.collection(COLLECTIONS.roleAssignment)
    .where({ positionId, status: 'active' })
    .limit(50)
    .get()
  return result.data.find(item => activeOnDate(item, today)) || null
}

async function resolveArchivePosition(organizationId, positionId) {
  const cleanOrganizationId = canonicalOrganizationId(organizationId)
  const rawPositionId = cleanText(positionId, 160)
  const code = positionCodeFromId(rawPositionId)
  const candidates = Array.from(new Set([
    rawPositionId,
    code,
    cleanOrganizationId && code ? `position_${cleanOrganizationId}_${code}` : ''
  ].filter(Boolean)))
  for (const id of candidates) {
    const byId = await db.collection(COLLECTIONS.position).where({ id, status: 'active' }).limit(1).get()
    if (byId.data[0]) return byId.data[0]
  }
  if (cleanOrganizationId && code) {
    const byCode = await db.collection(COLLECTIONS.position)
      .where({ organizationId: cleanOrganizationId, code, status: 'active' })
      .limit(1)
      .get()
    if (byCode.data[0]) return byCode.data[0]
  }
  return null
}

async function resolveCaptainPosition(organizationId) {
  return resolveArchivePosition(organizationId, 'captain')
}

async function resolveHonorConfirmPosition(position) {
  const code = cleanText(position && position.code, 80) || positionCodeFromId(position && position.id)
  let confirmPositionId = ''
  if (CAPTAIN_CONFIRM_POSITION_CODES.includes(code)) {
    const captain = await resolveCaptainPosition(position.organizationId)
    confirmPositionId = captain ? captain.id : `position_${position.organizationId}_captain`
  } else {
    confirmPositionId = cleanText(position.parentPositionId, 160)
    const parentAssignment = confirmPositionId ? await getActiveAssignmentByPosition(confirmPositionId) : null
    if (!parentAssignment) {
      const captain = await resolveCaptainPosition(position.organizationId)
      confirmPositionId = captain ? captain.id : `position_${position.organizationId}_captain`
    }
  }
  const confirmAssignment = confirmPositionId ? await getActiveAssignmentByPosition(confirmPositionId) : null
  return {
    confirmPositionId,
    confirmUnavailableReason: confirmAssignment ? '' : 'captain_unbound'
  }
}

async function buildHonorFields(member, record, baseData) {
  const requestedLevel = normalizeHonorRequestedLevel(record.honorRequestedLevel)
  if (requestedLevel === 'none') {
    return {
      eventStatus: 'archived',
      honorRequestedLevel: 'none',
      honorConfirmedLevel: null,
      honorStatus: 'none',
      confirmPositionId: '',
      confirmUnavailableReason: '',
      honorRecipientUserId: '',
      honorRecipientName: '',
      honorRecipientPositionId: '',
      termStartDate: '',
      termEndDate: '',
      confirmedBy: '',
      confirmedByName: '',
      confirmedAt: null
    }
  }
  const position = await resolveArchivePosition(baseData.organizationId, baseData.positionId || baseData.categoryId)
  const positionCode = position ? position.code : positionCodeFromId(baseData.positionId || baseData.categoryId)
  if (!position || !HONOR_REQUEST_POSITION_CODES.includes(positionCode)) {
    throw Object.assign(new Error('当前岗位不支持荣誉申报'), { code: 'HONOR_POSITION_NOT_ALLOWED' })
  }
  const assignments = await activeRoleAssignments(member.id)
  const assignment = assignments.find(item =>
    item.organizationId === baseData.organizationId &&
    (item.positionId === position.id || positionIdMatches(item.positionId, position.id) || positionIdMatches(item.positionId, positionCode))
  )
  if (!assignment) {
    throw Object.assign(new Error('仅当前有效岗位负责人可申报本岗位荣誉事件'), { code: 'HONOR_POSITION_OWNER_REQUIRED' })
  }
  const confirmation = await resolveHonorConfirmPosition(position)
  return {
    eventStatus: 'pending_leader_confirm',
    honorRequestedLevel: requestedLevel,
    honorConfirmedLevel: null,
    honorStatus: 'pending_leader_confirm',
    confirmPositionId: confirmation.confirmPositionId,
    confirmUnavailableReason: confirmation.confirmUnavailableReason,
    honorRecipientUserId: member.id,
    honorRecipientName: cleanText(member.name, 40),
    honorRecipientPositionId: position.id,
    termStartDate: cleanText(assignment.startDate, 10),
    termEndDate: cleanText(assignment.endDate, 10),
    confirmedBy: '',
    confirmedByName: '',
    confirmedAt: null
  }
}

async function requireHonorConfirmer(openid, record, requirePending = true) {
  const user = await requirePlatformUser(openid)
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('事件不存在或已归档'), { code: 'NOT_FOUND' })
  }
  if (requirePending && !HONOR_LEADER_PENDING_STATUSES.includes(record.honorStatus)) {
    throw Object.assign(new Error('该事件当前不是待直属确认状态'), { code: 'HONOR_NOT_PENDING' })
  }
  if (record.honorRecipientUserId && record.honorRecipientUserId === user.id) {
    throw Object.assign(new Error('申报人本人不能确认自己的待直属确认荣誉事件'), { code: 'HONOR_SELF_CONFIRM_FORBIDDEN' })
  }
  const assignments = await activeRoleAssignments(user.id)
  const confirmPositionId = cleanText(record.confirmPositionId, 160)
  const allowed = assignments.some(item => item.positionId === confirmPositionId || positionIdMatches(item.positionId, confirmPositionId))
  if (!allowed) {
    throw Object.assign(new Error('仅当前直属上级岗位负责人可确认'), { code: 'HONOR_CONFIRM_POSITION_REQUIRED' })
  }
  return user
}

async function requireHonorVerifier(openid, record, requirePending = true) {
  const user = await requirePlatformUser(openid)
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('事件不存在或已归档'), { code: 'NOT_FOUND' })
  }
  if (requirePending && !HONOR_VERIFY_PENDING_STATUSES.includes(record.honorStatus)) {
    throw Object.assign(new Error('该事件当前不是待荣誉核准状态'), { code: 'HONOR_NOT_PENDING_VERIFY' })
  }
  const roles = await platformRoles(user.id)
  if (roles.some(item => item.role === 'super_admin')) return user
  const assignments = await activeRoleAssignments(user.id)
  const allowed = assignments.some(item =>
    item.organizationId === record.organizationId &&
    positionIdMatches(item.positionId, HONOR_CHAIR_POSITION_CODE)
  )
  if (!allowed) {
    throw Object.assign(new Error('仅当前荣誉主席可核准入榜'), { code: 'HONOR_VERIFY_POSITION_REQUIRED' })
  }
  return user
}

async function hasPlatformGrant(userId, module, action, context = {}) {
  const grants = await activePermissionGrants(userId)
  const organizationId = canonicalOrganizationId(context.organizationId || context.teamId)
  let organization = null
  if (organizationId) {
    const result = await db.collection(COLLECTIONS.organization)
      .where({ id: organizationId, status: 'active' })
      .limit(1)
      .get()
    organization = result.data[0] || null
  }
  const organizationScopeIds = [organizationId].concat((organization && organization.ancestorIds) || []).filter(Boolean)
  let positionId = cleanText(context.positionId, 140)
  let parentPositionId = cleanText(context.parentPositionId, 140)
  if (positionId && organizationId && !positionId.startsWith('position_')) {
    const fullPositionId = `position_${organizationId}_${positionId}`
    const result = await db.collection(COLLECTIONS.position).where({ id: fullPositionId }).limit(1).get()
    if (result.data[0]) {
      positionId = result.data[0].id
      parentPositionId = result.data[0].parentPositionId || parentPositionId
    }
  }
  return grants.some(grant => {
    if (!['all', module].includes(grant.module) || !(grant.actions || []).includes(action)) return false
    if (grant.scopeType === 'global') return true
    if (grant.scopeType === 'organization') return grant.organizationId === organizationId
    if (grant.scopeType === 'organization_tree') return organizationScopeIds.includes(grant.organizationId)
    if (grant.organizationId !== organizationId) return false
    if (grant.scopeType === 'position') return positionIdMatches(grant.scopeId, positionId)
    if (grant.scopeType === 'position_tree') {
      return positionIdMatches(grant.scopeId, positionId) || positionIdMatches(grant.scopeId, parentPositionId)
    }
    return false
  })
}

async function getPlatformSession(openid) {
  let user = await findPlatformUser(openid)
  if (!user) {
    const timestamp = now()
    const data = {
      id: businessId('user'),
      openid,
      unionid: '',
      name: `待认证用户-${openid.slice(-4)}`,
      avatar: '',
      phone: '',
      status: 'pending',
      defaultOrganizationId: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp
    }
    const result = await db.collection(COLLECTIONS.user).add({ data })
    user = { ...data, _id: result._id }
  }
  if (user.status === 'disabled') {
    throw Object.assign(new Error('当前账号已停用'), { code: 'USER_DISABLED' })
  }
  if (user.status === 'pending' && hasCompleteAuthorizationProfile(user)) {
    const timestamp = now()
    await db.collection(COLLECTIONS.user).doc(user._id).update({
      data: { status: 'active', updatedAt: timestamp, lastLoginAt: timestamp }
    })
    user = { ...user, status: 'active', updatedAt: timestamp, lastLoginAt: timestamp }
  }
  const [baseRoles, assignments, grants, portPermissions] = await Promise.all([
    platformRoles(user.id),
    activeRoleAssignments(user.id),
    activePermissionGrants(user.id),
    activeUserPermissions(user.id)
  ])
  const roles = baseRoles.concat(assignments.map(item => ({
    id: item.id,
    role: 'role_manager',
    organizationId: item.organizationId,
    positionId: item.positionId,
    userId: item.userId,
    startDate: item.startDate,
    endDate: item.endDate,
    status: item.status
  })))
  const roleNames = roles.map(item => item.role)
  const primaryRole = roleNames.includes('super_admin')
    ? 'super_admin'
    : roleNames[0] || 'member'
  const legacyRole = primaryRole === 'super_admin'
    ? 'superadmin'
    : primaryRole === 'member' ? 'member' : 'admin'
  const avatarFileId = avatarFileIdOf(user)
  const avatarRows = avatarFileId
    ? await attachImageUrls([{ fileId: avatarFileId }])
    : []
  const avatarUrl = avatarRows[0]
    ? avatarRows[0].imageUrl
    : cleanText(user.avatarUrl || user.avatar, 1000)
  return {
    _id: user.id,
    id: user.id,
    nickname: user.name,
    avatarFileId,
    avatarUrl,
    status: user.status === 'active' ? 'approved' : 'pending',
    role: legacyRole,
    platformRole: primaryRole,
    roles,
    grants,
    portPermissions,
    organizationId: user.defaultOrganizationId || '',
    profileCompleted: Boolean(user.profileCompleted || (user.name && !user.name.startsWith('待认证用户-'))),
    memberCode: user.memberCode || '',
    accountSuffix: String(user.id || '').slice(-6)
  }
}

async function saveUserMemberCode(openid, event = {}) {
  const operator = await requireSuperAdmin(openid)
  const userId = cleanText(event.userId, 100)
  const memberCode = cleanText(event.memberCode, 30).toUpperCase()
  if (!userId || !memberCode || !/^[A-Z0-9_-]{2,30}$/.test(memberCode)) {
    throw Object.assign(new Error('成员编号仅支持字母、数字、横线和下划线'), { code: 'INVALID_MEMBER_CODE' })
  }
  const duplicate = await db.collection(COLLECTIONS.user).where({ memberCode }).limit(1).get()
  if (duplicate.data[0] && duplicate.data[0].id !== userId) {
    throw Object.assign(new Error('该成员编号已经被使用'), { code: 'MEMBER_CODE_EXISTS' })
  }
  await db.collection(COLLECTIONS.user).where({ id: userId }).update({
    data: { memberCode, updatedAt: now() }
  })
  await writePlatformLog(operator, 'update', 'user', userId, { memberCode })
  return { userId, memberCode }
}

async function saveMyProfile(openid, event = {}) {
  let user = await findPlatformUser(openid)
  if (!user) {
    await getPlatformSession(openid)
    user = await findPlatformUser(openid)
  }
  const profile = event.profile || {}
  const name = cleanText(profile.name, 30)
  const organizationId = canonicalOrganizationId(profile.organizationId)
  const avatarFileID = cleanText(profile.avatarFileID, 1000)
  const avatarRecordId = cleanText(profile.avatarRecordId, 100)
  if (profile.consentAccepted !== true) {
    throw Object.assign(new Error('请先阅读并同意用户服务协议和隐私保护指引'), { code: 'PROFILE_CONSENT_REQUIRED' })
  }
  if (!name || name.length < 2) {
    throw Object.assign(new Error('请填写至少两个字的真实姓名'), { code: 'INVALID_PROFILE_NAME' })
  }
  const organizationResult = await db.collection(COLLECTIONS.organization)
    .where({ id: organizationId, status: 'active' })
    .limit(1)
    .get()
  const organization = organizationResult.data[0]
  if (!organization || !['region', 'team'].includes(organization.type)) {
    throw Object.assign(new Error('请选择协作区或所属服务队'), { code: 'INVALID_PROFILE_ORGANIZATION' })
  }
  const data = {
    name,
    defaultOrganizationId: organizationId,
    profileCompleted: true,
    status: 'active',
    updatedAt: now(),
    lastLoginAt: now()
  }
  if (avatarFileID || avatarRecordId) {
    if (!avatarFileID || !avatarRecordId) {
      throw Object.assign(new Error('头像文件信息不完整，请重新选择照片'), { code: 'INVALID_PROFILE_AVATAR' })
    }
    await ensureFileRecordCollection()
    const avatarResult = await db.collection(COLLECTIONS.fileRecord)
      .where({ id: avatarRecordId, status: 'active' })
      .limit(1)
      .get()
    const avatarRecord = avatarResult.data[0]
    if (!avatarRecord || avatarRecord.resourceType !== 'user_avatar' ||
        avatarRecord.resourceId !== user.id || avatarRecord.organizationId !== organizationId ||
        avatarRecord.fileID !== avatarFileID || avatarRecord.uploaderOpenid !== openid) {
      throw Object.assign(new Error('只能将本人上传的照片设为成员头像'), { code: 'PROFILE_AVATAR_PERMISSION_DENIED' })
    }
    data.avatar = avatarFileID
  }
  await db.collection(COLLECTIONS.user).doc(user._id).update({ data })
  await writePlatformLog({ ...user, name }, 'update_profile', 'user', user.id, {
    name,
    organizationId,
    avatarUpdated: Boolean(data.avatar)
  })
  return {
    id: user.id,
    name,
    organizationId,
    avatarUrl: data.avatar || user.avatar || '',
    status: data.status
  }
}

async function listProfileOrganizations(openid) {
  let user = await findPlatformUser(openid)
  if (!user) {
    await getPlatformSession(openid)
    user = await findPlatformUser(openid)
  }
  if (!user || user.status === 'disabled') {
    throw Object.assign(new Error('当前账号不可用'), { code: 'USER_DISABLED' })
  }
  const result = await db.collection(COLLECTIONS.organization)
    .where({ status: 'active' })
    .orderBy('level', 'asc')
    .orderBy('sortOrder', 'asc')
    .limit(100)
    .get()
  return result.data
    .filter(item => ['region', 'team'].includes(item.type))
    .map(item => ({ id: item.id, name: item.name, shortName: item.shortName, type: item.type }))
}

const PERMISSION_MODULES = [
  'all', 'home', 'tasks', 'archives', 'history', 'photos', 'honors', 'ledger',
  'contacts', 'contact_private', 'positions', 'role_assignments', 'notices',
  'files', 'permissions', 'logs'
]
const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'upload', 'approve', 'complete', 'export']
const PERMISSION_MODULE_ACTIONS = {
  all: PERMISSION_ACTIONS,
  home: ['read', 'create', 'update', 'delete', 'upload'], tasks: ['read', 'create', 'update', 'delete', 'complete'], archives: ['read', 'create', 'update', 'delete', 'export'],
  history: ['read', 'create', 'update', 'delete', 'export'], photos: ['read', 'upload', 'update', 'delete'], honors: ['read', 'create', 'update', 'approve'],
  ledger: ['read', 'create', 'update', 'delete', 'export'], contacts: ['read', 'create', 'update', 'delete', 'export'], contact_private: ['read', 'update'],
  positions: ['read', 'create', 'update', 'delete'], role_assignments: ['read', 'create', 'update', 'delete'], notices: ['read', 'create', 'update', 'delete'],
  files: ['read', 'upload', 'delete'], permissions: ['read', 'create', 'update', 'delete'], logs: ['read', 'export']
}
const PERMISSION_SCOPES = ['global', 'organization', 'organization_tree', 'position', 'position_tree']
const TEAM_SCOPED_ADMIN_ROLE_CODES = ['team_admin', 'first-vp', 'second-vp', 'third-vp', 'secretary', 'treasurer']

async function listUserPermissions(openid) {
  const user = await requirePlatformUser(openid)
  const roles = await platformRoles(user.id)
  const ownGrants = await activeUserPermissions(user.id)
  const canRead = ownGrants.some(item => ((item.permissions || {}).permission || []).includes('read'))
  if (!roles.some(item => item.role === 'super_admin') && ownGrants.length && !canRead) {
    throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
  }
  const result = await db.collection(COLLECTIONS.userPermissions).limit(500).get()
  return result.data.filter(item => item.status !== 'deleted')
}

function sanitizePortPermissions(input = {}) {
  const result = {}
  Object.keys(PORT_PERMISSION_ACTIONS).forEach(module => {
    const actions = Array.isArray(input[module]) ? input[module] : []
    result[module] = Array.from(new Set(actions
      .map(item => cleanText(item, 20))
      .filter(item => PORT_PERMISSION_ACTIONS[module].includes(item))))
  })
  return result
}

async function saveUserPermissions(openid, event = {}, authorizedOperator = null) {
  const operator = authorizedOperator || await requireSuperAdmin(openid)
  const input = event.userPermissions || {}
  const userId = cleanText(input.userId, 100)
  const teamId = canonicalOrganizationId(input.teamId)
  const roleCode = cleanText(input.roleCode, 100)
  const roleName = cleanText(input.roleName, 100)
  const groupName = cleanText(input.groupName, 100)
  const dataScope = cleanText(input.dataScope, 20)
  const positionId = cleanText(input.positionId, 140)
  const startDate = cleanText(input.startDate, 10)
  const endDate = cleanText(input.endDate, 10)
  if (!userId || !teamId || !roleCode || !roleName || !PORT_DATA_SCOPES.includes(dataScope) || !startDate || !endDate) {
    throw Object.assign(new Error('用户、服务队、角色、数据范围和有效期不能为空'), { code: 'INVALID_USER_PERMISSIONS' })
  }
  if (startDate > endDate) {
    throw Object.assign(new Error('授权开始时间不能晚于结束时间'), { code: 'INVALID_USER_PERMISSION_DATE' })
  }
  const target = await requireAuthorizationTarget(userId)
  const team = await requireActiveOrganization(teamId)
  if (!['region', 'team'].includes(team.type)) {
    throw Object.assign(new Error('请选择协作区或服务队'), { code: 'INVALID_PERMISSION_TEAM' })
  }
  if (TEAM_SCOPED_ADMIN_ROLE_CODES.includes(roleCode) && (team.type !== 'team' || dataScope !== 'team')) {
    throw Object.assign(new Error('服务队管理员岗位只能使用所属服务队范围'), { code: 'INVALID_TEAM_SCOPED_ADMIN_ROLE' })
  }
  if (dataScope === 'position') {
    const positionResult = await db.collection(COLLECTIONS.position)
      .where({ id: positionId, organizationId: teamId, status: 'active' })
      .limit(1)
      .get()
    if (!positionResult.data[0]) {
      throw Object.assign(new Error('所选岗位不属于当前服务队'), { code: 'INVALID_PERMISSION_POSITION' })
    }
  }
  const inputId = cleanText(input.id, 100)
  const existingById = inputId
    ? await db.collection(COLLECTIONS.userPermissions).where({ id: inputId }).limit(1).get()
    : { data: [] }
  const existingByUser = existingById.data[0]
    ? { data: [] }
    : await db.collection(COLLECTIONS.userPermissions).where({ userId, status: 'active' }).limit(20).get()
  const sameRolePermissions = existingByUser.data.filter(item =>
    canonicalOrganizationId(item.teamId) === teamId && item.roleCode === roleCode)
  const primaryExisting = existingById.data[0] || sameRolePermissions[0]
  const id = primaryExisting ? primaryExisting.id : inputId || businessId('user_permission')
  const normalizedPermissions = sanitizePortPermissions(input.permissions)
  normalizedPermissions.finance = roleCode === 'super_admin'
    ? normalizedPermissions.finance
    : ['read']
  if (TEAM_SCOPED_ADMIN_ROLE_CODES.includes(roleCode)) {
    Object.keys(normalizedPermissions).forEach(module => {
      normalizedPermissions[module] = normalizedPermissions[module].filter(action => action !== 'delete')
    })
  }
  const data = {
    id,
    userId,
    userName: target.name,
    teamId,
    roleCode,
    roleName,
    groupName: groupName || roleName,
    dataScope,
    positionId: dataScope === 'position' ? positionId : '',
    permissions: normalizedPermissions,
    startDate,
    endDate,
    status: 'active',
    grantedBy: operator.id,
    updatedAt: now()
  }
  const duplicatedActive = (existingById.data.concat(sameRolePermissions))
    .filter(item => item && item._id && item._id !== (primaryExisting && primaryExisting._id))
  await Promise.all(duplicatedActive.map(item => db.collection(COLLECTIONS.userPermissions).doc(item._id).update({
    data: { status: 'deleted', mergedInto: id, updatedAt: now() }
  })))
  if (primaryExisting) {
    await db.collection(COLLECTIONS.userPermissions).doc(primaryExisting._id).update({ data })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.userPermissions).add({ data })
  }
  const previousLinkedRoles = await db.collection(COLLECTIONS.userRole)
    .where({ sourcePermissionId: id, status: 'active' })
    .limit(20)
    .get()
  await Promise.all(previousLinkedRoles.data.map(item => db.collection(COLLECTIONS.userRole).doc(item._id).update({
    data: { status: 'inactive', updatedAt: now() }
  })))
  if (['super_admin', 'area_admin', 'team_admin'].includes(roleCode)) {
    const roleOrganizationId = roleCode === 'super_admin'
      ? 'org_federation_china'
      : roleCode === 'area_admin' ? 'org_region_21_suihua' : teamId
    const roleResult = await db.collection(COLLECTIONS.userRole)
      .where({ sourcePermissionId: id })
      .limit(1)
      .get()
    const roleData = {
      id: roleResult.data[0] ? roleResult.data[0].id : businessId('role'),
      sourcePermissionId: id,
      userId,
      organizationId: roleOrganizationId,
      role: roleCode,
      startDate,
      endDate,
      expiresAt: endDate,
      status: 'active',
      grantedBy: operator.id,
      grantedAt: now(),
      updatedAt: now()
    }
    if (roleResult.data[0]) await db.collection(COLLECTIONS.userRole).doc(roleResult.data[0]._id).update({ data: roleData })
    else {
      roleData.createdAt = now()
      await db.collection(COLLECTIONS.userRole).add({ data: roleData })
    }
  }
  await db.collection(COLLECTIONS.user).where({ id: userId }).update({
    data: { status: 'active', updatedAt: now() }
  })
  await writePlatformLog(operator, primaryExisting ? 'update_permission' : 'grant_permission', 'user_permissions', id, data)
  return data
}

async function revokeUserPermissions(openid, event = {}, authorizedOperator = null) {
  const operator = authorizedOperator || await requireSuperAdmin(openid)
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.userPermissions).where({ id }).limit(1).get()
  const grant = result.data[0]
  if (!grant) return true
  await db.collection(COLLECTIONS.userPermissions).doc(grant._id).update({
    data: { status: 'deleted', updatedAt: now() }
  })
  const linkedRoles = await db.collection(COLLECTIONS.userRole).where({ sourcePermissionId: id, status: 'active' }).limit(20).get()
  await Promise.all(linkedRoles.data.map(item => db.collection(COLLECTIONS.userRole).doc(item._id).update({
    data: { status: 'inactive', updatedAt: now() }
  })))
  await writePlatformLog(operator, 'delete_permission', 'user_permissions', id, grant)
  return true
}

async function requirePermissionGrantAdmin(openid) {
  return requireAssignmentAdmin(openid)
}

async function listPermissionGrants(openid, event = {}) {
  await requirePlatformUser(openid)
  const organizationId = cleanText(event.organizationId, 100)
  const query = organizationId
    ? { organizationId, status: 'active' }
    : { status: 'active' }
  const result = await db.collection(COLLECTIONS.permissionGrant).where(query).limit(500).get()
  return result.data
}

async function savePermissionGrant(openid, event = {}) {
  const operator = await requirePermissionGrantAdmin(openid)
  const input = event.grant || {}
  const module = cleanText(input.module, 40)
  const scopeType = cleanText(input.scopeType, 40)
  const actions = Array.from(new Set(
    (Array.isArray(input.actions) ? input.actions : []).map(item => cleanText(item, 20))
  )).filter(item => PERMISSION_ACTIONS.includes(item))
  const data = {
    id: cleanText(input.id, 100) || businessId('grant'),
    userId: cleanText(input.userId, 100),
    organizationId: cleanText(input.organizationId, 100),
    module,
    scopeType,
    scopeId: cleanText(input.scopeId, 140),
    actions,
    startDate: cleanText(input.startDate, 10),
    endDate: cleanText(input.endDate, 10),
    status: 'active',
    grantedBy: operator.id,
    updatedAt: now()
  }
  if (!data.userId || !data.organizationId || !PERMISSION_MODULES.includes(module) ||
      !PERMISSION_SCOPES.includes(scopeType) || !actions.length || !data.startDate || !data.endDate) {
    throw Object.assign(new Error('人员、组织、模块、范围、操作和授权日期不能为空'), { code: 'INVALID_PERMISSION_GRANT' })
  }
  if (data.startDate > data.endDate) {
    throw Object.assign(new Error('授权开始时间不能晚于结束时间'), { code: 'INVALID_PERMISSION_DATE' })
  }
  if (['position', 'position_tree'].includes(scopeType) && !data.scopeId) {
    throw Object.assign(new Error('岗位权限必须选择具体岗位'), { code: 'POSITION_SCOPE_REQUIRED' })
  }
  await requireAuthorizationTarget(data.userId)
  await requireActiveOrganization(data.organizationId)
  if (!await canAdministerOrganization(operator.id, data.organizationId)) {
    throw Object.assign(new Error('不能超出管理范围授予权限'), { code: 'AUTHORIZATION_SCOPE_DENIED' })
  }
  if (['position', 'position_tree'].includes(scopeType)) {
    const positionResult = await db.collection(COLLECTIONS.position)
      .where({ id: data.scopeId, organizationId: data.organizationId, status: 'active' })
      .limit(1)
      .get()
    if (!positionResult.data[0]) {
      throw Object.assign(new Error('所选岗位不属于授权组织'), { code: 'INVALID_AUTHORIZATION_POSITION' })
    }
  }
  const operatorRoles = await platformRoles(operator.id)
  const isSuperAdmin = operatorRoles.some(item => item.status === 'active' && item.role === 'super_admin')
  if (!isSuperAdmin && (scopeType === 'global' || module === 'all')) {
    throw Object.assign(new Error('只有超级管理员可以授予全部内容或全局权限'), { code: 'SUPER_ADMIN_GRANT_REQUIRED' })
  }
  if (scopeType === 'global' && module !== 'all') data.scopeId = ''
  if (['organization', 'organization_tree'].includes(scopeType)) data.scopeId = data.organizationId

  const existing = await db.collection(COLLECTIONS.permissionGrant).where({ id: data.id }).limit(1).get()
  if (existing.data[0]) {
    await db.collection(COLLECTIONS.permissionGrant).doc(existing.data[0]._id).update({ data })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.permissionGrant).add({ data })
  }
  await db.collection(COLLECTIONS.user).where({ id: data.userId }).update({
    data: { status: 'active', updatedAt: now() }
  })
  await writePlatformLog(operator, 'grant_permission', 'permission_grant', data.id, data)
  return data
}

async function revokePermissionGrant(openid, event = {}) {
  const operator = await requirePermissionGrantAdmin(openid)
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.permissionGrant).where({ id }).limit(1).get()
  const grant = result.data[0]
  if (!grant) return true
  await db.collection(COLLECTIONS.permissionGrant).doc(grant._id).update({
    data: { status: 'revoked', updatedAt: now() }
  })
  await writePlatformLog(operator, 'revoke_permission', 'permission_grant', id, grant)
  return true
}

async function listUserRoles(openid, event = {}) {
  await requirePlatformUser(openid)
  const userId = cleanText(event.userId, 100)
  const query = userId ? { userId, status: 'active' } : { status: 'active' }
  const result = await db.collection(COLLECTIONS.userRole).where(query).limit(500).get()
  return result.data
}

async function saveUserRole(openid, event = {}) {
  const operator = await requireSuperAdmin(openid)
  const input = event.userRole || {}
  const allowedRoles = ['super_admin', 'area_admin', 'team_admin', 'member']
  const role = cleanText(input.role, 40)
  if (!allowedRoles.includes(role)) {
    throw Object.assign(new Error('不支持的管理员角色'), { code: 'INVALID_USER_ROLE' })
  }
  const userId = cleanText(input.userId, 100)
  const organizationId = cleanText(input.organizationId, 100)
  const startDate = cleanText(input.startDate, 10)
  const endDate = cleanText(input.endDate, 10)
  if (!userId || !organizationId || !startDate || !endDate) {
    throw Object.assign(new Error('用户、管理组织和授权日期不能为空'), { code: 'INVALID_USER_ROLE' })
  }
  if (startDate > endDate) {
    throw Object.assign(new Error('授权开始时间不能晚于结束时间'), { code: 'INVALID_USER_ROLE_DATE' })
  }
  await requireAuthorizationTarget(userId)
  const organizationResult = await db.collection(COLLECTIONS.organization)
    .where({ id: organizationId, status: 'active' })
    .limit(1)
    .get()
  const organization = organizationResult.data[0]
  const validScope = role === 'super_admin'
    ? organizationId === 'org_federation_china'
    : role === 'area_admin'
      ? organization && organization.type === 'region'
      : role === 'team_admin'
        ? organization && organization.type === 'team'
        : Boolean(organization)
  if (!validScope) {
    throw Object.assign(new Error('管理员角色与所选组织范围不匹配'), { code: 'INVALID_ROLE_SCOPE' })
  }
  const existing = await db.collection(COLLECTIONS.userRole)
    .where({ userId, organizationId, role })
    .limit(1)
    .get()
  const data = {
    id: existing.data[0] ? existing.data[0].id : businessId('role'),
    userId,
    organizationId,
    role,
    startDate,
    endDate,
    status: 'active',
    grantedBy: operator.id,
    grantedAt: now(),
    expiresAt: endDate,
    updatedAt: now()
  }
  if (existing.data[0]) {
    await db.collection(COLLECTIONS.userRole).doc(existing.data[0]._id).update({ data })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.userRole).add({ data })
  }
  await db.collection(COLLECTIONS.user).where({ id: userId }).update({
    data: { status: 'active', updatedAt: now() }
  })
  await writePlatformLog(operator, 'grant_role', 'user_role', data.id, { userId, organizationId, role })
  return data
}

async function revokeUserRole(openid, event = {}) {
  const operator = await requireSuperAdmin(openid)
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.userRole).where({ id }).limit(1).get()
  const role = result.data[0]
  if (!role) return true
  if (role.role === 'super_admin') {
    const superAdmins = await db.collection(COLLECTIONS.userRole)
      .where({ role: 'super_admin', status: 'active' })
      .count()
    if (superAdmins.total <= 1) {
      throw Object.assign(new Error('系统必须至少保留一名超级管理员'), { code: 'LAST_SUPER_ADMIN' })
    }
  }
  await db.collection(COLLECTIONS.userRole).doc(role._id).update({
    data: { status: 'inactive', updatedAt: now() }
  })
  await writePlatformLog(operator, 'revoke_role', 'user_role', id, {
    userId: role.userId,
    organizationId: role.organizationId,
    role: role.role
  })
  return true
}

const AREA_POSITIONS = [
  ['area-chair', '区域主席'],
  ['area-coordinator', '区域协调长'],
  ['area-officer', '干事'],
  ['secretary-general', '秘书长'],
  ['finance-chief', '财务长'],
  ['gmt', 'GMT'],
  ['glt', 'GLT'],
  ['gst', 'GST'],
  ['marketing', '营销宣传'],
  ['membership', '会员发展'],
  ['service-development', '服务发展'],
  ['area-other', '其他协作区岗位']
]

const TEAM_POSITIONS = [
  ['captain', '队长'],
  ['secretary', '秘书', 'captain'],
  ['tamer', '纠察', 'captain'],
  ['treasurer', '司库', 'captain'],
  ['admin', '总务', 'captain'],
  ['honor-chair', '荣誉主席'],
  ['first-vp', '第一副队长', 'captain'],
  ['second-vp', '第二副队长', 'captain'],
  ['third-vp', '第三副队长', 'captain'],
  ['member-retention', '会员与保留委员会', 'first-vp'],
  ['leadership-training', '领导力培训委员会', 'first-vp'],
  ['external-exchange', '对外交流委员会', 'first-vp'],
  ['service-plan', '服务与计划委员会', 'second-vp'],
  ['news-publicity', '新闻宣传委员会', 'second-vp'],
  ['fundraising-plan', '筹款与计划委员会', 'second-vp'],
  ['care-committee', '关爱委员会', 'third-vp'],
  ['fellowship-committee', '联谊委员会', 'third-vp'],
  ['annual-meeting', '年会委员会', 'third-vp']
]
const TEAM_COMMITTEE_CODES = new Set([
  'member-retention', 'leadership-training', 'external-exchange',
  'service-plan', 'news-publicity', 'fundraising-plan',
  'care-committee', 'fellowship-committee', 'annual-meeting'
])

const HONOR_LEVELS = ['none', 'good', 'great', 'excellent']
const HONOR_GRANT_LEVELS = ['good', 'great', 'excellent']
const HONOR_LEVEL_LABELS = {
  none: '不申报',
  good: '优秀',
  great: '杰出',
  excellent: '卓越'
}
const HONOR_REQUEST_POSITION_CODES = [
  'secretary',
  'treasurer',
  'admin',
  'tamer',
  'member-retention',
  'leadership-training',
  'external-exchange',
  'service-plan',
  'news-publicity',
  'fundraising-plan',
  'care-committee',
  'fellowship-committee',
  'annual-meeting'
]
const CAPTAIN_CONFIRM_POSITION_CODES = ['secretary', 'treasurer', 'admin', 'tamer']

async function requireSuperAdmin(openid) {
  const user = await requirePlatformUser(openid)
  const roles = await platformRoles(user.id)
  if (!roles.some(item => item.role === 'super_admin' && item.status === 'active')) {
    throw Object.assign(new Error('仅协作区超级管理员可执行此操作'), { code: 'SUPER_ADMIN_REQUIRED' })
  }
  return user
}

async function bootstrapGovernance(openid) {
  const user = await requireSuperAdmin(openid)
  const organizations = await db.collection(COLLECTIONS.organization)
    .where({ status: 'active' })
    .limit(500)
    .get()
  const existing = await db.collection(COLLECTIONS.position).limit(100).get()
  const existingMap = {}
  existing.data.forEach(item => { existingMap[item.id] = item })
  let created = 0
  for (const organization of organizations.data) {
    if (!['region', 'team'].includes(organization.type)) continue
    const definitions = organization.type === 'region' ? AREA_POSITIONS : TEAM_POSITIONS
    for (let index = 0; index < definitions.length; index += 1) {
      const [code, name, parentCode] = definitions[index]
      const id = `position_${organization.id}_${code}`
      const parentPositionId = parentCode ? `position_${organization.id}_${parentCode}` : null
      const type = organization.type === 'region'
        ? 'area'
        : TEAM_COMMITTEE_CODES.has(code) ? 'committee' : 'team'
      if (existingMap[id]) {
        await db.collection(COLLECTIONS.position).doc(existingMap[id]._id).update({
          data: { name, type, parentPositionId, sortOrder: (index + 1) * 10, updatedAt: now() }
        })
        continue
      }
      await db.collection(COLLECTIONS.position).add({
        data: {
          id,
          organizationId: organization.id,
          code,
          name,
          type,
          parentPositionId,
          responsibilities: '',
          sortOrder: (index + 1) * 10,
          status: 'active',
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        }
      })
      created += 1
    }
  }
  await writePlatformLog(user, 'create', 'position', 'governance-bootstrap', { created })
  return { created }
}

async function listPositions(openid, event = {}) {
  await requirePlatformUser(openid)
  const organizationId = cleanText(event.organizationId, 100)
  const query = organizationId ? { organizationId, status: 'active' } : { status: 'active' }
  const result = await db.collection(COLLECTIONS.position)
    .where(query)
    .orderBy('sortOrder', 'asc')
    .limit(500)
    .get()
  return result.data
}

async function listPositionDirectory(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const organizationId = canonicalOrganizationId(event.organizationId)
  const organization = await requireActiveOrganization(organizationId)
  const [positionResult, assignmentResult, userResult] = await Promise.all([
    db.collection(COLLECTIONS.position).where({ organizationId, status: 'active' }).orderBy('sortOrder', 'asc').limit(500).get(),
    db.collection(COLLECTIONS.roleAssignment).where({ organizationId, status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.user).limit(500).get()
  ])
  const today = new Date().toISOString().slice(0, 10)
  const userMap = {}
  userResult.data.forEach(item => { userMap[item.id] = item.name })
  const activeAssignments = assignmentResult.data.filter(item =>
    (!item.startDate || item.startDate <= today) && (!item.endDate || item.endDate >= today)
  )
  const administrator = await canEditServiceTeamPositions(user.id, organizationId)
  return Promise.all(positionResult.data.map(async position => {
    const assignment = activeAssignments.find(item => item.positionId === position.id)
    return {
      id: position.id,
      code: position.code,
      organizationId,
      name: position.name,
      parentPositionId: position.parentPositionId || '',
      person: assignment ? assignment.memberName || userMap[assignment.memberId || assignment.userId] || '待完善姓名' : '待授权',
      userId: assignment ? assignment.memberId || assignment.userId || '' : '',
      startDate: assignment ? assignment.startDate || '' : '',
      endDate: assignment ? assignment.endDate || '' : '',
      canEdit: administrator
    }
  }))
}

async function savePositionDirectory(openid, event = {}) {
  const operator = await requirePlatformUser(openid)
  const input = event.position || {}
  const organizationId = canonicalOrganizationId(input.organizationId)
  const positionId = cleanText(input.id, 140)
  const name = cleanText(input.name, 100)
  const memberName = cleanText(input.memberName, 40)
  const memberId = cleanText(input.memberId || input.userId, 100)
  const startDate = cleanText(input.startDate, 10)
  const endDate = cleanText(input.endDate, 10)
  if (!organizationId || !positionId || !name || !memberName || !memberId || !startDate || !endDate) {
    throw Object.assign(new Error('岗位、负责人和授权日期不能为空'), { code: 'INVALID_POSITION_DIRECTORY' })
  }
  if (startDate > endDate) {
    throw Object.assign(new Error('授权开始时间不能晚于结束时间'), { code: 'INVALID_ASSIGNMENT_DATE' })
  }
  const result = await db.collection(COLLECTIONS.position)
    .where({ id: positionId, organizationId, status: 'active' })
    .limit(1)
    .get()
  const position = result.data[0]
  if (!position) throw Object.assign(new Error('所选岗位不存在'), { code: 'POSITION_NOT_FOUND' })
  if (!await canEditServiceTeamPositions(operator.id, organizationId)) {
    throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
  }
  const organization = await requireActiveOrganization(organizationId)
  const member = await resolvePositionDirectoryMember(memberId, memberName)
  if (member.name !== memberName) {
    throw Object.assign(new Error('所选成员与负责人姓名不一致'), { code: 'POSITION_MEMBER_MISMATCH' })
  }
  await db.collection(COLLECTIONS.position).doc(position._id).update({ data: { name, updatedAt: now() } })
  const assignments = await db.collection(COLLECTIONS.roleAssignment)
    .where({ organizationId, positionId, status: 'active' })
    .limit(100)
    .get()
  for (const item of assignments.data) {
    await db.collection(COLLECTIONS.roleAssignment).doc(item._id).update({
      data: { status: 'revoked', updatedAt: now() }
    })
  }
  const assignment = {
    id: businessId('assignment'),
    areaId: 'org_region_21_suihua',
    teamId: organizationId.includes('_team_') ? organizationId : null,
    serviceTeamId: organizationId,
    serviceTeamName: organization.name,
    organizationId,
    positionId,
    positionKey: position.code,
    positionName: name,
    memberName,
    userId: memberId,
    memberId,
    roleType: 'role_manager',
    startDate,
    endDate,
    status: 'active',
    createdBy: operator.id,
    updatedBy: operator.id,
    createdAt: now(),
    updatedAt: now()
  }
  await db.collection(COLLECTIONS.roleAssignment).add({ data: assignment })
  await writePlatformLog(operator, 'update', 'position_directory', positionId, {
    serviceTeamId: organizationId,
    serviceTeamName: organization.name,
    positionKey: position.code,
    positionName: name,
    memberName,
    memberId,
    updatedBy: operator.id,
    updatedAt: assignment.updatedAt
  })
  return { ...assignment, name }
}

async function listRoleAssignments(openid, event = {}) {
  await requirePlatformUser(openid)
  const organizationId = cleanText(event.organizationId, 100)
  const query = organizationId ? { organizationId, status: 'active' } : { status: 'active' }
  const result = await db.collection(COLLECTIONS.roleAssignment)
    .where(query)
    .limit(500)
    .get()
  return result.data
}

async function listPlatformUsers(openid) {
  await requirePlatformUser(openid)
  const result = await db.collection(COLLECTIONS.user)
    .limit(500)
    .get()
  return result.data.filter(item => item.status !== 'disabled').map(item => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar || '',
    status: item.status,
    defaultOrganizationId: item.defaultOrganizationId || '',
    profileCompleted: Boolean(item.profileCompleted || (item.name && !item.name.startsWith('待认证用户-'))),
    accountSuffix: String(item.id || '').slice(-6),
    memberCode: item.memberCode || ''
  }))
}

async function saveRoleAssignment(openid, event = {}) {
  const operator = await requireAssignmentAdmin(openid)
  const assignment = event.assignment || {}
  const data = {
    id: cleanText(assignment.id, 100) || businessId('assignment'),
    areaId: cleanText(assignment.areaId, 100) || 'org_region_21_suihua',
    teamId: cleanText(assignment.teamId, 100) || null,
    organizationId: cleanText(assignment.organizationId, 100),
    positionId: cleanText(assignment.positionId, 140),
    userId: cleanText(assignment.userId, 100),
    memberId: cleanText(assignment.memberId || assignment.userId, 100),
    roleType: 'role_manager',
    startDate: cleanText(assignment.startDate, 10),
    endDate: cleanText(assignment.endDate, 10),
    status: assignment.status === 'revoked' ? 'revoked' : 'active',
    createdBy: operator.id,
    updatedAt: now()
  }
  if (!data.organizationId || !data.positionId || !data.userId || !data.startDate || !data.endDate) {
    throw Object.assign(new Error('组织、岗位、负责人和授权日期不能为空'), { code: 'INVALID_ROLE_ASSIGNMENT' })
  }
  if (data.startDate > data.endDate) {
    throw Object.assign(new Error('授权开始时间不能晚于结束时间'), { code: 'INVALID_ASSIGNMENT_DATE' })
  }
  await requireAuthorizationTarget(data.userId)
  await requireActiveOrganization(data.organizationId)
  if (!await canAdministerOrganization(operator.id, data.organizationId)) {
    throw Object.assign(new Error('不能超出管理范围设置岗位'), { code: 'AUTHORIZATION_SCOPE_DENIED' })
  }
  const positionResult = await db.collection(COLLECTIONS.position)
    .where({ id: data.positionId, organizationId: data.organizationId, status: 'active' })
    .limit(1)
    .get()
  if (!positionResult.data[0]) {
    throw Object.assign(new Error('所选岗位不属于授权组织'), { code: 'INVALID_AUTHORIZATION_POSITION' })
  }
  const overlapping = await db.collection(COLLECTIONS.roleAssignment)
    .where({ organizationId: data.organizationId, positionId: data.positionId, status: 'active' })
    .limit(100)
    .get()
  const previousDay = new Date(`${data.startDate}T00:00:00+08:00`)
  previousDay.setDate(previousDay.getDate() - 1)
  const previousEndDate = previousDay.toISOString().slice(0, 10)
  for (const item of overlapping.data) {
    if (item.id === data.id || item.userId === data.userId) continue
    if ((!item.endDate || item.endDate >= data.startDate) && (!item.startDate || item.startDate <= data.endDate)) {
      await db.collection(COLLECTIONS.roleAssignment).doc(item._id).update({
        data: {
          endDate: previousEndDate,
          status: item.startDate && item.startDate > previousEndDate ? 'revoked' : 'active',
          updatedAt: now()
        }
      })
    }
  }
  const existing = await db.collection(COLLECTIONS.roleAssignment).where({ id: data.id }).limit(1).get()
  if (existing.data[0]) {
    await db.collection(COLLECTIONS.roleAssignment).doc(existing.data[0]._id).update({ data })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.roleAssignment).add({ data })
  }
  await writePlatformLog(operator, 'grant_role', 'role_assignment', data.id, data)
  return data
}

async function writePlatformLog(user, action, targetType, targetId, after = null) {
  await db.collection(COLLECTIONS.operationLog).add({
    data: {
      id: businessId('log'),
      userId: user.id,
      organizationId: user.defaultOrganizationId || '',
      action,
      targetType,
      targetId,
      before: null,
      after,
      ip: '',
      userAgent: '',
      createdAt: now()
    }
  })
}

const HONOR_ORGANIZATION_ID = 'org_team_yuanhang'
const HONOR_RULES = {
  secretary: ['secretary', '秘书长', '年度例会完成', '次'],
  treasurer: ['treasurer', '财务长', '中狮基金申请进度', '%'],
  tamer: ['tamer', '纠察长', '累计乐捐', '元'],
  admin: ['admin', '总务长', '例会保障达标', '次'],
  membership: ['member-retention', '会员发展与保留委员会', '远航新增狮友', '人'],
  training: ['leadership-training', '领导力与培训委员会', '逢五相约达成', '次'],
  exchange: ['external-exchange', '对外交流委员会', '出省交流人次', '人次'],
  service: ['service-plan', '服务与计划委员会', '年度服务场次', '次'],
  publicity: ['news-publicity', '新闻与宣传委员会', '代表处公众号发表', '篇'],
  fundraising: ['fundraising-plan', '筹款委员会', '年度累计筹款', '元'],
  care: ['care-committee', '团队关爱委员会', '年度关爱服务', '次'],
  fellowship: ['fellowship-committee', '团队联谊委员会', '年度联谊场次', '次'],
  annual: ['annual-meeting', '年会委员会', '年度条件达成', '项']
}

async function requireHonorEditor(openid, record, action) {
  const user = await requirePlatformUser(openid)
  const portState = await portPermissionState(user.id, 'honor', action, record)
  if (portState.allowed) return user
  if (portState.configured) throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
  if (await canAdministerOrganization(user.id, record.organizationId)) return user
  if (await hasPlatformGrant(user.id, 'honors', action, record)) return user
  const assignments = await activeRoleAssignments(user.id)
  const allowed = assignments.some(item =>
    item.organizationId === record.organizationId && positionIdMatches(item.positionId, record.positionId)
  )
  if (!allowed) {
    throw Object.assign(new Error('当前用户没有该岗位的荣誉录入权限'), { code: 'HONOR_PERMISSION_REQUIRED' })
  }
  return user
}

async function listHonorRecords(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  if (user.status !== 'active') throw Object.assign(new Error('仅内部成员可查看荣誉记录'), { code: 'ACTIVE_MEMBER_REQUIRED' })
  const organizationId = canonicalOrganizationId(event.organizationId)
  if (organizationId !== HONOR_ORGANIZATION_ID) return []
  await ensureHonorCollection()
  const query = { organizationId, status: 'active' }
  if (event.term) query.term = cleanText(event.term, 30)
  const result = await db.collection(COLLECTIONS.honorRecord).where(query).orderBy('date', 'desc').limit(200).get()
  const portGrants = await enforcingPortPermissions(user.id)
  return result.data
    .filter(item => !portGrants.length || portPermissionAllowed(portGrants, user.id, 'honor', 'read', item))
    .map(item => ({ ...item, _id: undefined }))
}

async function saveHonorRecord(openid, event = {}) {
  await ensureHonorCollection()
  const input = event.record || {}
  const ruleId = cleanText(input.ruleId, 40)
  const definition = HONOR_RULES[ruleId]
  const organizationId = canonicalOrganizationId(input.organizationId)
  if (!definition || organizationId !== HONOR_ORGANIZATION_ID) {
    throw Object.assign(new Error('荣誉指标或所属组织无效'), { code: 'INVALID_HONOR_RULE' })
  }
  const value = Number(input.value)
  const date = cleanText(input.date, 10)
  const recipient = cleanText(input.recipient, 40)
  if (!Number.isFinite(value) || value < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !recipient) {
    throw Object.assign(new Error('请完整填写表彰对象、日期和有效累计值'), { code: 'INVALID_HONOR_RECORD' })
  }
  const record = {
    id: businessId('honor'),
    organizationId,
    term: cleanText(input.term, 30),
    ruleId,
    positionId: definition[0],
    ruleName: definition[1],
    metric: definition[2],
    unit: definition[3],
    recipient,
    value,
    date,
    note: cleanText(input.note, 120),
    status: 'active'
  }
  const operator = await requireHonorEditor(openid, record, 'create')
  const timestamp = now()
  Object.assign(record, { createdBy: operator.id, createdByName: operator.name, createdAt: timestamp, updatedAt: timestamp, deletedAt: null })
  await db.collection(COLLECTIONS.honorRecord).add({ data: record })
  await writePlatformLog(operator, 'create', 'honor_record', record.id, record)
  return record
}

async function deleteHonorRecord(openid, event = {}) {
  await ensureHonorCollection()
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.honorRecord).where({ id, status: 'active' }).limit(1).get()
  const record = result.data[0]
  if (!record) throw Object.assign(new Error('荣誉记录不存在或已删除'), { code: 'HONOR_RECORD_NOT_FOUND' })
  const operator = await requireHonorEditor(openid, record, 'delete')
  await db.collection(COLLECTIONS.honorRecord).doc(record._id).update({ data: { status: 'deleted', deletedAt: now(), updatedAt: now() } })
  await writePlatformLog(operator, 'delete', 'honor_record', id, { status: 'deleted' })
  return true
}

async function ensureHonorCollection() {
  try {
    await db.collection(COLLECTIONS.honorRecord).limit(1).get()
  } catch (error) {
    if (typeof db.createCollection !== 'function') throw error
    await db.createCollection(COLLECTIONS.honorRecord)
  }
}

const INITIAL_ORGANIZATIONS = [
  ['org_federation_china', '中国狮子联会', '中国狮子联会', 'federation', null, [], 0, 10],
  ['org_office_haerbin', '中国狮子联会哈尔滨代表处', '哈尔滨代表处', 'office', 'org_federation_china', ['org_federation_china'], 1, 20],
  ['org_region_21_suihua', '第二十一协作区', '二十一协作区', 'region', 'org_office_haerbin', ['org_federation_china', 'org_office_haerbin'], 2, 30],
  ['org_team_linghang', '领航服务队', '领航', 'team', 'org_region_21_suihua', ['org_federation_china', 'org_office_haerbin', 'org_region_21_suihua'], 3, 40],
  ['org_team_ailinghang', '爱领航服务队', '爱领航', 'team', 'org_region_21_suihua', ['org_federation_china', 'org_office_haerbin', 'org_region_21_suihua'], 3, 50],
  ['org_team_yuanhang', '远航服务队', '远航', 'team', 'org_region_21_suihua', ['org_federation_china', 'org_office_haerbin', 'org_region_21_suihua'], 3, 60],
  ['org_team_jingying', '精英服务队', '精英', 'team', 'org_region_21_suihua', ['org_federation_china', 'org_office_haerbin', 'org_region_21_suihua'], 3, 70]
]

async function bootstrapV2(openid) {
  if (!openid) throw Object.assign(new Error('未获取到微信登录身份'), { code: 'OPENID_REQUIRED' })

  const [userCount, roleCount, organizationCount] = await Promise.all([
    db.collection(COLLECTIONS.user).count(),
    db.collection(COLLECTIONS.userRole).count(),
    db.collection(COLLECTIONS.organization).count()
  ])

  let user = await findPlatformUser(openid)
  if ((userCount.total > 0 || roleCount.total > 0) && !user) {
    throw Object.assign(new Error('系统已经初始化，仅现有管理员可以继续配置'), { code: 'ALREADY_BOOTSTRAPPED' })
  }

  if (!user) {
    const timestamp = now()
    const userId = businessId('user')
    const data = {
      id: userId,
      openid,
      unionid: '',
      name: '系统管理员',
      avatar: '',
      phone: '',
      status: 'active',
      defaultOrganizationId: 'org_region_21_suihua',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp
    }
    const result = await db.collection(COLLECTIONS.user).add({ data })
    user = { ...data, _id: result._id }
  }

  if (organizationCount.total === 0) {
    const timestamp = now()
    for (const item of INITIAL_ORGANIZATIONS) {
      await db.collection(COLLECTIONS.organization).add({
        data: {
          id: item[0],
          name: item[1],
          shortName: item[2],
          type: item[3],
          parentId: item[4],
          ancestorIds: item[5],
          level: item[6],
          pathName: '',
          status: 'active',
          sortOrder: item[7],
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null
        }
      })
    }
  }

  const existingRole = await db.collection(COLLECTIONS.userRole)
    .where({ userId: user.id, role: 'super_admin', status: 'active' })
    .limit(1)
    .get()
  if (!existingRole.data[0]) {
    const timestamp = now()
    await db.collection(COLLECTIONS.userRole).add({
      data: {
        id: businessId('role'),
        userId: user.id,
        organizationId: 'org_federation_china',
        role: 'super_admin',
        status: 'active',
        grantedBy: user.id,
        grantedAt: timestamp,
        expiresAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    })
  }

  await writePlatformLog(user, 'grant_role', 'user_role', user.id, { role: 'super_admin' })
  return {
    initialized: true,
    userId: user.id,
    organizationCount: INITIAL_ORGANIZATIONS.length,
    role: 'super_admin'
  }
}

async function listOrganizations(openid, event = {}) {
  await requirePlatformUser(openid)
  const status = cleanText(event.status, 20) || 'active'
  const result = await db.collection(COLLECTIONS.organization)
    .where({ status })
    .orderBy('level', 'asc')
    .orderBy('sortOrder', 'asc')
    .limit(500)
    .get()
  return result.data
}

const EVENT_TYPES = ['例会事件', '联谊事件', '关爱事件', '纠察事件', '培训事件', '会员发展', '服务事件']

function inferEventType(categoryId = '', category = '') {
  const value = `${categoryId} ${category}`.toLowerCase()
  if (/fellowship|social|联谊/.test(value)) return '联谊事件'
  if (/care|关爱/.test(value)) return '关爱事件'
  if (/tamer|纠察/.test(value)) return '纠察事件'
  if (/training|培训|领导力/.test(value)) return '培训事件'
  if (/member-retention|\bmember\b|会员/.test(value)) return '会员发展'
  return '例会事件'
}

function normalizeEventType(value, categoryId = '', category = '') {
  return EVENT_TYPES.includes(value) ? value : inferEventType(categoryId, category)
}

async function listEventRecords(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const historyRead = await historyReadPermissionSnapshot(user)
  const status = cleanText(event.status, 30) || 'published'
  const organizationId = cleanText(event.organizationId, 80)
  const category = cleanText(event.category, 40)
  const categoryId = cleanText(event.categoryId, 80)
  const eventType = cleanText(event.eventType, 40)
  const eventMonth = cleanText(event.eventMonth, 7)
  const limit = Math.min(Number(event.limit) || 50, 100)
  const result = await db.collection(COLLECTIONS.eventRecord).limit(200).get()
  const records = result.data
    .filter(item => !item.deletedAt)
    .filter(item => !status || item.status === status)
    .filter(item => !organizationId || item.organizationId === organizationId)
    .filter(item => !category || item.category === category)
    .filter(item => !categoryId || item.categoryId === categoryId)
    .map(item => ({ ...item, eventType: normalizeEventType(item.eventType, item.categoryId, item.category) }))
    .filter(item => !eventType || item.eventType === eventType)
    .filter(item => !eventMonth || item.eventMonth === eventMonth)
    .filter(item => historyRead.canRead(item))
    .sort((a, b) => {
      const createdDifference = new Date(b.createdAt || b.updatedAt || b.eventDate || 0).getTime() -
        new Date(a.createdAt || a.updatedAt || a.eventDate || 0).getTime()
      return createdDifference || String(b.eventDate || '').localeCompare(String(a.eventDate || ''))
    })
    .slice(0, limit)
  const imageQueries = createArchiveImageQueryAdapter({ db, collections: COLLECTIONS })
  const resolvedImageMap = await loadArchiveImages(records, {
    listEventImages: imageQueries.listEventImages,
    listFileRecords: imageQueries.listFileRecords,
    attachImageUrls,
    warn: (message, error) => console.warn(message, error.message)
  })
  return records.map(item => ({ ...item, images: resolvedImageMap[item.id] || [] }))
}

async function saveEventRecord(openid, event = {}) {
  const record = event.record || {}
  const member = await requireEventEditor(openid, record, record.id || event.id ? 'update' : 'create')
  const id = cleanText(record.id || event.id, 100) || businessId('event')
  const eventDate = cleanText(record.eventDate, 10)
  const existing = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const participants = cleanParticipants(record.participants)
  const participantCount = participants.length
    ? participants.reduce((sum, group) => sum + group.members.length, 0)
    : Math.max(0, Math.floor(Number(record.participantCount) || 0))
  if (existing.data[0] && ['pending_confirm', 'pending_leader_confirm', 'pending_honor_verify', 'honor_verified', 'need_recheck'].includes(existing.data[0].honorStatus)) {
    throw Object.assign(new Error('荣誉流转中的事件暂不可修改'), { code: 'PENDING_CONFIRM_LOCKED' })
  }
  const data = {
    id,
    areaId: cleanText(record.areaId, 100) || 'org_region_21_suihua',
    teamId: cleanText(record.teamId, 100) || null,
    title: cleanText(record.title, 120),
    content: cleanText(record.content, 10000),
    summary: cleanText(record.summary, 1000),
    organizationId: cleanText(record.organizationId, 100),
    organizationAncestorIds: Array.isArray(record.organizationAncestorIds)
      ? record.organizationAncestorIds.map(item => cleanText(item, 100)).filter(Boolean)
      : [],
    category: cleanText(record.category, 40) || '纪事',
    categoryId: cleanText(record.categoryId, 80),
    eventType: normalizeEventType(cleanText(record.eventType, 40), record.categoryId, record.category),
    positionId: cleanText(record.positionId || record.categoryId, 140),
    archiveId: cleanText(record.archiveId, 180),
    keywords: Array.isArray(record.keywords)
      ? record.keywords.slice(0, 20).map(item => cleanText(item, 40)).filter(Boolean)
      : [],
    eventDate,
    eventMonth: eventDate && eventDate.length >= 7 ? eventDate.slice(0, 7) : '',
    location: cleanText(record.location, 120),
    participantCount,
    participants,
    creatorId: member.id,
    ownerName: cleanText(record.ownerName || member.name, 40),
    status: ['draft', 'pending_review', 'pending_confirm', 'pending_leader_confirm', 'published', 'rejected', 'archived'].includes(record.status)
      ? record.status
      : 'draft',
    visibility: ['private', 'organization', 'public'].includes(record.visibility)
      ? record.visibility
      : 'organization',
    viewCount: Number(record.viewCount) || 0,
    imageCount: Number(record.imageCount) || 0,
    updatedAt: now()
  }
  Object.assign(data, await buildHonorFields(member, record, data))
  if (HONOR_LEADER_PENDING_STATUSES.includes(data.honorStatus)) {
    data.status = 'pending_leader_confirm'
  } else if (HONOR_LEADER_PENDING_STATUSES.includes(data.status)) {
    data.status = 'published'
  }

  if (!data.title || !data.organizationId || !data.eventDate) {
    throw Object.assign(new Error('纪事标题、组织和日期不能为空'), { code: 'INVALID_EVENT_RECORD' })
  }

  if (existing.data[0]) {
    await db.collection(COLLECTIONS.eventRecord).doc(existing.data[0]._id).update({ data })
    await writePlatformLog(member, 'update', 'event_record', id, { title: data.title })
    return { id, _id: existing.data[0]._id }
  }

  data.createdAt = now()
  if (data.status === 'published') data.publishedAt = now()
  const result = await db.collection(COLLECTIONS.eventRecord).add({ data })
  await writePlatformLog(member, 'create', 'event_record', id, { title: data.title })
  return { id, _id: result._id }
}

async function getEventRecord(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const id = cleanText(event.id, 100)
  if (!id) throw Object.assign(new Error('缺少纪事 ID'), { code: 'EVENT_ID_REQUIRED' })
  const result = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('纪事不存在或已归档'), { code: 'NOT_FOUND' })
  }
  const historyRead = await historyReadPermissionSnapshot(user)
  if (!historyRead.canRead(record)) {
    throw Object.assign(new Error('当前账号无权查看该历史事件'), { code: 'PERMISSION_DENIED' })
  }
  const imageQueries = createArchiveImageQueryAdapter({ db, collections: COLLECTIONS })
  const resolvedImageMap = await loadArchiveImages([record], {
    listEventImages: imageQueries.listEventImages,
    listFileRecords: imageQueries.listFileRecords,
    attachImageUrls,
    warn: (message, error) => console.warn(message, error.message)
  })
  return {
    ...record,
    eventType: normalizeEventType(record.eventType, record.categoryId, record.category),
    images: resolvedImageMap[record.id] || []
  }
}

async function archiveEventRecord(openid, event = {}) {
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  if (!record) return true
  const user = await requireEventEditor(openid, record, 'delete')
  await db.collection(COLLECTIONS.eventRecord).doc(record._id).update({
    data: {
      status: 'archived',
      deletedAt: now(),
      updatedAt: now()
    }
  })
  await writePlatformLog(user, 'delete', 'event_record', id, { title: record.title })
  return true
}

function eventHonorView(item) {
  return {
    ...item,
    confirmedAt: item.confirmedAt ? formatDate(item.confirmedAt) : '',
    honorVerifiedAt: item.honorVerifiedAt ? formatDate(item.honorVerifiedAt) : '',
    honorRequestedLabel: honorLabel(item.honorRequestedLevel),
    honorConfirmedLabel: honorLabel(item.honorConfirmedLevel),
    honorLevelLabel: honorLabel(item.honorConfirmedLevel || item.honorRequestedLevel),
    honorStatusLabel: honorStatusLabel(item.honorStatus)
  }
}

async function listHonorConfirmations(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const organizationId = canonicalOrganizationId(event.organizationId)
  const assignments = await activeRoleAssignments(user.id)
  const confirmPositionIds = new Set(assignments.map(item => item.positionId).filter(Boolean))
  if (!confirmPositionIds.size) return []
  const result = await db.collection(COLLECTIONS.eventRecord).limit(300).get()
  return result.data
    .filter(item => !item.deletedAt)
    .filter(item => HONOR_LEADER_PENDING_STATUSES.includes(item.honorStatus))
    .filter(item => !organizationId || item.organizationId === organizationId)
    .filter(item => confirmPositionIds.has(item.confirmPositionId) || Array.from(confirmPositionIds).some(positionId => positionIdMatches(positionId, item.confirmPositionId)))
    .sort((a, b) => String(b.createdAt || b.eventDate || '').localeCompare(String(a.createdAt || a.eventDate || '')))
    .map(eventHonorView)
}

async function listHonorVerifications(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const organizationId = canonicalOrganizationId(event.organizationId)
  const roles = await platformRoles(user.id)
  const assignments = await activeRoleAssignments(user.id)
  const canVerify = roles.some(item => item.role === 'super_admin') ||
    assignments.some(item =>
      (!organizationId || item.organizationId === organizationId) &&
      positionIdMatches(item.positionId, HONOR_CHAIR_POSITION_CODE)
    )
  if (!canVerify) return []
  const result = await db.collection(COLLECTIONS.eventRecord).limit(300).get()
  return result.data
    .filter(item => !item.deletedAt)
    .filter(item => HONOR_VERIFY_PENDING_STATUSES.includes(item.honorStatus))
    .filter(item => !organizationId || item.organizationId === organizationId)
    .sort((a, b) => String(b.confirmedAt || b.createdAt || b.eventDate || '').localeCompare(String(a.confirmedAt || a.createdAt || a.eventDate || '')))
    .map(eventHonorView)
}

async function updateHonorConfirmation(openid, event = {}, mode = 'archive') {
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  await requireHonorConfirmer(openid, record, false)
  if (record && mode === 'archive' && record.eventStatus === 'archived' && record.honorStatus === 'none') {
    return record
  }
  if (record && mode === 'grant' && record.honorStatus === 'pending_honor_verify') {
    return record
  }
  if (record && mode === 'not_granted' && record.honorStatus === 'not_granted') {
    return record
  }
  const user = await requireHonorConfirmer(openid, record)
  const confirmedAt = now()
  const common = {
    status: 'published',
    eventStatus: 'archived',
    updatedAt: confirmedAt
  }
  let data = common
  let action = 'confirm_archive'
  if (mode === 'archive') {
    data = {
      ...common,
      honorStatus: 'none',
      honorConfirmedLevel: null,
      confirmedBy: user.id,
      confirmedByName: cleanText(user.name, 40),
      confirmedAt
    }
  }
  if (mode === 'grant') {
    data = {
      ...common,
      honorStatus: 'pending_honor_verify',
      honorConfirmedLevel: normalizeHonorGrantLevel(event.honorConfirmedLevel || event.level || record.honorRequestedLevel),
      confirmedBy: user.id,
      confirmedByName: cleanText(user.name, 40),
      confirmedAt
    }
    action = 'confirm_grant_honor'
  } else if (mode === 'not_granted') {
    data = {
      ...common,
      honorStatus: 'not_granted',
      honorConfirmedLevel: null,
      confirmedBy: user.id,
      confirmedByName: cleanText(user.name, 40),
      confirmedAt
    }
    action = 'mark_honor_not_granted'
  }
  await db.collection(COLLECTIONS.eventRecord).doc(record._id).update({ data })
  await writePlatformLog(user, 'update', 'event_record', id, { action, title: record.title })
  return { ...record, ...data, id, _id: record._id }
}

async function confirmArchiveEvent(openid, event = {}) {
  return updateHonorConfirmation(openid, event, 'archive')
}

async function confirmGrantHonor(openid, event = {}) {
  return updateHonorConfirmation(openid, event, 'grant')
}

async function markHonorNotGranted(openid, event = {}) {
  return updateHonorConfirmation(openid, event, 'not_granted')
}

async function updateHonorVerification(openid, event = {}, mode = 'verify') {
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  const user = await requireHonorVerifier(openid, record)
  const verifiedAt = now()
  const common = {
    status: 'published',
    eventStatus: 'archived',
    updatedAt: verifiedAt,
    honorVerifiedBy: user.id,
    honorVerifiedByName: cleanText(user.name, 40),
    honorVerifiedAt: verifiedAt
  }
  const data = mode === 'need_recheck'
    ? { ...common, honorStatus: 'need_recheck' }
    : { ...common, honorStatus: 'honor_verified' }
  const action = mode === 'need_recheck' ? 'mark_honor_need_recheck' : 'verify_honor_for_wall'
  await db.collection(COLLECTIONS.eventRecord).doc(record._id).update({ data })
  await writePlatformLog(user, 'update', 'event_record', id, { action, title: record.title })
  return { ...record, ...data, id, _id: record._id }
}

async function verifyHonorForWall(openid, event = {}) {
  return updateHonorVerification(openid, event, 'verify')
}

async function markHonorNeedRecheck(openid, event = {}) {
  return updateHonorVerification(openid, event, 'need_recheck')
}

function inTerm(record, termKey) {
  const today = new Date().toISOString().slice(0, 10)
  if (termKey) {
    return `${record.termStartDate || ''}_${record.termEndDate || ''}` === termKey
  }
  if (!record.termStartDate && !record.termEndDate) return true
  return (!record.termStartDate || record.termStartDate <= today) && (!record.termEndDate || record.termEndDate >= today)
}

async function getArchiveHonorStats(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const organizationId = canonicalOrganizationId(event.organizationId)
  const portGrants = await enforcingPortPermissions(user.id)
  const level = cleanText(event.level, 20)
  const positionId = cleanText(event.positionId, 160)
  const recipientUserId = cleanText(event.recipientUserId, 100)
  const termKey = cleanText(event.termKey, 40)
  const result = await db.collection(COLLECTIONS.eventRecord).limit(500).get()
  const baseRecords = result.data
    .filter(item => !item.deletedAt)
    .filter(item => HONOR_WALL_STATUSES.includes(item.honorStatus))
    .filter(item => !organizationId || item.organizationId === organizationId)
    .filter(item => !level || item.honorConfirmedLevel === level)
    .filter(item => !positionId || item.honorRecipientPositionId === positionId || item.categoryId === positionId || item.positionId === positionId)
    .filter(item => !recipientUserId || item.honorRecipientUserId === recipientUserId)
    .filter(item => !portGrants.length || portPermissionAllowed(portGrants, user.id, 'history', 'read', item))
  const termMap = {}
  baseRecords.forEach(item => {
    const itemTermKey = `${item.termStartDate || ''}_${item.termEndDate || ''}`
    if (itemTermKey !== '_' && !termMap[itemTermKey]) {
      termMap[itemTermKey] = {
        key: itemTermKey,
        startDate: item.termStartDate || '',
        endDate: item.termEndDate || '',
        label: `${item.termStartDate || '未设开始'} 至 ${item.termEndDate || '未设结束'}`
      }
    }
  })
  const records = baseRecords
    .filter(item => inTerm(item, termKey))
    .sort((a, b) => String(b.confirmedAt || b.eventDate || '').localeCompare(String(a.confirmedAt || a.eventDate || '')))
    .slice(0, 200)
    .map(eventHonorView)
  const counts = { good: 0, great: 0, excellent: 0 }
  const chairMap = {}
  const memberMap = {}
  const positionMap = {}
  records.forEach(item => {
    const honorLevel = item.honorConfirmedLevel
    if (counts[honorLevel] !== undefined) counts[honorLevel] += 1
    const chairKey = `${item.honorRecipientPositionId || item.positionId}_${item.honorRecipientUserId || ''}`
    if (!chairMap[chairKey]) {
      chairMap[chairKey] = {
        key: chairKey,
        positionId: item.honorRecipientPositionId || item.positionId,
        positionName: item.category || item.uploaderRole || '',
        userId: item.honorRecipientUserId || '',
        name: item.honorRecipientName || '',
        counts: { good: 0, great: 0, excellent: 0 },
        events: []
      }
    }
    if (chairMap[chairKey].counts[honorLevel] !== undefined) chairMap[chairKey].counts[honorLevel] += 1
    chairMap[chairKey].events.push(item.id)
    const memberKey = item.honorRecipientUserId || item.honorRecipientName || 'unknown'
    if (!memberMap[memberKey]) {
      memberMap[memberKey] = {
        key: memberKey,
        userId: item.honorRecipientUserId || '',
        name: item.honorRecipientName || '',
        counts: { good: 0, great: 0, excellent: 0 },
        events: []
      }
    }
    if (memberMap[memberKey].counts[honorLevel] !== undefined) memberMap[memberKey].counts[honorLevel] += 1
    memberMap[memberKey].events.push(item.id)
    const posKey = item.honorRecipientPositionId || item.positionId || item.categoryId
    if (posKey && !positionMap[posKey]) positionMap[posKey] = { id: posKey, name: item.category || item.uploaderRole || posKey }
  })
  return {
    counts,
    total: records.length,
    events: records,
    chairStats: Object.values(chairMap),
    memberStats: Object.values(memberMap),
    positions: Object.values(positionMap),
    terms: Object.values(termMap)
  }
}

async function listEventImages(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const eventId = cleanText(event.eventId, 100)
  if (!eventId) return []
  const recordResult = await db.collection(COLLECTIONS.eventRecord).where({ id: eventId }).limit(1).get()
  const record = recordResult.data[0]
  const portState = await portPermissionState(user.id, 'history', 'read', record || {})
  if (portState.configured && !portState.allowed) {
    throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
  }
  const result = await db.collection(COLLECTIONS.eventImage)
    .where({ eventId, status: 'active' })
    .orderBy('sortOrder', 'asc')
    .limit(200)
    .get()
  return attachImageUrls(result.data)
}

async function saveEventImages(openid, event = {}) {
  const eventId = cleanText(event.eventId, 100)
  const imageKeys = new Set()
  const images = (Array.isArray(event.images) ? event.images : []).filter(image => {
    image = image || {}
    const fileId = cleanText(image.fileId, 500)
    const imageUrl = cleanText(image.imageUrl, 1000)
    const key = fileId || imageUrl
    if (!key || imageKeys.has(key)) return false
    imageKeys.add(key)
    return true
  }).slice(0, 9)
  const eventResult = await db.collection(COLLECTIONS.eventRecord).where({ id: eventId }).limit(1).get()
  const record = eventResult.data[0]
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('纪事不存在，无法保存照片'), { code: 'EVENT_NOT_FOUND' })
  }
  const user = await requireEventEditor(openid, record, 'upload')
  const existing = await db.collection(COLLECTIONS.eventImage)
    .where({ eventId })
    .limit(100)
    .get()
  const retainedFileIds = new Set(images.map(image => cleanText(image.fileId, 500)).filter(Boolean))
  const imageOrder = new Map(images.map((image, index) => [
    cleanText(image.fileId, 500) || cleanText(image.imageUrl, 1000),
    index
  ]))
  const removedFileIds = Array.from(new Set(existing.data
    .map(item => cleanText(item.fileId, 500))
    .filter(fileId => fileId && !retainedFileIds.has(fileId))))
  const retainedKeys = new Set()
  await Promise.all(existing.data.map(item => {
    const key = cleanText(item.fileId, 500) || cleanText(item.imageUrl, 1000)
    if (item.status === 'active' && imageOrder.has(key) && !retainedKeys.has(key)) {
      retainedKeys.add(key)
      return db.collection(COLLECTIONS.eventImage).doc(item._id).update({
        data: { sortOrder: imageOrder.get(key), updatedAt: now() }
      })
    }
    if (item.status === 'active') {
      return db.collection(COLLECTIONS.eventImage).doc(item._id).update({
        data: { status: 'deleted', deletedAt: now(), updatedAt: now() }
      })
    }
    return Promise.resolve()
  }))
  await Promise.all(images.map((image, index) => {
    image = image || {}
    const key = cleanText(image.fileId, 500) || cleanText(image.imageUrl, 1000)
    if (retainedKeys.has(key)) return Promise.resolve()
    return db.collection(COLLECTIONS.eventImage).add({
      data: {
        id: businessId('image'),
        eventId,
        organizationId: record.organizationId,
        provider: 'wechat_cloud',
        fileId: cleanText(image.fileId, 500),
        imageUrl: cleanText(image.imageUrl, 1000),
        objectKey: cleanText(image.objectKey, 500),
        width: Number(image.width) || 0,
        height: Number(image.height) || 0,
        size: Number(image.size) || 0,
        sortOrder: index,
        status: 'active',
        createdBy: user.id,
        createdAt: now(),
        deletedAt: null
      }
    })
  }))
  await db.collection(COLLECTIONS.eventRecord).doc(record._id).update({
    data: { imageCount: images.length, updatedAt: now() }
  })
  if (removedFileIds.length) {
    try {
      const fileRecords = await db.collection(COLLECTIONS.fileRecord)
        .where({ resourceType: 'event_record', resourceId: eventId })
        .limit(100)
        .get()
      await Promise.all(fileRecords.data
        .filter(item => removedFileIds.includes(item.fileID))
        .map(item => db.collection(COLLECTIONS.fileRecord).doc(item._id).update({
          data: { status: 'deleted', deletedAt: now(), updatedAt: now() }
        })))
    } catch (error) {
      console.warn('清理文件记录失败', eventId, error)
    }
    for (let index = 0; index < removedFileIds.length; index += 50) {
      try {
        await cloud.deleteFile({ fileList: removedFileIds.slice(index, index + 50) })
      } catch (error) {
        console.warn('清理云存储文件失败', eventId, error)
      }
    }
  }
  await writePlatformLog(user, 'update', 'event_image', eventId, { imageCount: images.length })
  return { eventId, imageCount: images.length, removedFileCount: removedFileIds.length }
}

async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).limit(1).get()
  } catch (error) {
    if (typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection(collectionName)
    } catch (createError) {
      if (!/exist|already/i.test(createError.message || '')) throw createError
    }
  }
}

async function ensureFileRecordCollection() {
  return ensureCollection(COLLECTIONS.fileRecord)
}

function normalizeMediaCategory(value) {
  const category = cleanText(value, 30)
  return MEDIA_CATEGORY_NAMES[category] ? category : 'uncategorized'
}

function mediaOrganizationId(value) {
  const organizationId = canonicalOrganizationId(value)
  if (!MEDIA_TEAM_NAMES[organizationId]) {
    throw Object.assign(new Error('请选择有效的服务队云盘'), { code: 'INVALID_MEDIA_ORGANIZATION' })
  }
  return organizationId
}

async function mediaPermission(openid, organizationId, action = 'read') {
  const user = await requirePlatformUser(openid)
  organizationId = mediaOrganizationId(organizationId)
  if (action === 'read') return { user, organizationId }
  if (await canAdministerOrganization(user.id, organizationId)) return { user, organizationId }
  const normalizedAction = action === 'create' ? 'upload' : (action === 'export' ? 'update' : action)
  const portState = await portPermissionState(user.id, 'photos', normalizedAction, { organizationId })
  if (portState.allowed || await hasPlatformGrant(user.id, 'photos', normalizedAction, { organizationId })) {
    return { user, organizationId }
  }
  throw Object.assign(new Error(action === 'read' ? '无权查看该服务队云盘' : '无权管理该服务队云盘'), {
    code: 'MEDIA_PERMISSION_DENIED'
  })
}

async function mediaPermissionSummary(user, organizationId) {
  const administrator = await canAdministerOrganization(user.id, organizationId)
  const permissionFor = async action => {
    if (administrator) return true
    const portState = await portPermissionState(user.id, 'photos', action, { organizationId })
    return portState.allowed || await hasPlatformGrant(user.id, 'photos', action, { organizationId })
  }
  const canRead = true
  const canUpload = administrator || await permissionFor('upload')
  const canManage = administrator || await permissionFor('update')
  const canDelete = administrator || await permissionFor('delete')
  return { canRead, canUpload, canManage, canDelete, canExport: canManage, canShare: canRead, canSwitchTeam: true }
}

async function mediaAvailableTeams(openid) {
  await requirePlatformUser(openid)
  return Object.keys(MEDIA_TEAM_NAMES).map(id => ({ id, name: MEDIA_TEAM_NAMES[id] }))
}

async function mediaAlbumsForOrganization(organizationId) {
  const result = await db.collection(COLLECTIONS.mediaAlbum)
    .where({ organizationId, status: 'active' })
    .limit(500)
    .get()
  return result.data.filter(item => !item.deletedAt)
}

function mediaAlbumBreadcrumbs(album, albums = []) {
  const byId = new Map(albums.map(item => [item.id, item]))
  const result = []
  let current = album
  const visited = new Set()
  while (current && !visited.has(current.id) && result.length < 12) {
    visited.add(current.id)
    result.unshift({ id: current.id, title: current.title })
    current = current.parentId ? byId.get(current.parentId) : null
  }
  return result
}

async function mediaAlbumCoverMap(albums = []) {
  const resolved = await attachImageUrls(albums
    .map(item => ({ fileId: cleanText(item.coverFileID, 1000) }))
    .filter(item => item.fileId))
  return resolved.reduce((map, item) => {
    map[item.fileId] = item.imageUrl || item.fileId
    return map
  }, {})
}

function mediaAlbumView(item, coverMap = {}) {
  return {
    ...item,
    parentId: item.parentId || '',
    categoryName: MEDIA_CATEGORY_NAMES[item.category] || MEDIA_CATEGORY_NAMES.uncategorized,
    coverUrl: coverMap[item.coverFileID] || ''
  }
}

async function listMediaAlbums(openid, event = {}) {
  const organizationId = mediaOrganizationId(event.organizationId)
  const { user } = await mediaPermission(openid, organizationId, 'read')
  await ensureCollection(COLLECTIONS.mediaAlbum)
  await ensureFileRecordCollection()
  const category = cleanText(event.category, 30)
  const parentId = cleanText(event.parentId, 100)
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const start = (page - 1) * pageSize
  const allAlbums = await mediaAlbumsForOrganization(organizationId)
  const filtered = allAlbums
    .filter(item => (item.parentId || '') === parentId)
    .filter(item => !category || category === 'all' || item.category === normalizeMediaCategory(category))
    .sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || '')) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  const albums = filtered.slice(start, start + pageSize)
  const coverMap = await mediaAlbumCoverMap(albums)
  const currentFolder = parentId ? allAlbums.find(item => item.id === parentId) : null
  if (parentId && !currentFolder) throw Object.assign(new Error('文件夹不存在或已删除'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  return {
    organizationId,
    organizationName: MEDIA_TEAM_NAMES[organizationId],
    categories: MEDIA_CATEGORIES,
    permissions: await mediaPermissionSummary(user, organizationId),
    availableTeams: await mediaAvailableTeams(openid),
    parentId,
    currentFolder: currentFolder ? mediaAlbumView(currentFolder, coverMap) : null,
    breadcrumbs: currentFolder ? mediaAlbumBreadcrumbs(currentFolder, allAlbums) : [],
    albums: albums.map(item => mediaAlbumView(item, coverMap)),
    page,
    pageSize,
    total: filtered.length,
    hasMore: start + albums.length < filtered.length
  }
}

async function findMediaAlbum(id) {
  const albumId = cleanText(id, 100)
  if (!albumId) return null
  const result = await db.collection(COLLECTIONS.mediaAlbum).where({ id: albumId }).limit(1).get()
  return result.data[0] || null
}

async function getMediaAlbum(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaAlbum)
  await ensureFileRecordCollection()
  const album = await findMediaAlbum(event.id)
  if (!album || album.status !== 'active' || album.deletedAt) {
    throw Object.assign(new Error('相册不存在或已删除'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  }
  const { user } = await mediaPermission(openid, album.organizationId, 'read')
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 30))
  const start = (page - 1) * pageSize
  const condition = { resourceType: 'media_album', resourceId: album.id, status: 'active' }
  const [countResult, result, allAlbums] = await Promise.all([
    db.collection(COLLECTIONS.fileRecord).where(condition).count(),
    db.collection(COLLECTIONS.fileRecord).where(condition)
      .orderBy('sortOrder', 'asc')
      .skip(start)
      .limit(pageSize)
      .get(),
    mediaAlbumsForOrganization(album.organizationId)
  ])
  const files = result.data
  const childFolders = allAlbums.filter(item => (item.parentId || '') === album.id)
  const childCoverMap = await mediaAlbumCoverMap(childFolders)
  const resolvedFiles = await attachImageUrls(files)
  return {
    album: mediaAlbumView(album),
    breadcrumbs: mediaAlbumBreadcrumbs(album, allAlbums),
    childFolders: childFolders.map(item => mediaAlbumView(item, childCoverMap)),
    files: resolvedFiles.map(item => ({
      ...item,
      url: item.imageUrl || item.fileID || item.fileId || ''
    })),
    permissions: await mediaPermissionSummary(user, album.organizationId),
    page,
    pageSize,
    total: countResult.total,
    hasMore: start + files.length < countResult.total
  }
}

async function saveMediaAlbum(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaAlbum)
  await ensureFileRecordCollection()
  const input = event.album || {}
  const existing = input.id ? await findMediaAlbum(input.id) : null
  const organizationId = mediaOrganizationId(existing ? existing.organizationId : input.organizationId)
  const action = existing ? 'update' : 'create'
  const { user } = await mediaPermission(openid, organizationId, action)
  if (existing && canonicalOrganizationId(input.organizationId || organizationId) !== organizationId) {
    throw Object.assign(new Error('不能把相册移动到其他服务队'), { code: 'MEDIA_TEAM_MISMATCH' })
  }
  const category = normalizeMediaCategory(input.category || (existing && existing.category))
  const eventDate = validDateText(input.eventDate || (existing && existing.eventDate)) || new Date().toISOString().slice(0, 10)
  const title = cleanText(input.title || (existing && existing.title), 80) || '未分类相册'
  const parentId = cleanText(input.parentId !== undefined ? input.parentId : (existing && existing.parentId), 100)
  let parent = null
  if (parentId) {
    parent = await findMediaAlbum(parentId)
    if (!parent || parent.status !== 'active' || parent.deletedAt) {
      throw Object.assign(new Error('上级文件夹不存在'), { code: 'MEDIA_PARENT_NOT_FOUND' })
    }
    if (parent.organizationId !== organizationId) {
      throw Object.assign(new Error('不能跨服务队建立文件夹'), { code: 'MEDIA_TEAM_MISMATCH' })
    }
    if (existing && parent.id === existing.id) {
      throw Object.assign(new Error('不能把文件夹放入自身'), { code: 'MEDIA_FOLDER_CYCLE' })
    }
    if (existing) {
      const albums = await mediaAlbumsForOrganization(organizationId)
      if (mediaDescendantAlbumIds(existing.id, albums).includes(parent.id)) {
        throw Object.assign(new Error('不能把文件夹移入自己的下级目录'), { code: 'MEDIA_FOLDER_CYCLE' })
      }
    }
  }
  const data = {
    id: existing ? existing.id : businessId('album'),
    organizationId,
    title,
    parentId,
    depth: parent ? Number(parent.depth || 0) + 1 : 0,
    category,
    eventDate,
    coverFileID: existing ? existing.coverFileID || '' : '',
    mediaCount: existing ? Number(existing.mediaCount) || 0 : 0,
    imageCount: existing ? Number(existing.imageCount) || 0 : 0,
    videoCount: existing ? Number(existing.videoCount) || 0 : 0,
    creatorId: existing ? existing.creatorId : user.id,
    creatorName: existing ? existing.creatorName : user.name,
    status: 'active',
    updatedAt: now()
  }
  if (existing) {
    await db.collection(COLLECTIONS.mediaAlbum).doc(existing._id).update({ data })
    if (existing.category !== category || existing.title !== title) {
      await db.collection(COLLECTIONS.fileRecord)
        .where({ resourceType: 'media_album', resourceId: existing.id, status: 'active' })
        .update({ data: { category, eventName: title, updatedAt: now() } })
    }
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.mediaAlbum).add({ data })
  }
  await writePlatformLog(user, existing ? 'update' : 'create', 'media_album', data.id, { organizationId, category })
  return { ...data, categoryName: MEDIA_CATEGORY_NAMES[category] }
}

async function deleteMediaFile(openid, event = {}) {
  await ensureFileRecordCollection()
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.fileRecord).where({ id }).limit(1).get()
  const file = result.data[0]
  if (!file || file.resourceType !== 'media_album' || file.status !== 'active') {
    throw Object.assign(new Error('文件不存在或已删除'), { code: 'MEDIA_FILE_NOT_FOUND' })
  }
  const { user } = await mediaPermission(openid, file.organizationId, 'delete')
  await db.collection(COLLECTIONS.fileRecord).doc(file._id).update({
    data: { status: 'deleted', deletedAt: now(), deletedBy: user.id, updatedAt: now() }
  })
  if (file.fileID) {
    try { await cloud.deleteFile({ fileList: [file.fileID] }) } catch (error) { console.warn('删除云盘文件失败', error.message) }
  }
  const album = await findMediaAlbum(file.resourceId)
  if (album) await refreshMediaAlbumStats(album)
  await writePlatformLog(user, 'delete', 'media_file', id, { organizationId: file.organizationId, albumId: file.resourceId })
  return true
}

async function refreshMediaAlbumStats(albumOrId) {
  const album = typeof albumOrId === 'string' ? await findMediaAlbum(albumOrId) : albumOrId
  if (!album) return
  const baseCondition = { resourceType: 'media_album', resourceId: album.id, status: 'active' }
  const [mediaCount, imageCount, videoCount, nextImages] = await Promise.all([
    db.collection(COLLECTIONS.fileRecord).where(baseCondition).count(),
    db.collection(COLLECTIONS.fileRecord).where({ ...baseCondition, mediaType: 'image' }).count(),
    db.collection(COLLECTIONS.fileRecord).where({ ...baseCondition, mediaType: 'video' }).count(),
    db.collection(COLLECTIONS.fileRecord).where({ ...baseCondition, mediaType: 'image' }).orderBy('sortOrder', 'asc').limit(1).get()
  ])
  await db.collection(COLLECTIONS.mediaAlbum).doc(album._id).update({ data: {
    mediaCount: mediaCount.total,
    imageCount: imageCount.total,
    videoCount: videoCount.total,
    coverFileID: nextImages.data[0] ? nextImages.data[0].fileID : '',
    updatedAt: now()
  } })
}

function mediaDescendantAlbumIds(rootId, albums = []) {
  const result = []
  const queue = [rootId]
  const visited = new Set()
  while (queue.length) {
    const id = queue.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    result.push(id)
    albums.filter(item => (item.parentId || '') === id).forEach(item => queue.push(item.id))
  }
  return result
}

async function deleteMediaAlbum(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaAlbum)
  await ensureFileRecordCollection()
  const album = await findMediaAlbum(event.id)
  if (!album || album.status !== 'active') throw Object.assign(new Error('相册不存在或已删除'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  const { user } = await mediaPermission(openid, album.organizationId, 'delete')
  const allAlbums = await mediaAlbumsForOrganization(album.organizationId)
  const targetAlbumIds = mediaDescendantAlbumIds(album.id, allAlbums)
  const targetAlbums = allAlbums.filter(item => targetAlbumIds.includes(item.id))
  const fileIds = []
  let fileCount = 0
  for (const albumId of targetAlbumIds) {
    while (true) {
      const files = await db.collection(COLLECTIONS.fileRecord)
        .where({ resourceType: 'media_album', resourceId: albumId, status: 'active' }).limit(100).get()
      if (!files.data.length) break
      fileCount += files.data.length
      fileIds.push(...files.data.map(item => item.fileID).filter(Boolean))
      await Promise.all(files.data.map(item => db.collection(COLLECTIONS.fileRecord).doc(item._id).update({
        data: { status: 'deleted', deletedAt: now(), deletedBy: user.id, updatedAt: now() }
      })))
    }
  }
  for (let index = 0; index < fileIds.length; index += 50) {
    try { await cloud.deleteFile({ fileList: fileIds.slice(index, index + 50) }) } catch (error) { console.warn('批量删除云盘文件失败', error.message) }
  }
  await Promise.all(targetAlbums.map(item => db.collection(COLLECTIONS.mediaAlbum).doc(item._id).update({
    data: { status: 'deleted', deletedAt: now(), deletedBy: user.id, updatedAt: now() }
  })))
  await writePlatformLog(user, 'delete', 'media_album', album.id, {
    organizationId: album.organizationId,
    fileCount,
    folderCount: targetAlbums.length
  })
  return true
}

async function createMediaShare(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaShare)
  const album = await findMediaAlbum(event.albumId)
  if (!album || album.status !== 'active' || album.deletedAt) {
    throw Object.assign(new Error('文件夹不存在或已删除'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  }
  const { user } = await mediaPermission(openid, album.organizationId, 'read')
  const expiresDays = Math.min(30, Math.max(1, Number(event.expiresDays) || 7))
  const createdAt = now()
  const expiresAt = new Date(createdAt.getTime() + expiresDays * 24 * 60 * 60 * 1000)
  const data = {
    id: businessId('share'),
    token: randomToken(9),
    organizationId: album.organizationId,
    resourceType: 'media_album',
    resourceId: album.id,
    title: album.title,
    creatorId: user.id,
    creatorName: user.name,
    expiresAt,
    status: 'active',
    visitCount: 0,
    createdAt,
    updatedAt: createdAt
  }
  await db.collection(COLLECTIONS.mediaShare).add({ data })
  await writePlatformLog(user, 'share', 'media_album', album.id, { organizationId: album.organizationId, shareId: data.id })
  return { ...data, sharePath: `/pages/media-drive/share/index?token=${encodeURIComponent(data.token)}` }
}

async function getMediaShare(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaShare)
  const token = cleanText(event.token, 100)
  const result = await db.collection(COLLECTIONS.mediaShare).where({ token, status: 'active' }).limit(1).get()
  const share = result.data[0]
  if (!share || new Date(share.expiresAt).getTime() <= Date.now()) {
    throw Object.assign(new Error('分享已失效'), { code: 'MEDIA_SHARE_EXPIRED' })
  }
  const album = await findMediaAlbum(share.resourceId)
  if (!album || album.status !== 'active' || album.deletedAt) {
    throw Object.assign(new Error('分享的文件夹不存在'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  }
  await mediaPermission(openid, album.organizationId, 'read')
  await db.collection(COLLECTIONS.mediaShare).doc(share._id).update({
    data: { visitCount: Number(share.visitCount || 0) + 1, updatedAt: now() }
  })
  return {
    id: share.id,
    title: share.title,
    creatorName: share.creatorName,
    expiresAt: share.expiresAt,
    organizationName: MEDIA_TEAM_NAMES[album.organizationId],
    album: mediaAlbumView(album)
  }
}

async function mediaFilesForAlbumIds(albumIds = [], limit = 500) {
  const files = []
  for (const albumId of albumIds) {
    if (files.length >= limit) break
    const result = await db.collection(COLLECTIONS.fileRecord)
      .where({ resourceType: 'media_album', resourceId: albumId, status: 'active' })
      .orderBy('sortOrder', 'asc')
      .limit(Math.min(100, limit - files.length))
      .get()
    files.push(...result.data)
  }
  return files
}

function csvCell(value) {
  return `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`
}

function safeExportName(value, fallback) {
  return cleanText(value, 80).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-') || fallback
}

async function createMediaExport(openid, event = {}) {
  await ensureCollection(COLLECTIONS.mediaExport)
  await ensureFileRecordCollection()
  const album = await findMediaAlbum(event.albumId)
  if (!album || album.status !== 'active' || album.deletedAt) {
    throw Object.assign(new Error('文件夹不存在或已删除'), { code: 'MEDIA_ALBUM_NOT_FOUND' })
  }
  const { user } = await mediaPermission(openid, album.organizationId, 'export')
  const allAlbums = await mediaAlbumsForOrganization(album.organizationId)
  const albumIds = mediaDescendantAlbumIds(album.id, allAlbums)
  const albumMap = new Map(allAlbums.map(item => [item.id, item]))
  const format = cleanText(event.format, 20) === 'csv' ? 'csv' : 'zip'
  const limit = format === 'zip' ? MEDIA_EXPORT_MAX_FILES + 1 : 500
  const files = await mediaFilesForAlbumIds(albumIds, limit)
  if (!files.length) throw Object.assign(new Error('文件夹中没有可导出的文件'), { code: 'MEDIA_EXPORT_EMPTY' })
  if (format === 'zip' && files.length > MEDIA_EXPORT_MAX_FILES) {
    throw Object.assign(new Error(`单次最多打包 ${MEDIA_EXPORT_MAX_FILES} 个文件，请分文件夹导出`), { code: 'MEDIA_EXPORT_TOO_LARGE' })
  }
  const exportId = businessId('export')
  const baseName = safeExportName(album.title, '服务队云盘')
  let content
  let fileName
  let fileType
  if (format === 'csv') {
    const header = ['服务队', '文件夹', '文件名', '类型', '大小（字节）', '上传人', '上传时间', '对象存储路径']
    const rows = files.map(file => [
      MEDIA_TEAM_NAMES[album.organizationId],
      (mediaAlbumBreadcrumbs(albumMap.get(file.resourceId), allAlbums) || []).map(item => item.title).join('/'),
      file.originalFileName,
      file.mediaType,
      file.size,
      file.uploaderName,
      formatDate(file.createdAt),
      file.objectKey
    ])
    content = Buffer.from(`\ufeff${[header].concat(rows).map(row => row.map(csvCell).join(',')).join('\n')}`)
    fileName = `${baseName}-文件清单.csv`
    fileType = 'text/csv'
  } else {
    const knownSize = files.reduce((sum, file) => sum + Math.max(0, Number(file.size) || 0), 0)
    if (knownSize > MEDIA_EXPORT_MAX_BYTES) {
      throw Object.assign(new Error('单次打包不能超过100MB，请分文件夹导出'), { code: 'MEDIA_EXPORT_TOO_LARGE' })
    }
    const zip = new JSZip()
    let actualSize = 0
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      if (!file.fileID) continue
      const downloaded = await cloud.downloadFile({ fileID: file.fileID })
      const fileContent = downloaded.fileContent
      actualSize += fileContent.length
      if (actualSize > MEDIA_EXPORT_MAX_BYTES) {
        throw Object.assign(new Error('单次打包不能超过100MB，请分文件夹导出'), { code: 'MEDIA_EXPORT_TOO_LARGE' })
      }
      const breadcrumbs = mediaAlbumBreadcrumbs(albumMap.get(file.resourceId), allAlbums).map(item => safeExportName(item.title, '文件夹'))
      const originalName = safeExportName(file.originalFileName, `文件-${index + 1}`)
      zip.file(breadcrumbs.concat(originalName).join('/'), fileContent)
    }
    content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    fileName = `${baseName}.zip`
    fileType = 'application/zip'
  }
  const objectKey = `中国狮子联会/哈尔滨代表处/二十一协作区/${MEDIA_TEAM_NAMES[album.organizationId]}/服务队云盘/导出/${new Date().getFullYear()}/${exportId}/${fileName}`
  const uploaded = await cloud.uploadFile({ cloudPath: objectKey, fileContent: content })
  const createdAt = now()
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
  const data = {
    id: exportId,
    organizationId: album.organizationId,
    albumId: album.id,
    format,
    fileName,
    fileID: uploaded.fileID,
    objectKey,
    fileCount: files.length,
    size: content.length,
    creatorId: user.id,
    creatorName: user.name,
    status: 'ready',
    expiresAt,
    createdAt,
    updatedAt: createdAt
  }
  await Promise.all([
    db.collection(COLLECTIONS.mediaExport).add({ data }),
    db.collection(COLLECTIONS.fileRecord).add({ data: {
      id: businessId('file'),
      organizationId: album.organizationId,
      serviceTeamName: MEDIA_TEAM_NAMES[album.organizationId],
      leaderRole: '服务队云盘',
      departmentName: '导出',
      eventName: album.title,
      cloudPath: objectKey,
      objectKey,
      fileID: uploaded.fileID,
      fileType,
      originalFileName: fileName,
      uploaderOpenid: user.openid,
      uploaderName: user.name,
      resourceType: 'media_export',
      resourceId: exportId,
      module: 'photos',
      albumId: album.id,
      provider: 'cloudbase',
      size: content.length,
      status: 'active',
      createdAt,
      updatedAt: createdAt
    } })
  ])
  const linkResult = await cloud.getTempFileURL({ fileList: [uploaded.fileID] })
  const downloadUrl = linkResult.fileList && linkResult.fileList[0] ? linkResult.fileList[0].tempFileURL : ''
  await writePlatformLog(user, 'export', 'media_album', album.id, { organizationId: album.organizationId, exportId, format, fileCount: files.length })
  return { ...data, downloadUrl }
}

async function saveFileRecord(openid, event = {}) {
  const input = event.record || {}
  const organizationId = canonicalOrganizationId(input.organizationId)
  const resourceType = cleanText(input.resourceType, 40) || 'event_record'
  const resourceId = cleanText(input.resourceId, 100)
  const module = cleanText(input.module, 40) || 'archives'
  const inputFileType = cleanText(input.fileType, 100) || 'application/octet-stream'
  let user = null
  if (resourceType === 'user_avatar') {
    user = await findPlatformUser(openid)
    if (!user || user.status === 'disabled') {
      throw Object.assign(new Error('当前账号不可上传成员照片'), { code: 'PROFILE_AVATAR_USER_REQUIRED' })
    }
  } else {
    user = await requirePlatformUser(openid)
  }
  let mediaAlbum = null
  if (resourceType === 'media_album') {
    await ensureCollection(COLLECTIONS.mediaAlbum)
    mediaAlbum = await findMediaAlbum(resourceId)
    if (!mediaAlbum || mediaAlbum.status !== 'active' || mediaAlbum.deletedAt) {
      throw Object.assign(new Error('文件关联的云盘相册不存在'), { code: 'FILE_RESOURCE_NOT_FOUND' })
    }
    if (mediaAlbum.organizationId !== organizationId) {
      throw Object.assign(new Error('文件组织与云盘相册不一致'), { code: 'FILE_ORGANIZATION_MISMATCH' })
    }
    await mediaPermission(openid, organizationId, 'upload')
  } else if (resourceType === 'event_record') {
    const result = await db.collection(COLLECTIONS.eventRecord)
      .where({ id: resourceId })
      .limit(1)
      .get()
    const record = result.data[0]
    if (!record) throw Object.assign(new Error('文件关联的事件不存在'), { code: 'FILE_RESOURCE_NOT_FOUND' })
    if (record.organizationId !== organizationId) {
      throw Object.assign(new Error('文件组织与事件组织不一致'), { code: 'FILE_ORGANIZATION_MISMATCH' })
    }
    await requireEventEditor(openid, record, 'upload')
  } else if (resourceType === 'home_banner') {
    if (!await canManageTeamHomeBanner(user.id, organizationId, ['upload'])) {
      throw Object.assign(new Error('仅当前服务队轮播管理员可上传首页轮播'), { code: 'PERMISSION_DENIED' })
    }
  } else if (resourceType === 'user_avatar') {
    if (resourceId !== user.id || module !== 'contacts' || !inputFileType.startsWith('image/')) {
      throw Object.assign(new Error('只能上传本人的成员照片'), { code: 'PROFILE_AVATAR_PERMISSION_DENIED' })
    }
    const organization = await requireActiveOrganization(organizationId)
    if (!['region', 'team'].includes(organization.type)) {
      throw Object.assign(new Error('请选择协作区或所属服务队'), { code: 'INVALID_PROFILE_ORGANIZATION' })
    }
  } else {
    const portModule = module === 'history' ? 'history' : 'archive'
    const portState = await portPermissionState(user.id, portModule, 'upload', { organizationId })
    const legacyAllowed = await canAdministerOrganization(user.id, organizationId) ||
      await hasPlatformGrant(user.id, module, 'create', { organizationId })
    if (!portState.allowed && (portState.configured || !legacyAllowed)) {
      throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' })
    }
  }
  const fixedPath = '中国狮子联会/哈尔滨代表处/二十一协作区/'
  const cloudPath = cleanText(input.cloudPath, 1000).replace(/^\/+/, '')
  const fileID = cleanText(input.fileID, 1000)
  const serviceTeamName = cleanText(input.serviceTeamName, 40)
  const leaderRole = cleanText(input.leaderRole, 40)
  const departmentName = cleanText(input.departmentName, 60)
  const eventName = cleanText(input.eventName, 100)
  const serviceTeamNames = {
    org_region_21_suihua: '协作区公共档案',
    org_team_linghang: '领航服务队',
    org_team_ailinghang: '爱领航服务队',
    org_team_yuanhang: '远航服务队',
    org_team_jingying: '精英服务队'
  }
  const expectedTeamName = serviceTeamNames[organizationId]
  const mediaCategoryName = mediaAlbum ? MEDIA_CATEGORY_NAMES[mediaAlbum.category] || MEDIA_CATEGORY_NAMES.uncategorized : ''
  const mediaYear = mediaAlbum && /^\d{4}/.test(mediaAlbum.eventDate || '') ? mediaAlbum.eventDate.slice(0, 4) : ''
  const requiredPrefix = resourceType === 'media_album'
    ? `${fixedPath}${serviceTeamName}/服务队云盘/${mediaCategoryName}/${mediaYear}/`
    : `${fixedPath}${serviceTeamName}/`
  if (!expectedTeamName || serviceTeamName !== expectedTeamName ||
      !cloudPath.startsWith(requiredPrefix) || !fileID || !leaderRole || !eventName ||
      (resourceType === 'media_album' && (
        leaderRole !== '服务队云盘' || departmentName !== mediaCategoryName || eventName !== mediaAlbum.title
      )) ||
      (resourceType === 'user_avatar' && (leaderRole !== '成员头像' || departmentName))) {
    throw Object.assign(new Error('文件归档路径或必填信息不完整'), { code: 'INVALID_FILE_RECORD' })
  }
  await ensureFileRecordCollection()
  const data = {
    id: businessId('file'),
    organizationId,
    orgLevel: '中国狮子联会',
    representativeOffice: '哈尔滨代表处',
    cooperationArea: '二十一协作区',
    serviceTeamName,
    leaderRole,
    departmentName,
    eventName,
    cloudPath,
    objectKey: cloudPath,
    fileID,
    fileType: inputFileType,
    originalFileName: cleanText(input.originalFileName, 200),
    uploaderOpenid: user.openid,
    uploaderName: user.name,
    resourceType,
    resourceId,
    module,
    albumId: resourceType === 'media_album' ? resourceId : '',
    category: resourceType === 'media_album' ? mediaAlbum.category : '',
    mediaType: resourceType === 'media_album' && cleanText(input.mediaType, 10) === 'video' ? 'video' : 'image',
    size: Number(input.size) || 0,
    duration: Number(input.duration) || 0,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    sortOrder: Number(input.sortOrder) || 0,
    provider: 'cloudbase',
    status: 'active',
    createdAt: now(),
    updatedAt: now()
  }
  await db.collection(COLLECTIONS.fileRecord).add({ data })
  if (mediaAlbum) {
    const mediaType = data.mediaType
    const shouldUseAsCover = mediaType === 'image' && !Number(mediaAlbum.imageCount || 0)
    await db.collection(COLLECTIONS.mediaAlbum).doc(mediaAlbum._id).update({ data: {
      coverFileID: shouldUseAsCover ? data.fileID : mediaAlbum.coverFileID || '',
      mediaCount: Number(mediaAlbum.mediaCount || 0) + 1,
      imageCount: Number(mediaAlbum.imageCount || 0) + (mediaType === 'image' ? 1 : 0),
      videoCount: Number(mediaAlbum.videoCount || 0) + (mediaType === 'video' ? 1 : 0),
      updatedAt: now()
    } })
  }
  await writePlatformLog(user, 'upload', 'file_record', data.id, {
    organizationId, cloudPath, resourceType, resourceId
  })
  return data
}

async function listLedgerRecords(openid, event = {}) {
  await requirePlatformUser(openid)
  const organizationId = cleanText(event.organizationId, 100)
  if (!organizationId) return []
  const result = await db.collection(COLLECTIONS.ledgerRecord)
    .where({ organizationId })
    .orderBy('date', 'desc')
    .limit(200)
    .get()
  return result.data.filter(item => !item.deletedAt)
}

async function saveLedgerRecord(openid, event = {}) {
  const record = event.record || {}
  const organizationId = cleanText(record.organizationId, 100)
  const context = {
    organizationId,
    positionId: 'treasurer',
    categoryId: 'treasurer',
    creatorId: record.createdBy
  }
  const platformUser = await requirePlatformUser(openid)
  const roles = await platformRoles(platformUser.id)
  if (!roles.some(item => item.status === 'active' && item.role === 'super_admin')) {
    throw Object.assign(new Error('财务账目仅允许超级管理员维护'), { code: 'LEDGER_WRITE_SUPER_ADMIN_REQUIRED' })
  }
  const action = record.id ? 'update' : 'create'
  const portState = await portPermissionState(platformUser.id, 'finance', action, context)
  const user = portState.allowed
    ? platformUser
    : portState.configured
      ? (() => { throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' }) })()
      : await requireEventEditor(openid, context)
  const id = cleanText(record.id, 100) || businessId('ledger')
  const data = {
    id,
    areaId: cleanText(record.areaId, 100) || 'org_region_21_suihua',
    teamId: cleanText(record.teamId, 100) || null,
    organizationId,
    positionId: cleanText(record.positionId, 140) || 'treasurer',
    title: cleanText(record.title, 120),
    type: ['income', 'expense', 'asset', 'other'].includes(record.type) ? record.type : 'other',
    amount: Number(record.amount) || 0,
    description: cleanText(record.description, 2000),
    date: cleanText(record.date, 10),
    createdBy: user.id,
    updatedAt: now(),
    deletedAt: null
  }
  if (!data.title || !data.date) {
    throw Object.assign(new Error('账目标题和日期不能为空'), { code: 'INVALID_LEDGER_RECORD' })
  }
  const existing = await db.collection(COLLECTIONS.ledgerRecord).where({ id }).limit(1).get()
  if (existing.data[0]) {
    await db.collection(COLLECTIONS.ledgerRecord).doc(existing.data[0]._id).update({ data })
    await writePlatformLog(user, 'update', 'ledger_record', id, { title: data.title, amount: data.amount })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.ledgerRecord).add({ data })
    await writePlatformLog(user, 'create', 'ledger_record', id, { title: data.title, amount: data.amount })
  }
  return data
}

async function deleteLedgerRecord(openid, event = {}) {
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.ledgerRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  if (!record) return true
  const context = {
    organizationId: record.organizationId,
    positionId: 'treasurer',
    categoryId: 'treasurer',
    creatorId: record.createdBy
  }
  const platformUser = await requirePlatformUser(openid)
  const roles = await platformRoles(platformUser.id)
  if (!roles.some(item => item.status === 'active' && item.role === 'super_admin')) {
    throw Object.assign(new Error('财务账目仅允许超级管理员删除'), { code: 'LEDGER_DELETE_SUPER_ADMIN_REQUIRED' })
  }
  const portState = await portPermissionState(platformUser.id, 'finance', 'delete', context)
  const user = portState.allowed
    ? platformUser
    : portState.configured
      ? (() => { throw Object.assign(new Error('无权限操作'), { code: 'PERMISSION_DENIED' }) })()
      : await requireEventEditor(openid, context)
  await db.collection(COLLECTIONS.ledgerRecord).doc(record._id).update({
    data: { deletedAt: now(), updatedAt: now() }
  })
  await writePlatformLog(user, 'delete', 'ledger_record', id, { title: record.title })
  return true
}

async function applyMembership(openid, event) {
  const existing = await findMember(openid)
  if (existing) return publicMember(existing)

  const now = new Date()
  const data = {
    _openid: openid,
    nickname: cleanText(event.nickname, 40) || '微信成员',
    avatarUrl: cleanText(event.avatarUrl, 500),
    status: 'pending',
    role: 'member',
    createdAt: now,
    updatedAt: now
  }
  const result = await db.collection(COLLECTIONS.members).add({ data })
  return publicMember({ ...data, _id: result._id })
}

const HOME_BANNER_ALLOWED_ORGANIZATIONS = [
  'org_region_21_suihua',
  'org_team_linghang',
  'org_team_ailinghang',
  'org_team_yuanhang',
  'org_team_jingying'
]

function normalizeHomeBannerOrganizationId(value) {
  const organizationId = canonicalOrganizationId(value || 'org_region_21_suihua')
  if (!HOME_BANNER_ALLOWED_ORGANIZATIONS.includes(organizationId)) {
    throw Object.assign(new Error('请选择协作区或服务队'), { code: 'INVALID_HOME_BANNER_ORGANIZATION' })
  }
  return organizationId
}

async function ensureHomeBannerCollection() {
  try {
    await db.collection(COLLECTIONS.homeBanner).limit(1).get()
  } catch (error) {
    if (typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection(COLLECTIONS.homeBanner)
    } catch (createError) {
      if (!/exist|already/i.test(createError.message || '')) throw createError
    }
  }
}

async function listHomeBanners(openid, event = {}) {
  await requirePlatformUser(openid)
  const organizationId = normalizeHomeBannerOrganizationId(event.organizationId)
  try {
    const result = await db.collection(COLLECTIONS.homeBanner)
      .where({ organizationId, status: 'active' })
      .limit(20)
      .get()
    const rows = result.data
      .slice()
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    const withUrls = await attachImageUrls(rows.filter(item => item.fileId || item.imageUrl).map(item => ({
      id: item.id,
      fileId: item.fileId,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder
    })))
    return {
      configured: rows.length > 0,
      banners: withUrls.map(item => ({
        id: item.id,
        fileId: item.fileId,
        imageUrl: item.imageUrl,
        src: item.imageUrl || item.fileId,
        sortOrder: item.sortOrder
      }))
    }
  } catch (error) {
    if (/collection|not exist|doesn't exist/i.test(error.message || '')) {
      return { configured: false, banners: [] }
    }
    throw error
  }
}

async function saveHomeBanners(openid, event = {}) {
  const user = await requirePlatformUser(openid)
  const organizationId = normalizeHomeBannerOrganizationId(event.organizationId)
  await ensureHomeBannerCollection()
  const banners = (event.banners || [])
    .map(item => typeof item === 'string' ? item : item.fileId || item.fileID || item.imageUrl || item.src)
    .map(item => cleanText(item, 1000))
    .filter(Boolean)
    .slice(0, 9)
  const existing = await db.collection(COLLECTIONS.homeBanner)
    .where({ organizationId, status: 'active' })
    .limit(100)
    .get()
  const currentValues = existing.data.map(item => item.fileId || item.imageUrl || '').filter(Boolean)
  const requiredActions = []
  if (banners.some(value => !currentValues.includes(value))) requiredActions.push('create', 'upload')
  if (currentValues.some(value => !banners.includes(value))) requiredActions.push('delete')
  if (!requiredActions.length || banners.some((value, index) => currentValues[index] !== value)) requiredActions.push('update')
  if (!await canManageTeamHomeBanner(user.id, organizationId, Array.from(new Set(requiredActions)))) {
    throw Object.assign(new Error('当前账号无权编辑该服务队轮播图'), { code: 'PERMISSION_DENIED' })
  }
  await Promise.all(existing.data.map(item => db.collection(COLLECTIONS.homeBanner).doc(item._id).update({
    data: { status: 'deleted', deletedAt: now(), updatedAt: now(), deletedBy: user.id }
  })))
  if (!banners.length) {
    await db.collection(COLLECTIONS.homeBanner).add({
      data: {
        id: businessId('home_banner'),
        organizationId,
        scopeName: cleanText(event.scopeName, 80),
        fileId: '',
        imageUrl: '',
        sortOrder: 0,
        emptyState: true,
        status: 'active',
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now(),
        updatedAt: now()
      }
    })
  }
  await Promise.all(banners.map((value, index) => {
    const isCloudFile = value.startsWith('cloud://')
    return db.collection(COLLECTIONS.homeBanner).add({
      data: {
        id: businessId('home_banner'),
        organizationId,
        scopeName: cleanText(event.scopeName, 80),
        fileId: isCloudFile ? value : '',
        imageUrl: isCloudFile ? '' : value,
        sortOrder: index,
        status: 'active',
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now(),
        updatedAt: now()
      }
    })
  }))
  await writePlatformLog(user, 'update', 'home_banner', organizationId, {
    organizationId,
    count: banners.length
  })
  return listHomeBanners(openid, { organizationId })
}

const TODO_ORGANIZATION_ID = 'org_team_yuanhang'
const TODO_ORGANIZATION_ANCESTORS = ['org_region_21_suihua']
const TODO_CATEGORIES = ['生日关爱', '婚丧嫁娶', '公益服务', '联谊活动', '会议培训', '其他']
const YUANHANG_BIRTHDAYS = {
  刘建鑫: '07-09', 李珊珊: '07-22', 景殿贤: '08-06', 胡世领: '08-20', 徐春梅: '08-24', 张明星: '08-26',
  徐铭宣: '09-26', 关丙刚: '09-28', 王奇: '10-06', 杨景辉: '10-21', 吴雪: '12-02', 李晶: '12-19',
  李玲玲: '02-19', 宋永恒: '03-01', 李文强: '03-05', 吕媛媛: '03-11', 张芳: '03-20', 刘泉宏: '03-24',
  徐雪峰: '04-01', 潘洋洋: '04-04', 谭振峰: '04-29', 景树生: '05-05', 徐双龙: '05-05', 隋志菊: '05-07'
}
const YUANHANG_PROFESSIONS = { 刘建鑫: 'teacher', 李珊珊: 'teacher', 胡世领: 'teacher' }
const MEMBER_HOLIDAYS = [
  { profession: 'teacher', name: '教师节', monthDay: '09-10' },
  { profession: 'nurse', name: '护士节', monthDay: '05-12' },
  { profession: 'doctor', name: '中国医师节', monthDay: '08-19' }
]

function normalizeProfession(value) {
  const profession = cleanText(value, 20)
  return ['teacher', 'nurse', 'doctor'].includes(profession) ? profession : ''
}

function chinaDateText() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function nextBirthdayDate(monthDay, todayText) {
  const [year, currentMonth, currentDay] = todayText.split('-').map(Number)
  const [month, day] = String(monthDay).split('-').map(Number)
  let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (date < todayText) date = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const todayUtc = Date.UTC(year, currentMonth - 1, currentDay)
  const [birthdayYear] = date.split('-').map(Number)
  const birthdayUtc = Date.UTC(birthdayYear, month - 1, day)
  return { date, difference: Math.round((birthdayUtc - todayUtc) / 86400000), year: birthdayYear }
}

async function ensureBirthdayTodos() {
  const todayText = chinaDateText()
  const existing = await db.collection(COLLECTIONS.tasks)
    .where({ organizationId: TODO_ORGANIZATION_ID })
    .limit(200)
    .get()
  const existingIds = new Set(existing.data.map(item => item.id))
  const timestamp = now()
  await Promise.all(Object.entries(YUANHANG_BIRTHDAYS).map(async ([name, birthday], index) => {
    const upcoming = nextBirthdayDate(birthday, todayText)
    if (upcoming.difference < 0 || upcoming.difference > 30) return
    const id = `todo_birthday_${upcoming.year}_${index + 1}`
    if (existingIds.has(id)) return
    await db.collection(COLLECTIONS.tasks).doc(id).set({
      data: {
        id,
        title: `${name}生日关爱`,
        description: '系统根据成员生日提前30天自动生成',
        category: '生日关爱',
        date: upcoming.date,
        time: '',
        location: '',
        managerId: '',
        creatorId: 'system_birthday',
        organizationId: TODO_ORGANIZATION_ID,
        status: 'pending',
        visible: true,
        visibleToAll: true,
        birthdayMemberName: name,
        autoGenerated: true,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    })
  }))
}

async function ensureMemberHolidayTodos() {
  const [members, existing] = await Promise.all([
    directoryMembers(),
    db.collection(COLLECTIONS.tasks).where({ organizationId: TODO_ORGANIZATION_ID }).limit(200).get()
  ])
  const existingIds = new Set(existing.data.map(item => item.id))
  const todayText = chinaDateText()
  const timestamp = now()
  await Promise.all(MEMBER_HOLIDAYS.map(async (holiday, index) => {
    const memberNames = members
      .filter(item => item.organizationId === TODO_ORGANIZATION_ID && item.profession === holiday.profession)
      .map(item => item.name)
    if (!memberNames.length) return
    const upcoming = nextBirthdayDate(holiday.monthDay, todayText)
    if (upcoming.difference < 0 || upcoming.difference > 30) return
    const id = `todo_member_holiday_${upcoming.year}_${index + 1}`
    if (existingIds.has(id)) return
    await db.collection(COLLECTIONS.tasks).doc(id).set({
      data: {
        id,
        title: `${holiday.name}关怀提醒`,
        description: `关怀成员：${memberNames.join('、')}`,
        category: '生日关爱',
        date: upcoming.date,
        time: '',
        location: '',
        managerId: '',
        creatorId: 'system_member_holiday',
        organizationId: TODO_ORGANIZATION_ID,
        status: 'pending',
        visible: true,
        visibleToAll: true,
        holidayType: holiday.profession,
        memberNames,
        autoGenerated: true,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    })
  }))
}

async function ensureMonthlyMeetingTodo() {
  const todoQueries = createMonthlyMeetingQueryAdapter({
    db,
    collectionName: COLLECTIONS.tasks,
    organizationId: TODO_ORGANIZATION_ID
  })
  return reconcileMonthlyMeetingTodo({
    todayText: chinaDateText,
    timestamp: now,
    findTaskById: todoQueries.findTaskById,
    findMatchingTasks: todoQueries.findMatchingTasks,
    createTask: data => db.collection(COLLECTIONS.tasks).doc(data.id).set({ data }),
    updateTask: (task, data) => db.collection(COLLECTIONS.tasks).doc(task._id).update({ data }),
    writeAudit: (action, taskId, data) => writePlatformLog({
      id: 'system_monthly_meeting',
      defaultOrganizationId: TODO_ORGANIZATION_ID
    }, action, 'todo', taskId, data)
  })
}

async function ensureAutomaticTodos() {
  await ensureBirthdayTodos()
  await ensureMemberHolidayTodos()
  return runAutomaticTodoReconciliation({
    existingRemindersReady: true,
    ensureBirthdayTodos,
    ensureMemberHolidayTodos,
    ensureMonthlyMeetingTodo
  })
}

async function isTodoAdmin(user) {
  if (!user || user.status !== 'active') return false
  const roles = await platformRoles(user.id)
  return roles.some(item =>
    item.status === 'active' &&
    (item.role === 'super_admin' ||
      ['federation_admin', 'office_admin', 'region_admin', 'area_admin', 'team_admin'].includes(item.role) &&
      [TODO_ORGANIZATION_ID].concat(TODO_ORGANIZATION_ANCESTORS).includes(item.organizationId))
  )
}

async function todoViewer(openid) {
  const user = await findPlatformUser(openid)
  return user && user.status === 'active' ? user : null
}

async function requireTodoCreator(openid) {
  const user = await findPlatformUser(openid)
  const canCreate = user && user.status === 'active' && (
    canonicalOrganizationId(user.defaultOrganizationId) === TODO_ORGANIZATION_ID ||
    await isTodoAdmin(user)
  )
  if (!canCreate) {
    throw Object.assign(new Error('仅远航服务队内部成员可发布待办'), { code: 'TODO_MEMBER_REQUIRED' })
  }
  return user
}

async function requireTodoAdmin(openid) {
  const user = await requirePlatformUser(openid)
  if (!await isTodoAdmin(user)) {
    throw Object.assign(new Error('仅管理员可编辑、删除或完成待办'), { code: 'TODO_ADMIN_REQUIRED' })
  }
  return user
}

function validDateText(value) {
  const text = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? '' : text
}

async function decorateTodos(items = []) {
  return items.map(item => ({
    ...item,
    month: String(item.date || '').slice(0, 7),
    day: String(item.date || '').slice(8, 10),
    team: '远航服务队',
    teamId: 'yuanhang',
    visibleToAll: true,
    createdBy: item.creatorId
  }))
}

async function findTodo(id) {
  const value = cleanText(id, 100)
  if (!value) return null
  try {
    const result = await db.collection(COLLECTIONS.tasks).doc(value).get()
    if (result.data) return result.data
  } catch (error) {}
  const result = await db.collection(COLLECTIONS.tasks).where({ id: value }).limit(1).get()
  return result.data[0] || null
}

async function getHome(openid) {
  const viewer = await todoViewer(openid)
  if (viewer) await ensureAutomaticTodos()
  const [tasksResult, memberCount, noticeResult, activityResult] = await Promise.all([
    viewer ? db.collection(COLLECTIONS.tasks).where({ organizationId: TODO_ORGANIZATION_ID }).limit(200).get() : Promise.resolve({ data: [] }),
    db.collection(COLLECTIONS.user).where({ status: 'active' }).count(),
    db.collection(COLLECTIONS.notices).limit(50).get(),
    db.collection(COLLECTIONS.activities).limit(50).get()
  ])
  const tasks = activeItems(tasksResult.data)
    .filter(item => item.visible !== false && item.status !== 'deleted')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const notices = activeItems(noticeResult.data)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3)
  const activities = activeItems(activityResult.data)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 3)

  return {
    summary: {
      pendingCount: tasks.filter(item => item.status !== 'done').length,
      doneCount: tasks.filter(item => item.status === 'done').length,
      memberCount: memberCount.total
    },
    tasks: await decorateTodos(tasks.filter(item => !['done', 'completed'].includes(item.status)).slice(0, 4)),
    notices,
    activities
  }
}

async function listTasks(openid, event) {
  if (!await todoViewer(openid)) return { tasks: [], months: [], categories: TODO_CATEGORIES }
  await ensureAutomaticTodos()
  const result = await db.collection(COLLECTIONS.tasks)
    .where({ organizationId: TODO_ORGANIZATION_ID })
    .limit(200)
    .get()
  const allTasks = activeItems(result.data)
    .filter(item => item.visible !== false && item.status !== 'deleted')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const tasks = allTasks.filter(item => {
    const monthMatches = !event.month || event.month === 'all' || String(item.date || '').startsWith(event.month)
    const statusMatches = !event.status || event.status === 'all' || item.status === event.status
    return monthMatches && statusMatches
  })
  const months = [...new Set(allTasks.map(item => String(item.date || '').slice(0, 7)).filter(Boolean))]
    .sort()
    .map(value => ({ value, label: monthLabel(value) }))
  return { tasks: await decorateTodos(tasks), months, categories: TODO_CATEGORIES }
}

async function getTask(openid, event) {
  await requireTodoAdmin(openid)
  const task = await findTodo(event.id)
  if (!task || task.visible === false || task.status === 'deleted') {
    throw Object.assign(new Error('待办不存在或已删除'), { code: 'TODO_NOT_FOUND' })
  }
  return (await decorateTodos([task]))[0]
}

async function saveTask(openid, event) {
  const task = event.task || {}
  const user = event.id ? await requireTodoAdmin(openid) : await requireTodoCreator(openid)
  const title = cleanText(task.title, 100)
  const date = validDateText(task.date)
  const category = TODO_CATEGORIES.includes(task.category) ? task.category : '其他'
  if (!title || !date) {
    throw Object.assign(new Error('请填写事项内容并选择有效日期'), { code: 'INVALID_TODO' })
  }
  const data = {
    title,
    description: cleanText(task.description, 1000),
    category,
    date,
    time: cleanText(task.time, 5),
    location: cleanText(task.location, 100),
    managerId: '',
    organizationId: TODO_ORGANIZATION_ID,
    visibleToAll: true,
    updatedAt: now()
  }
  if (event.id) {
    const existing = await findTodo(event.id)
    if (!existing || existing.visible === false || existing.status === 'deleted') {
      throw Object.assign(new Error('待办不存在或已删除'), { code: 'TODO_NOT_FOUND' })
    }
    await db.collection(COLLECTIONS.tasks).doc(existing._id).update({ data })
    await writePlatformLog(user, 'update', 'todo', existing.id, data)
    return { id: existing.id, _id: existing._id }
  }
  data.id = businessId('todo')
  data.creatorId = user.id
  data.status = 'pending'
  data.visible = true
  data.createdAt = now()
  const result = await db.collection(COLLECTIONS.tasks).add({ data })
  await writePlatformLog(user, 'create', 'todo', data.id, data)
  return { id: data.id, _id: result._id }
}

async function deleteTask(openid, event) {
  const user = await requireTodoAdmin(openid)
  const task = await findTodo(event.id)
  if (!task) return true
  await db.collection(COLLECTIONS.tasks).doc(task._id).update({
    data: { status: 'deleted', visible: false, deletedAt: now(), updatedAt: now() }
  })
  await writePlatformLog(user, 'delete', 'todo', task.id, { title: task.title })
  return true
}

async function completeTask(openid, event) {
  const user = await requireTodoAdmin(openid)
  const task = await findTodo(event.id)
  if (!task || task.visible === false || task.status === 'deleted') {
    throw Object.assign(new Error('待办不存在或已删除'), { code: 'TODO_NOT_FOUND' })
  }
  await db.collection(COLLECTIONS.tasks).doc(task._id).update({
    data: { status: 'completed', updatedAt: now() }
  })
  await writePlatformLog(user, 'complete', 'todo', task.id, { title: task.title, status: 'completed' })
  return true
}

async function reopenTask(openid, event) {
  const user = await requireTodoAdmin(openid)
  const task = await findTodo(event.id)
  if (!task || task.visible === false || task.status === 'deleted') {
    throw Object.assign(new Error('待办不存在或已删除'), { code: 'TODO_NOT_FOUND' })
  }
  if (!['done', 'completed'].includes(task.status)) return true
  const data = {
    status: 'pending',
    completedAt: null,
    completedBy: '',
    archiveMonth: '',
    updatedAt: now()
  }
  await db.collection(COLLECTIONS.tasks).doc(task._id).update({ data })
  await writePlatformLog(user, 'reopen', 'todo', task.id, { title: task.title, status: 'pending' })
  return true
}

async function listOrg(openid) {
  await requireApproved(openid)
  const result = await db.collection(COLLECTIONS.org).orderBy('order', 'asc').limit(200).get()
  return activeItems(result.data)
}

function memberInitial(name) {
  return cleanText(name, 40).slice(0, 1) || '成'
}

function memberLetter(name) {
  const first = memberInitial(name)
  const map = {
    安: 'A', 白: 'B', 陈: 'C', 崔: 'C', 丁: 'D', 董: 'D', 付: 'F', 冯: 'F',
    高: 'G', 郭: 'G', 关: 'G', 韩: 'H', 何: 'H', 胡: 'H', 黄: 'H',
    荆: 'J', 景: 'J', 井: 'J', 姜: 'J', 孔: 'K', 李: 'L', 刘: 'L', 吕: 'L',
    梁: 'L', 林: 'L', 米: 'M', 马: 'M', 潘: 'P', 彭: 'P', 任: 'R',
    宋: 'S', 孙: 'S', 滕: 'T', 田: 'T', 王: 'W', 吴: 'W', 徐: 'X',
    许: 'X', 谢: 'X', 杨: 'Y', 姚: 'Y', 张: 'Z', 赵: 'Z', 周: 'Z'
  }
  return map[first] || '#'
}

function normalizeBirthday(value) {
  const text = cleanText(value, 10)
  if (!text) return ''
  const match = text.match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/)
  if (!match) {
    throw Object.assign(new Error('生日请按 MM-DD 填写'), { code: 'INVALID_BIRTHDAY' })
  }
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw Object.assign(new Error('生日日期格式不正确'), { code: 'INVALID_BIRTHDAY' })
  }
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function safeBirthday(value) {
  try {
    return normalizeBirthday(value)
  } catch (error) {
    return ''
  }
}

const DIRECTORY_ROSTER = {
  org_team_linghang: ['王刚', '刘宝山', '于波', '范信银', '陈维凡', '刘金辉', '腾保国', '贾晓梅', '杨磊', '吴含', '朱连春', '蒋萧彤', '辛志武', '马玉红', '李洪志', '李力安', '侯盛楠', '王连会', '孙建', '金萍', '徐红霞', '王玉宝', '王洪伟', '王立彬', '关向星'],
  org_team_jingying: ['王丽', '杨帆', '陈纯玉', '杨丽莹', '付艳超', '孙明龙', '孙洪涛', '于永和', '张影', '周钰慧', '裴大伟', '林衍伟', '安铁', '薛允丽', '郭晓红', '张淑云', '李永生', '王继芳', '吕洪威', '任凤影', '张南翔', '程传海', '刘明海', '陈俊超', '谢巍巍'],
  org_team_ailinghang: ['陈纯颖', '王必东', '张书慧', '杨振忠', '陈冬彬', '孙显波', '王秋香', '谢志琴', '邓福友', '陈瓯', '王磊', '辛福恩', '毛烨', '吴亚娟', '杨秀娟', '张成功', '孙慧霖', '刘磊', '李红太', '刘金岭', '范晓波', '李玉博', '邰欢欢'],
  org_team_yuanhang: ['关丙刚', '张明星', '徐双龙', '张芳', '李晶', '刘建鑫', '李珊珊', '刘圣亮', '杨景辉', '李文强', '李玲玲', '吕媛媛', '王奇', '潘洋洋', '景树生', '徐雪峰', '胡世领', '徐铭宣', '徐春梅', '吴雪', '谭振峰', '腾飞', '宋永恒', '景殿贤', '刘泉宏', '隋志菊', '井续海', '王必东']
}
const DIRECTORY_POSITION_OVERRIDES = {
  org_team_yuanhang: { 李玲玲: '秘书' }
}

async function organizationNameMap() {
  const result = await db.collection(COLLECTIONS.organization).limit(200).get()
  const map = {
    org_region_21_suihua: { name: '二十一协作区', shortName: '协作区', type: 'region' },
    org_team_linghang: { name: '领航服务队', shortName: '领航', type: 'team' },
    org_team_ailinghang: { name: '爱领航服务队', shortName: '爱领航', type: 'team' },
    org_team_yuanhang: { name: '远航服务队', shortName: '远航', type: 'team' },
    org_team_jingying: { name: '精英服务队', shortName: '精英', type: 'team' }
  }
  result.data.forEach(item => {
    map[item.id] = {
      name: item.name,
      shortName: item.shortName || item.name,
      type: item.type
    }
  })
  return map
}

function publicDirectoryMember(user, organizations = {}) {
  const organizationId = canonicalOrganizationId(user.defaultOrganizationId || user.organizationId)
  const organization = organizations[organizationId] || {}
  const sourceName = cleanText(user.name || user.nickname, 40)
  const name = organizationId === 'org_team_yuanhang' && sourceName === '李姗姗' ? '李珊珊' : sourceName
  const avatarFileId = avatarFileIdOf(user)
  return {
    _id: user.id || user._id,
    id: user.id || user._id,
    name,
    nickname: name,
    team: organization.name || cleanText(user.team, 80) || '未分配服务队',
    teamShortName: organization.shortName || '',
    teamId: organizationId,
    organizationId,
    defaultOrganizationId: organizationId,
    position: cleanText(user.position, 80) || cleanText(user.roleName, 80) || '成员',
    birthday: safeBirthday(user.birthday) || (organizationId === 'org_team_yuanhang' ? YUANHANG_BIRTHDAYS[name] || '' : ''),
    profession: normalizeProfession(user.profession) || (organizationId === 'org_team_yuanhang' ? YUANHANG_PROFESSIONS[name] || '' : ''),
    memberCode: cleanText(user.memberCode, 30),
    accountSuffix: String(user.id || user._id || '').slice(-6),
    resource: cleanText(user.resource, 100),
    avatarFileId,
    avatarUrl: avatarFileId || cleanText(user.avatar || user.avatarUrl, 1000),
    initial: memberInitial(name),
    letter: cleanText(user.letter, 2) || memberLetter(name),
    avatarTone: cleanText(user.avatarTone, 20) || 'green',
    status: user.status || 'active'
  }
}

function staticDirectoryMembers(organizations = {}) {
  return Object.keys(DIRECTORY_ROSTER).flatMap(organizationId =>
    DIRECTORY_ROSTER[organizationId].map((name, index) => publicDirectoryMember({
      id: `roster_${organizationId}_${index + 1}`,
      name,
      defaultOrganizationId: organizationId,
      position: DIRECTORY_POSITION_OVERRIDES[organizationId] && DIRECTORY_POSITION_OVERRIDES[organizationId][name] || '成员',
      birthday: organizationId === 'org_team_yuanhang' ? YUANHANG_BIRTHDAYS[name] || '' : '',
      profession: organizationId === 'org_team_yuanhang' ? YUANHANG_PROFESSIONS[name] || '' : '',
      status: 'active'
    }, organizations)))
}

function findStaticDirectoryMember(id, organizations = {}) {
  return staticDirectoryMembers(organizations).find(item => item.id === id || item._id === id) || null
}

async function directoryMembers() {
  const [userResult, organizations] = await Promise.all([
    db.collection(COLLECTIONS.user).limit(500).get(),
    organizationNameMap()
  ])
  const directory = {}
  staticDirectoryMembers(organizations).forEach(item => {
    directory[`${item.organizationId}:${item.name}`] = item
  })
  userResult.data
    .slice()
    .sort((a, b) => String(a.updatedAt || a.createdAt || '').localeCompare(String(b.updatedAt || b.createdAt || '')))
    .filter(item => cleanText(item.name, 40) && !cleanText(item.name, 40).startsWith('待认证用户-'))
    .filter(item => {
      const organizationId = canonicalOrganizationId(item.defaultOrganizationId || item.organizationId)
      if (organizationId !== 'org_team_jingying' || item.directoryManaged) return true
      return DIRECTORY_ROSTER.org_team_jingying.includes(cleanText(item.name, 40))
    })
    .forEach(item => {
      const member = publicDirectoryMember(item, organizations)
      const key = `${member.organizationId}:${member.name}`
      const rosterMember = directory[key]
      if (member.position === '成员' && rosterMember && rosterMember.position !== '成员') {
        member.position = rosterMember.position
      }
      if (!member.birthday && rosterMember && rosterMember.birthday) member.birthday = rosterMember.birthday
      if (!member.profession && rosterMember && rosterMember.profession) member.profession = rosterMember.profession
      if (item.status === 'disabled') delete directory[key]
      else directory[key] = member
    })
  const members = Object.values(directory)
    .sort((a, b) => String(a.letter || '#').localeCompare(String(b.letter || '#')) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const avatarRows = await attachImageUrls(members
    .map(item => ({ fileId: item.avatarFileId }))
    .filter(item => item.fileId))
  const avatarUrlMap = avatarRows.reduce((map, item) => {
    map[item.fileId] = item.imageUrl || item.fileId
    return map
  }, {})
  return members.map(item => ({
    ...item,
    avatarUrl: avatarUrlMap[item.avatarFileId] || item.avatarUrl
  }))
}

async function listDirectoryMembers(openid) {
  await requireApproved(openid)
  return directoryMembers()
}

async function findDirectoryUser(id) {
  const value = cleanText(id, 100)
  if (!value) return null
  const byBusinessId = await db.collection(COLLECTIONS.user).where({ id: value }).limit(1).get()
  if (byBusinessId.data[0]) return byBusinessId.data[0]
  try {
    const byDoc = await db.collection(COLLECTIONS.user).doc(value).get()
    return byDoc.data || null
  } catch (error) {
    return null
  }
}

async function canManageDirectoryMember(openid, target = {}, requestedAction = '') {
  const platformUser = await findPlatformUser(openid)
  const action = requestedAction || (target.id ? 'update' : 'create')
  if (platformUser && platformUser.status === 'active') {
    const organizationId = target.defaultOrganizationId || target.organizationId
    if (await canAdministerOrganization(platformUser.id, organizationId)) return true
    const state = await portPermissionState(platformUser.id, 'contacts', action, {
      organizationId
    })
    if (state.allowed) return true
    if (!state.configured && await hasPlatformGrant(platformUser.id, 'contacts', action, { organizationId })) return true
    return false
  }
  const legacy = await requireApproved(openid)
  return ['superadmin', 'editor', 'admin'].includes(legacy.role)
}

async function getMember(openid, event = {}) {
  await requireApproved(openid)
  const organizations = await organizationNameMap()
  const user = await findDirectoryUser(event.id)
  const member = user
    ? user.status !== 'disabled' ? publicDirectoryMember(user, organizations) : null
    : findStaticDirectoryMember(cleanText(event.id, 100), organizations)
  if (!member) {
    throw Object.assign(new Error('未找到成员资料'), { code: 'MEMBER_NOT_FOUND' })
  }
  const canManage = await canManageDirectoryMember(openid, member, 'update')
  const canDelete = await canManageDirectoryMember(openid, member, 'delete')
  const resolvedMembers = await attachImageUrls(member.avatarFileId
    ? [{ fileId: member.avatarFileId }]
    : [])
  const resolvedAvatar = resolvedMembers[0]
  return {
    member: {
      ...member,
      avatarUrl: resolvedAvatar ? resolvedAvatar.imageUrl : member.avatarUrl
    },
    canViewContact: true,
    canManage,
    canDelete
  }
}

async function saveMember(openid, event = {}) {
  const input = event.member || {}
  const id = cleanText(input.id || input._id, 100)
  const existing = id ? await findDirectoryUser(id) : null
  const organizationId = canonicalOrganizationId(input.organizationId || input.defaultOrganizationId || input.teamId || (existing && existing.defaultOrganizationId))
  const operator = await requireDirectoryMemberEditor(openid, existing ? 'update' : 'create', organizationId)
  const platformOperator = await findPlatformUser(openid)
  const organization = await requireActiveOrganization(organizationId)
  if (!['region', 'team'].includes(organization.type)) {
    throw Object.assign(new Error('请选择协作区或服务队'), { code: 'INVALID_MEMBER_ORGANIZATION' })
  }
  const name = cleanText(input.name || input.nickname, 40)
  if (!name) {
    throw Object.assign(new Error('请填写成员姓名'), { code: 'INVALID_MEMBER_NAME' })
  }
  const data = {
    id: existing ? existing.id : businessId('user'),
    name,
    defaultOrganizationId: organizationId,
    position: cleanText(input.position, 80) || '成员',
    birthday: normalizeBirthday(input.birthday),
    profession: normalizeProfession(input.profession),
    resource: cleanText(input.resource, 100),
    avatar: cleanText(input.avatarFileId, 1000) || cleanText(input.avatarUrl || input.avatar, 1000),
    letter: cleanText(input.letter, 2) || memberLetter(name),
    status: cleanText(input.status, 20) || (existing && existing.status) || 'active',
    profileCompleted: true,
    directoryManaged: true,
    updatedAt: now()
  }
  if (cleanText(input.memberCode, 30)) data.memberCode = cleanText(input.memberCode, 30).toUpperCase()
  if (existing) {
    await db.collection(COLLECTIONS.user).doc(existing._id).update({ data })
    await writePlatformLog(platformOperator || { id: operator._id, defaultOrganizationId: organizationId }, 'update', 'user', data.id, { name, organizationId, birthday: data.birthday })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.user).add({ data })
    await writePlatformLog(platformOperator || { id: operator._id, defaultOrganizationId: organizationId }, 'create', 'user', data.id, { name, organizationId, birthday: data.birthday })
  }
  const organizations = await organizationNameMap()
  return publicDirectoryMember({ ...existing, ...data }, organizations)
}

async function deleteMember(openid, event = {}) {
  let existing = await findDirectoryUser(event.id)
  let staticMember = null
  if (!existing) {
    const organizations = await organizationNameMap()
    staticMember = findStaticDirectoryMember(cleanText(event.id, 100), organizations)
  }
  if (!existing && !staticMember) return true
  const organizationId = canonicalOrganizationId(
    (existing && existing.defaultOrganizationId) || (staticMember && staticMember.defaultOrganizationId)
  )
  const operator = await requireDirectoryMemberEditor(openid, 'delete', organizationId)
  const platformOperator = await findPlatformUser(openid)
  const deletedAt = now()
  if (existing) {
    await db.collection(COLLECTIONS.user).doc(existing._id).update({
      data: { status: 'disabled', deletedAt, updatedAt: deletedAt }
    })
  } else {
    existing = {
      id: businessId('user'),
      name: staticMember.name,
      defaultOrganizationId: organizationId,
      position: staticMember.position || '成员',
      status: 'disabled',
      profileCompleted: true,
      deletedAt,
      createdAt: deletedAt,
      updatedAt: deletedAt
    }
    await db.collection(COLLECTIONS.user).add({ data: existing })
  }
  await writePlatformLog(platformOperator || { id: operator._id, defaultOrganizationId: organizationId }, 'delete', 'user', existing.id, { name: existing.name, organizationId })
  return true
}

async function getOrg(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(COLLECTIONS.org).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveOrg(openid, event) {
  const unit = event.unit || {}
  const member = await requireLegacyPortEditor(openid, 'member', event.id ? 'update' : 'create', {
    organizationId: unit.organizationId || unit.teamId,
    creatorId: unit.createdBy
  })
  const data = {
    position: cleanText(unit.position, 100),
    person: cleanText(unit.person, 40),
    committee: cleanText(unit.committee, 100),
    description: cleanText(unit.description, 1500),
    order: Number(unit.order) || 100,
    updatedAt: new Date()
  }
  if (!data.position) throw Object.assign(new Error('请填写岗位名称'), { code: 'INVALID_ORG' })
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.org).doc(id).update({ data })
    await writeAudit(member, 'update', 'org', id, data.position)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.org).add({ data })
  await writeAudit(member, 'create', 'org', result._id, data.position)
  return { id: result._id }
}

async function deleteOrg(openid, event) {
  const id = cleanText(event.id, 80)
  const unitResult = await db.collection(COLLECTIONS.org).doc(id).get()
  const unit = unitResult.data || {}
  const member = await requireLegacyPortEditor(openid, 'member', 'delete', {
    organizationId: unit.organizationId || unit.teamId,
    creatorId: unit.createdBy
  })
  await db.collection(COLLECTIONS.org).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'org', id)
  return true
}

async function listActivities(openid) {
  await requireApproved(openid)
  const [activityResult, photoResult] = await Promise.all([
    db.collection(COLLECTIONS.activities).limit(200).get(),
    db.collection(COLLECTIONS.photos).limit(1000).get()
  ])
  const photos = activeItems(photoResult.data)
  const activities = activeItems(activityResult.data)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const coverRows = activities
    .map(item => {
      const related = photos.filter(photo => photo.activityId === item._id)
      return related.find(photo => photo.isCover) || related[0]
    })
    .filter(Boolean)
  const resolvedCovers = await attachImageUrls(coverRows)
  const coverUrlMap = resolvedCovers.reduce((map, item) => {
    map[item.fileId] = item.imageUrl || item.fileId
    return map
  }, {})
  return activities
    .map(item => {
      const related = photos.filter(photo => photo.activityId === item._id)
      const cover = related.find(photo => photo.isCover) || related[0]
      const coverFileId = cleanText(cover && (cover.fileID || cover.fileId), 1000)
      return {
        ...item,
        dateLabel: item.date || '',
        photoCount: related.length,
        coverUrl: coverUrlMap[coverFileId] || coverFileId
      }
    })
}

async function getActivity(openid, event) {
  await requireApproved(openid)
  const id = cleanText(event.id, 80)
  const [activityResult, photoResult] = await Promise.all([
    db.collection(COLLECTIONS.activities).doc(id).get(),
    db.collection(COLLECTIONS.photos).where({ activityId: id }).limit(500).get()
  ])
  const activity = activityResult.data
  if (activity.deletedAt) throw Object.assign(new Error('活动不存在或已归档'), { code: 'NOT_FOUND' })
  const photos = activeItems(photoResult.data).sort((a, b) => (a.order || 0) - (b.order || 0))
  const resolvedPhotos = await attachImageUrls(photos)
  const cover = resolvedPhotos.find(item => item.isCover) || resolvedPhotos[0]
  return {
    activity: { ...activity, dateLabel: activity.date || '', coverUrl: cover ? cover.imageUrl : '' },
    photos: resolvedPhotos.map(item => ({
      ...item,
      url: item.imageUrl || item.fileID || item.fileId || ''
    }))
  }
}

async function saveActivity(openid, event) {
  const activity = event.activity || {}
  const member = await requireLegacyPortEditor(openid, 'history', event.id ? 'update' : 'create', {
    organizationId: activity.organizationId || activity.teamId,
    creatorId: activity.createdBy
  })
  const data = {
    title: cleanText(activity.title, 100),
    date: cleanText(activity.date, 10),
    location: cleanText(activity.location, 100),
    owner: cleanText(activity.owner, 40),
    participants: cleanText(activity.participants, 500),
    description: cleanText(activity.description, 2000),
    summary: cleanText(activity.summary, 3000),
    updatedAt: new Date()
  }
  if (!data.title) throw Object.assign(new Error('请填写活动名称'), { code: 'INVALID_ACTIVITY' })
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.activities).doc(id).update({ data })
    await writeAudit(member, 'update', 'activity', id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.activities).add({ data })
  await writeAudit(member, 'create', 'activity', result._id, data.title)
  return { id: result._id }
}

async function deleteActivity(openid, event) {
  const id = cleanText(event.id, 80)
  const activityResult = await db.collection(COLLECTIONS.activities).doc(id).get()
  const activity = activityResult.data || {}
  const member = await requireLegacyPortEditor(openid, 'history', 'delete', {
    organizationId: activity.organizationId || activity.teamId,
    creatorId: activity.createdBy
  })
  await db.collection(COLLECTIONS.activities).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'activity', id)
  return true
}

async function addPhoto(openid, event) {
  const activityId = cleanText(event.activityId, 80)
  const fileID = cleanText(event.fileID, 1000)
  if (!activityId || !fileID.startsWith('cloud://')) {
    throw Object.assign(new Error('照片信息不正确'), { code: 'INVALID_PHOTO' })
  }
  const activityResult = await db.collection(COLLECTIONS.activities).doc(activityId).get()
  const activity = activityResult.data || {}
  const member = await requireLegacyPortEditor(openid, 'history', 'upload', {
    organizationId: activity.organizationId || activity.teamId,
    creatorId: activity.createdBy
  })
  const count = await db.collection(COLLECTIONS.photos).where({ activityId }).count()
  const result = await db.collection(COLLECTIONS.photos).add({
    data: {
      activityId,
      fileID,
      caption: '',
      isCover: count.total === 0,
      order: count.total,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })
  await writeAudit(member, 'upload', 'photo', result._id, activityId)
  return { id: result._id }
}

async function deletePhoto(openid, event) {
  const id = cleanText(event.id, 80)
  const photoResult = await db.collection(COLLECTIONS.photos).doc(id).get()
  const photo = photoResult.data || {}
  const activityResult = photo.activityId ? await db.collection(COLLECTIONS.activities).doc(photo.activityId).get() : { data: {} }
  const activity = activityResult.data || {}
  const member = await requireLegacyPortEditor(openid, 'history', 'delete', {
    organizationId: activity.organizationId || activity.teamId,
    creatorId: activity.createdBy
  })
  await db.collection(COLLECTIONS.photos).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'photo', id)
  return true
}

function contentCollection(type) {
  return type === 'history' ? COLLECTIONS.history : COLLECTIONS.notices
}

async function listContent(openid, event) {
  await requireApproved(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const result = await db.collection(contentCollection(type)).limit(200).get()
  const items = activeItems(result.data)
  if (type === 'history') {
    return items.sort((a, b) => String(b.year || '').localeCompare(String(a.year || '')))
  }
  return items
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(item => ({ ...item, dateLabel: formatDate(item.updatedAt).slice(0, 10) }))
}

async function getContent(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(contentCollection(event.type)).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveContent(openid, event) {
  const type = event.type === 'history' ? 'history' : 'notice'
  const content = event.content || {}
  const member = await requireLegacyPortEditor(openid, 'history', event.id ? 'update' : 'create', {
    organizationId: content.organizationId || content.teamId,
    creatorId: content.createdBy
  })
  const data = {
    title: cleanText(content.title, 100),
    content: cleanText(content.content, 5000),
    updatedAt: new Date()
  }
  if (type === 'history') data.year = cleanText(content.year, 10)
  if (type === 'notice') data.pinned = Boolean(content.pinned)
  if (!data.title) throw Object.assign(new Error('请填写标题'), { code: 'INVALID_CONTENT' })
  const collection = db.collection(contentCollection(type))
  if (event.id) {
    const id = cleanText(event.id, 80)
    await collection.doc(id).update({ data })
    await writeAudit(member, 'update', type, id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await collection.add({ data })
  await writeAudit(member, 'create', type, result._id, data.title)
  return { id: result._id }
}

async function deleteContent(openid, event) {
  const type = event.type === 'history' ? 'history' : 'notice'
  const id = cleanText(event.id, 80)
  const contentResult = await db.collection(contentCollection(type)).doc(id).get()
  const content = contentResult.data || {}
  const member = await requireLegacyPortEditor(openid, 'history', 'delete', {
    organizationId: content.organizationId || content.teamId,
    creatorId: content.createdBy
  })
  await db.collection(contentCollection(type)).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', type, id)
  return true
}

async function listMembers(openid, event) {
  await requireAdmin(openid)
  const allowed = ['pending', 'approved', 'rejected']
  const status = allowed.includes(event.status) ? event.status : 'pending'
  const result = await db.collection(COLLECTIONS.members).where({ status }).limit(200).get()
  return result.data
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(item => ({
      _id: item._id,
      nickname: item.nickname,
      initial: (item.nickname || '成').slice(0, 1),
      avatarUrl: item.avatarUrl,
      role: item.role,
      status: item.status,
      createdAtLabel: formatDate(item.createdAt)
    }))
}

async function reviewMember(openid, event) {
  const member = await requireAdmin(openid)
  const status = event.status === 'approved' ? 'approved' : 'rejected'
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({
    data: { status, reviewedBy: openid, reviewedAt: new Date(), updatedAt: new Date() }
  })
  await writeAudit(member, 'review', 'member', id, status)
  return true
}

async function setMemberRole(openid, event) {
  await requireSuperAdmin(openid)
  throw Object.assign(new Error('旧管理员角色入口已停用，请使用组织角色与用户权限'), { code: 'LEGACY_PERMISSION_DISABLED' })
}

async function listAdminMembers(openid) {
  await requireAdmin(openid)
  const result = await db.collection(COLLECTIONS.members)
    .where({ status: 'approved', role: db.command.in(['admin', 'editor']) })
    .limit(200)
    .get()
  return result.data.map(item => ({
    _id: item._id,
    name: item.nickname,
    nickname: item.nickname,
    initial: (item.nickname || '管').slice(0, 1),
    team: item.team || '',
    role: item.role,
    permissions: item.permissions || []
  }))
}

async function listAdminCandidates(openid) {
  await requireSuperAdmin(openid)
  const result = await db.collection(COLLECTIONS.members)
    .where({ status: 'approved' })
    .limit(200)
    .get()
  return result.data
    .filter(item =>
      !['superadmin', 'admin', 'editor'].includes(item.role) &&
      cleanText(item.nickname, 40) && item.nickname !== '微信成员' && cleanText(item.team, 100)
    )
    .map(item => ({
      _id: item._id,
      name: item.nickname,
      nickname: item.nickname,
      initial: (item.nickname || '成').slice(0, 1),
      team: item.team || ''
    }))
}

async function saveAdminPermissions(openid, event) {
  await requireSuperAdmin(openid)
  throw Object.assign(new Error('旧板块权限入口已停用，请使用组织角色与用户权限'), { code: 'LEGACY_PERMISSION_DISABLED' })
}

async function requireLegacyAuthorizationTarget(id) {
  const result = await db.collection(COLLECTIONS.members).doc(id).get()
  const target = result.data
  if (!target || !cleanText(target.nickname, 40) || target.nickname === '微信成员' || !cleanText(target.team, 100)) {
    throw Object.assign(new Error('该用户尚未填写姓名和所属组织，暂不能授权'), { code: 'USER_PROFILE_INCOMPLETE' })
  }
  return target
}

async function getAdminStats(openid) {
  await requireEditor(openid)
  const [tasks, org, activities] = await Promise.all([
    db.collection(COLLECTIONS.tasks).count(),
    db.collection(COLLECTIONS.org).count(),
    db.collection(COLLECTIONS.activities).count()
  ])
  return {
    taskCount: tasks.total,
    orgCount: org.total,
    activityCount: activities.total,
    hasSeedData: tasks.total > 0 || org.total > 0
  }
}

async function listAuditLogs(openid) {
  await requireAdmin(openid)
  const result = await db.collection(COLLECTIONS.auditLogs).limit(300).get()
  const labels = {
    create: '新增',
    update: '修改',
    delete: '移入回收站',
    upload: '上传',
    review: '成员确认',
    role: '权限变更'
  }
  return result.data
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(item => ({ ...item, actionLabel: labels[item.action] || item.action, createdAtLabel: formatDate(item.createdAt) }))
}

const seedOrg = [
  ['第一副队长', '李晶', '', 10],
  ['会员发展与保留委员会主席', '徐雪峰', '会员发展与保留委员会', 11],
  ['领导力发展培训委员会主席', '李明浩', '领导力发展培训委员会', 12],
  ['对外交流委员会主席', '吕媛媛', '对外交流委员会', 13],
  ['第二副队长', '张芳', '', 20],
  ['服务与计划委员会主席', '李珊珊', '服务与计划委员会', 21],
  ['筹款委员会主席', '荆立月', '筹款委员会', 22],
  ['新闻与宣传委员会主席', '杨景辉', '新闻与宣传委员会', 23],
  ['第三副队长', '徐双龙', '', 30],
  ['狮友关爱委员会主席', '刘建鑫', '狮友关爱委员会', 31],
  ['狮友联谊委员会主席', '景雅东', '狮友联谊委员会', 32],
  ['年会委员会主席', '李文强', '年会委员会', 33],
  ['司库', '王奇', '', 40],
  ['总务', '刘泉宏', '', 50],
  ['纠察', '潘洋洋', '', 60],
  ['秘书', '张明星', '', 70]
]

async function seedData(openid) {
  const member = await requireEditor(openid)
  const orgCount = await db.collection(COLLECTIONS.org).count()
  const now = new Date()
  if (orgCount.total === 0) {
    await Promise.all(seedOrg.map(item => db.collection(COLLECTIONS.org).add({
      data: {
        position: item[0],
        person: item[1],
        committee: item[2],
        order: item[3],
        description: item[2] === '新闻与宣传委员会'
          ? '每次活动结束后，主席需要收集所有照片和信息并存储至网盘。'
          : '',
        createdAt: now,
        updatedAt: now
      }
    })))
  }
  await writeAudit(member, 'create', 'seed', 'initial-data', '导入文档初始数据')
  return true
}

async function adminAccountByUsername(username) {
  const result = await db.collection(COLLECTIONS.adminAccount)
    .where({ username: cleanText(username, 60).toLowerCase(), status: 'active' })
    .limit(1)
    .get()
  return result.data[0] || null
}

async function adminOperatorFromAccount(account) {
  const result = await db.collection(COLLECTIONS.user).where({ id: account.userId, status: 'active' }).limit(1).get()
  const user = result.data[0]
  if (!user) throw Object.assign(new Error('绑定的成员账号不可用'), { code: 'ADMIN_USER_DISABLED' })
  const roles = await platformRoles(user.id)
  if (!roles.some(item => ['super_admin', 'area_admin', 'region_admin', 'team_admin'].includes(item.role))) {
    throw Object.assign(new Error('当前账号已无管理员权限'), { code: 'ADMIN_ROLE_REQUIRED' })
  }
  return { ...user, roles }
}

async function issueAdminSession(account, user) {
  const accessToken = randomToken()
  const refreshToken = randomToken()
  const timestamp = Date.now()
  const data = {
    id: businessId('admin_session'),
    accountId: account.id,
    userId: user.id,
    accessTokenHash: tokenHash(accessToken),
    refreshTokenHash: tokenHash(refreshToken),
    accessExpiresAt: new Date(timestamp + ADMIN_ACCESS_TTL),
    refreshExpiresAt: new Date(timestamp + ADMIN_REFRESH_TTL),
    status: 'active',
    createdAt: now(),
    updatedAt: now()
  }
  await db.collection(COLLECTIONS.adminSession).add({ data })
  return {
    accessToken,
    refreshToken,
    expiresIn: ADMIN_ACCESS_TTL / 1000,
    user: { id: user.id, name: user.name, roles: user.roles }
  }
}

async function requireAdminSession(event = {}) {
  const hash = tokenHash(event.adminToken)
  const result = await db.collection(COLLECTIONS.adminSession)
    .where({ accessTokenHash: hash, status: 'active' })
    .limit(1)
    .get()
  const session = result.data[0]
  if (!session || new Date(session.accessExpiresAt).getTime() <= Date.now()) {
    throw Object.assign(new Error('后台会话已过期'), { code: 'ADMIN_SESSION_EXPIRED' })
  }
  const accountResult = await db.collection(COLLECTIONS.adminAccount).where({ id: session.accountId, status: 'active' }).limit(1).get()
  const account = accountResult.data[0]
  if (!account) throw Object.assign(new Error('后台账号已停用'), { code: 'ADMIN_ACCOUNT_DISABLED' })
  return { session, account, user: await adminOperatorFromAccount(account) }
}

async function bootstrapAdminAccount(openid, event = {}) {
  const secret = cleanText(process.env.ADMIN_BOOTSTRAP_SECRET, 200)
  if (!secret || cleanText(event.bootstrapSecret, 200) !== secret) {
    throw Object.assign(new Error('初始化密钥无效'), { code: 'ADMIN_BOOTSTRAP_DENIED' })
  }
  const username = cleanText(event.username, 60).toLowerCase()
  const password = String(event.password || '')
  const userId = cleanText(event.userId, 100)
  if (!/^[a-z0-9_.-]{4,60}$/.test(username) || password.length < 12 || !userId) {
    throw Object.assign(new Error('账号需至少 4 位，密码需至少 12 位'), { code: 'INVALID_ADMIN_ACCOUNT' })
  }
  const existingCount = await db.collection(COLLECTIONS.adminAccount).count()
  if (existingCount.total) throw Object.assign(new Error('初始管理员已存在'), { code: 'ADMIN_ALREADY_BOOTSTRAPPED' })
  const userResult = await db.collection(COLLECTIONS.user).where({ id: userId, status: 'active' }).limit(1).get()
  const user = userResult.data[0]
  if (!user) throw Object.assign(new Error('未找到绑定成员'), { code: 'ADMIN_USER_NOT_FOUND' })
  const roles = await platformRoles(userId)
  if (!roles.some(item => item.role === 'super_admin')) {
    throw Object.assign(new Error('首个后台账号必须绑定超级管理员'), { code: 'SUPER_ADMIN_REQUIRED' })
  }
  const totpSecret = authenticator.generateSecret()
  const recoveryCode = randomToken(12)
  const data = {
    id: businessId('admin_account'), username, userId,
    passwordHash: passwordHash(password), totpSecret,
    recoveryCodeHash: tokenHash(recoveryCode), status: 'active', failedAttempts: 0,
    createdAt: now(), updatedAt: now()
  }
  await db.collection(COLLECTIONS.adminAccount).add({ data })
  return {
    username,
    totpSecret,
    otpauth: authenticator.keyuri(username, '21纪事本管理后台', totpSecret),
    recoveryCode
  }
}

async function adminLogin(openid, event = {}) {
  const account = await adminAccountByUsername(event.username)
  if (!account) throw Object.assign(new Error('账号或密码错误'), { code: 'ADMIN_LOGIN_FAILED' })
  if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) {
    throw Object.assign(new Error('尝试次数过多，请稍后再试'), { code: 'ADMIN_ACCOUNT_LOCKED' })
  }
  if (!passwordMatches(event.password, account.passwordHash)) {
    const failedAttempts = Number(account.failedAttempts || 0) + 1
    await db.collection(COLLECTIONS.adminAccount).doc(account._id).update({ data: {
      failedAttempts,
      lockedUntil: failedAttempts >= ADMIN_MAX_FAILURES ? new Date(Date.now() + 15 * 60 * 1000) : null,
      updatedAt: now()
    } })
    throw Object.assign(new Error('账号或密码错误'), { code: 'ADMIN_LOGIN_FAILED' })
  }
  const user = await adminOperatorFromAccount(account)
  await db.collection(COLLECTIONS.adminAccount).doc(account._id).update({ data: {
    failedAttempts: 0, lockedUntil: null, lastLoginAt: now(),
    updatedAt: now()
  } })
  await writePlatformLog(user, 'admin_login', 'admin_account', account.id, { username: account.username })
  return issueAdminSession(account, user)
}

async function adminRefresh(openid, event = {}) {
  const hash = tokenHash(event.refreshToken)
  const result = await db.collection(COLLECTIONS.adminSession).where({ refreshTokenHash: hash, status: 'active' }).limit(1).get()
  const session = result.data[0]
  if (!session || new Date(session.refreshExpiresAt).getTime() <= Date.now()) {
    throw Object.assign(new Error('刷新会话已过期'), { code: 'ADMIN_REFRESH_EXPIRED' })
  }
  const accountResult = await db.collection(COLLECTIONS.adminAccount).where({ id: session.accountId, status: 'active' }).limit(1).get()
  const account = accountResult.data[0]
  const user = account && await adminOperatorFromAccount(account)
  if (!user) throw Object.assign(new Error('后台账号不可用'), { code: 'ADMIN_ACCOUNT_DISABLED' })
  await db.collection(COLLECTIONS.adminSession).doc(session._id).update({ data: { status: 'rotated', updatedAt: now() } })
  return issueAdminSession(account, user)
}

async function adminLogout(openid, event = {}) {
  const auth = await requireAdminSession(event)
  await db.collection(COLLECTIONS.adminSession).doc(auth.session._id).update({ data: { status: 'revoked', updatedAt: now() } })
  return true
}

async function adminChangePassword(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const currentPassword = String(event.currentPassword || '')
  const newPassword = String(event.newPassword || '')
  if (!passwordMatches(currentPassword, auth.account.passwordHash)) {
    throw Object.assign(new Error('当前密码不正确'), { code: 'ADMIN_CURRENT_PASSWORD_INVALID' })
  }
  if (newPassword.length < 12) {
    throw Object.assign(new Error('新密码至少需要 12 位'), { code: 'ADMIN_PASSWORD_TOO_SHORT' })
  }
  if (currentPassword === newPassword) {
    throw Object.assign(new Error('新密码不能与当前密码相同'), { code: 'ADMIN_PASSWORD_UNCHANGED' })
  }
  const timestamp = now()
  const sessions = await db.collection(COLLECTIONS.adminSession).where({ accountId: auth.account.id, status: 'active' }).limit(100).get()
  await db.collection(COLLECTIONS.adminAccount).doc(auth.account._id).update({ data: {
    passwordHash: passwordHash(newPassword), failedAttempts: 0, lockedUntil: null, passwordChangedAt: timestamp, updatedAt: timestamp
  } })
  await Promise.all(sessions.data.map(item => db.collection(COLLECTIONS.adminSession).doc(item._id).update({ data: { status: 'revoked', updatedAt: timestamp } })))
  await writePlatformLog(auth.user, 'change_admin_password', 'admin_account', auth.account.id, {})
  return true
}

function adminAllowedOrganizationIds(user, organizations) {
  const activeRoles = user.roles.filter(item => item.status !== 'inactive' && item.status !== 'revoked')
  if (activeRoles.some(item => item.role === 'super_admin')) return organizations.map(item => item.id)
  const allowed = new Set()
  const areaRoles = activeRoles.filter(item => ['area_admin', 'region_admin'].includes(item.role))
  if (areaRoles.length) {
    organizations.forEach(org => {
      if (org.type === 'team' || areaRoles.some(role => org.id === canonicalOrganizationId(role.organizationId))) {
        allowed.add(org.id)
      }
    })
  }
  activeRoles.forEach(role => {
    if (!['area_admin', 'region_admin', 'team_admin'].includes(role.role)) return
    organizations.forEach(org => {
      const organizationId = canonicalOrganizationId(role.organizationId)
      if (org.id === organizationId || (org.ancestorIds || []).map(canonicalOrganizationId).includes(organizationId)) allowed.add(org.id)
    })
  })
  return Array.from(allowed)
}

async function adminGraph(openid, event = {}) {
  const { user } = await requireAdminSession(event)
  const [orgResult, userResult, positionResult, roleResult, assignmentResult, grantResult, portResult] = await Promise.all([
    db.collection(COLLECTIONS.organization).where({ status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.user).limit(500).get(),
    db.collection(COLLECTIONS.position).where({ status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.userRole).where({ status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.roleAssignment).where({ status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.permissionGrant).where({ status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.userPermissions).where({ status: 'active' }).limit(500).get()
  ])
  const allowedIds = adminAllowedOrganizationIds(user, orgResult.data)
  const selectedId = canonicalOrganizationId(event.organizationId)
  const visibleIds = selectedId && allowedIds.includes(selectedId) ? [selectedId] : allowedIds
  const inScope = item => !item.organizationId || visibleIds.includes(canonicalOrganizationId(item.organizationId || item.teamId))
  const assignments = assignmentResult.data.filter(inScope)
  const grants = grantResult.data.filter(inScope)
  const portPermissions = portResult.data.filter(item => visibleIds.includes(canonicalOrganizationId(item.teamId)))
  const userIds = new Set(assignments.concat(grants, portPermissions).map(item => item.userId).concat(roleResult.data.filter(inScope).map(item => item.userId)))
  userResult.data.filter(item => visibleIds.includes(canonicalOrganizationId(item.defaultOrganizationId))).forEach(item => userIds.add(item.id))
  if (user.roles.some(item => item.role === 'super_admin')) userResult.data.forEach(item => userIds.add(item.id))
  const visibleUsers = userResult.data.filter(item => userIds.has(item.id) && item.status !== 'deleted')
  const normalizedMemberName = name => cleanText(name, 100).replace(/^[^—-]{1,20}[—-]/, '')
  const deduplicatedUsers = new Map()
  visibleUsers
    .slice()
    .sort((a, b) => Number(Boolean(b.openid)) - Number(Boolean(a.openid)) || Number(!String(b.id).startsWith('directory_')) - Number(!String(a.id).startsWith('directory_')))
    .forEach(item => {
      const key = `${canonicalOrganizationId(item.defaultOrganizationId)}:${normalizedMemberName(item.name)}`
      if (!deduplicatedUsers.has(key)) deduplicatedUsers.set(key, item)
    })
  return {
    viewer: { id: user.id, name: user.name, roles: user.roles, allowedOrganizationIds: allowedIds },
    organizations: orgResult.data.filter(item => visibleIds.includes(item.id)),
    users: Array.from(deduplicatedUsers.values()).map(item => ({
      id: item.id,
      name: item.name,
      organizationId: item.defaultOrganizationId,
      memberCode: item.memberCode || '',
      status: item.status || 'pending',
      profileCompleted: Boolean(item.profileCompleted || (item.name && !item.name.startsWith('待认证用户-')))
    })),
    positions: positionResult.data.filter(inScope),
    roles: roleResult.data.filter(inScope), assignments, grants, portPermissions
  }
}

function validateGraphDraft(draft = {}) {
  const normalized = {
    id: cleanText(draft.id, 100), userId: cleanText(draft.userId, 100),
    organizationId: canonicalOrganizationId(draft.organizationId),
    module: cleanText(draft.module, 30), actions: Array.from(new Set((draft.actions || []).map(item => cleanText(item, 20)))),
    scopeType: cleanText(draft.scopeType, 30), scopeId: cleanText(draft.scopeId, 140),
    startDate: cleanText(draft.startDate, 10), endDate: cleanText(draft.endDate, 10),
    roleCode: cleanText(draft.roleCode, 30),
    capabilities: Array.from(new Set((draft.capabilities || []).map(item => cleanText(item, 20))))
  }
  if (!normalized.userId || !normalized.organizationId || !PERMISSION_MODULES.includes(normalized.module) ||
      !normalized.actions.length || normalized.actions.some(item => !PERMISSION_ACTIONS.includes(item)) ||
      !PERMISSION_SCOPES.includes(normalized.scopeType) || !normalized.startDate || !normalized.endDate) {
    throw Object.assign(new Error('请补全用户、组织、模块、操作、范围和任期'), { code: 'INVALID_GRAPH_GRANT' })
  }
  if (normalized.actions.some(item => !(PERMISSION_MODULE_ACTIONS[normalized.module] || []).includes(item))) {
    throw Object.assign(new Error('所选界面不支持其中一项操作'), { code: 'INVALID_GRAPH_GRANT_ACTION' })
  }
  if (['position', 'position_tree'].includes(normalized.scopeType) && !normalized.scopeId) {
    throw Object.assign(new Error('岗位权限必须指定岗位'), { code: 'POSITION_SCOPE_REQUIRED' })
  }
  if (normalized.startDate > normalized.endDate) throw Object.assign(new Error('开始日期不能晚于结束日期'), { code: 'INVALID_GRAPH_GRANT_DATE' })
  if (normalized.roleCode) {
    const allowedRoles = ['super_admin', 'team_admin']
    const allowedCapabilities = ['create', 'delete', 'update', 'search', 'access']
    if (!allowedRoles.includes(normalized.roleCode) || !normalized.capabilities.length || normalized.capabilities.some(item => !allowedCapabilities.includes(item))) {
      throw Object.assign(new Error('管理员角色或权限不正确'), { code: 'INVALID_ADMIN_ROLE_GRANT' })
    }
    if (normalized.roleCode === 'super_admin' && (normalized.scopeType !== 'global' || normalized.organizationId !== 'org_federation_china' || normalized.capabilities.length !== allowedCapabilities.length)) {
      throw Object.assign(new Error('超级管理员必须使用全体范围和全部权限'), { code: 'INVALID_SUPER_ADMIN_GRANT' })
    }
    if (normalized.roleCode === 'team_admin' && normalized.scopeType !== 'organization') {
      throw Object.assign(new Error('服务队管理员只能使用本服务队范围'), { code: 'INVALID_TEAM_ADMIN_GRANT' })
    }
  }
  return normalized
}

async function adminGrantPreflight(openid, event = {}, existingAuth = null) {
  const draft = validateGraphDraft(event.draft)
  const [auth, organizationResult] = await Promise.all([
    existingAuth || requireAdminSession(event),
    db.collection(COLLECTIONS.organization).where({ status: 'active' }).limit(500).get(),
    requireAuthorizationTarget(draft.userId)
  ])
  const { user } = auth
  const organizations = organizationResult.data
  if (draft.module === 'ledger' && draft.actions.some(item => item !== 'read')) {
    throw Object.assign(new Error('财务账目对所有成员只读，维护操作仅限超级管理员'), { code: 'LEDGER_GRANT_READ_ONLY' })
  }
  if (draft.roleCode === 'team_admin' && draft.capabilities.includes('delete')) {
    throw Object.assign(new Error('服务队管理员不能获得删除权限'), { code: 'TEAM_ADMIN_DELETE_DENIED' })
  }
  if (draft.roleCode === 'team_admin') {
    const existingTeamRoles = (await db.collection(COLLECTIONS.userRole)
      .where({ userId: draft.userId, role: 'team_admin' })
      .limit(100)
      .get()).data
    if (existingTeamRoles.some(item => canonicalOrganizationId(item.organizationId) !== draft.organizationId)) {
      throw Object.assign(new Error('服务队管理员的所属服务队首次设置后不可变更'), { code: 'TEAM_ADMIN_ORGANIZATION_LOCKED' })
    }
  }
  if (!adminAllowedOrganizationIds(user, organizations).includes(draft.organizationId)) {
    throw Object.assign(new Error('不能超出当前管理范围授权'), { code: 'AUTHORIZATION_SCOPE_DENIED' })
  }
  if (draft.roleCode === 'team_admin') {
    const team = organizations.find(item => item.id === draft.organizationId && item.type === 'team')
    if (!team) throw Object.assign(new Error('请选择有效的服务队'), { code: 'INVALID_TEAM_ADMIN_ORGANIZATION' })
  }
  if (['position', 'position_tree'].includes(draft.scopeType)) {
    const positionResult = await db.collection(COLLECTIONS.position)
      .where({ id: draft.scopeId, organizationId: draft.organizationId, status: 'active' })
      .limit(1).get()
    if (!positionResult.data[0]) {
      throw Object.assign(new Error('所选岗位不属于授权组织'), { code: 'INVALID_AUTHORIZATION_POSITION' })
    }
  }
  const roleLabel = draft.roleCode === 'super_admin' ? '超级管理员' : draft.roleCode === 'team_admin' ? '服务队管理员' : ''
  const capabilityLabels = { create: '创建', delete: '删除', update: '修改', search: '查找', access: '访问' }
  const impact = roleLabel
    ? `将设为${roleLabel}，范围为${draft.roleCode === 'super_admin' ? '全体' : '本服务队'}，权限为${draft.capabilities.map(item => capabilityLabels[item]).join('/')}，有效期 ${draft.startDate} 至 ${draft.endDate}`
    : `将授予 ${draft.module} 模块 ${draft.actions.join('/')}权限，有效期 ${draft.startDate} 至 ${draft.endDate}`
  return { draft, impact }
}

async function adminGrantCommit(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const checked = await adminGrantPreflight(openid, event, auth)
  const draft = checked.draft
  const existing = draft.id ? await db.collection(COLLECTIONS.permissionGrant).where({ id: draft.id }).limit(1).get() : { data: [] }
  const id = draft.id || businessId('grant')
  const data = { ...draft, id, status: 'active', grantedBy: auth.user.id, updatedAt: now() }
  if (existing.data[0]) await db.collection(COLLECTIONS.permissionGrant).doc(existing.data[0]._id).update({ data })
  else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.permissionGrant).add({ data })
  }
  if (draft.roleCode) {
    const [roleResult, portResult] = await Promise.all([
      db.collection(COLLECTIONS.userRole).where({ sourcePermissionId: id }).limit(1).get(),
      draft.roleCode === 'team_admin'
        ? db.collection(COLLECTIONS.userPermissions).where({ userId: draft.userId, status: 'active' }).limit(100).get()
        : Promise.resolve({ data: [] })
    ])
    const roleData = {
      id: roleResult.data[0] ? roleResult.data[0].id : businessId('role'), sourcePermissionId: id,
      userId: draft.userId, organizationId: draft.organizationId, role: draft.roleCode,
      startDate: draft.startDate, endDate: draft.endDate, expiresAt: draft.endDate,
      status: 'active', grantedBy: auth.user.id, grantedAt: now(), updatedAt: now()
    }
    const roleWrite = roleResult.data[0]
      ? db.collection(COLLECTIONS.userRole).doc(roleResult.data[0]._id).update({ data: roleData })
      : (() => { roleData.createdAt = now(); return db.collection(COLLECTIONS.userRole).add({ data: roleData }) })()
    if (draft.roleCode === 'team_admin') {
      const capabilityActions = Array.from(new Set(draft.capabilities.map(item => ['search', 'access'].includes(item) ? 'read' : item)))
      const permissions = {}
      Object.entries(PORT_PERMISSION_ACTIONS).forEach(([module, supported]) => {
        permissions[module] = capabilityActions.filter(action => supported.includes(action))
      })
      permissions.finance = ['read']
      const linkedPort = portResult.data.find(item => item.sourcePermissionId === id) || portResult.data.find(item =>
        item.roleCode === 'team_admin' && canonicalOrganizationId(item.teamId) === draft.organizationId)
      const portData = {
        id: linkedPort ? linkedPort.id : businessId('user_permission'), sourcePermissionId: id,
        userId: draft.userId, userName: '', teamId: draft.organizationId,
        roleCode: 'team_admin', roleName: '服务队管理员', dataScope: 'team', positionId: '',
        permissions, startDate: draft.startDate, endDate: draft.endDate,
        status: 'active', grantedBy: auth.user.id, updatedAt: now()
      }
      const portWrite = linkedPort
        ? db.collection(COLLECTIONS.userPermissions).doc(linkedPort._id).update({ data: portData })
        : (() => { portData.createdAt = now(); return db.collection(COLLECTIONS.userPermissions).add({ data: portData }) })()
      await Promise.all([roleWrite, portWrite])
    } else {
      await roleWrite
    }
  }
  await writePlatformLog(auth.user, existing.data[0] ? 'update_permission' : 'grant_permission', 'permission_grant', id, data)
  return data
}

async function adminGrantRevoke(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const id = cleanText(event.id, 100)
  const result = await db.collection(COLLECTIONS.permissionGrant).where({ id, status: 'active' }).limit(1).get()
  const grant = result.data[0]
  if (!grant) return true
  await adminGrantPreflight(openid, { ...event, draft: grant })
  await db.collection(COLLECTIONS.permissionGrant).doc(grant._id).update({ data: { status: 'revoked', revokedAt: now(), updatedAt: now() } })
  const linkedRoles = await db.collection(COLLECTIONS.userRole).where({ sourcePermissionId: id, status: 'active' }).limit(20).get()
  const linkedPortPermissions = await db.collection(COLLECTIONS.userPermissions).where({ sourcePermissionId: id, status: 'active' }).limit(20).get()
  await Promise.all([
    ...linkedRoles.data.map(item => db.collection(COLLECTIONS.userRole).doc(item._id).update({ data: { status: 'inactive', updatedAt: now() } })),
    ...linkedPortPermissions.data.map(item => db.collection(COLLECTIONS.userPermissions).doc(item._id).update({ data: { status: 'deleted', updatedAt: now() } }))
  ])
  await writePlatformLog(auth.user, 'revoke_permission', 'permission_grant', id, grant)
  return true
}

async function adminSaveUserPermissions(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const input = event.userPermissions || {}
  const isSuperAdmin = auth.user.roles.some(item => item.role === 'super_admin' && item.status === 'active')
  const isAreaAdmin = auth.user.roles.some(item => ['area_admin', 'region_admin'].includes(item.role) && item.status === 'active')
  if (isAreaAdmin && !isSuperAdmin) {
    const organizations = (await db.collection(COLLECTIONS.organization).where({ status: 'active' }).limit(500).get()).data
    const teamId = canonicalOrganizationId(input.teamId)
    if (!adminAllowedOrganizationIds(auth.user, organizations).includes(teamId)) {
      throw Object.assign(new Error('协作区管理员不能超出本协作区授权'), { code: 'AREA_ADMIN_SCOPE_DENIED' })
    }
    if (['super_admin', 'area_admin'].includes(cleanText(input.roleCode, 100))) {
      throw Object.assign(new Error('协作区管理员不能授予主管理员或协作区管理员角色'), { code: 'AREA_ADMIN_ROLE_GRANT_DENIED' })
    }
    const permissions = sanitizePortPermissions(input.permissions)
    if ((permissions.finance || []).some(action => action !== 'read')) {
      throw Object.assign(new Error('财务账目维护权限仅限超级管理员'), { code: 'AREA_ADMIN_FINANCE_DENIED' })
    }
  } else if (!isSuperAdmin) {
    const teamIds = auth.user.roles.filter(item => item.role === 'team_admin' && item.status === 'active').map(item => canonicalOrganizationId(item.organizationId))
    const teamId = canonicalOrganizationId(input.teamId)
    const permissions = sanitizePortPermissions(input.permissions)
    const hasForbiddenAction = Object.values(permissions).flat().some(action => action === 'delete') ||
      (permissions.finance || []).some(action => action !== 'read') ||
      (permissions.permission || []).some(action => action !== 'read')
    if (!teamIds.includes(teamId)) {
      throw Object.assign(new Error('服务队管理员只能维护本服务队权限'), { code: 'TEAM_ADMIN_SCOPE_DENIED' })
    }
    if (['super_admin', 'area_admin'].concat(TEAM_SCOPED_ADMIN_ROLE_CODES).includes(cleanText(input.roleCode, 100))) {
      throw Object.assign(new Error('服务队管理员不能授予管理员角色'), { code: 'TEAM_ADMIN_ROLE_GRANT_DENIED' })
    }
    if (cleanText(input.dataScope, 20) === 'district' || hasForbiddenAction) {
      throw Object.assign(new Error('服务队管理员不能授予跨队、删除、财务维护或权限管理操作'), { code: 'TEAM_ADMIN_PERMISSION_DENIED' })
    }
  }
  return saveUserPermissions(openid, event, auth.user)
}

async function adminRevokeUserPermissions(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const isSuperAdmin = auth.user.roles.some(item => item.role === 'super_admin' && item.status === 'active')
  const isAreaAdmin = auth.user.roles.some(item => ['area_admin', 'region_admin'].includes(item.role) && item.status === 'active')
  if (isAreaAdmin && !isSuperAdmin) {
    const id = cleanText(event.id, 100)
    const [result, organizationsResult] = await Promise.all([
      db.collection(COLLECTIONS.userPermissions).where({ id, status: 'active' }).limit(1).get(),
      db.collection(COLLECTIONS.organization).where({ status: 'active' }).limit(500).get()
    ])
    const grant = result.data[0]
    const allowedIds = adminAllowedOrganizationIds(auth.user, organizationsResult.data)
    if (!grant || !allowedIds.includes(canonicalOrganizationId(grant.teamId)) || ['super_admin', 'area_admin'].includes(grant.roleCode)) {
      throw Object.assign(new Error('协作区管理员只能撤销本协作区下属权限'), { code: 'AREA_ADMIN_REVOKE_DENIED' })
    }
  } else if (!isSuperAdmin) {
    const id = cleanText(event.id, 100)
    const result = await db.collection(COLLECTIONS.userPermissions).where({ id, status: 'active' }).limit(1).get()
    const grant = result.data[0]
    const teamIds = auth.user.roles.filter(item => item.role === 'team_admin' && item.status === 'active').map(item => canonicalOrganizationId(item.organizationId))
    if (!grant || !teamIds.includes(canonicalOrganizationId(grant.teamId)) || ['super_admin', 'area_admin'].concat(TEAM_SCOPED_ADMIN_ROLE_CODES).includes(grant.roleCode)) {
      throw Object.assign(new Error('服务队管理员只能撤销本服务队的成员或岗位权限'), { code: 'TEAM_ADMIN_REVOKE_DENIED' })
    }
  }
  return revokeUserPermissions(openid, event, auth.user)
}

async function adminDeleteUser(openid, event = {}) {
  const auth = await requireAdminSession(event)
  const isSuperAdmin = auth.user.roles.some(item => item.role === 'super_admin' && item.status === 'active')
  const isAreaAdmin = auth.user.roles.some(item => ['area_admin', 'region_admin'].includes(item.role) && item.status === 'active')
  if (!isSuperAdmin && !isAreaAdmin) {
    throw Object.assign(new Error('只有超级管理员或协作区管理员可以删除用户'), { code: 'AREA_ADMIN_REQUIRED' })
  }
  const userId = cleanText(event.userId, 100)
  if (!userId || userId === auth.user.id) {
    throw Object.assign(new Error('不能删除当前登录的超级管理员'), { code: 'ADMIN_SELF_DELETE_DENIED' })
  }
  const [userResult, roleResult] = await Promise.all([
    db.collection(COLLECTIONS.user).where({ id: userId }).limit(1).get(),
    db.collection(COLLECTIONS.userRole).where({ userId, status: 'active' }).limit(100).get()
  ])
  const target = userResult.data[0]
  if (!target) return true
  if (!isSuperAdmin) {
    const organizations = (await db.collection(COLLECTIONS.organization).where({ status: 'active' }).limit(500).get()).data
    if (!adminAllowedOrganizationIds(auth.user, organizations).includes(canonicalOrganizationId(target.defaultOrganizationId))) {
      throw Object.assign(new Error('协作区管理员不能删除管理范围外用户'), { code: 'AREA_ADMIN_SCOPE_DENIED' })
    }
  }
  if (roleResult.data.some(item => item.role === 'super_admin')) {
    throw Object.assign(new Error('请先撤销该用户的超级管理员角色'), { code: 'SUPER_ADMIN_DELETE_DENIED' })
  }
  const timestamp = now()
  const [portResult, grantResult] = await Promise.all([
    db.collection(COLLECTIONS.userPermissions).where({ userId, status: 'active' }).limit(500).get(),
    db.collection(COLLECTIONS.permissionGrant).where({ userId, status: 'active' }).limit(500).get()
  ])
  await Promise.all([
    db.collection(COLLECTIONS.user).doc(target._id).update({ data: { status: 'deleted', deletedAt: timestamp, updatedAt: timestamp } }),
    ...roleResult.data.map(item => db.collection(COLLECTIONS.userRole).doc(item._id).update({ data: { status: 'inactive', updatedAt: timestamp } })),
    ...portResult.data.map(item => db.collection(COLLECTIONS.userPermissions).doc(item._id).update({ data: { status: 'deleted', updatedAt: timestamp } })),
    ...grantResult.data.map(item => db.collection(COLLECTIONS.permissionGrant).doc(item._id).update({ data: { status: 'revoked', revokedAt: timestamp, updatedAt: timestamp } }))
  ])
  await writePlatformLog(auth.user, 'delete_user', 'user', userId, { name: target.name })
  return true
}

const handlers = {
  bootstrapAdminAccount,
  adminLogin,
  adminRefresh,
  adminLogout,
  adminChangePassword,
  adminGraph,
  adminGrantPreflight,
  adminGrantCommit,
  adminGrantRevoke,
  adminSaveUserPermissions,
  adminRevokeUserPermissions,
  adminDeleteUser,
  getSession,
  bootstrapV2,
  getPlatformSession,
  saveMyProfile,
  saveUserMemberCode,
  listProfileOrganizations,
  bootstrapGovernance,
  listPositions,
  listPositionDirectory,
  savePositionDirectory,
  listRoleAssignments,
  listPlatformUsers,
  listUserRoles,
  listPermissionGrants,
  listUserPermissions,
  saveUserRole,
  savePermissionGrant,
  saveUserPermissions,
  revokeUserRole,
  revokePermissionGrant,
  revokeUserPermissions,
  saveRoleAssignment,
  listOrganizations,
  listEventRecords,
  saveEventRecord,
  getEventRecord,
  archiveEventRecord,
  listHonorConfirmations,
  listHonorVerifications,
  confirmArchiveEvent,
  confirmGrantHonor,
  markHonorNotGranted,
  verifyHonorForWall,
  markHonorNeedRecheck,
  getArchiveHonorStats,
  listEventImages,
  saveEventImages,
  saveFileRecord,
  listMediaAlbums,
  listMediaTeams: mediaAvailableTeams,
  getMediaAlbum,
  saveMediaAlbum,
  deleteMediaFile,
  deleteMediaAlbum,
  createMediaShare,
  getMediaShare,
  createMediaExport,
  listLedgerRecords,
  saveLedgerRecord,
  deleteLedgerRecord,
  listHonorRecords,
  saveHonorRecord,
  deleteHonorRecord,
  getHome,
  listTasks,
  getTask,
  saveTask,
  deleteTask,
  completeTask,
  reopenTask,
  listMembers: listDirectoryMembers,
  getMember,
  saveMember,
  deleteMember,
  listOrg,
  listHomeBanners,
  saveHomeBanners,
  getOrg,
  saveOrg,
  deleteOrg,
  listActivities,
  getActivity,
  saveActivity,
  deleteActivity,
  addPhoto,
  deletePhoto,
  listContent,
  getContent,
  saveContent,
  deleteContent,
  listAdminMembers,
  listAdminCandidates,
  saveAdminPermissions,
  setMemberRole,
  getAdminStats,
  listAuditLogs,
  seedData
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID && !WEB_ADMIN_ACTIONS.has(event.action)) {
    return fail('ANONYMOUS_ACTION_DENIED', '匿名会话无权访问该接口')
  }
  const handler = handlers[event.action]
  if (!handler) return fail('UNKNOWN_ACTION', '不支持的操作')
  try {
    return success(await handler(OPENID, event))
  } catch (error) {
    console.error(event.action, error)
    return fail(error.code || 'SERVER_ERROR', error.message || '服务暂不可用')
  }
}
