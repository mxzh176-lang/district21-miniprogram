const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const COLLECTIONS = {
  organization: 'organization',
  user: 'user',
  userRole: 'user_role',
  permissionGrant: 'permission_grant',
  position: 'position',
  roleAssignment: 'role_assignment',
  eventRecord: 'event_record',
  eventImage: 'event_image',
  operationLog: 'operation_log',
  ledgerRecord: 'ledger_record',
  honorRecord: 'honor_record',
  members: 'members',
  tasks: 'tasks',
  org: 'org_units',
  activities: 'activities',
  photos: 'photos',
  notices: 'notices',
  history: 'history',
  auditLogs: 'audit_logs'
}

const success = (data = null) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })
const cleanText = (value, maxLength = 200) => String(value || '').trim().slice(0, maxLength)
const activeItems = items => items.filter(item => !item.deletedAt)
const now = () => new Date()

function businessId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
  return roles.some(item =>
    item.status === 'active' &&
    ['federation_admin', 'office_admin', 'region_admin', 'area_admin', 'team_admin'].includes(item.role) &&
    scopeIds.includes(item.organizationId)
  )
}

async function requireEventEditor(openid, record = {}, action = 'update') {
  const user = await requirePlatformUser(openid)
  if (await canAdministerOrganization(user.id, record.organizationId)) return user
  const permissionContext = {
    organizationId: record.organizationId || record.teamId,
    positionId: record.positionId || record.categoryId
  }
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
  return result.data
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
  const [baseRoles, assignments, grants] = await Promise.all([
    platformRoles(user.id),
    activeRoleAssignments(user.id),
    activePermissionGrants(user.id)
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
  return {
    _id: user.id,
    id: user.id,
    nickname: user.name,
    avatarUrl: user.avatar || '',
    status: user.status === 'active' ? 'approved' : 'pending',
    role: legacyRole,
    platformRole: primaryRole,
    roles,
    grants,
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
    updatedAt: now(),
    lastLoginAt: now()
  }
  await db.collection(COLLECTIONS.user).doc(user._id).update({ data })
  await writePlatformLog({ ...user, name }, 'update_profile', 'user', user.id, {
    name,
    organizationId
  })
  return {
    id: user.id,
    name,
    organizationId,
    status: user.status
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

const PERMISSION_MODULES = ['all', 'archives', 'contacts', 'tasks', 'history', 'notices', 'photos', 'honors']
const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete']
const PERMISSION_SCOPES = ['global', 'organization', 'organization_tree', 'position', 'position_tree']

async function requirePermissionGrantAdmin(openid) {
  return requireAssignmentAdmin(openid)
}

async function listPermissionGrants(openid, event = {}) {
  await requirePermissionGrantAdmin(openid)
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
  await requireAssignmentAdmin(openid)
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
  if (!userId || !organizationId) {
    throw Object.assign(new Error('用户和管理组织不能为空'), { code: 'INVALID_USER_ROLE' })
  }
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
    status: 'active',
    grantedBy: operator.id,
    grantedAt: now(),
    expiresAt: null,
    updatedAt: now()
  }
  if (existing.data[0]) {
    await db.collection(COLLECTIONS.userRole).doc(existing.data[0]._id).update({ data })
  } else {
    data.createdAt = now()
    await db.collection(COLLECTIONS.userRole).add({ data })
  }
  await db.collection(COLLECTIONS.user).where({ id: userId }).update({
    data: { status: 'active', defaultOrganizationId: organizationId, updatedAt: now() }
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
  ['secretary', '秘书'],
  ['tamer', '纠察'],
  ['treasurer', '司库'],
  ['admin', '总务'],
  ['first-vp', '第一副队长'],
  ['second-vp', '第二副队长'],
  ['third-vp', '第三副队长'],
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
  const existingIds = new Set(existing.data.map(item => item.id))
  let created = 0
  for (const organization of organizations.data) {
    if (!['region', 'team'].includes(organization.type)) continue
    const definitions = organization.type === 'region' ? AREA_POSITIONS : TEAM_POSITIONS
    for (let index = 0; index < definitions.length; index += 1) {
      const [code, name, parentCode] = definitions[index]
      const id = `position_${organization.id}_${code}`
      if (existingIds.has(id)) continue
      await db.collection(COLLECTIONS.position).add({
        data: {
          id,
          organizationId: organization.id,
          code,
          name,
          type: parentCode ? 'committee' : organization.type === 'region' ? 'area' : 'team',
          parentPositionId: parentCode ? `position_${organization.id}_${parentCode}` : null,
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
  await requirePlatformEditor(openid)
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
  return result.data.map(item => ({ ...item, _id: undefined }))
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

async function listEventRecords(openid, event = {}) {
  await requirePlatformUser(openid)
  const status = cleanText(event.status, 30) || 'published'
  const organizationId = cleanText(event.organizationId, 80)
  const category = cleanText(event.category, 40)
  const categoryId = cleanText(event.categoryId, 80)
  const eventMonth = cleanText(event.eventMonth, 7)
  const limit = Math.min(Number(event.limit) || 50, 100)
  const result = await db.collection(COLLECTIONS.eventRecord).limit(200).get()
  const records = result.data
    .filter(item => !item.deletedAt)
    .filter(item => !status || item.status === status)
    .filter(item => !organizationId || item.organizationId === organizationId)
    .filter(item => !category || item.category === category)
    .filter(item => !categoryId || item.categoryId === categoryId)
    .filter(item => !eventMonth || item.eventMonth === eventMonth)
    .sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || '')))
    .slice(0, limit)
  try {
    const imageResult = await db.collection(COLLECTIONS.eventImage).limit(1000).get()
    const imageMap = {}
    imageResult.data
      .filter(item => item.status === 'active')
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .forEach(item => {
        if (!imageMap[item.eventId]) imageMap[item.eventId] = []
        imageMap[item.eventId].push(item)
      })
    return records.map(item => ({ ...item, images: imageMap[item.id] || [] }))
  } catch (error) {
    console.warn('event_image list unavailable', error.message)
    return records
  }
}

async function saveEventRecord(openid, event = {}) {
  const record = event.record || {}
  const member = await requireEventEditor(openid, record, record.id || event.id ? 'update' : 'create')
  const id = cleanText(record.id || event.id, 100) || businessId('event')
  const eventDate = cleanText(record.eventDate, 10)
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
    positionId: cleanText(record.positionId || record.categoryId, 140),
    archiveId: cleanText(record.archiveId, 180),
    keywords: Array.isArray(record.keywords)
      ? record.keywords.slice(0, 20).map(item => cleanText(item, 40)).filter(Boolean)
      : [],
    eventDate,
    eventMonth: eventDate && eventDate.length >= 7 ? eventDate.slice(0, 7) : '',
    location: cleanText(record.location, 120),
    creatorId: member.id,
    ownerName: cleanText(record.ownerName || member.name, 40),
    status: ['draft', 'pending_review', 'published', 'rejected', 'archived'].includes(record.status)
      ? record.status
      : 'draft',
    visibility: ['private', 'organization', 'public'].includes(record.visibility)
      ? record.visibility
      : 'organization',
    viewCount: Number(record.viewCount) || 0,
    imageCount: Number(record.imageCount) || 0,
    updatedAt: now()
  }

  if (!data.title || !data.organizationId || !data.eventDate) {
    throw Object.assign(new Error('纪事标题、组织和日期不能为空'), { code: 'INVALID_EVENT_RECORD' })
  }

  const existing = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
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
  await requirePlatformUser(openid)
  const id = cleanText(event.id, 100)
  if (!id) throw Object.assign(new Error('缺少纪事 ID'), { code: 'EVENT_ID_REQUIRED' })
  const result = await db.collection(COLLECTIONS.eventRecord).where({ id }).limit(1).get()
  const record = result.data[0]
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('纪事不存在或已归档'), { code: 'NOT_FOUND' })
  }
  const images = await db.collection(COLLECTIONS.eventImage)
    .where({ eventId: record.id, status: 'active' })
    .orderBy('sortOrder', 'asc')
    .limit(200)
    .get()
  return { ...record, images: images.data }
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

async function listEventImages(openid, event = {}) {
  await requirePlatformUser(openid)
  const eventId = cleanText(event.eventId, 100)
  if (!eventId) return []
  const result = await db.collection(COLLECTIONS.eventImage)
    .where({ eventId, status: 'active' })
    .orderBy('sortOrder', 'asc')
    .limit(200)
    .get()
  return result.data
}

async function saveEventImages(openid, event = {}) {
  const eventId = cleanText(event.eventId, 100)
  const images = Array.isArray(event.images) ? event.images.slice(0, 9) : []
  const eventResult = await db.collection(COLLECTIONS.eventRecord).where({ id: eventId }).limit(1).get()
  const record = eventResult.data[0]
  if (!record || record.deletedAt) {
    throw Object.assign(new Error('纪事不存在，无法保存照片'), { code: 'EVENT_NOT_FOUND' })
  }
  const user = await requireEventEditor(openid, record, 'update')
  const existing = await db.collection(COLLECTIONS.eventImage)
    .where({ eventId, status: 'active' })
    .limit(100)
    .get()
  await Promise.all(existing.data.map(item =>
    db.collection(COLLECTIONS.eventImage).doc(item._id).update({
      data: { status: 'deleted', deletedAt: now() }
    })
  ))
  await Promise.all(images.map((image, index) => {
    image = image || {}
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
  await writePlatformLog(user, 'update', 'event_image', eventId, { imageCount: images.length })
  return { eventId, imageCount: images.length }
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
  const user = await requireEventEditor(openid, {
    organizationId,
    positionId: 'treasurer',
    categoryId: 'treasurer'
  })
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
  const user = await requireEventEditor(openid, {
    organizationId: record.organizationId,
    positionId: 'treasurer',
    categoryId: 'treasurer'
  })
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

async function getHome(openid) {
  await requireApproved(openid)
  const [tasksResult, memberCount, noticeResult, activityResult] = await Promise.all([
    db.collection(COLLECTIONS.tasks).limit(200).get(),
    db.collection(COLLECTIONS.members).where({ status: 'approved' }).count(),
    db.collection(COLLECTIONS.notices).limit(50).get(),
    db.collection(COLLECTIONS.activities).limit(50).get()
  ])
  const tasks = activeItems(tasksResult.data).sort((a, b) => {
    return String(a.month).localeCompare(String(b.month)) || (a.order || 0) - (b.order || 0)
  })
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
    tasks: tasks.filter(item => item.status !== 'done').slice(0, 4)
      .map(item => ({ ...item, monthLabel: monthLabel(item.month) })),
    notices,
    activities
  }
}

async function listTasks(openid, event) {
  await requireApproved(openid)
  const result = await db.collection(COLLECTIONS.tasks).limit(200).get()
  const allTasks = activeItems(result.data).sort((a, b) => {
    return String(a.month).localeCompare(String(b.month)) || (a.order || 0) - (b.order || 0)
  })
  const tasks = allTasks.filter(item => {
    const monthMatches = !event.month || event.month === 'all' || item.month === event.month
    const statusMatches = !event.status || event.status === 'all' || item.status === event.status
    return monthMatches && statusMatches
  })
  const months = [...new Set(allTasks.map(item => item.month).filter(Boolean))]
    .sort()
    .map(value => ({ value, label: monthLabel(value) }))
  return { tasks, months }
}

async function getTask(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(COLLECTIONS.tasks).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveTask(openid, event) {
  const member = await requireEditor(openid)
  const task = event.task || {}
  const data = {
    title: cleanText(task.title, 100),
    month: cleanText(task.month, 7),
    category: cleanText(task.category, 30) || '其他',
    owner: cleanText(task.owner, 40),
    status: task.status === 'done' ? 'done' : 'pending',
    description: cleanText(task.description, 1000),
    order: Number(task.order) || 100,
    updatedAt: new Date()
  }
  if (!data.title || !/^\d{4}-\d{2}$/.test(data.month)) {
    throw Object.assign(new Error('事项名称或月份格式不正确'), { code: 'INVALID_TASK' })
  }
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.tasks).doc(id).update({ data })
    await writeAudit(member, 'update', 'task', id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.tasks).add({ data })
  await writeAudit(member, 'create', 'task', result._id, data.title)
  return { id: result._id }
}

async function deleteTask(openid, event) {
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.tasks).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'task', id)
  return true
}

async function listOrg(openid) {
  await requireApproved(openid)
  const result = await db.collection(COLLECTIONS.org).orderBy('order', 'asc').limit(200).get()
  return activeItems(result.data)
}

async function getOrg(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(COLLECTIONS.org).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveOrg(openid, event) {
  const member = await requireEditor(openid)
  const unit = event.unit || {}
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
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
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
  return activeItems(activityResult.data)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(item => {
      const related = photos.filter(photo => photo.activityId === item._id)
      const cover = related.find(photo => photo.isCover) || related[0]
      return {
        ...item,
        dateLabel: item.date || '',
        photoCount: related.length,
        coverUrl: cover ? cover.fileID : ''
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
  const cover = photos.find(item => item.isCover) || photos[0]
  return {
    activity: { ...activity, dateLabel: activity.date || '', coverUrl: cover ? cover.fileID : '' },
    photos
  }
}

async function saveActivity(openid, event) {
  const member = await requireEditor(openid)
  const activity = event.activity || {}
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
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.activities).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'activity', id)
  return true
}

async function addPhoto(openid, event) {
  const member = await requireEditor(openid)
  const activityId = cleanText(event.activityId, 80)
  const fileID = cleanText(event.fileID, 1000)
  if (!activityId || !fileID.startsWith('cloud://')) {
    throw Object.assign(new Error('照片信息不正确'), { code: 'INVALID_PHOTO' })
  }
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
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
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
  const member = await requireEditor(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const content = event.content || {}
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
  const member = await requireEditor(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const id = cleanText(event.id, 80)
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
  const member = await requireSuperAdmin(openid)
  const role = ['member', 'editor', 'admin'].includes(event.role) ? event.role : 'member'
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({ data: { role, updatedAt: new Date() } })
  await writeAudit(member, 'role', 'member', id, role)
  return true
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
    .filter(item => !['superadmin', 'admin', 'editor'].includes(item.role))
    .map(item => ({
      _id: item._id,
      name: item.nickname,
      nickname: item.nickname,
      initial: (item.nickname || '成').slice(0, 1),
      team: item.team || ''
    }))
}

async function saveAdminPermissions(openid, event) {
  const member = await requireSuperAdmin(openid)
  const allowed = ['tasks', 'archives', 'contacts', 'photos', 'notices']
  const permissions = Array.isArray(event.permissions)
    ? event.permissions.filter(value => allowed.includes(value))
    : []
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({
    data: { permissions, updatedAt: new Date() }
  })
  await writeAudit(member, 'role', 'member', id, `permissions:${permissions.join(',')}`)
  return true
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
    review: '成员审核',
    role: '权限变更'
  }
  return result.data
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(item => ({ ...item, actionLabel: labels[item.action] || item.action, createdAtLabel: formatDate(item.createdAt) }))
}

const seedTasks = [
  ['2025-06', '服务', '孩子走访', '双龙', 'done'],
  ['2025-06', '外交', '哈尔滨八协联合换届', '款姐', 'done'],
  ['2025-06', '资产', '名牌、马甲和短袖订制', '泉宏', 'done'],
  ['2025-06', '关爱', '芳姐孩子高考关爱', '建鑫', 'done'],
  ['2025-06', '服务', '垃圾桶到货', '芳姐', 'done'],
  ['2025-06', '外交', '爱领航换届', '款姐', 'done'],
  ['2025-06', '服务', '红色行动', '芳姐', 'done'],
  ['2025-06', '协作区', '投票', '明星', 'done'],
  ['2025-06', '培训', '大庆13-15候任干部培训', '丙刚', 'done'],
  ['2025-06', '联谊', '户外烤肉团建', '砖哥', 'pending'],
  ['2025-06', '外交', '哈尔滨27主任', '款姐', 'pending'],
  ['2025-06', '服务队', '签约社区', '丙刚', 'pending'],
  ['2025-07', '会议', '4日开会', '', 'pending'],
  ['2025-07', '服务', '8日捐赠垃圾桶', '', 'pending'],
  ['2025-07', '助学', '22日圆梦助学', '', 'pending'],
  ['2025-07', '关爱', '31日慰问老兵', '', 'pending'],
  ['2025-08', '服务', '战立行动', '', 'pending'],
  ['2025-08', '活动', '28日慕思音乐会', '', 'pending']
]

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
  const [taskCount, orgCount] = await Promise.all([
    db.collection(COLLECTIONS.tasks).count(),
    db.collection(COLLECTIONS.org).count()
  ])
  const now = new Date()
  if (taskCount.total === 0) {
    await Promise.all(seedTasks.map((item, index) => db.collection(COLLECTIONS.tasks).add({
      data: {
        month: item[0],
        category: item[1],
        title: item[2],
        owner: item[3],
        status: item[4],
        description: '',
        order: index,
        createdAt: now,
        updatedAt: now
      }
    })))
  }
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

const handlers = {
  getSession,
  bootstrapV2,
  getPlatformSession,
  saveMyProfile,
  saveUserMemberCode,
  listProfileOrganizations,
  bootstrapGovernance,
  listPositions,
  listRoleAssignments,
  listPlatformUsers,
  listUserRoles,
  listPermissionGrants,
  saveUserRole,
  savePermissionGrant,
  revokeUserRole,
  revokePermissionGrant,
  saveRoleAssignment,
  listOrganizations,
  listEventRecords,
  saveEventRecord,
  getEventRecord,
  archiveEventRecord,
  listEventImages,
  saveEventImages,
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
  listOrg,
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
  const handler = handlers[event.action]
  if (!handler) return fail('UNKNOWN_ACTION', '不支持的操作')
  try {
    return success(await handler(OPENID, event))
  } catch (error) {
    console.error(event.action, error)
    return fail(error.code || 'SERVER_ERROR', error.message || '服务暂不可用')
  }
}
