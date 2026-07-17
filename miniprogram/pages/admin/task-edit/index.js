const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const TODO_ORGANIZATION_ID = 'org_team_yuanhang'
const CATEGORY_OPTIONS = ['生日关爱', '婚丧嫁娶', '公益服务', '联谊活动', '会议培训', '其他']

function today() {
  const date = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

Page({
  data: {
    id: '',
    categories: CATEGORY_OPTIONS,
    categoryIndex: CATEGORY_OPTIONS.length - 1,
    saving: false,
    canDelete: false,
    form: {
      title: '',
      date: '',
      category: '其他'
    }
  },

  async onLoad(options) {
    try {
      const session = await api.call('getSession')
      const editing = Boolean(options.id)
      const allowed = editing ? permission.canManageTodo(session) : permission.canCreateTodo(session)
      if (!allowed) {
        wx.showToast({ title: editing ? '仅管理员可编辑待办' : '仅远航内部成员可发布待办', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 700)
        return
      }
      this.session = session
      this.setData({
        id: options.id || '',
        canDelete: editing && permission.canManageTodo(session),
        'form.date': today()
      })
      wx.setNavigationBarTitle({ title: editing ? '编辑待办' : '新建待办' })
      if (editing) await this.loadTask()
    } catch (error) {
      api.showError(error)
    }
  },

  async loadTask() {
    try {
      const task = await api.call('getTask', { id: this.data.id })
      const categoryIndex = Math.max(this.data.categories.indexOf(task.category), 0)
      this.setData({
        categoryIndex,
        form: {
          title: task.title || '',
          date: task.date || today(),
          category: this.data.categories[categoryIndex]
        }
      })
    } catch (error) {
      api.showError(error)
    }
  },

  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value })
  },

  changeDate(event) {
    this.setData({ 'form.date': event.detail.value })
  },

  changeCategory(event) {
    const categoryIndex = Number(event.detail.value)
    this.setData({
      categoryIndex,
      'form.category': this.data.categories[categoryIndex]
    })
  },

  async save() {
    const title = this.data.form.title.trim()
    if (!title || !this.data.form.date) {
      wx.showToast({ title: '请填写事项内容并选择日期', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveTask', {
        id: this.data.id,
        task: {
          title,
          date: this.data.form.date,
          category: this.data.form.category,
          organizationId: TODO_ORGANIZATION_ID
        }
      })
      wx.showToast({ title: this.data.id ? '修改成功' : '发布成功', icon: 'success' })
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
        title: '删除待办',
        content: '删除后普通成员将无法查看此待办。',
        confirmText: '删除',
        confirmColor: '#c4473a',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteTask', { id: this.data.id })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
