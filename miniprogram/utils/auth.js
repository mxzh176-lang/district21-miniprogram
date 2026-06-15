const api = require('./api')

async function requireApproved(options = {}) {
  const app = getApp()
  try {
    const member = await api.call('getSession')
    app.globalData.member = member
    if (options.admin && !['superadmin', 'admin'].includes(member.role)) {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' })
      wx.switchTab({ url: '/pages/home/index' })
      return null
    }
    if (options.editor && !['superadmin', 'editor', 'admin'].includes(member.role)) {
      wx.showToast({ title: '仅内容管理员可访问', icon: 'none' })
      wx.switchTab({ url: '/pages/home/index' })
      return null
    }
    return member
  } catch (error) {
    wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' })
    return null
  }
}

module.exports = {
  requireApproved
}
