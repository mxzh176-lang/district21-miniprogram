const api = require('../../../utils/api')

const LEVEL_FILTERS = [
  { value: '', label: '全部' },
  { value: 'good', label: '优秀' },
  { value: 'great', label: '杰出' },
  { value: 'excellent', label: '卓越' }
]

function totalCount(counts) {
  counts = counts || {}
  return (counts.good || 0) + (counts.great || 0) + (counts.excellent || 0)
}

Page({
  data: {
    organizationId: '',
    level: '',
    positionId: '',
    recipientUserId: '',
    termKey: '',
    stats: { counts: { good: 0, great: 0, excellent: 0 }, events: [], chairStats: [], memberStats: [], positions: [] },
    levelFilters: LEVEL_FILTERS,
    levelIndex: 0,
    positionOptions: [{ id: '', name: '全部岗位' }],
    positionIndex: 0,
    chairOptions: [{ userId: '', name: '全部主席' }],
    chairIndex: 0,
    termOptions: [{ key: '', label: '当前任期' }],
    termIndex: 0,
    loading: true
  },

  onLoad(options) {
    const levelIndex = Math.max(LEVEL_FILTERS.findIndex(item => item.value === (options.level || '')), 0)
    this.setData({
      organizationId: options.organization || 'yuanhang',
      level: options.level || '',
      levelIndex
    })
    wx.setNavigationBarTitle({ title: '荣誉事件墙' })
  },

  async onShow() {
    await this.loadStats()
  },

  async loadStats() {
    try {
      this.setData({ loading: true })
      const stats = await api.call('getArchiveHonorStats', {
        organizationId: this.data.organizationId,
        level: this.data.level,
        positionId: this.data.positionId,
        recipientUserId: this.data.recipientUserId,
        termKey: this.data.termKey
      })
      const positionOptions = [{ id: '', name: '全部岗位' }].concat(stats.positions || [])
      const chairOptions = [{ userId: '', name: '全部主席' }].concat((stats.chairStats || []).map(item => ({
        userId: item.userId,
        name: item.name || '未命名主席'
      })))
      const termOptions = [{ key: '', label: '当前任期' }].concat(stats.terms || [])
      this.setData({
        stats: stats || this.data.stats,
        positionOptions,
        chairOptions,
        termOptions,
        positionIndex: Math.max(positionOptions.findIndex(item => item.id === this.data.positionId), 0),
        chairIndex: Math.max(chairOptions.findIndex(item => item.userId === this.data.recipientUserId), 0),
        termIndex: Math.max(termOptions.findIndex(item => item.key === this.data.termKey), 0),
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      api.showError(error)
    }
  },

  async changeLevel(event) {
    const levelIndex = Number(event.detail.value)
    const item = this.data.levelFilters[levelIndex] || this.data.levelFilters[0]
    this.setData({ levelIndex, level: item.value })
    await this.loadStats()
  },

  async changePosition(event) {
    const positionIndex = Number(event.detail.value)
    const item = this.data.positionOptions[positionIndex] || this.data.positionOptions[0]
    this.setData({ positionIndex, positionId: item.id })
    await this.loadStats()
  },

  async changeChair(event) {
    const chairIndex = Number(event.detail.value)
    const item = this.data.chairOptions[chairIndex] || this.data.chairOptions[0]
    this.setData({ chairIndex, recipientUserId: item.userId })
    await this.loadStats()
  },

  async changeTerm(event) {
    const termIndex = Number(event.detail.value)
    const item = this.data.termOptions[termIndex] || this.data.termOptions[0]
    this.setData({ termIndex, termKey: item.key })
    await this.loadStats()
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  totalCount
})
