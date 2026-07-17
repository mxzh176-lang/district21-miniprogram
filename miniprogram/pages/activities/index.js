const api = require('../../utils/api')
const orgScope = require('../../utils/org-scope')

function filterByTeam(items = [], teamId = 'all') {
  return teamId === 'all'
    ? items
    : items.filter(item => item.teamId === teamId || item.teamId === 'district')
}

Page({
  data: {
    activities: [],
    filteredActivities: [],
    teams: [],
    teamId: 'all'
  },

  async onShow() {
    const currentScope = orgScope.getCurrentScope()
    const teamId = currentScope.teamId || 'all'
    const [activities, teams] = await Promise.all([
      api.call('listActivities'),
      api.call('listTeams')
    ])
    this.setData({ activities, filteredActivities: filterByTeam(activities, teamId), teams: teams.slice(1), teamId })
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.id
    orgScope.setCurrentScopeByTeamId(teamId)
    const filteredActivities = filterByTeam(this.data.activities, teamId)
    this.setData({ teamId, filteredActivities })
  },

  openActivity(event) {
    wx.navigateTo({ url: `/pages/activities/detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
