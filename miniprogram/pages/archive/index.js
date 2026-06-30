const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

function categoryNameMap(organization = {}) {
  const map = {}
  ;(organization.categories || []).forEach(category => {
    if (category.id) map[category.id] = category.name
    ;(category.children || []).forEach(child => {
      if (child.id) map[child.id] = child.name
    })
  })
  return map
}

function formatRecentDate(value) {
  const text = String(value || '')
  if (!text || text.length < 10) return text
  return `${text.slice(0, 4)}年${Number(text.slice(5, 7))}月${Number(text.slice(8, 10))}日`
}

function archiveSortTime(item = {}) {
  return String(item.updatedAt || item.createdAt || item.date || '')
}

Page({
  data: {
    organizations: [],
    selectedId: 'district',
    selectedOrganization: {},
    currentScope: orgScope.ORG_OPTIONS[0],
    loading: true,
    loadError: '',
    canManage: false,
    honorStats: { counts: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0 }, total: 0 },
    honorLevels: [],
    recentEntries: [],
    pendingConfirmCount: 0,
    pendingVerifyCount: 0,
    session: null
  },

  async onShow() {
    try {
      const currentScope = orgScope.ORG_OPTIONS.find(item => item.dataId === this.data.selectedId || item.orgId === this.data.selectedId || item.teamId === this.data.selectedId) || orgScope.ORG_OPTIONS[0]
      const [organizations, session] = await Promise.all([
        api.call('listArchives'),
        api.call('getSession')
      ])
      this.setData({
        organizations,
        session,
        currentScope,
        canManage: permission.canManage(session),
        loadError: ''
      })
      const scopedId = this.data.selectedId || 'district'
      await this.selectOrganizationById(scopedId)
    } catch (error) {
      this.setData({ loading: false, loadError: '档案加载失败，请点击微信开发者工具“编译”后重试。' })
      api.showError(error)
    }
  },

  selectOrganization(event) {
    const id = event.currentTarget.dataset.id
    const currentScope = orgScope.setCurrentScopeByTeamId(id)
    this.setData({ currentScope })
    this.selectOrganizationById(id)
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: orgScope.ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentScope = orgScope.setCurrentScope(orgScope.ORG_OPTIONS[result.tapIndex])
        this.setData({ currentScope })
        const scopedId = currentScope.orgType === 'team' ? currentScope.orgId : (this.data.organizations[0] && this.data.organizations[0].id) || this.data.selectedId
        this.selectOrganizationById(scopedId)
      }
    })
  },

  async selectOrganizationById(id) {
    let selectedOrganization = this.data.organizations.find(item => item.id === id) || this.data.organizations[0] || {}
    const supportIds = ['secretary', 'tamer', 'treasurer', 'admin']
    const sourceCategories = selectedOrganization.categories || []
    const captainCategory = sourceCategories.find(item => item.id === 'captain') || {}
    const supportMap = {}
    ;(captainCategory.children || [])
      .concat(sourceCategories.filter(item => supportIds.includes(item.id)))
      .filter(item => supportIds.includes(item.id))
      .forEach(item => { supportMap[item.id] = { ...item, compact: true } })
    const supportCategories = supportIds.map(item => supportMap[item]).filter(Boolean)
    const displayCategories = sourceCategories
      .filter(item => !supportIds.includes(item.id))
      .map(item => item.id === 'captain'
        ? { ...item, children: supportCategories }
        : item)
    const canEditPositionDirectory = permission.canEditServiceTeamPositions(this.data.session, selectedOrganization)
    selectedOrganization = {
      ...selectedOrganization,
      canEditTeamPositions: canEditPositionDirectory,
      categories: displayCategories.map(category => ({
        ...category,
        canEditDirectory: canEditPositionDirectory || Boolean(category.canEditDirectory),
        canMaintain: category.id === 'treasurer'
          ? permission.canMaintainLedger(this.data.session, {
            organizationId: selectedOrganization.id,
            cloudOrganizationId: selectedOrganization.cloudId,
            positionId: category.positionId || category.id,
            person: category.person
          })
          : permission.canMaintainPosition(this.data.session, {
            organizationId: selectedOrganization.id,
            cloudOrganizationId: selectedOrganization.cloudId,
            positionId: category.positionId || category.id,
            person: category.person
          }),
        children: (category.children || []).map(child => ({
          ...child,
          canEditDirectory: canEditPositionDirectory || Boolean(child.canEditDirectory),
          canMaintain: permission.canMaintainPosition(this.data.session, {
            organizationId: selectedOrganization.id,
            cloudOrganizationId: selectedOrganization.cloudId,
            positionId: child.positionId || child.id,
            parentPositionId: category.positionId || category.id,
            person: child.person
          })
        }))
      }))
    }
    this.setData({
      selectedId: id,
      selectedOrganization,
      loading: false,
      loadError: ''
    })
    await Promise.all([
      this.loadHonorOverview(),
      this.loadRecentEntries()
    ])
  },

  async loadRecentEntries() {
    try {
      let entries = await api.call('listArchiveEntries', {
        organizationId: this.data.selectedId
      })
      if (!entries || !entries.length) {
        entries = await api.call('listArchiveEntries', {
          organizationId: this.data.selectedId,
          status: 'archived'
        })
      }
      const categoryMap = categoryNameMap(this.data.selectedOrganization)
      const latestEntries = (entries || [])
        .slice()
        .sort((a, b) => archiveSortTime(b).localeCompare(archiveSortTime(a)))
        .slice(0, 5)
      const detailedEntries = await Promise.all(latestEntries.map(async item => {
        try {
          const detail = await api.call('getArchiveEntry', { id: item._id })
          return { ...item, ...detail }
        } catch (error) {
          return item
        }
      }))
      const recentEntries = detailedEntries
        .map(item => ({
          ...item,
          dateLabel: formatRecentDate(item.date),
          categoryName: categoryMap[item.categoryId] || item.uploaderRole || '历史事件',
          coverText: '档',
          carouselPhotos: (item.photos || []).filter(Boolean).slice(0, 5),
          summaryText: item.summary || item.content || item.location || '点击查看历史事件详情',
          meta: `${categoryMap[item.categoryId] || item.uploaderRole || '档案'} · ${item.uploadedBy || item.ownerName || '已归档'}`
        }))
      this.setData({ recentEntries })
    } catch (error) {
      this.setData({ recentEntries: [] })
    }
  },

  async loadHonorOverview() {
    try {
      const [honorStats, confirmations, verifications] = await Promise.all([
        api.call('getArchiveHonorStats', { organizationId: this.data.selectedId }),
        api.call('listHonorConfirmations', { organizationId: this.data.selectedId }),
        api.call('listHonorVerifications', { organizationId: this.data.selectedId })
      ])
      const normalizedHonorStats = this.normalizeHonorStats(honorStats)
      this.setData({
        honorStats: normalizedHonorStats,
        honorLevels: this.buildHonorLevels(normalizedHonorStats),
        pendingConfirmCount: (confirmations || []).length,
        pendingVerifyCount: (verifications || []).length
      })
    } catch (error) {
      const emptyHonorStats = this.normalizeHonorStats()
      this.setData({
        honorStats: emptyHonorStats,
        honorLevels: this.buildHonorLevels(emptyHonorStats),
        pendingConfirmCount: 0,
        pendingVerifyCount: 0
      })
    }
  },

  normalizeHonorStats(stats = {}) {
    const counts = stats.counts || {}
    const normalizedCounts = {
      fiveStar: counts.fiveStar || counts.excellent || 0,
      fourStar: counts.fourStar || counts.great || 0,
      threeStar: counts.threeStar || counts.good || 0,
      twoStar: counts.twoStar || 0,
      oneStar: counts.oneStar || 0
    }
    return {
      ...stats,
      counts: normalizedCounts,
      total: Object.keys(normalizedCounts).reduce((sum, key) => sum + (normalizedCounts[key] || 0), 0)
    }
  },

  buildHonorLevels(stats = {}) {
    const counts = stats.counts || {}
    return [
      { key: 'fiveStar', label: '五星', level: 'excellent', count: counts.fiveStar || 0 },
      { key: 'fourStar', label: '四星', level: 'great', count: counts.fourStar || 0 },
      { key: 'threeStar', label: '三星', level: 'good', count: counts.threeStar || 0 },
      { key: 'twoStar', label: '二星', level: 'twoStar', count: counts.twoStar || 0 },
      { key: 'oneStar', label: '一星', level: 'oneStar', count: counts.oneStar || 0 }
    ]
  },

  openHonorWall(event) {
    const level = event.currentTarget.dataset.level || ''
    wx.navigateTo({
      url: `/pages/archive/honor-wall/index?organization=${this.data.selectedId}${level ? `&level=${level}` : ''}`
    })
  },

  openConfirmations() {
    wx.navigateTo({ url: `/pages/archive/confirm/index?organization=${this.data.selectedId}` })
  },

  openHistoryList() {
    wx.navigateTo({
      url: `/pages/archive/list/index?organization=${this.data.selectedId}&category=all`
    })
  },

  openRecentEntry(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  addContent(event) {
    const category = event.currentTarget.dataset.category
    if (category === 'treasurer') {
      wx.navigateTo({ url: `/pages/archive/ledger/index?organization=${this.data.selectedId}` })
      return
    }
    wx.navigateTo({ url: `/pages/archive/list/index?organization=${this.data.selectedId}&category=${category}` })
  },

  openSubArchive(event) {
    const category = event.currentTarget.dataset.category
    if (category === 'treasurer') {
      wx.navigateTo({ url: `/pages/archive/ledger/index?organization=${this.data.selectedId}` })
      return
    }
    wx.navigateTo({ url: `/pages/archive/list/index?organization=${this.data.selectedId}&category=${category}` })
  },

  editPosition(event) {
    const positionId = event.currentTarget.dataset.position
    const organizationId = this.data.selectedOrganization.cloudId || this.data.selectedOrganization.id
    wx.navigateTo({
      url: `/pages/archive/position-edit/index?organizationId=${encodeURIComponent(organizationId)}&positionId=${encodeURIComponent(positionId)}`
    })
  },

  uploadPhotos() {
    wx.showToast({ title: '正式版将打开云照片上传', icon: 'none' })
  }
})
