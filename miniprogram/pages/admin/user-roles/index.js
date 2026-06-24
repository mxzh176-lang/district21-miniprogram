const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const ROLE_OPTIONS = [
  { value: 'team_admin', label: '服务队管理员' },
  { value: 'area_admin', label: '协作区管理员' },
  { value: 'super_admin', label: '超级管理员' },
  { value: 'member', label: '普通成员' }
]

Page({
  data: {
    canEdit: false,
    users: [],
    incompleteUserCount: 0,
    userIndex: 0,
    organizations: [],
    organizationIndex: 0,
    roleOptions: ROLE_OPTIONS,
    roleIndex: 0,
    roles: [],
    userMap: {},
    organizationMap: {},
    memberCode: '',
    startDate: '2026-07-01',
    endDate: '2027-06-30'
  },

  async onLoad() {
    const session = await api.call('getSession')
    this.setData({ canEdit: permission.isSuperAdmin(session) })
    await this.loadData()
  },

  async loadData() {
    try {
      const [users, teams, roles] = await Promise.all([
        api.call('listPlatformUsers'),
        api.call('listTeams'),
        api.call('listUserRoles')
      ])
      const organizations = [
        { id: 'org_federation_china', name: '中国狮子联会（超级管理员范围）', type: 'federation' },
        ...teams.map(item => ({
          ...item,
          id: item.cloudId || item.id,
          type: item.type || (item.id === 'district' ? 'region' : 'team')
        }))
      ]
      const userMap = {}
      users.forEach(user => { userMap[user.id] = user.name })
      const organizationMap = {}
      organizations.forEach(item => { organizationMap[item.id] = item.name })
      const eligibleUsers = users.filter(item =>
        item.profileCompleted && item.defaultOrganizationId && item.name && !item.name.startsWith('待认证用户')
      )
      this.setData({
        users: eligibleUsers.map(item => ({
          ...item,
          displayName: `${item.name} · ${organizationMap[item.defaultOrganizationId]} · ${item.memberCode || item.accountSuffix || String(item.id).slice(-6)} · ${item.status === 'pending' ? '待授权' : '已启用'}`
        })),
        incompleteUserCount: users.length - eligibleUsers.length,
        organizations,
        roles: roles.map(item => ({
          ...item,
          userName: userMap[item.userId] || item.userId,
          organizationName: organizationMap[item.organizationId] || item.organizationId,
          roleLabel: this.roleLabel(item.role),
          termLabel: `${item.startDate || '长期'} 至 ${item.endDate || item.expiresAt || '长期'}`
        })),
        userMap,
        organizationMap,
        memberCode: eligibleUsers[0] ? eligibleUsers[0].memberCode || '' : ''
      })
      this.syncOrganizationForRole(0)
    } catch (error) {
      api.showError(error)
    }
  },

  roleLabel(role) {
    const item = ROLE_OPTIONS.find(option => option.value === role)
    return item ? item.label : role
  },

  onUserChange(event) {
    const userIndex = Number(event.detail.value)
    this.setData({ userIndex, memberCode: this.data.users[userIndex].memberCode || '' })
  },

  onMemberCodeInput(event) {
    this.setData({ memberCode: event.detail.value.toUpperCase() })
  },

  async saveMemberCode() {
    const user = this.data.users[this.data.userIndex]
    if (!user || !this.data.memberCode.trim()) {
      wx.showToast({ title: '请选择用户并填写成员编号', icon: 'none' })
      return
    }
    try {
      await api.call('saveUserMemberCode', { userId: user.id, memberCode: this.data.memberCode.trim() })
      wx.showToast({ title: '成员编号已保存', icon: 'success' })
      await this.loadData()
    } catch (error) {
      api.showError(error)
    }
  },

  onRoleChange(event) {
    const roleIndex = Number(event.detail.value)
    this.setData({ roleIndex })
    this.syncOrganizationForRole(roleIndex)
  },

  onOrganizationChange(event) {
    this.setData({ organizationIndex: Number(event.detail.value) })
  },

  onStartDateChange(event) { this.setData({ startDate: event.detail.value }) },
  onEndDateChange(event) { this.setData({ endDate: event.detail.value }) },

  goRoleAssignments() {
    wx.navigateTo({ url: '/pages/admin/role-assignments/index' })
  },

  goPermissionGrants() {
    wx.navigateTo({ url: '/pages/admin/permission-grants/index' })
  },

  syncOrganizationForRole(roleIndex) {
    const role = ROLE_OPTIONS[roleIndex].value
    let organizationIndex = 0
    if (role === 'area_admin') {
      organizationIndex = Math.max(0, this.data.organizations.findIndex(item => item.type === 'region'))
    } else if (role === 'team_admin') {
      organizationIndex = Math.max(0, this.data.organizations.findIndex(item => item.type === 'team'))
    }
    this.setData({ organizationIndex })
  },

  async saveRole() {
    const user = this.data.users[this.data.userIndex]
    const role = this.data.roleOptions[this.data.roleIndex]
    const organization = this.data.organizations[this.data.organizationIndex]
    if (!user || !role || !organization) {
      wx.showToast({ title: '请选择用户、角色和管理范围', icon: 'none' })
      return
    }
    try {
      await api.call('saveUserRole', {
        userRole: {
          userId: user.id,
          role: role.value,
          organizationId: organization.id,
          startDate: this.data.startDate,
          endDate: this.data.endDate
        }
      })
      wx.showToast({ title: '管理员角色已保存', icon: 'success' })
      await this.loadData()
    } catch (error) {
      api.showError(error)
    }
  },

  revokeRole(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '取消管理员角色',
      content: '取消后该用户将立即失去对应管理权限。',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('revokeUserRole', { id })
          await this.loadData()
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
