const api = require('../../utils/api')
const permission = require('../../utils/permission')
const rules = require('../../data/honor-rules')

Page({
  data: {
    groups: [],
    records: [],
    counts: { good: 0, great: 0, excellent: 0 },
    overall: 0,
    expandedId: '',
    canCreate: false,
    loading: true,
    term: rules.term,
    version: rules.version
  },

  async onShow() { await this.loadData() },
  async onPullDownRefresh() { await this.loadData(); wx.stopPullDownRefresh() },

  async loadData() {
    try {
      const [records, session] = await Promise.all([
        api.call('listHonorRecords', { organizationId: rules.organizationId, term: rules.term }),
        api.call('getSession')
      ])
      const dashboard = this.buildDashboard(records || [])
      this.setData({
        ...dashboard,
        canCreate: rules.groups.some(group => group.items.some(item => permission.canMaintainHonors(session, {
          organizationId: rules.organizationId,
          positionId: item.positionId
        }, 'create'))),
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      api.showError(error)
    }
  },

  buildDashboard(records) {
    const latest = {}
    records.forEach(item => {
      if (!latest[item.ruleId] || Number(item.value) > Number(latest[item.ruleId].value)) latest[item.ruleId] = item
    })
    const counts = { good: 0, great: 0, excellent: 0 }
    let totalProgress = 0
    let ruleCount = 0
    const groups = rules.groups.map(group => ({
      ...group,
      items: group.items.map(item => {
        const record = latest[item.id]
        const value = Number(record && record.value) || 0
        const state = this.calculateState(item, value)
        if (state.levelKey) counts[state.levelKey] += 1
        totalProgress += state.progress
        ruleCount += 1
        return { ...item, ...state, value, displayValue: this.formatValue(value, item.unit) }
      })
    }))
    return {
      groups,
      counts,
      overall: ruleCount ? Math.round(totalProgress / ruleCount) : 0,
      records: records.map(item => ({ ...item, dateShort: String(item.date || '').slice(5), valueLabel: this.formatValue(item.value, item.unit || '') }))
    }
  },

  calculateState(item, value) {
    const t = item.thresholds
    let levelKey = ''
    let levelName = '进行中'
    let nextName = '优秀'
    let nextValue = t.good
    if (value >= t.excellent) { levelKey = 'excellent'; levelName = '卓越'; nextName = '已达卓越'; nextValue = t.excellent }
    else if (value >= t.great) { levelKey = 'great'; levelName = '杰出'; nextName = '卓越'; nextValue = t.excellent }
    else if (value >= t.good) { levelKey = 'good'; levelName = '优秀'; nextName = '杰出'; nextValue = t.great }
    return {
      levelKey,
      levelName,
      progress: Math.min(100, Math.round(value / t.excellent * 100)),
      nextLabel: nextName === '已达卓越' ? nextName : `距${nextName}还需${Math.max(0, nextValue - value)}${item.unit}`
    }
  },

  formatValue(value, unit) {
    return unit === '元' ? `${Number(value || 0).toLocaleString()}元` : `${Number(value || 0)}${unit}`
  },

  toggle(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  createRecord() { wx.navigateTo({ url: '/pages/honors/edit/index' }) }
})
