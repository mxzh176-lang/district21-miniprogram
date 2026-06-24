const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

Page({
  data: { id: '', entry: {}, photos: [], canEdit: false, canDelete: false },

  onLoad(options) {
    this.setData({ id: options.id || 'ar-1' })
  },

  async onShow() {
    const [entry, session, organizations] = await Promise.all([
      api.call('getArchiveEntry', { id: this.data.id }),
      api.call('getSession'),
      api.call('listArchives')
    ])
    const organization = organizations.find(item => item.id === entry.organizationId)
    const photos = (entry.photos || []).map((url, index) => ({
      id: `${entry._id}-${index}`,
      url,
      label: `事件照片 ${index + 1}`
    }))
    this.setData({
      entry: {
        ...entry,
        team: entry.team || (organization && organization.name) || '',
        keywordText: (entry.keywords || []).join(' · ')
      },
      photos,
      canEdit: permission.canMaintainArchive(session, organization, entry.categoryId, 'update'),
      canDelete: permission.canMaintainArchive(session, organization, entry.categoryId, 'delete')
    })
    wx.setNavigationBarTitle({ title: entry.title })
  },

  previewPhoto(event) {
    const current = event.currentTarget.dataset.url
    wx.previewImage({
      current,
      urls: this.data.photos.map(item => item.url)
    })
  },

  editEntry() {
    const entry = this.data.entry
    wx.navigateTo({
      url: `/pages/archive/edit/index?id=${entry._id}&organization=${entry.organizationId}&category=${entry.categoryId}`
    })
  },

  deleteEntry() {
    wx.showModal({
      title: '删除档案',
      content: '确认删除这条档案吗？',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteArchiveEntry', { id: this.data.id })
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 600)
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
