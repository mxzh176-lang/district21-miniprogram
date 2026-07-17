const api = require('./utils/api')

App({
  globalData: {
    member: null,
    cloudMode: true,
    cloudEnvId: 'cloud1-d6ghj5dev32a15a81'
  },

  onLaunch() {
    wx.setStorageSync('district21-app-version', '1.0.0')
    try {
      api.initialize({ env: this.globalData.cloudEnvId, traceUser: true })
    } catch (error) {}
  }
  ,
  async onShow() {
    try {
      this.globalData.member = await api.call('getSession', {}, { forceRefresh: true })
      wx.setStorageSync('district21-permission-refreshed-at', Date.now())
    } catch (error) {}
  }
})
