const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

Page({
  data: {
    id: '',
    type: 'notice',
    saving: false,
    form: { title: '', content: '', year: '', pinned: false }
  },

  async onLoad(options) {
    const member = await auth.requireApproved({ editor: true })
    if (!member) return
    const type = options.type === 'history' ? 'history' : 'notice'
    this.setData({ type, id: options.id || '' })
    wx.setNavigationBarTitle({ title: type === 'notice' ? '编辑公告' : '编辑历史记录' })
    if (options.id) {
      const form = await api.call('getContent', { type, id: options.id })
      this.setData({ form })
    }
  },

  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value })
  },

  changePinned(event) {
    this.setData({ 'form.pinned': event.detail.value })
  },

  async save() {
    if (!this.data.form.title.trim()) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveContent', {
        type: this.data.type,
        id: this.data.id,
        content: this.data.form
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
        content: '内容将不再对成员显示，确认继续吗？',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteContent', { type: this.data.type, id: this.data.id })
      wx.showToast({ title: '已移入回收站', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
