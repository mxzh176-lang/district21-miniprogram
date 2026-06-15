const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

Page({
  data: {
    id: '',
    statuses: [
      { value: 'pending', label: '进行中' },
      { value: 'done', label: '已完成' }
    ],
    statusIndex: 0,
    saving: false,
    form: {
      title: '',
      month: '',
      category: '服务',
      owner: '',
      status: 'pending',
      description: ''
    }
  },

  async onLoad(options) {
    const member = await auth.requireApproved({ editor: true })
    if (!member) return
    if (options.id) {
      this.setData({ id: options.id })
      await this.loadTask()
    } else {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      this.setData({ 'form.month': month })
    }
  },

  async loadTask() {
    try {
      const form = await api.call('getTask', { id: this.data.id })
      const statusIndex = this.data.statuses.findIndex(item => item.value === form.status)
      this.setData({ form, statusIndex: Math.max(statusIndex, 0) })
    } catch (error) {
      api.showError(error)
    }
  },

  input(event) {
    this.setData({
      [`form.${event.currentTarget.dataset.key}`]: event.detail.value
    })
  },

  changeMonth(event) {
    this.setData({ 'form.month': event.detail.value })
  },

  changeStatus(event) {
    const statusIndex = Number(event.detail.value)
    this.setData({
      statusIndex,
      'form.status': this.data.statuses[statusIndex].value
    })
  },

  async save() {
    if (!this.data.form.title.trim() || !this.data.form.month) {
      wx.showToast({ title: '请填写事项名称和月份', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveTask', {
        id: this.data.id,
        task: this.data.form
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
        content: '事项将不再对成员显示，并保留管理员操作记录。',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteTask', { id: this.data.id })
      wx.showToast({ title: '已移入回收站', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
