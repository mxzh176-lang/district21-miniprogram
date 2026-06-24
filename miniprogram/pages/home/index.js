const api = require('../../utils/api')
const permission = require('../../utils/permission')

Page({
  data: {
    summary: {},
    tasks: [],
    careOverview: {},
    notices: [],
    activities: [],
    teams: [],
    banners: [],
    heroSlides: [],
    selectedTeamId: 'all',
    allTasks: [],
    completedTasks: [],
    allCompletedTasks: [],
    canCreateTask: false
  },

  async onShow() {
    try {
      await this.loadHome()
    } catch (error) {
      api.showError(error)
    }
  },

  async onPullDownRefresh() {
    try {
      await this.loadHome()
    } catch (error) {
      api.showError(error)
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  buildHeroSlides(banners = []) {
    return [
      { type: 'intro', key: 'intro' },
      ...banners.map((src, index) => ({ type: 'image', key: `banner-${index}`, src }))
    ]
  },

  async loadHome() {
    const [data, session] = await Promise.all([
      api.call('getHome'),
      api.call('getSession')
    ])
    const tasks = (data.tasks || []).map(item => ({
      ...item,
      displayMonth: `${Number(String(item.month || '').slice(5, 7)) || ''}月`,
      canComplete: permission.canCompleteTodo(session, item)
    }))
    const completedTasks = (data.completedTasks || []).map(item => ({
      ...item,
      displayMonth: `${Number(String(item.month || '').slice(5, 7)) || ''}月`,
      canComplete: false
    }))
    this.setData({
      ...data,
      heroSlides: this.buildHeroSlides(data.banners || []),
      allTasks: tasks,
      completedTasks,
      allCompletedTasks: completedTasks,
      canCreateTask: permission.canPerform(session, 'tasks', 'create')
    })
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/index' })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  selectTeam(event) {
    const selectedTeamId = event.currentTarget.dataset.id
    const tasks = selectedTeamId === 'all'
      ? this.data.allTasks
      : this.data.allTasks.filter(item => item.teamId === selectedTeamId)
    const completedTasks = selectedTeamId === 'all'
      ? this.data.allCompletedTasks
      : this.data.allCompletedTasks.filter(item => item.teamId === selectedTeamId)
    this.setData({ selectedTeamId, tasks, completedTasks })
  },

  async completeTask(event) {
    const id = event.currentTarget.dataset.id
    const task = this.data.tasks.find(item => item._id === id)
    if (!task || !task.canComplete) {
      wx.showToast({ title: '仅创建人、岗位负责人或管理员可完成', icon: 'none' })
      return
    }
    try {
      await api.call('completeTask', { id })
      wx.showToast({ title: '已完成并归档', icon: 'success' })
      await this.loadHome()
    } catch (error) {
      api.showError(error)
    }
  },

  goContacts() {
    wx.switchTab({ url: '/pages/org/index' })
  },

  goBirthdays() {
    wx.navigateTo({ url: '/pages/tasks/index?category=狮友生日' })
  },

  goMonthlyService() {
    wx.navigateTo({ url: '/pages/tasks/index?category=公益服务' })
  },

  goActivities() {
    wx.switchTab({ url: '/pages/history/index' })
  },

  openActivity(event) {
    wx.navigateTo({ url: `/pages/activities/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  goNotices() {
    wx.navigateTo({ url: '/pages/notices/index' })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' })
  },

  goHonors() {
    wx.navigateTo({ url: '/pages/honors/index' })
  }
})
