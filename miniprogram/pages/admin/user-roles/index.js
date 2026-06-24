const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const MODULE_DEFINITIONS = [
  ['history', '历史事件', [['read', '查看历史事件'], ['create', '新增历史事件'], ['update', '修改历史事件'], ['delete', '删除历史事件'], ['upload', '上传事件图片']]],
  ['archive', '档案目录', [['read', '查看档案'], ['update', '修改档案'], ['upload', '上传档案图片'], ['delete', '删除档案内容']]],
  ['todo', '待办事项', [['read', '查看待办'], ['create', '新增待办'], ['update', '修改待办'], ['complete', '完成待办'], ['delete', '删除待办']]],
  ['finance', '司库账目', [['read', '查看账目'], ['create', '新增账目'], ['update', '修改账目'], ['delete', '删除账目']]],
  ['member', '成员名册', [['read', '查看成员'], ['update', '修改成员信息'], ['create', '新增成员'], ['delete', '删除成员']]],
  ['honor', '荣誉表彰', [['read', '查看荣誉'], ['create', '新增荣誉'], ['update', '修改荣誉'], ['delete', '删除荣誉']]],
  ['permission', '权限中心', [['read', '查看权限'], ['create', '授权用户'], ['update', '修改授权'], ['delete', '删除授权']]]
]

const BASE_ROLES = [
  { code: 'member', name: '普通成员', preset: 'member' },
  { code: 'team_admin', name: '服务队管理员', preset: 'team_admin' },
  { code: 'area_admin', name: '协作区管理员', preset: 'area_admin' },
  { code: 'super_admin', name: '超级管理员', preset: 'super_admin' }
]

const DATA_SCOPES = [
  { value: 'district', label: '协作区全部' },
  { value: 'team', label: '本服务队全部' },
  { value: 'position', label: '本岗位/委员会' },
  { value: 'self', label: '仅自己创建的内容' }
]

function emptyPermissions() {
  return MODULE_DEFINITIONS.reduce((result, item) => { result[item[0]] = []; return result }, {})
}

function roleDefaults(preset) {
  const permissions = emptyPermissions()
  if (preset === 'super_admin') {
    MODULE_DEFINITIONS.forEach(([module, , actions]) => { permissions[module] = actions.map(item => item[0]) })
    return { dataScope: 'district', permissions }
  }
  if (preset === 'area_admin' || preset === 'team_admin') {
    MODULE_DEFINITIONS.forEach(([module, , actions]) => {
      permissions[module] = module === 'permission' ? ['read'] : actions.map(item => item[0])
    })
    return { dataScope: preset === 'area_admin' ? 'district' : 'team', permissions }
  }
  if (preset === 'member') {
    Object.keys(permissions).forEach(module => { permissions[module] = ['read'] })
    return { dataScope: 'team', permissions }
  }
  permissions.history = ['read', 'create', 'update', 'upload']
  permissions.archive = ['read', 'update', 'upload']
  permissions.todo = ['read', 'create', 'update']
  permissions.honor = ['read']
  if (preset === 'treasurer') permissions.finance = ['read', 'create', 'update', 'delete']
  return { dataScope: 'position', permissions }
}

