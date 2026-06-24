const api = require('../../../utils/api')

Page({
  data: {
    id: '',
    member: {},
    canManage: false
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  async onShow() {
    const result = await api.call('getMember', { id: this.data.id })
    this.setData(result)
    wx.setNavigationBarTitle({ title: result.member.name || '狮友详情' })
  },

  editMember() {
    wx.navigateTo({ url: `/pages/org/edit/index?id=${this.data.id}` })
  }
})
