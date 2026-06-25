const api = require('../../utils/api')
const permission = require('../../utils/permission')

Page({
  data: {
    organizations: [],
    selectedId: 'yuanhang',
    selectedOrganization: {},
    loading: true,
    loadError: '',
    canManage: false,
    honorStats: { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
    pendingConfirmCount: 0,
    session: null
  },

  async onShow() {
    try {
      const [organizations, session] = await Promise.all([
        api.call('listArchives'),
        api.call('getSession')
      ])
      this.setData({
        organizations,
        session,
        canManage: permission.canManage(session),
        loadError: ''
      })
      await this.selectOrganizationById(this.data.selectedId)
    } catch (error) {
      this.setData({ loading: false, loadError: '档案加载失败，请点击微信开发者工具“编译”后重试。' })
      api.showError(error)
    }
  },

  selectOrganization(event) {
    this.selectOrganizationById(event.currentTarget.dataset.id)
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
    selectedOrganization = {
      ...selectedOrganization,
      canEditTeamPositions: permission.canEditServiceTeamPositions(this.data.session, selectedOrganization),
      categories: displayCategories.map(category => ({
        ...category,
        canEditDirectory: Boolean(category.canEditDirectory) &&
          permission.canEditServiceTeamPositions(this.data.session, selectedOrganization),
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
          canEditDirectory: Boolean(child.canEditDirectory) &&
            permission.canEditServiceTeamPositions(this.data.session, selectedOrganization),
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
      const [honorStats, confirmations] = await Promise.all([
        api.call('getArchiveHonorStats', { organizationId: this.data.selectedId }),
        api.call('listHonorConfirmations', { organizationId: this.data.selectedId })
      ])
      this.setData({
        honorStats: honorStats || { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
        pendingConfirmCount: (confirmations || []).length
      })
    } catch (error) {
      this.setData({
        honorStats: { counts: { good: 0, great: 0, excellent: 0 }, total: 0 },
        pendingConfirmCount: 0
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
    wx.showActionSheet({
      itemList: ['选择成员', '输入姓名'],
      success: result => {
        const inputMode = result.tapIndex === 1 ? 'manual' : 'member'
        wx.navigateTo({
          url: `/pages/archive/position-edit/index?organizationId=${encodeURIComponent(organizationId)}&positionId=${encodeURIComponent(positionId)}&inputMode=${inputMode}`
        })
      }
    })
  },

  uploadPhotos() {
    wx.showToast({ title: '正式版将打开云照片上传', icon: 'none' })
  }
})
