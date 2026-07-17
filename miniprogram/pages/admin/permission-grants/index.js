const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const MODULE_OPTIONS = [
  { value: 'archives', label: '档案' },
  { value: 'contacts', label: '通讯录' },
  { value: 'tasks', label: '待办事项' },
  { value: 'history', label: '历史事件' },
  { value: 'notices', label: '通知公告' },
  { value: 'photos', label: '服务队云盘' },
  { value: 'honors', label: '荣誉表彰' },
  { value: 'all', label: '全部内容' }
]

const SCOPE_OPTIONS = [
  { value: 'organization', label: '仅当前组织' },
  { value: 'organization_tree', label: '当前组织及下级组织' },
  { value: 'position', label: '仅一个岗位' },
  { value: 'position_tree', label: '岗位及其子岗位' },
  { value: 'global', label: '全局所有组织' }
]

const ACTION_OPTIONS = [
  { value: 'read', label: '查看', checked: true },
  { value: 'create', label: '新增', checked: true },
  { value: 'update', label: '修改', checked: true },
  { value: 'upload', label: '上传照片视频', checked: true },
  { value: 'delete', label: '删除', checked: true }
]

const ROLE_PRESETS = [
  { label: '单个岗位管理员（秘书、司库、委员会等）', module: 'archives', scopeType: 'position', actions: ['read', 'create', 'update', 'upload', 'delete'] },
  { label: '分管负责人：维护岗位及子类目', module: 'archives', scopeType: 'position_tree', actions: ['read', 'create', 'update'] },
  { label: '栏目负责人：维护职务与负责人资料', module: 'archives', scopeType: 'position', actions: ['read', 'update'] },
  { label: '服务队档案统筹员：维护本队档案', module: 'archives', scopeType: 'organization', actions: ['read', 'create', 'update'] },
  { label: '服务队通讯录维护员', module: 'contacts', scopeType: 'organization', actions: ['read', 'create', 'update'] },
  { label: '服务队待办协调员', module: 'tasks', scopeType: 'organization', actions: ['read', 'create', 'update'] },
  { label: '服务队历史维护员', module: 'history', scopeType: 'organization', actions: ['read', 'create', 'update'] },
  { label: '服务队荣誉记录员', module: 'honors', scopeType: 'organization', actions: ['read', 'create', 'update'] },
  { label: '服务队云盘管理员', module: 'photos', scopeType: 'organization', actions: ['read', 'upload', 'update', 'delete'] },
  { label: '岗位荣誉记录员', module: 'honors', scopeType: 'position', actions: ['read', 'create', 'update'] },
  { label: '服务队全内容管理员', module: 'all', scopeType: 'organization', actions: ['read', 'create', 'update', 'delete'] },
  { label: '协作区全内容管理员', module: 'all', scopeType: 'organization_tree', actions: ['read', 'create', 'update', 'delete'] }
]

