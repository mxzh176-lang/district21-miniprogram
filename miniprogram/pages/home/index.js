const api = require('../../utils/api')

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
    allTasks: []
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
    const data = await api.call('getHome')
    const tasks = data.tasks || []
    this.setData({
      ...data,
      heroSlides: this.buildHeroSlides(data.banners || []),
      allTasks: tasks
    })
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/index' })
  },

  selectTeam(event) {
    const selectedTeamId = event.currentTarget.dataset.id
    const tasks = selectedTeamId === 'all'
      ? this.data.allTasks
      : this.data.allTasks.filter(item => item.teamId === selectedTeamId)
    this.setData({ selectedTeamId, tasks })
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

  goStructure() {
    wx.navigateTo({ url: '/pages/structure/index' })
  }
})
