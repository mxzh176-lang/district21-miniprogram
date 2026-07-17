const api = require('../../../utils/api')
const permission = require('../../../utils/permission')
const orgScope = require('../../../utils/org-scope')

const SUPPORT_POSITION_IDS = ['secretary', 'tamer', 'treasurer', 'admin']

function displayPositionName(name = '') {
  return String(name).replace(/委员会/g, '').trim()
}

function buildCategoryDirectory(organization = {}, session = null) {
  const sourceCategories = organization.categories || []
  const captainCategory = sourceCategories.find(item => item.id === 'captain') || {}
  const supportMap = {}
  ;(captainCategory.children || [])
    .concat(sourceCategories.filter(item => SUPPORT_POSITION_IDS.includes(item.id)))
    .filter(item => SUPPORT_POSITION_IDS.includes(item.id))
    .forEach(item => { supportMap[item.id] = { ...item, compact: true } })
  const supportCategories = SUPPORT_POSITION_IDS.map(item => supportMap[item]).filter(Boolean)
  const displayCategories = sourceCategories
    .filter(item => !SUPPORT_POSITION_IDS.includes(item.id))
    .map(item => item.id === 'captain'
      ? { ...item, children: supportCategories }
      : item)
  const canEditPositionDirectory = permission.isSuperAdmin(session)
  return displayCategories.map(category => {
    const canMaintain = category.id === 'treasurer'
      ? permission.canMaintainLedger(session, {
        organizationId: organization.id,
        cloudOrganizationId: organization.cloudId,
        positionId: category.positionId || category.id,
        person: category.person
      }, 'create')
      : permission.canMaintainPosition(session, {
        organizationId: organization.id,
        cloudOrganizationId: organization.cloudId,
        positionId: category.positionId || category.id,
        person: category.person
      }, 'create')
    const children = (category.children || []).map(child => {
      const childCanMaintain = permission.canMaintainPosition(session, {
        organizationId: organization.id,
        cloudOrganizationId: organization.cloudId,
        positionId: child.positionId || child.id,
        parentPositionId: category.positionId || category.id,
        person: child.person
      }, 'create')
      return {
        ...child,
        displayName: displayPositionName(child.name),
        canEditDirectory: canEditPositionDirectory,
        canMaintain: childCanMaintain
      }
    }).filter(child => child.canMaintain || child.canEditDirectory)
    return {
      ...category,
      displayName: displayPositionName(category.name),
      canEditDirectory: canEditPositionDirectory,
      canMaintain,
      children
    }
  }).filter(category => category.canMaintain || category.canEditDirectory || category.children.length)
}

Page({
  data: {
    organizations: [],
    organizationOptions: [],
    organizationIndex: 0,
    selectedOrganization: {},
    currentScope: orgScope.ORG_OPTIONS[0],
    categoryDirectory: [],
    authorizedOrganizations: [],
    session: null,
    canCreateTodo: false,
    hasArchiveAccess: false,
    loadError: ''
  },

  async onShow() {
    try {
      const allowed = await this.loadDirectory()
      if (!allowed) wx.switchTab({ url: '/pages/archive/index' })
    } catch (error) {
      this.setData({ loadError: '栏目加载失败，请稍后重试。' })
      api.showError(error)
    }
  },

  async loadDirectory() {
    const [organizations, session] = await Promise.all([
      api.call('listArchives'),
      api.call('getSession')
    ])
    const currentScope = orgScope.getCurrentScope()
    const authorizedOrganizations = organizations.filter(item => buildCategoryDirectory(item, session).length)
    const canCreateTodo = permission.canCreateTodo(session)
    if (!authorizedOrganizations.length && !canCreateTodo) {
      wx.showToast({ title: '当前没有可新建的内容', icon: 'none' })
      return false
    }
    const currentId = currentScope.orgType === 'team' ? currentScope.orgId : currentScope.dataId
    const selectedOrganization = authorizedOrganizations.find(item => item.id === currentId || item.cloudId === currentId) ||
      authorizedOrganizations[0] ||
      {}
    const selectedScope = orgScope.ORG_OPTIONS.find(item =>
      item.dataId === selectedOrganization.id || item.orgId === selectedOrganization.id ||
      item.cloudId === selectedOrganization.cloudId
    ) || currentScope
    this.setData({
      organizations,
      authorizedOrganizations,
      organizationOptions: authorizedOrganizations.map(item => item.name || item.shortName || item.id),
      organizationIndex: Math.max(0, authorizedOrganizations.findIndex(item => item.id === selectedOrganization.id)),
      selectedOrganization,
      currentScope: selectedScope,
      categoryDirectory: buildCategoryDirectory(selectedOrganization, session),
      session,
      canCreateTodo,
      hasArchiveAccess: authorizedOrganizations.length > 0,
      loadError: ''
    })
    return true
  },

  openTodo() {
    if (!this.data.canCreateTodo) return
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  changeOrganization(event) {
    const index = Number(event.detail.value) || 0
    const selectedOrganization = this.data.authorizedOrganizations[index]
    if (!selectedOrganization) return
    orgScope.setCurrentScopeByTeamId(selectedOrganization.id)
    this.setData({
      organizationIndex: index,
      selectedOrganization,
      categoryDirectory: buildCategoryDirectory(selectedOrganization, this.data.session)
    })
  },

  chooseOrgScope() {
    const organizations = this.data.authorizedOrganizations
    if (!organizations.length) return
    wx.showActionSheet({
      itemList: organizations.map(item => item.name || item.shortName || item.id),
      success: result => {
        const selectedOrganization = organizations[result.tapIndex] || organizations[0]
        const currentScope = orgScope.ORG_OPTIONS.find(item =>
          item.dataId === selectedOrganization.id || item.orgId === selectedOrganization.id ||
          item.cloudId === selectedOrganization.cloudId
        ) || this.data.currentScope
        orgScope.setCurrentScope(currentScope)
        this.setData({
          currentScope,
          selectedOrganization,
          organizationIndex: Math.max(0, organizations.findIndex(item => item.id === selectedOrganization.id)),
          categoryDirectory: buildCategoryDirectory(selectedOrganization, this.data.session)
        })
      }
    })
  },

  openCategory(event) {
    const category = event.currentTarget.dataset.category
    const availableCategory = this.data.categoryDirectory
      .flatMap(item => [item].concat(item.children || []))
      .find(item => item.id === category)
    if (!category || !availableCategory || !availableCategory.canMaintain) return
    if (category === 'treasurer') {
      wx.navigateTo({ url: `/pages/archive/ledger/index?organization=${this.data.selectedOrganization.id}` })
      return
    }
    wx.navigateTo({
      url: `/pages/archive/edit/index?organization=${this.data.selectedOrganization.id}&category=${category}`
    })
  },

  editPosition(event) {
    if (!permission.isSuperAdmin(this.data.session)) return
    const positionId = event.currentTarget.dataset.position
    const organizationId = this.data.selectedOrganization.cloudId || this.data.selectedOrganization.id
    wx.navigateTo({
      url: `/pages/archive/position-edit/index?organizationId=${encodeURIComponent(organizationId)}&positionId=${encodeURIComponent(positionId)}`
    })
  }
})
