const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

Page({
  data: { logs: [] },

  async onLoad() {
    const member = await auth.requireApproved({ admin: true })
    if (!member) return
    await this.loadLogs()
  },

  async onPullDownRefresh() {
    await this.loadLogs()
    wx.stopPullDownRefresh()
  },

  async loadLogs() {
    try {
      this.setData({ logs: await api.call('listAuditLogs') })
    } catch (error) {
      api.showError(error)
    }
  }
})
