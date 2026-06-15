const api = require('../../utils/api')

Page({
  data: {
    activities: [],
    filteredActivities: [],
    teams: [],
    teamId: 'all'
  },

  async onShow() {
    const [activities, teams] = await Promise.all([
      api.call('listActivities'),
      api.call('listTeams')
    ])
    this.setData({ activities, filteredActivities: activities, teams: teams.slice(1) })
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.id
    const filteredActivities = teamId === 'all'
      ? this.data.activities
      : this.data.activities.filter(item => item.teamId === teamId || item.teamId === 'district')
    this.setData({ teamId, filteredActivities })
  },

  openActivity(event) {
    wx.navigateTo({ url: `/pages/activities/detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
