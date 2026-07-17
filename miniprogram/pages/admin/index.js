const api = require('../../utils/api')
const permission = require('../../utils/permission')
const auth = require('../../utils/auth')

Page({
  data: {
    stats: {},
    appointments: [],
    inviteCode: 'D21-SUIHUA-2026',
    adminMembers: [],
    adminCandidates: [],
    candidateIndex: 0,
    roleIndex: 0,
    roleOptions: [
      { value: 'admin', label: '管理员' },
      { value: 'editor', label: '内容管理员' }
    ],
    canAddAdmin: false,
    permissionOptions: [
      { value: 'tasks', label: '待办' },
      { value: 'archives', label: '档案' },
      { value: 'contacts', label: '通讯录' },
      { value: 'photos', label: '服务队云盘' },
      { value: 'notices', label: '通知' }
    ]
  },

  async onShow() {
    const approved = await auth.requireApproved({ admin: true })
    if (!approved) return
    const [stats, appointments, session] = await Promise.all([
      api.call('getAdminStats'),
      api.call('listAppointments'),
      api.call('getSession')
    ])
    this.setData({
      stats,
      appointments,
      adminMembers: [],
      adminCandidates: [],
      candidateIndex: 0,
      canAddAdmin: permission.isSuperAdmin(session)
    })
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '授权码已复制', icon: 'success' })
    })
  },

  goLogs() {
    wx.navigateTo({ url: '/pages/admin/logs/index' })
  },

  goRoleAssignments() {
    wx.navigateTo({ url: '/pages/admin/role-assignments/index' })
  },

  goUserRoles() {
    wx.navigateTo({ url: '/pages/admin/user-roles/index' })
  },

  goPermissionGrants() {
    wx.navigateTo({ url: '/pages/admin/permission-grants/index' })
  },

  async changePermissions(event) {
    const id = event.currentTarget.dataset.id
    const permissions = event.detail.value
    await api.call('saveAdminPermissions', { id, permissions })
    this.setData({
      adminMembers: this.data.adminMembers.map(item =>
        item._id === id ? this.withPermissionFlags({ ...item, permissions }) : item
      )
    })
    wx.showToast({ title: '权限已保存', icon: 'success' })
  },

  selectCandidate(event) {
    this.setData({ candidateIndex: Number(event.detail.value) })
  },

  selectRole(event) {
    this.setData({ roleIndex: Number(event.detail.value) })
  },

  async addAdmin() {
    const candidate = this.data.adminCandidates[this.data.candidateIndex]
    const role = this.data.roleOptions[this.data.roleIndex]
    if (!candidate || !role) {
      wx.showToast({ title: '暂无可添加成员', icon: 'none' })
      return
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '添加管理员',
        content: `确认将${candidate.name}设置为${role.label}吗？`,
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    await api.call('setMemberRole', { id: candidate._id, role: role.value })
    const permissions = permission.defaultMenuPermissions(
      role.value,
      this.data.permissionOptions.map(item => item.value)
    )
    await api.call('saveAdminPermissions', { id: candidate._id, permissions })
    wx.showToast({ title: '管理员已添加', icon: 'success' })
    await this.onShow()
  },

  async removeAdmin(event) {
    const id = event.currentTarget.dataset.id
    const name = event.currentTarget.dataset.name
    wx.showModal({
      title: '取消管理员',
      content: `确认取消${name}的管理员身份吗？`,
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        await api.call('setMemberRole', { id, role: 'member' })
        await api.call('saveAdminPermissions', { id, permissions: [] })
        wx.showToast({ title: '已取消管理员', icon: 'success' })
        await this.onShow()
      }
    })
  },

  withPermissionFlags(item) {
    return permission.decorateAdminMember(item)
  },

  goTasks() { wx.navigateTo({ url: '/pages/tasks/index' }) },
  goArchives() { wx.switchTab({ url: '/pages/archive/index' }) },
  goContacts() { wx.switchTab({ url: '/pages/org/index' }) },
  goNotices() { wx.navigateTo({ url: '/pages/notices/index' }) }
})
