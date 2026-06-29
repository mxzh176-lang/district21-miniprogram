const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

Page({
  data: {
    organizations: [],
    selectedId: 'yuanhang',
    selectedOrganization: {},
    currentScope: orgScope.ORG_OPTIONS[0],
    loading: true,
    loadError: '',
    canManage: false,
    honorStats: { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
    pendingConfirmCount: 0,
    pendingVerifyCount: 0,
    session: null
  },

  async onShow() {
    try {
      const currentScope = orgScope.getCurrentScope()
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
      const scopedId = currentScope.orgType === 'team' ? currentScope.orgId : this.data.selectedId
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
    await this.loadHonorOverview()
  },

  async loadHonorOverview() {
    try {
      const [honorStats, confirmations, verifications] = await Promise.all([
        api.call('getArchiveHonorStats', { organizationId: this.data.selectedId }),
        api.call('listHonorConfirmations', { organizationId: this.data.selectedId }),
        api.call('listHonorVerifications', { organizationId: this.data.selectedId })
      ])
      this.setData({
        honorStats: honorStats || { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
        pendingConfirmCount: (confirmations || []).length,
        pendingVerifyCount: (verifications || []).length
      })
    } catch (error) {
      this.setData({
        honorStats: { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
        pendingConfirmCount: 0,
        pendingVerifyCount: 0
      })
    }
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
