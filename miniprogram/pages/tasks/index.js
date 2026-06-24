const api = require('../../utils/api')
const permission = require('../../utils/permission')

Page({
  data: {
    selectedMonth: '',
    monthLabel: '',
    selectedDay: 'all',
    status: 'all',
    category: 'all',
    categories: [],
    tasks: [],
    taskDates: [],
    teamId: 'all',
    canEdit: false,
    canCreate: false,
    doneCount: 0,
    totalCount: 0
  },

  onLoad(options) {
    const selectedMonth = new Date().toISOString().slice(0, 7)
    this.setData({
      selectedMonth,
      monthLabel: `${Number(selectedMonth.slice(5, 7))}月`,
      category: options.category || 'all',
      teamId: options.teamId || 'all'
    })
  },

  async onShow() {
    const session = await api.call('getSession')
    this.setData({
      canEdit: permission.canPerform(session, 'todo', 'update'),
      canCreate: permission.canPerform(session, 'todo', 'create')
    })
    this.session = session
    await this.loadDates()
    await this.loadTasks()
  },

  async loadDates() {
    const data = await api.call('listTasks', { month: this.data.selectedMonth })
    const grouped = {}
    data.tasks.forEach(item => {
      grouped[item.day] = (grouped[item.day] || 0) + 1
    })
    const taskDates = Object.keys(grouped)
      .sort()
      .map(day => ({ day, count: grouped[day] }))
    this.setData({ taskDates })
  },

  selectDay(event) {
    const selectedDay = event.currentTarget.dataset.day
    this.setData({ selectedDay })
    this.loadTasks()
  },

  async loadTasks() {
    const data = await api.call('listTasks', {
      month: this.data.selectedMonth,
      status: this.data.status,
      category: this.data.category,
      day: this.data.selectedDay
      ,teamId: this.data.teamId
    })
    const monthData = await api.call('listTasks', {
      month: this.data.selectedMonth,
      teamId: this.data.teamId
    })
    this.setData({
      tasks: data.tasks.map(item => ({
        ...item,
        monthShort: String(item.month || '').slice(5, 7),
        completed: ['done', 'completed'].includes(item.status),
        canComplete: permission.canCompleteTodo(this.session, item)
      })),
      categories: data.categories,
      doneCount: monthData.tasks.filter(item => ['done', 'completed'].includes(item.status)).length,
      totalCount: monthData.tasks.length
    })
  },

  selectCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category })
    this.loadTasks()
  },

  selectStatus(event) {
    this.setData({ status: event.currentTarget.dataset.status })
    this.loadTasks()
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  openTask(event) {
    if (!this.data.canEdit) return
    wx.navigateTo({ url: `/pages/admin/task-edit/index?id=${event.currentTarget.dataset.id}` })
  },

  async completeTask(event) {
    const id = event.currentTarget.dataset.id
    const task = this.data.tasks.find(item => item._id === id)
    if (!task || task.completed) return
    if (!task.canComplete) {
      wx.showToast({ title: '仅创建人、岗位负责人或管理员可完成', icon: 'none' })
      return
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '完成待办',
        content: '确认完成后，会自动生成历史事件并归入对应档案。',
        confirmText: '完成',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('completeTask', { id })
      wx.showToast({ title: '已完成并入档案', icon: 'success' })
      await this.loadDates()
      await this.loadTasks()
    } catch (error) {
      api.showError(error)
    }
  }
})
