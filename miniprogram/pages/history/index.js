const api = require('../../utils/api')
const permission = require('../../utils/permission')

Page({
  data: {
    events: [],
    filteredEvents: [],
    teams: [],
    teamId: 'all',
    canEdit: false
  },

  async onShow() {
    const [events, teams, member] = await Promise.all([
      api.call('listArchiveEntries'),
      api.call('listTeams'),
      api.call('getSession')
    ])
    const sorted = events
      .filter(item => item.status === 'published')
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(item => ({
        ...item,
        type: item.uploaderRole,
        description: item.summary,
        teamId: item.organizationId,
        dateYear: item.date.slice(0, 4),
        dateDay: item.date.slice(5)
      }))
    this.setData({
      events: sorted,
      filteredEvents: sorted.slice(0, 50),
      teams,
      canEdit: permission.canPerform(member, 'history', 'update') || permission.canPerform(member, 'history', 'delete')
    })
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.id
    const filteredEvents = teamId === 'all'
      ? this.data.events
      : this.data.events.filter(item => item.teamId === teamId)
    this.setData({ teamId, filteredEvents: filteredEvents.slice(0, 50) })
  },

  openEvent(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  deleteEvent(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除历史事件',
      content: '删除后，该事件及对应档案将不再显示。确认删除吗？',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteArchiveEntry', { id })
          const events = this.data.events.filter(item => item._id !== id)
          const filtered = this.data.teamId === 'all'
            ? events
            : events.filter(item => item.teamId === this.data.teamId)
          this.setData({
            events,
            filteredEvents: filtered.slice(0, 50)
          })
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
