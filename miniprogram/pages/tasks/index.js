const api = require('../../utils/api')

Page({
  data: {
    selectedMonth: '2026-06',
    selectedDay: 'all',
    status: 'all',
    category: 'all',
    categories: [],
    tasks: [],
    taskDates: []
    ,teamId: 'all'
  },

  onLoad(options) {
    this.setData({
      category: options.category || 'all',
      teamId: options.teamId || 'all'
    })
  },

  async onShow() {
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
    this.setData({ tasks: data.tasks, categories: data.categories })
  },

  selectCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category })
    this.loadTasks()
  },

  selectStatus(event) {
    this.setData({ status: event.currentTarget.dataset.status })
    this.loadTasks()
  }
})
