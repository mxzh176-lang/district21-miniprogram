const api = require('../../utils/api')
const permission = require('../../utils/permission')
const auth = require('../../utils/auth')

Page({
  data: { items: [], canEdit: false },

  async onShow() {
    const member = await auth.requireApproved()
    if (!member) return
    this.setData({ canEdit: permission.canEditContent(member) })
    await this.loadItems()
  },

  async onPullDownRefresh() {
    await this.loadItems()
    wx.stopPullDownRefresh()
  },

  async loadItems() {
    try {
      this.setData({ items: await api.call('listContent', { type: 'notice' }) })
    } catch (error) {
      api.showError(error)
    }
  },

  createItem() {
    wx.navigateTo({ url: '/pages/admin/content-edit/index?type=notice' })
  },

  editItem(event) {
    wx.navigateTo({
      url: `/pages/admin/content-edit/index?type=notice&id=${event.currentTarget.dataset.id}`
    })
  }
})
