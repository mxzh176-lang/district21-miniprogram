const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const MODULE_OPTIONS = [
  { value: 'archives', label: '档案' },
  { value: 'contacts', label: '通讯录' },
  { value: 'tasks', label: '待办事项' },
  { value: 'history', label: '历史事件' },
  { value: 'notices', label: '通知公告' },
  { value: 'photos', label: '照片' },
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
  { value: 'delete', label: '删除', checked: false }
]

const ROLE_PRESETS = [
  { label: '单岗位档案负责人', module: 'archives', scopeType: 'position' },
  { label: '副队长团队负责人', module: 'archives', scopeType: 'position_tree' },
  { label: '服务队档案管理员', module: 'archives', scopeType: 'organization' },
  { label: '服务队通讯录管理员', module: 'contacts', scopeType: 'organization' },
  { label: '服务队待办管理员', module: 'tasks', scopeType: 'organization' },
  { label: '服务队历史事件管理员', module: 'history', scopeType: 'organization' },
  { label: '服务队荣誉录入员', module: 'honors', scopeType: 'organization' },
  { label: '岗位荣誉录入员', module: 'honors', scopeType: 'position' },
  { label: '服务队全内容管理员', module: 'all', scopeType: 'organization' },
  { label: '协作区全内容管理员', module: 'all', scopeType: 'organization_tree' }
]

Page({
  data: {
    allowed: false,
    users: [],
    userIndex: 0,
    organizations: [],
    organizationIndex: 0,
    positions: [],
    positionIndex: 0,
    moduleOptions: MODULE_OPTIONS,
    moduleIndex: 0,
    scopeOptions: SCOPE_OPTIONS,
    scopeIndex: 2,
    actionOptions: ACTION_OPTIONS,
    rolePresets: ROLE_PRESETS,
    rolePresetIndex: 0,
    actions: ['read', 'create', 'update'],
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    grants: [],
    loading: true,
    setupRequired: false
  },

  async onLoad() {
    const session = await api.call('getSession')
    if (!permission.canManageAssignments(session)) {
      wx.showToast({ title: '仅协作区管理员可分配权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.setData({ allowed: true })
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
      this.setData({
        users: users.map(item => ({
          ...item,
          displayName: `${item.name} · ${organizationMap[item.defaultOrganizationId] || '未选组织'} · ${item.accountSuffix || String(item.id).slice(-6)}`
        })),
        organizations,
        grants: grants.map(item => ({
          ...item,
          userName: userMap[item.userId] || item.userId,
          organizationName: organizationMap[item.organizationId] || item.organizationId,
          moduleLabel: this.optionLabel(MODULE_OPTIONS, item.module),
          scopeLabel: this.optionLabel(SCOPE_OPTIONS, item.scopeType),
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
      const positions = await api.call('listPositions', {
        organizationId: organization.cloudId || organization.id
      })
      this.setData({ positions, positionIndex: 0 })
    } catch (error) {
      this.setData({ positions: [] })
    }
  },

  onUserChange(event) { this.setData({ userIndex: Number(event.detail.value) }) },
  onRolePresetChange(event) {
    const rolePresetIndex = Number(event.detail.value)
    const preset = this.data.rolePresets[rolePresetIndex]
    const moduleIndex = Math.max(0, this.data.moduleOptions.findIndex(item => item.value === preset.module))
    const scopeIndex = Math.max(0, this.data.scopeOptions.findIndex(item => item.value === preset.scopeType))
    const actions = ['read', 'create', 'update', 'delete']
    this.setData({
      rolePresetIndex,
      moduleIndex,
      scopeIndex,
      actions,
      actionOptions: this.data.actionOptions.map(item => ({ ...item, checked: true }))
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
