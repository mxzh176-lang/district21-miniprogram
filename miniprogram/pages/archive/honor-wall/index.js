const api = require('../../../utils/api')

const LEVEL_FILTERS = [
  { value: '', label: '全部' },
  { value: 'excellent', label: '五星' },
  { value: 'great', label: '四星' },
  { value: 'good', label: '三星' },
  { value: 'twoStar', label: '二星' },
  { value: 'oneStar', label: '一星' }
]

function normalizeCounts(counts = {}) {
  return {
    fiveStar: counts.fiveStar || counts.excellent || 0,
    fourStar: counts.fourStar || counts.great || 0,
    threeStar: counts.threeStar || counts.good || 0,
    twoStar: counts.twoStar || 0,
    oneStar: counts.oneStar || 0
  }
}

function starLabel(value) {
  const map = {
    excellent: '五星',
    great: '四星',
    good: '三星',
    fiveStar: '五星',
    fourStar: '四星',
    threeStar: '三星',
    twoStar: '二星',
    oneStar: '一星',
    卓越: '五星',
    杰出: '四星',
    优秀: '三星'
  }
  return map[value] || value || ''
}

function decorateStats(stats = {}) {
  const counts = normalizeCounts(stats.counts)
  const decorateList = list => (list || []).map(item => ({
    ...item,
    starCounts: normalizeCounts(item.counts)
  }))
  return {
    ...stats,
    starCounts: counts,
    events: (stats.events || []).map(item => ({
      ...item,
      honorStarLabel: starLabel(item.honorConfirmedLevel || item.honorRequestedLevel || item.honorLevelLabel || item.honorConfirmedLabel)
    })),
    chairStats: decorateList(stats.chairStats),
    memberStats: decorateList(stats.memberStats)
  }
}

function totalCount(counts) {
  counts = counts || {}
  return (counts.oneStar || 0) + (counts.twoStar || 0) + (counts.threeStar || counts.good || 0) + (counts.fourStar || counts.great || 0) + (counts.fiveStar || counts.excellent || 0)
}

Page({
  data: {
    organizationId: '',
    level: '',
    positionId: '',
    recipientUserId: '',
    termKey: '',
    stats: { counts: {}, starCounts: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0 }, events: [], chairStats: [], memberStats: [], positions: [] },
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
        stats: decorateStats(stats || this.data.stats),
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
