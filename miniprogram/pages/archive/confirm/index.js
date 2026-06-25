const api = require('../../../utils/api')

const LEVEL_OPTIONS = [
  { value: 'good', label: '优秀' },
  { value: 'great', label: '杰出' },
  { value: 'excellent', label: '卓越' }
]

Page({
  data: {
    organizationId: '',
    loading: true,
    entries: [],
    verifyEntries: [],
    levelOptions: LEVEL_OPTIONS
  },

  onLoad(options) {
    this.setData({ organizationId: options.organization || 'yuanhang' })
    wx.setNavigationBarTitle({ title: '直属确认与荣誉核准' })
  },

  async onShow() {
    await this.loadEntries()
  },

  async loadEntries() {
    try {
      this.setData({ loading: true })
      const [entries, verifyEntries] = await Promise.all([
        api.call('listHonorConfirmations', { organizationId: this.data.organizationId }),
        api.call('listHonorVerifications', { organizationId: this.data.organizationId })
      ])
      this.setData({
        entries: (entries || []).map(item => ({
          ...item,
          selectedLevel: item.honorRequestedLevel === 'none' ? 'good' : item.honorRequestedLevel,
          selectedLevelLabel: item.honorRequestedLabel || item.honorLevelLabel || '优秀'
        })),
        verifyEntries: verifyEntries || [],
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      api.showError(error)
    }
  },

  changeLevel(event) {
    const index = Number(event.currentTarget.dataset.index)
    const levelIndex = Number(event.detail.value)
    const option = this.data.levelOptions[levelIndex] || this.data.levelOptions[0]
    this.setData({
      [`entries[${index}].selectedLevel`]: option.value,
      [`entries[${index}].selectedLevelLabel`]: option.label
    })
  },

  async runAction(id, action, payload = {}) {
    try {
      wx.showLoading({ title: '处理中' })
      await api.call(action, { id, ...payload })
      wx.hideLoading()
      wx.showToast({ title: '已完成', icon: 'success' })
      await this.loadEntries()
    } catch (error) {
      wx.hideLoading()
      api.showError(error)
    }
  },

  confirmArchive(event) {
    this.runAction(event.currentTarget.dataset.id, 'confirmArchiveEvent')
  },

  confirmGrant(event) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.entries[index]
    if (!item) return
    this.runAction(item._id, 'confirmGrantHonor', {
      honorConfirmedLevel: item.selectedLevel
    })
  },

  markNotGranted(event) {
    this.runAction(event.currentTarget.dataset.id, 'markHonorNotGranted')
  },

  verifyHonor(event) {
    this.runAction(event.currentTarget.dataset.id, 'verifyHonorForWall')
  },

  markNeedRecheck(event) {
    this.runAction(event.currentTarget.dataset.id, 'markHonorNeedRecheck')
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
