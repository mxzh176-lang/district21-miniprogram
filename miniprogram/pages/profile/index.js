const api = require('../../utils/api')

Page({
  data: { member: {} },

  async onShow() {
    this.setData({ member: await api.call('getSession') })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' })
  },

  goNotices() {
    wx.navigateTo({ url: '/pages/notices/index' })
  },

  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/index' })
  },

  goAssistant() {
    wx.navigateTo({ url: '/pages/assistant/index' })
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/index' })
  }
})
