const api = require('../../utils/api')
const permission = require('../../utils/permission')

const CURRENT_ORG_SCOPE = 'CURRENT_ORG_SCOPE'
const ORG_OPTIONS = [
  { orgType: 'district', orgId: 'district21', orgName: '二十一协作区', teamId: 'all', dataId: 'district', shortName: '协作区', members: 120 },
  { orgType: 'team', orgId: 'linghang', orgName: '领航服务队', teamId: 'linghang', dataId: 'linghang', shortName: '领航', members: 31 },
  { orgType: 'team', orgId: 'ailinghang', orgName: '爱领航服务队', teamId: 'ailinghang', dataId: 'ailinghang', shortName: '爱领航', members: 29 },
  { orgType: 'team', orgId: 'yuanhang', orgName: '远航服务队', teamId: 'yuanhang', dataId: 'yuanhang', shortName: '远航', members: 32 },
  { orgType: 'team', orgId: 'jingying', orgName: '精英服务队', teamId: 'jingying', dataId: 'jingying', shortName: '精英', members: 28 }
]

function orgForCache(value) {
  const orgId = value && value.orgId
  return ORG_OPTIONS.find(item => item.orgId === orgId) || ORG_OPTIONS[0]
}

function teamIdsForOrg(org) {
  if (!org || org.orgType === 'district') return []
  return [org.orgId, org.teamId, org.dataId, `org_team_${org.orgId}`].filter(Boolean)
}

function matchesCurrentOrg(item, org) {
  if (!org || org.orgType === 'district') return true
  const ids = teamIdsForOrg(org)
  return ids.includes(item.teamId) ||
    ids.includes(item.organizationId) ||
    ids.includes(item.team) ||
    String(item.team || '').includes(org.shortName) ||
    String(item.team || '').includes(org.orgName)
}

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
    let cached = null
    try { cached = wx.getStorageSync(CURRENT_ORG_SCOPE) } catch (error) { cached = null }
    const currentOrg = orgForCache(cached)
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
    const tasks = this.data.allTasks.filter(item => matchesCurrentOrg(item, currentOrg))
    const completedTasks = this.data.allCompletedTasks.filter(item => matchesCurrentOrg(item, currentOrg))
    const scopedActivities = this.data.allActivities.filter(item => matchesCurrentOrg(item, currentOrg))
    const activities = scopedActivities.slice(0, 3)
    const notices = this.data.allNotices.filter(item => matchesCurrentOrg(item, currentOrg) || !item.teamId).slice(0, 3)
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
    const teamId = this.data.currentOrg.orgType === 'team' ? this.data.currentOrg.teamId : 'all'
    wx.navigateTo({ url: `/pages/tasks/index?teamId=${teamId}` })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  selectTeam(event) {
    const selectedTeamId = event.currentTarget.dataset.id
    const currentOrg = ORG_OPTIONS.find(item => item.orgId === selectedTeamId || item.teamId === selectedTeamId) || ORG_OPTIONS[0]
    wx.setStorageSync(CURRENT_ORG_SCOPE, {
      orgType: currentOrg.orgType,
      orgId: currentOrg.orgId,
      orgName: currentOrg.orgName
    })
    this.setData({ currentOrg })
    this.applyOrgScope()
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentOrg = ORG_OPTIONS[result.tapIndex] || ORG_OPTIONS[0]
        wx.setStorageSync(CURRENT_ORG_SCOPE, {
          orgType: currentOrg.orgType,
          orgId: currentOrg.orgId,
          orgName: currentOrg.orgName
        })
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
    const organization = this.data.currentOrg.orgType === 'team' ? this.data.currentOrg.orgId : 'district'
    wx.navigateTo({ url: `/pages/archive/honor-wall/index?organization=${organization}` })
  },

  goArchive() {
    wx.switchTab({ url: '/pages/archive/index' })
  }
})