Page({
  data: {
    canEdit: false,
    loading: true,
    setupRequired: false,
    users: [], userIndex: 0, incompleteUserCount: 0,
    teams: [], teamIndex: 0,
    roles: BASE_ROLES, roleIndex: 0,
    positions: [],
    dataScopes: DATA_SCOPES, scopeIndex: 1,
    permissionGroups: [],
    startDate: '2026-07-01', endDate: '2027-06-30',
    grants: [], editingId: ''
  },

  async onLoad() {
    const session = await api.call('getSession')
    this.setData({ canEdit: permission.isSuperAdmin(session) })
    await this.loadData()
  },

  async loadData() {
    try {
      const [users, organizations, grants] = await Promise.all([
        api.call('listPlatformUsers'), api.call('listTeams'), api.call('listUserPermissions')
      ])
      const teams = organizations.filter(item => item.type === 'team')
      const teamMap = {}
      teams.forEach(item => { teamMap[item.cloudId || item.id] = item.name })
      const eligibleUsers = users.filter(item =>
        item.profileCompleted && item.defaultOrganizationId && item.name && !item.name.startsWith('待认证用户')
      )
      this.setData({
        users: eligibleUsers.map(item => ({ ...item, displayName: `${item.name} · ${teamMap[item.defaultOrganizationId] || '协作区'} · ${item.memberCode || item.accountSuffix}` })),
        incompleteUserCount: users.length - eligibleUsers.length,
        teams,
        grants: grants.map(item => ({ ...item, teamName: teamMap[item.teamId] || item.teamId, scopeName: (DATA_SCOPES.find(scope => scope.value === item.dataScope) || {}).label || item.dataScope })),
        loading: false,
        setupRequired: false
      })
      await this.loadRolesForTeam()
      this.applyRoleDefaults(0)
    } catch (error) {
      this.setData({ loading: false, setupRequired: /user_permissions|collection/i.test(error.message || '') })
      api.showError(error)
    }
  },

  currentTeam() { return this.data.teams[this.data.teamIndex] || {} },
  currentRole() { return this.data.roles[this.data.roleIndex] || {} },

  async loadRolesForTeam() {
    const team = this.currentTeam()
    if (!team.id) return this.setData({ positions: [], roles: BASE_ROLES, roleIndex: 0 })
    try {
      const positions = await api.call('listPositions', { organizationId: team.cloudId || team.id })
      this.setData({
        positions,
        roles: BASE_ROLES.concat(positions.map(item => ({ code: item.code || item.id, name: item.name, preset: item.code === 'treasurer' ? 'treasurer' : 'position', positionId: item.id }))),
        roleIndex: 0
      })
    } catch (error) {
      this.setData({ positions: [], roles: BASE_ROLES, roleIndex: 0 })
    }
  },

  buildGroups(permissions, expandedModule = 'history') {
    return MODULE_DEFINITIONS.map(([module, label, actions]) => ({
      module, label, expanded: module === expandedModule,
      selectedCount: (permissions[module] || []).length,
      actions: actions.map(([value, actionLabel]) => ({ value, label: actionLabel, checked: (permissions[module] || []).includes(value) }))
    }))
  },

  applyRoleDefaults(roleIndex) {
    const role = this.data.roles[roleIndex] || BASE_ROLES[0]
    const defaults = roleDefaults(role.preset)
    this.permissions = defaults.permissions
    this.setData({
      roleIndex,
      scopeIndex: Math.max(0, DATA_SCOPES.findIndex(item => item.value === defaults.dataScope)),
      permissionGroups: this.buildGroups(this.permissions)
    })
  },

  onUserChange(event) { this.setData({ userIndex: Number(event.detail.value) }) },
  async onTeamChange(event) {
    this.setData({ teamIndex: Number(event.detail.value) })
    await this.loadRolesForTeam()
    this.applyRoleDefaults(0)
  },
  onRoleChange(event) { this.applyRoleDefaults(Number(event.detail.value)) },
  onScopeChange(event) { this.setData({ scopeIndex: Number(event.detail.value) }) },
  onStartDateChange(event) { this.setData({ startDate: event.detail.value }) },
  onEndDateChange(event) { this.setData({ endDate: event.detail.value }) },

  toggleGroup(event) {
    const module = event.currentTarget.dataset.module
    this.setData({ permissionGroups: this.data.permissionGroups.map(item => ({ ...item, expanded: item.module === module ? !item.expanded : item.expanded })) })
  },

  onPermissionChange(event) {
    const module = event.currentTarget.dataset.module
    this.permissions[module] = event.detail.value
    const expanded = (this.data.permissionGroups.find(item => item.module === module) || {}).expanded ? module : ''
    const groups = this.buildGroups(this.permissions, expanded)
    if (!expanded) groups.forEach(item => { item.expanded = false })
    this.setData({ permissionGroups: groups })
  },

  async savePermissions() {
    const user = this.data.users[this.data.userIndex]
    const team = this.currentTeam()
    const role = this.currentRole()
    const scope = this.data.dataScopes[this.data.scopeIndex]
    if (!user || !team || !role || !scope) return wx.showToast({ title: '请完整选择授权信息', icon: 'none' })
    if (scope.value === 'position' && !role.positionId) return wx.showToast({ title: '岗位范围必须选择具体岗位角色', icon: 'none' })
    try {
      await api.call('saveUserPermissions', { userPermissions: {
        id: this.data.editingId || undefined,
        userId: user.id, userName: user.name,
        teamId: team.cloudId || team.id,
        roleCode: role.code, roleName: role.name,
        dataScope: scope.value, positionId: scope.value === 'position' ? role.positionId : '',
        permissions: this.permissions,
        startDate: this.data.startDate, endDate: this.data.endDate
      } })
      wx.showToast({ title: '授权已保存', icon: 'success' })
      this.setData({ editingId: '' })
      await this.loadData()
    } catch (error) { api.showError(error) }
  },

  async editGrant(event) {
    const grant = this.data.grants.find(item => item.id === event.currentTarget.dataset.id)
    if (!grant) return
    const userIndex = Math.max(0, this.data.users.findIndex(item => item.id === grant.userId))
    const teamIndex = Math.max(0, this.data.teams.findIndex(item => (item.cloudId || item.id) === grant.teamId))
    this.setData({ userIndex, teamIndex, editingId: grant.id, startDate: grant.startDate, endDate: grant.endDate })
    await this.loadRolesForTeam()
    let roleIndex = this.data.roles.findIndex(item => item.code === grant.roleCode)
    if (roleIndex < 0) roleIndex = 0
    this.permissions = { ...emptyPermissions(), ...(grant.permissions || {}) }
    this.setData({
      roleIndex,
      scopeIndex: Math.max(0, DATA_SCOPES.findIndex(item => item.value === grant.dataScope)),
      permissionGroups: this.buildGroups(this.permissions)
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 250 })
  },

  revokeGrant(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({ title: '删除授权', content: '删除后该授权立即失效。', confirmColor: '#d94f65', success: async result => {
      if (!result.confirm) return
      try { await api.call('revokeUserPermissions', { id }); await this.loadData() } catch (error) { api.showError(error) }
    } })
  }
})
