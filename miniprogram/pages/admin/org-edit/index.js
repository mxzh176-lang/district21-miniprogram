const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

Page({
  data: {
    id: '',
    saving: false,
    form: {
      position: '',
      person: '',
      committee: '',
      order: 100,
      description: ''
    }
  },

  async onLoad(options) {
    const member = await auth.requireApproved({ editor: true })
    if (!member) return
    if (options.id) {
      this.setData({ id: options.id })
      await this.loadOrg()
    }
  },

  async loadOrg() {
    try {
      const form = await api.call('getOrg', { id: this.data.id })
      this.setData({ form })
    } catch (error) {
      api.showError(error)
    }
  },

  input(event) {
    this.setData({
      [`form.${event.currentTarget.dataset.key}`]: event.detail.value
    })
  },

  async save() {
    if (!this.data.form.position.trim()) {
      wx.showToast({ title: '请填写岗位名称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveOrg', {
        id: this.data.id,
        unit: this.data.form
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    } finally {
      this.setData({ saving: false })
    }
  },

  async remove() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '移入回收站',
        content: '岗位将不再对成员显示，并保留管理员操作记录。',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteOrg', { id: this.data.id })
      wx.showToast({ title: '已移入回收站', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
