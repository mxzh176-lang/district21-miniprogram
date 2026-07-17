Page({
  openPrivacyPolicy() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '请升级微信后查看隐私保护指引', icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请先在小程序后台配置隐私保护指引', icon: 'none' })
    })
  }
})
