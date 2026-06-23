const api = require('../../../utils/api')
const permission = require('../../../utils/permission')
const rules = require('../../../data/honor-rules')

const allRules = []
rules.groups.forEach(group => group.items.forEach(item => allRules.push({ ...item, groupName: group.name })))

Page({
  data: {
    allowed: false,
    ruleOptions: allRules.map(item => `${item.groupName} · ${item.name}`),
    ruleIndex: 0,
    selectedRule: allRules[0],
    recipient: '',
    value: '',
    date: '',
    note: '',
    saving: false
  },

  async onLoad() {
    try {
      const session = await api.call('getSession')
      this.allowedRules = allRules.filter(rule => permission.canMaintainHonors(session, this.context(rule), 'create'))
      const selectedRule = this.allowedRules[0]
      if (!selectedRule) {
        wx.showToast({ title: '没有荣誉录入权限', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 600)
        return
      }
      this.setData({
        allowed: true,
        date: new Date().toISOString().slice(0, 10),
        selectedRule,
        ruleOptions: this.allowedRules.map(item => `${item.groupName} · ${item.name}`)
      })
    } catch (error) { api.showError(error) }
  },

  context(rule) {
    return { organizationId: rules.organizationId, positionId: rule.positionId }
  },

  async changeRule(event) {
    const ruleIndex = Number(event.detail.value)
    const selectedRule = this.allowedRules[ruleIndex]
    this.setData({ ruleIndex, selectedRule })
  },

  bindField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },

  async submit() {
    if (this.data.saving) return
    const recipient = String(this.data.recipient || '').trim()
    const value = Number(this.data.value)
    if (!recipient) return wx.showToast({ title: '请填写表彰对象', icon: 'none' })
    if (!Number.isFinite(value) || value < 0) return wx.showToast({ title: '请填写有效累计值', icon: 'none' })
    this.setData({ saving: true })
    try {
      const rule = this.data.selectedRule
      await api.call('saveHonorRecord', {
        record: {
          organizationId: rules.organizationId,
          term: rules.term,
          ruleId: rule.id,
          positionId: rule.positionId,
          ruleName: rule.name,
          metric: rule.metric,
          unit: rule.unit,
          recipient,
          value,
          date: this.data.date,
          note: String(this.data.note || '').trim()
        }
      })
      wx.showToast({ title: '已更新达成进度', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (error) {
      this.setData({ saving: false })
      api.showError(error)
    }
  }
})
