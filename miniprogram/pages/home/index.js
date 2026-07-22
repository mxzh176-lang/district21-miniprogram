const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')
const todoDisplay = require('../../utils/todo-display')
const { uploadOrgFile } = require('../../services/file-upload-service')
const TODO_SYNC_INTERVAL = 5000

const ORG_OPTIONS = orgScope.ORG_OPTIONS
const BANNER_ORGANIZATION_IDS = {
  district: 'org_region_21_suihua',
  district21: 'org_region_21_suihua',
  linghang: 'org_team_linghang',
  ailinghang: 'org_team_ailinghang',
  yuanhang: 'org_team_yuanhang',
  jingying: 'org_team_jingying'
}
function archiveOrganizationId(scope = {}) {
  return scope.dataId || scope.orgId || 'district'
}

function bannerOrganizationId(scope = {}) {
  const rawId = scope.cloudId || scope.organizationId || scope.orgId || scope.dataId || 'district'
  return BANNER_ORGANIZATION_IDS[rawId] || rawId || 'org_region_21_suihua'
}

function formatArchiveDate(value) {
  const text = String(value || '')
  if (text.length < 10) return text
  return `${text.slice(0, 4)}年${Number(text.slice(5, 7))}月${Number(text.slice(8, 10))}日`
}

function archiveSortTime(item = {}) {
  return String(item.updatedAt || item.createdAt || item.date || '')
}

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
    baseBanners: [],
    session: null,
    canCreateTask: false,
    canManageBanners: false,
    bannerSaving: false
  },

  onLoad() {
    const currentOrg = orgScope.getCurrentScope()
    this.setData({ currentOrg })
  },

  async onShow() {
    try {
      await this.loadHome()
      this.startTodoSync()
    } catch (error) {
      api.showError(error)
    }
  },

  onHide() {
    this.stopTodoSync()
  },

  onUnload() {
    this.stopTodoSync()
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

  bannerSources(items = []) {
    return items
      .map(item => typeof item === 'string' ? item : item.src || item.imageUrl || item.fileID || item.fileId || '')
      .filter(Boolean)
  },

  refreshBannerPermission(session = this.data.session, currentOrg = this.data.currentOrg) {
    const canManageBanners = permission.canManageTeamHomeBanner(session, bannerOrganizationId(currentOrg))
    this.setData({ canManageBanners })
  },

  async loadHomeBannersForScope() {
    const currentOrg = this.data.currentOrg || ORG_OPTIONS[0]
    const organizationId = bannerOrganizationId(currentOrg)
    try {
      const response = await api.call('listHomeBanners', { organizationId })
      const configured = Array.isArray(response)
        ? response.length > 0
        : Boolean(response && response.configured)
      const banners = Array.isArray(response)
        ? response
        : response && (response.banners || response.items) || []
      const sources = this.bannerSources(banners)
      const visibleSources = configured ? sources : (sources.length ? sources : this.data.baseBanners)
      this.setData({
        banners: sources,
        heroSlides: this.buildHeroSlides(visibleSources)
      })
    } catch (error) {
      const fallback = this.data.baseBanners || []
      this.setData({
        banners: fallback,
        heroSlides: this.buildHeroSlides(fallback)
      })
    }
  },

  async loadHome() {
    const selectedMonth = todoDisplay.currentMonth()
    const [data, session, monthData] = await Promise.all([
      api.call('getHome'),
      api.call('getSession'),
      api.call('listTasks', { month: 'all' })
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
      baseBanners: data.banners || [],
      session,
      canCreateTask: permission.canCreateTodo(session)
    })
    this.refreshBannerPermission(session)
    this.applyOrgScope()
    await this.loadHomeBannersForScope()
  },

  startTodoSync() {
    this.stopTodoSync()
    this.todoSyncTimer = setInterval(() => this.refreshTodoTasks(), TODO_SYNC_INTERVAL)
  },

  stopTodoSync() {
    if (!this.todoSyncTimer) return
    clearInterval(this.todoSyncTimer)
    this.todoSyncTimer = null
  },

  async refreshTodoTasks() {
    if (this.todoSyncing || !this.data.session) return
    this.todoSyncing = true
    try {
      const monthData = await api.call('listTasks', { month: 'all' }, { forceRefresh: true })
      const allTasks = todoDisplay.sortTasks((monthData.tasks || []).map(item =>
        todoDisplay.decorateTask(item, this.data.session)))
      this.setData({ allTasks })
      this.applyOrgScope({ refreshArchive: false })
    } catch (error) {
    } finally {
      this.todoSyncing = false
    }
  },

  applyOrgScope(options = {}) {
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
    const tasks = this.data.allTasks.filter(item => item.visibleToAll || orgScope.matchesScope(item, currentOrg))
    const homeTaskGroups = todoDisplay.buildHomeGroups(tasks)
    const homeVisibleCount = homeTaskGroups.reduce((sum, group) => sum + group.tasks.length, 0)
    const homePendingCount = tasks.filter(item => !item.completed).length
    const completedCount = tasks.filter(item => item.completed).length
    const scopedActivities = this.data.allActivities.filter(item => orgScope.matchesScope(item, currentOrg))
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
      activities: [],
      notices,
      summary: {
        ...baseSummary,
        pendingCount: homePendingCount,
        doneCount: completedCount,
        memberCount,
        photoCount
      },
      careOverview: this.data.baseCareOverview || {},
      historyTitle: '最新归档'
    })
    if (options.refreshArchive !== false) this.loadArchiveEventsForHome()
  },

  async loadArchiveEventsForHome() {
    const organizationId = archiveOrganizationId(this.data.currentOrg)
    try {
      let entries = await api.call('listArchiveEntries', { organizationId })
      if (!entries || !entries.length) entries = await api.call('listArchiveEntries', { organizationId, status: 'archived' })
      const latestEntries = (entries || [])
        .slice()
        .sort((a, b) => archiveSortTime(b).localeCompare(archiveSortTime(a)))
        .slice(0, 5)
      const activities = latestEntries.map(item => ({
        ...item,
        mark: '档',
        dateLabel: formatArchiveDate(item.date),
        carouselPhotos: (item.photos || []).filter(Boolean).slice(0, 5),
        team: item.team || this.data.currentOrg.orgName,
        photoCount: item.photoCount || (item.photos || []).length || 0,
        tone: item.tone || 'blue'
      }))
      if (archiveOrganizationId(this.data.currentOrg) === organizationId) {
        this.setData({ activities })
      }
    } catch (error) {
      this.setData({ activities: [] })
    }
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
        this.refreshBannerPermission()
        this.applyOrgScope()
        this.loadHomeBannersForScope()
      }
    })
  },

  editHomeBanners() {
    if (!this.data.canManageBanners || this.data.bannerSaving) return
    wx.showActionSheet({
      itemList: ['替换当前轮播图', '清空当前轮播图'],
      success: result => {
        if (result.tapIndex === 0) this.chooseHomeBanners()
        if (result.tapIndex === 1) this.clearHomeBanners()
      }
    })
  },

  async chooseHomeBanners() {
    try {
      const media = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 9,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: resolve,
          fail: reject
        })
      })
      const files = media.tempFiles || []
      if (!files.length) return
      await this.saveSelectedHomeBanners(files)
    } catch (error) {
      if (error && !String(error.errMsg || '').includes('cancel')) api.showError(error)
    }
  },

  async saveSelectedHomeBanners(files = []) {
    const currentOrg = this.data.currentOrg || ORG_OPTIONS[0]
    const organizationId = bannerOrganizationId(currentOrg)
    this.setData({ bannerSaving: true })
    wx.showLoading({ title: '上传轮播图' })
    try {
      const uploaded = await Promise.all(files.map((item, index) => uploadOrgFile({
        filePath: item.tempFilePath || item.path,
        organizationId,
        leaderRole: '首页轮播',
        departmentName: '',
        eventName: `${currentOrg.orgName || '当前范围'}首页轮播`,
        sequence: index,
        resourceType: 'home_banner',
        resourceId: organizationId,
        module: 'photos'
      })))
      const banners = uploaded.map(item => item.fileID).filter(Boolean)
      await api.call('saveHomeBanners', {
        organizationId,
        scopeName: currentOrg.orgName,
        banners
      })
      await this.loadHomeBannersForScope()
      wx.showToast({ title: '轮播已更新', icon: 'success' })
    } catch (error) {
      api.showError(error)
    } finally {
      wx.hideLoading()
      this.setData({ bannerSaving: false })
    }
  },

  async clearHomeBanners() {
    const currentOrg = this.data.currentOrg || ORG_OPTIONS[0]
    const organizationId = bannerOrganizationId(currentOrg)
    this.setData({ bannerSaving: true })
    try {
      await api.call('saveHomeBanners', {
        organizationId,
        scopeName: currentOrg.orgName,
        banners: []
      })
      await this.loadHomeBannersForScope()
      wx.showToast({ title: '已清空轮播', icon: 'success' })
    } catch (error) {
      api.showError(error)
    } finally {
      this.setData({ bannerSaving: false })
    }
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
      wx.showToast({ title: '仅管理员可完成待办', icon: 'none' })
      return
    }
    try {
      await api.call('completeTask', { id })
      wx.showToast({ title: '已标记完成', icon: 'success' })
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
    wx.navigateTo({ url: `/pages/archive/list/index?organization=${archiveOrganizationId(this.data.currentOrg)}&category=all` })
  },

  openActivity(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' })
  }
})
