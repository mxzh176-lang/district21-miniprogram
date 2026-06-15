const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

Page({
  data: {
    id: '',
    saving: false,
    form: {
      title: '',
      date: '',
      location: '',
      owner: '',
      participants: '',
      description: '',
      summary: ''
    }
  },

  async onLoad(options) {
    const member = await auth.requireApproved({ editor: true })
    if (!member) return
    if (options.id) {
      this.setData({ id: options.id })
      const data = await api.call('getActivity', { id: options.id })
      this.setData({ form: data.activity })
    }
  },

  input(event) {
    this.setData({
      [`form.${event.currentTarget.dataset.key}`]: event.detail.value
    })
  },

  changeDate(event) {
    this.setData({ 'form.date': event.detail.value })
  },

  async save() {
    if (!this.data.form.title.trim()) {
      wx.showToast({ title: '请填写活动名称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const result = await api.call('saveActivity', {
        id: this.data.id,
        activity: this.data.form
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      if (!this.data.id) {
        wx.redirectTo({ url: `/pages/activities/detail/index?id=${result.id}` })
      } else {
        setTimeout(() => wx.navigateBack(), 500)
      }
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
        content: '活动和照片将不再对成员显示，管理员操作记录会保留。',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteActivity', { id: this.data.id })
      wx.showToast({ title: '已移入回收站', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/history/index' }), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
