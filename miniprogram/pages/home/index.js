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
    selectedTeamId: 'all',
    allTasks: []
  },

  async onShow() {
    const data = await api.call('getHome')
    this.setData({ ...data, allTasks: data.tasks })
  },

  async onPullDownRefresh() {
    const data = await api.call('getHome')
    this.setData({ ...data, allTasks: data.tasks })
    wx.stopPullDownRefresh()
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
