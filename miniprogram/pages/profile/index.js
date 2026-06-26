const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

Page({
  data: { member: {}, currentScope: orgScope.ORG_OPTIONS[0], canManage: false, canViewPermissions: false, needsProfile: false },

  async onShow() {
    const currentScope = orgScope.getCurrentScope()
    const member = await api.call('getSession')
    this.setData({
      currentScope,
      member: {
        ...member,
        displayRole: permission.displayRole(member),
        displayCode: member.memberCode || member.accountSuffix || String(member.id || member._id || '').slice(-6)
      },
      canManage: permission.canManage(member),
      canViewPermissions: permission.isSuperAdmin(member) ||
        permission.hasPortPermission(member, 'permission', 'read') ||
        !permission.activePortPermissions(member).length,
      needsProfile: !member.profileCompleted || !member.organizationId
    })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' })
  },

  goUserPermissions() {
    wx.navigateTo({ url: '/pages/admin/user-roles/index' })
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile/edit/index' })
  },

  goNotices() {
    wx.navigateTo({ url: '/pages/notices/index' })
  },

  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/index' })
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/index' })
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: orgScope.ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentScope = orgScope.setCurrentScope(orgScope.ORG_OPTIONS[result.tapIndex])
        this.setData({ currentScope })
      }
    })
  },

  copyUserId() {
    if (!this.data.member.id && !this.data.member._id) return
    wx.setClipboardData({
      data: this.data.member.memberCode || this.data.member.id || this.data.member._id,
      success: () => wx.showToast({ title: '账号编号已复制', icon: 'success' })
    })
  },

  async retryCloud() {
    wx.showLoading({ title: '连接云端' })
    try {
      await this.onShow()
      if (this.data.member.status === 'readonly') {
        wx.showToast({ title: '仍未连接，请重新部署 api 云函数', icon: 'none' })
      } else {
        wx.showToast({ title: '云端连接成功', icon: 'success' })
      }
    } finally {
      wx.hideLoading()
    }
  }
})
