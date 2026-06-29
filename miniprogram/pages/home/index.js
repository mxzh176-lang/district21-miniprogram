const api = require('../../utils/api')
const permission = require('../../utils/permission')
const todoDisplay = require('../../utils/todo-display')

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
    homeTaskGroups: [],
    homePendingCount: 0,
    homeVisibleCount: 0,
    homeHasMore: false,
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
    const selectedMonth = todoDisplay.currentMonth()
    const [data, session, monthData] = await Promise.all([
      api.call('getHome'),
      api.call('getSession'),
      api.call('listTasks', { month: selectedMonth })
    ])
    const allTasks = todoDisplay.sortTasks((monthData.tasks || []).map(item => todoDisplay.decorateTask(item, session)))
    const pendingCount = allTasks.filter(item => !item.completed).length
    this.setData({
      ...data,
      heroSlides: this.buildHeroSlides(data.banners || []),
      monthLabel: `${Number(selectedMonth.slice(5, 7))}月`,
      summary: { ...(data.summary || {}), pendingCount },
      allTasks,
      homePendingCount: pendingCount,
      canCreateTask: permission.canPerform(session, 'todo', 'create')
    })
    this.updateHomeTaskGroups()
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/index' })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  selectTeam(event) {
    const selectedTeamId = event.currentTarget.dataset.id
    this.setData({ selectedTeamId })
    this.updateHomeTaskGroups()
  },

  updateHomeTaskGroups() {
    const tasks = this.data.selectedTeamId === 'all'
      ? this.data.allTasks
      : this.data.allTasks.filter(item => todoDisplay.matchesTeam(item, this.data.selectedTeamId))
    const homeTaskGroups = todoDisplay.buildHomeGroups(tasks)
    const homeVisibleCount = homeTaskGroups.reduce((sum, group) => sum + group.tasks.length, 0)
    const homePendingCount = tasks.filter(item => !item.completed).length
    this.setData({
      homeTaskGroups,
      homePendingCount,
      homeVisibleCount,
      homeHasMore: homePendingCount > homeVisibleCount
    })
  },

  openTask(event) {
    const id = event.detail && event.detail.id
    if (!id) return
    wx.navigateTo({ url: `/pages/admin/task-edit/index?id=${id}` })
  },

  async completeTask(event) {
    const id = event.detail && event.detail.id ? event.detail.id : event.currentTarget.dataset.id
    const task = this.data.allTasks.find(item => item._id === id)
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
