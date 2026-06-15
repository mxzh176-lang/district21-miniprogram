const api = require('../../../utils/api')

Page({
  data: { id: '', activity: {}, photos: [] },

  onLoad(options) {
    this.setData({ id: options.id || 'event-1' })
  },

  async onShow() {
    const data = await api.call('getActivity', { id: this.data.id })
    this.setData(data)
    wx.setNavigationBarTitle({ title: data.activity.title })
  }
})
