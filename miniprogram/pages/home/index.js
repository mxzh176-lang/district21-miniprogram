const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')
const todoDisplay = require('../../utils/todo-display')

const ORG_OPTIONS = orgScope.ORG_OPTIONS

Page({
  data: {
    summary: {},
    careOverview: {},
    notices: [],
    activities: [],
    teams: [],
    banners: [],
    heroSlides: [],
    currentOrg: ORG_OPTIONS[0],
    orgOptions: ORG_OPTIONS,
    historyTitle: '最近服务足迹',
    allTasks: [],
    homeTaskGroups: [],
    homePendingCount: 0,
    homeVisibleCount: 0,
    homeHasMore: false,
    allActivities: [],
    allNotices: [],
    baseSummary: {},
    baseCareOverview: {},
    canCreateTask: false
  },

  onLoad() {
    const currentOrg = orgScope.getCurrentScope()
    this.setData({ currentOrg })
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
    this.setData({
      ...data,
      heroSlides: this.buildHeroSlides(data.banners || []),
      monthLabel: `${Number(selectedMonth.slice(5, 7))}月`,
      allTasks,
      allActivities: data.activities || [],
      allNotices: data.notices || [],
      baseSummary: data.summary || {},
      baseCareOverview: data.careOverview || {},
      canCreateTask: permission.canPerform(session, 'todo', 'create')
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
    const tasks = this.data.allTasks.filter(item => orgScope.matchesScope(item, currentOrg))
    const homeTaskGroups = todoDisplay.buildHomeGroups(tasks)
    const homeVisibleCount = homeTaskGroups.reduce((sum, group) => sum + group.tasks.length, 0)
    const homePendingCount = tasks.filter(item => !item.completed).length
    const completedCount = tasks.filter(item => item.completed).length
    const scopedActivities = this.data.allActivities.filter(item => orgScope.matchesScope(item, currentOrg))
    const activities = scopedActivities.slice(0, 3)
    const notices = this.data.allNotices.filter(item => orgScope.matchesScope(item, currentOrg) || !item.teamId).slice(0, 3)
    const baseSummary = this.data.baseSummary || {}
    const currentTeam = teams.find(item => item.id === currentOrg.orgId || item.orgId === currentOrg.orgId)
    const teamMembers = currentOrg.members || (currentTeam && currentTeam.members) || 0
    const memberCount = isDistrict
      ? baseSummary.memberCount || teams.reduce((sum, item) => sum + (Number(item.members) || 0), 0)
      : teamMembers
    const photoCount = isDistrict
      ? baseSummary.photoCount || this.data.allActivities.reduce((sum, item) => sum + (Number(item.photoCount) || 0), 0)
      : scopedActivities.reduce((sum, item) => sum + (Number(item.photoCount) || 0), 0)

    this.setData({
      homeTaskGroups,
      homePendingCount,
      homeVisibleCount,
      homeHasMore: homePendingCount > homeVisibleCount,
      activities,
      notices,
      summary: {
        ...baseSummary,
        pendingCount: homePendingCount,
        doneCount: completedCount,
        memberCount,
        photoCount
      },
      careOverview: this.data.baseCareOverview || {},
      historyTitle: isDistrict ? '最近服务足迹' : '服务队历史事件'
    })
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/index' })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentOrg = orgScope.setCurrentScope(ORG_OPTIONS[result.tapIndex])
        this.setData({ currentOrg })
        this.applyOrgScope()
      }
    })
  },

  openTask(event) {
    const id = event.detail && event.detail.id
    if (!id) return
    wx.navigateTo({ url: `/pages/tasks/index?taskId=${id}` })
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
    wx.navigateTo({ url: '/pages/tasks/index?category=birthday' })
  },

  goMonthlyService() {
    wx.navigateTo({ url: '/pages/tasks/index?category=service' })
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
  }
})