Page({
  data: {
    allowed: false,
    canEdit: false,
    users: [],
    incompleteUserCount: 0,
    userIndex: 0,
    organizations: [],
    organizationIndex: 0,
    positions: [],
    allPositions: [],
    positionIndex: 0,
    moduleOptions: MODULE_OPTIONS,
    moduleIndex: 0,
    scopeOptions: SCOPE_OPTIONS,
    scopeIndex: 2,
    actionOptions: ACTION_OPTIONS,
    rolePresets: ROLE_PRESETS,
    rolePresetIndex: 0,
    actions: ['read', 'create', 'update', 'upload', 'delete'],
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    grants: [],
    loading: true,
    setupRequired: false
  },

  async onLoad() {
    const session = await api.call('getSession')
    this.setData({ allowed: true, canEdit: permission.canManageAssignments(session) })
    await this.loadData()
  },

  async loadData() {
    try {
      const [users, organizations, grants] = await Promise.all([
        api.call('listPlatformUsers'),
        api.call('listTeams'),
        api.call('listPermissionGrants')
      ])
      const userMap = {}
      users.forEach(item => { userMap[item.id] = item.name })
      const organizationMap = {}
      organizations.forEach(item => { organizationMap[item.cloudId || item.id] = item.name })
      const eligibleUsers = users.filter(item =>
        item.profileCompleted && item.defaultOrganizationId && item.name && !item.name.startsWith('待认证用户')
      )
      this.setData({
        users: eligibleUsers.map(item => ({
          ...item,
          displayName: `${item.name} · ${organizationMap[item.defaultOrganizationId]} · ${item.memberCode || item.accountSuffix || String(item.id).slice(-6)}`
        })),
        incompleteUserCount: users.length - eligibleUsers.length,
        organizations,
        grants: grants.map(item => ({
          ...item,
          userName: userMap[item.userId] || item.userId,
          organizationName: organizationMap[item.organizationId] || item.organizationId,
          moduleLabel: this.optionLabel(MODULE_OPTIONS, item.module),
          scopeLabel: this.optionLabel(SCOPE_OPTIONS, item.scopeType),
          positionName: item.scopeId || '',
          actionLabel: (item.actions || []).map(action => this.optionLabel(ACTION_OPTIONS, action)).join('、')
        })),
        loading: false,
        setupRequired: false
      })
      await this.loadPositions()
    } catch (error) {
      this.setData({ loading: false, setupRequired: error.code === 'CLOUD_CALL_FAILED' || /collection/i.test(error.message) })
      api.showError(error)
    }
  },

  optionLabel(options, value) {
    const option = options.find(item => item.value === value)
    return option ? option.label : value
  },

  currentOrganization() {
    return this.data.organizations[this.data.organizationIndex] || {}
  },

  currentScope() {
    return this.data.scopeOptions[this.data.scopeIndex] || {}
  },

  async loadPositions() {
    const organization = this.currentOrganization()
    if (!organization.id) return this.setData({ positions: [] })
    try {
      const organizationId = organization.cloudId || organization.id
      const [sourcePositions, directory] = await Promise.all([
        api.call('listPositions', { organizationId }),
        api.call('listPositionDirectory', { organizationId })
      ])
      const positionMap = {}
      sourcePositions.forEach(item => { positionMap[item.id] = item })
      const directoryMap = {}
      ;(directory || []).forEach(item => { directoryMap[item.id] = item })
      const positions = sourcePositions.map(item => ({
        ...item,
        roleName: item.type === 'committee' && !String(item.name || '').endsWith('主席') ? `${item.name}主席` : item.name,
        person: directoryMap[item.id] ? directoryMap[item.id].person : '待授权',
        userId: directoryMap[item.id] ? directoryMap[item.id].userId : '',
        displayName: this.positionDisplayName(item, positionMap, directoryMap)
      }))
      const sortedPositions = this.prioritizePositions(positions)
      this.setData({
        positions: sortedPositions,
        allPositions: positions,
        positionIndex: 0,
        grants: this.data.grants.map(item => ({
          ...item,
          positionName: item.organizationId === (organization.cloudId || organization.id) && positionMap[item.scopeId]
            ? positions.find(position => position.id === item.scopeId).displayName
            : item.positionName
        }))
      })
    } catch (error) {
      this.setData({ positions: [] })
    }
  },

  positionDisplayName(position, positionMap, directoryMap) {
    const parent = positionMap[position.parentPositionId]
    const roleName = position.type === 'committee' && !String(position.name || '').endsWith('主席')
      ? `${position.name}主席`
      : position.name
    const hierarchy = parent ? `${parent.name} / ${roleName}` : roleName
    const person = directoryMap[position.id] && directoryMap[position.id].person || '待授权'
    return `${hierarchy} · ${person} · 单独管理本岗位档案`
  },

  prioritizePositions(positions = this.data.allPositions) {
    const user = this.data.users[this.data.userIndex] || {}
    return positions.slice().sort((a, b) => {
      const aAssigned = a.userId === user.id || a.person && a.person === user.name ? 1 : 0
      const bAssigned = b.userId === user.id || b.person && b.person === user.name ? 1 : 0
      return bAssigned - aAssigned || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    })
  },

  onUserChange(event) {
    const userIndex = Number(event.detail.value)
    this.setData({ userIndex }, () => {
      this.setData({ positions: this.prioritizePositions(), positionIndex: 0 })
    })
  },
  onRolePresetChange(event) {
    const rolePresetIndex = Number(event.detail.value)
    const preset = this.data.rolePresets[rolePresetIndex]
    const moduleIndex = Math.max(0, this.data.moduleOptions.findIndex(item => item.value === preset.module))
    const scopeIndex = Math.max(0, this.data.scopeOptions.findIndex(item => item.value === preset.scopeType))
    const actions = preset.actions || ['read', 'create', 'update']
    this.setData({
      rolePresetIndex,
      moduleIndex,
      scopeIndex,
      actions,
      actionOptions: this.data.actionOptions.map(item => ({ ...item, checked: actions.includes(item.value) }))
    })
  },
  onModuleChange(event) { this.setData({ moduleIndex: Number(event.detail.value) }) },
  onScopeChange(event) { this.setData({ scopeIndex: Number(event.detail.value) }) },
  onPositionChange(event) { this.setData({ positionIndex: Number(event.detail.value) }) },
  onStartDateChange(event) { this.setData({ startDate: event.detail.value }) },
  onEndDateChange(event) { this.setData({ endDate: event.detail.value }) },
  onActionsChange(event) {
    const actions = event.detail.value
    this.setData({
      actions,
      actionOptions: this.data.actionOptions.map(item => ({ ...item, checked: actions.includes(item.value) }))
    })
  },

  async onOrganizationChange(event) {
    this.setData({ organizationIndex: Number(event.detail.value) })
    await this.loadPositions()
  },

  async saveGrant() {
    const user = this.data.users[this.data.userIndex]
    const organization = this.currentOrganization()
    const module = this.data.moduleOptions[this.data.moduleIndex]
    const scope = this.currentScope()
    const position = this.data.positions[this.data.positionIndex]
    const needsPosition = ['position', 'position_tree'].includes(scope.value)
    if (!user || !organization || !module || !scope || !this.data.actions.length) {
      wx.showToast({ title: '请完整选择授权内容', icon: 'none' })
      return
    }
    if (needsPosition && !position) {
      wx.showToast({ title: '请选择授权岗位', icon: 'none' })
      return
    }
    try {
      await api.call('savePermissionGrant', {
        grant: {
          userId: user.id,
          organizationId: organization.cloudId || organization.id,
          module: module.value,
          scopeType: scope.value,
          scopeId: needsPosition ? position.id : '',
          actions: this.data.actions,
          startDate: this.data.startDate,
          endDate: this.data.endDate
        }
      })
      wx.showToast({ title: '精细权限已保存', icon: 'success' })
      await this.loadData()
    } catch (error) {
      api.showError(error)
    }
  },

  revokeGrant(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '取消精细权限',
      content: '取消后该条权限立即失效，其他叠加权限不受影响。',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('revokePermissionGrant', { id })
          await this.loadData()
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
