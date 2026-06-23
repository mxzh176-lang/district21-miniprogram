const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

Page({
  data: {
    allowed: false,
    organizations: [],
    organizationIndex: 0,
    positions: [],
    positionIndex: 0,
    users: [],
    userIndex: 0,
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    assignments: [],
    loading: true,
    setupRequired: false
  },

  async onLoad() {
    const session = await api.call('getSession')
    if (!permission.canManageAssignments(session)) {
      wx.showToast({ title: '仅协作区管理员可管理岗位授权', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.setData({ allowed: true })
    await this.loadBaseData()
  },

  async loadBaseData() {
    try {
      const [organizations, users] = await Promise.all([
        api.call('listTeams'),
        api.call('listPlatformUsers')
      ])
      const organizationMap = {}
      organizations.forEach(item => { organizationMap[item.cloudId || item.id] = item.name })
      this.setData({
        organizations,
        users: users.map(item => ({
          ...item,
          displayName: `${item.name} · ${organizationMap[item.defaultOrganizationId] || '未选组织'} · ${item.accountSuffix || String(item.id).slice(-6)}`
        })),
        loading: false
      })
      await this.loadOrganizationData()
    } catch (error) {
      this.setData({ loading: false, setupRequired: true })
      api.showError(error)
    }
  },

  currentOrganization() {
    return this.data.organizations[this.data.organizationIndex] || {}
  },

  async loadOrganizationData() {
    const organization = this.currentOrganization()
    if (!organization.id) return
    const organizationId = organization.cloudId || organization.id
    try {
      const [positions, assignments] = await Promise.all([
        api.call('listPositions', { organizationId }),
        api.call('listRoleAssignments', { organizationId })
      ])
      const userMap = {}
      this.data.users.forEach(user => { userMap[user.id] = user.name })
      const positionMap = {}
      positions.forEach(position => { positionMap[position.id] = position.name })
      this.setData({
        positions,
        positionIndex: 0,
        assignments: assignments.map(item => ({
          ...item,
          userName: userMap[item.userId] || '未知人员',
          positionName: positionMap[item.positionId] || '未知岗位'
        })),
        setupRequired: !positions.length
      })
    } catch (error) {
      this.setData({ positions: [], assignments: [], setupRequired: true })
      api.showError(error)
    }
  },

  async onOrganizationChange(event) {
    this.setData({ organizationIndex: Number(event.detail.value) })
    await this.loadOrganizationData()
  },

  onPositionChange(event) {
    this.setData({ positionIndex: Number(event.detail.value) })
  },

  onUserChange(event) {
    this.setData({ userIndex: Number(event.detail.value) })
  },

  onStartDateChange(event) {
    this.setData({ startDate: event.detail.value })
  },

  onEndDateChange(event) {
    this.setData({ endDate: event.detail.value })
  },

  async initializePositions() {
    try {
      wx.showLoading({ title: '初始化岗位' })
      await api.call('bootstrapGovernance')
      await this.loadOrganizationData()
      wx.showToast({ title: '岗位初始化完成', icon: 'success' })
    } catch (error) {
      api.showError(error)
    } finally {
      wx.hideLoading()
    }
  },

  async saveAssignment() {
    const organization = this.currentOrganization()
    const position = this.data.positions[this.data.positionIndex]
    const user = this.data.users[this.data.userIndex]
    if (!organization.id || !position || !user) {
      wx.showToast({ title: '请选择组织、岗位和负责人', icon: 'none' })
      return
    }
    try {
      await api.call('saveRoleAssignment', {
        assignment: {
          areaId: 'org_region_21_suihua',
          teamId: organization.type === 'team' ? organization.cloudId || organization.id : null,
          organizationId: organization.cloudId || organization.id,
          positionId: position.id,
          userId: user.id,
          memberId: user.id,
          startDate: this.data.startDate,
          endDate: this.data.endDate,
          status: 'active'
        }
      })
      wx.showToast({ title: '授权已保存', icon: 'success' })
      await this.loadOrganizationData()
    } catch (error) {
      api.showError(error)
    }
  }
})
