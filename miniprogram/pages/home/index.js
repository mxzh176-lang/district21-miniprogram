const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

const ORG_OPTIONS = orgScope.ORG_OPTIONS

function decorateTasks(tasks, session) {
  return (tasks || []).map(item => ({
    ...item,
    displayMonth: `${Number(String(item.month || '').slice(5, 7)) || ''}月`,
    canComplete: permission.canCompleteTodo(session, item)
  }))
}

function decorateCompletedTasks(tasks) {
  return (tasks || []).map(item => ({
    ...item,
    displayMonth: `${Number(String(item.month || '').slice(5, 7)) || ''}月`,
    canComplete: false
  }))
}

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
    currentOrg: ORG_OPTIONS[0],
    orgOptions: ORG_OPTIONS,
    visibleTeams: [],
    honorTitle: '协作区荣誉与表彰',
    archiveTitle: '协作区档案入口',
    archiveDesc: '查看协作区与服务队岗位档案',
    historyTitle: '最近服务足迹',
    allTasks: [],
    completedTasks: [],
    allCompletedTasks: [],
    allActivities: [],
    allNotices: [],
    baseSummary: {},
    baseCareOverview: {},
    canCreateTask: false
  },

  onLoad() {
    const currentOrg = orgScope.getCurrentScope()
    this.setData({
      currentOrg,
      selectedTeamId: currentOrg.teamId
    })
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
    this.setData({
      ...data,
      heroSlides: this.buildHeroSlides(data.banners || []),
      allTasks: decorateTasks(data.tasks || [], session),
      allCompletedTasks: decorateCompletedTasks(data.completedTasks || []),
      allActivities: data.activities || [],
      allNotices: data.notices || [],
      baseSummary: data.summary || {},
      baseCareOverview: data.careOverview || {},
      canCreateTask: permission.canPerform(session, 'tasks', 'create')
    })
    this.applyOrgScope()
  },

  applyOrgScope() {
    const currentOrg = this.data.currentOrg || ORG_OPTIONS[0]
    const isDistrict = currentOrg.orgType === 'district'
    const teams = (this.data.teams && this.data.teams.length ? this.data.teams : ORG_OPTIONS)
      .map(item => ({
        ...item,
        id: item.id || item.orgId,
        shortName: item.shortName || item.orgName,
        color: item.color || '#7a5b91',
        members: Number(item.members) || 0
      }))
      .filter(item => item.id !== 'district' && item.orgId !== 'district21')
    const visibleTeams = isDistrict
      ? teams
      : teams.filter(item => item.id === currentOrg.orgId || item.orgId === currentOrg.orgId)
    const tasks = this.data.allTasks.filter(item => orgScope.matchesScope(item, currentOrg))
    const completedTasks = this.data.allCompletedTasks.filter(item => orgScope.matchesScope(item, currentOrg))
    const scopedActivities = this.data.allActivities.filter(item => orgScope.matchesScope(item, currentOrg))
    const activities = scopedActivities.slice(0, 3)
    const notices = this.data.allNotices.filter(item => orgScope.matchesScope(item, currentOrg) || !item.teamId).slice(0, 3)
    const baseSummary = this.data.baseSummary || {}
    const teamMembers = currentOrg.members || (visibleTeams[0] && visibleTeams[0].members) || 0
    const memberCount = isDistrict
      ? baseSummary.memberCount || teams.reduce((sum, item) => sum + (Number(item.members) || 0), 0)
      : teamMembers
    const photoCount = isDistrict
      ? baseSummary.photoCount || this.data.allActivities.reduce((sum, item) => sum + (Number(item.photoCount) || 0), 0)
      : scopedActivities.reduce((sum, item) => sum + (Number(item.photoCount) || 0), 0)
    this.setData({
      visibleTeams,
      selectedTeamId: currentOrg.teamId,
      tasks: tasks.slice(0, 4),
      completedTasks: completedTasks.slice(0, 4),
      activities,
      notices,
      summary: {
        ...baseSummary,
        pendingCount: tasks.length,
        doneCount: completedTasks.length,
        memberCount,
        photoCount
      },
      careOverview: this.data.baseCareOverview || {},
      honorTitle: `${isDistrict ? '协作区' : currentOrg.orgName}荣誉与表彰`,
      archiveTitle: `${isDistrict ? '协作区' : currentOrg.orgName}档案入口`,
      archiveDesc: isDistrict ? '查看协作区与服务队岗位档案' : '查看本服务队岗位档案与历史沉淀',
      historyTitle: isDistrict ? '最近服务足迹' : '服务队历史事件'
    })
  },

  goTasks() {
    wx.switchTab({ url: '/pages/tasks/index' })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  selectTeam(event) {
    const selectedTeamId = event.currentTarget.dataset.id
    const currentOrg = ORG_OPTIONS.find(item => item.orgId === selectedTeamId || item.teamId === selectedTeamId) || ORG_OPTIONS[0]
    orgScope.setCurrentScope(currentOrg)
    this.setData({ currentOrg })
    this.applyOrgScope()
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentOrg = ORG_OPTIONS[result.tapIndex] || ORG_OPTIONS[0]
        orgScope.setCurrentScope(currentOrg)
        this.setData({ currentOrg })
        this.applyOrgScope()
      }
    })
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
    wx.switchTab({ url: '/pages/tasks/index' })
  },

  goMonthlyService() {
    wx.switchTab({ url: '/pages/tasks/index' })
  },

  goActivities() {
    wx.navigateTo({ url: '/pages/history/index' })
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
    const organization = this.data.currentOrg.orgType === 'team' ? this.data.currentOrg.orgId : 'district'
    wx.navigateTo({ url: `/pages/archive/honor-wall/index?organization=${organization}` })
  },

  goArchive() {
    wx.switchTab({ url: '/pages/archive/index' })
  }
})
