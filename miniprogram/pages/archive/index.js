const api = require('../../utils/api')

Page({
  data: {
    organizations: [],
    selectedId: 'yuanhang',
    selectedOrganization: {},
    loading: true,
    loadError: ''
    ,canManage: false
  },

  async onShow() {
    try {
      const [organizations, session] = await Promise.all([
        api.call('listArchives'),
        api.call('getSession')
      ])
      this.setData({
        organizations,
        canManage: ['superadmin', 'admin'].includes(session.role),
        loadError: ''
      })
      await this.selectOrganizationById(this.data.selectedId)
    } catch (error) {
      this.setData({ loading: false, loadError: '档案加载失败，请点击微信开发者工具“编译”后重试。' })
      api.showError(error)
    }
  },

  selectOrganization(event) {
    this.selectOrganizationById(event.currentTarget.dataset.id)
  },

  async selectOrganizationById(id) {
    let selectedOrganization = this.data.organizations.find(item => item.id === id) || this.data.organizations[0] || {}
    const categoryOrder = wx.getStorageSync(`archiveCategoryOrder:${id}`) || []
    if (categoryOrder.length) {
      selectedOrganization = {
        ...selectedOrganization,
        categories: selectedOrganization.categories.slice().sort((a, b) =>
          categoryOrder.indexOf(a.id) - categoryOrder.indexOf(b.id)
        )
      }
    }
    this.setData({
      selectedId: id,
      selectedOrganization,
      loading: false,
      loadError: ''
    })
  },

  addContent(event) {
    const category = event.currentTarget.dataset.category
    if (event.currentTarget.dataset.restricted) {
      wx.showToast({ title: '仅司库和最高管理员可维护', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/archive/list/index?organization=${this.data.selectedId}&category=${category}` })
  },

  uploadPhotos() {
    wx.showToast({ title: '正式版将打开云照片上传', icon: 'none' })
  },

  moveCategory(event) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = event.currentTarget.dataset.direction
    const categories = this.data.selectedOrganization.categories.slice()
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= categories.length) return
    ;[categories[index], categories[target]] = [categories[target], categories[index]]
    const selectedOrganization = { ...this.data.selectedOrganization, categories }
    const organizations = this.data.organizations.map(item =>
      item.id === selectedOrganization.id ? selectedOrganization : item
    )
    this.setData({ selectedOrganization, organizations })
    wx.setStorageSync(`archiveCategoryOrder:${selectedOrganization.id}`, categories.map(item => item.id))
  }
})
