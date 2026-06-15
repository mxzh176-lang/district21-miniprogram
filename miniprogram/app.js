App({
  globalData: {
    member: null,
    demoMode: true
  },

  onLaunch() {
    wx.setStorageSync('district21-demo-version', '1.0.0')
    if (wx.cloud) {
      try {
        wx.cloud.init({ traceUser: true })
      } catch (error) {}
    }
  }
})
