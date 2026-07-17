const api = require('../../../utils/api')
const permission = require('../../../utils/permission')
const { EVENT_CATEGORIES, normalizeEventCategory } = require('../../../utils/event-category')

const CATEGORY_NAMES = {
  main: '记事本总目录',
  member: '会员发展',
  training: '领导力与培训',
  service: '公益服务',
  plan: '年度服务计划',
  meeting: '会议纪要',
  exchange: '对外交流',
  publicity: '新闻宣传',
  care: '狮友关爱',
  social: '聚会联谊',
  inventory: '物品清单',
  finance: '账目档案',
  captain: '队长——张明星',
  'first-vp': '第一副队长——张芳',
  'second-vp': '第二副队长——双龙',
  'third-vp': '第三副队长——媛媛',
  secretary: '秘书——玲玲',
  tamer: '纠察——振锋',
  treasurer: '司库——文强',
  admin: '总务——腾飞',
  'member-retention': '会员与保留委员会——大奇',
  'leadership-training': '领导力培训委员会——姗姗',
  'external-exchange': '对外交流委员会——丙刚',
  'service-plan': '服务与计划委员会——景辉',
  'news-publicity': '新闻宣传委员会——建鑫',
  'fundraising-plan': '筹款与计划委员会——珊珊',
  'care-committee': '关爱委员会——潘阳阳',
  'fellowship-committee': '联谊委员会——雪峰',
  'annual-meeting': '年会委员会——泉宏'
}

const CATEGORY_NOTICES = {
  'care-committee': '关爱档案仅记录必要的内部安排和跟进，不填写病情、家庭状况等敏感隐私。',
  'fellowship-committee': '联谊档案仅用于记录组织内部活动安排，不提供公开发帖、评论或陌生人互动。',
  'fundraising-plan': '本栏目仅用于内部经费筹备、使用计划和凭证留存，不提供公开募捐、支付或交易功能。',
  'news-publicity': '本栏目仅用于内部资料整理、确认、报送和留存，不形成面向公众的信息发布平台。'
}

function flattenCategories(organization) {
  const seen = new Set()
  const categories = (organization.categories || []).flatMap(category => [category].concat(category.children || []))
    .filter(category => {
      if (!category.id || seen.has(category.id) || category.id === 'treasurer') return false
      seen.add(category.id)
      return true
    })
    .map(category => ({
      id: category.id,
      name: category.name || CATEGORY_NAMES[category.id] || '未命名类目'
    }))
  return [{ id: 'all', name: '全部历史事件' }].concat(categories)
}

function archiveCreatedTimestamp(item = {}) {
  const value = item.createdAt || item.updatedAt || item.date || ''
  if (value instanceof Date) return value.getTime()
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

Page({
  data: {
    organizationId: '',
    categoryId: '',
    categoryName: '',
    organization: {},
    entries: [],
    totalEventCount: 0,
    positionPerson: '',
    categoryOptions: [],
    categoryIndex: 0,
    eventMonth: '',
    eventMonthLabel: '全部时间',
    eventCategory: '',
    eventCategoryOptions: ['全部事件分类'].concat(EVENT_CATEGORIES),
    eventCategoryIndex: 0,
    loading: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    isSuperAdmin: false,
    categoryNotice: '',
    loadError: ''
  },

  onLoad(options) {
    const categoryId = options.category || 'main'
    this.setData({
      organizationId: options.organization || 'yuanhang',
      categoryId,
      categoryName: CATEGORY_NAMES[categoryId] || '档案事件',
      categoryNotice: CATEGORY_NOTICES[categoryId] || ''
    })
  },

  async onShow() {
    try {
      this.setData({ loading: true })
      const [organizations, member] = await Promise.all([
        api.call('listArchives'),
        api.call('getSession')
      ])
      const organization = organizations.find(
        (item) => item.id === this.data.organizationId
      ) || organizations[0]
      const categoryOptions = flattenCategories(organization)
      const categoryIndex = Math.max(categoryOptions.findIndex(item => item.id === this.data.categoryId), 0)
      const selectedCategory = categoryOptions[categoryIndex] || {
        id: this.data.categoryId,
        name: this.data.categoryName
      }
      this.setData({ organization, member, categoryOptions, categoryIndex })
      await this.loadEntries(selectedCategory.id)
    } catch (error) {
      this.setData({ loading: false, loadError: '档案列表加载失败，请重新编译后重试。' })
      api.showError(error)
    }
  },

  async loadEntries(categoryId = this.data.categoryId) {
    try {
      this.setData({ loading: true })
      const query = {
        organizationId: this.data.organizationId,
        categoryId: categoryId === 'all' ? '' : categoryId,
        eventCategory: this.data.eventCategory,
        eventMonth: this.data.eventMonth
      }
      let [entries, allEntries] = await Promise.all([
        api.call('listArchiveEntries', query),
        this.data.eventMonth
          ? api.call('listArchiveEntries', { organizationId: this.data.organizationId, categoryId: categoryId === 'all' ? '' : categoryId, eventCategory: this.data.eventCategory })
          : Promise.resolve(null)
      ])
      if (!entries.length) {
        entries = await api.call('listArchiveEntries', { ...query, status: 'archived' })
      }
      if (allEntries && !allEntries.length) {
        allEntries = await api.call('listArchiveEntries', {
          organizationId: this.data.organizationId,
          categoryId: categoryId === 'all' ? '' : categoryId,
          eventCategory: this.data.eventCategory,
          status: 'archived'
        })
      }
      const position = permission.findArchivePosition(this.data.organization, categoryId)
      const categoryName = categoryId === 'all'
        ? '全部历史事件'
        : position ? position.name : (CATEGORY_NAMES[categoryId] || '档案事件')
      const sortedEntries = entries
        .slice()
        .sort((a, b) => archiveCreatedTimestamp(b) - archiveCreatedTimestamp(a) || String(b.date || '').localeCompare(String(a.date || '')))
        .map((item) => ({
          ...item,
          eventCategory: normalizeEventCategory(item.eventCategory, item.categoryId, item.uploaderRole),
          dateDay: item.date.slice(8, 10),
          dateMonth: `${Number(item.date.slice(5, 7))}月`,
          coverImage: item.photos && item.photos.length ? item.photos[0] : ''
        }))
      this.setData({
        categoryId,
        categoryName,
        positionPerson: categoryId === 'all' ? '全部栏目' : position && position.person ? position.person : '负责人待绑定',
        categoryNotice: CATEGORY_NOTICES[categoryId] || '',
        entries: sortedEntries,
        totalEventCount: (allEntries || entries).length,
        canCreate: categoryId !== 'all' && permission.canMaintainArchive(this.data.member, this.data.organization, categoryId, 'create'),
        canEdit: categoryId !== 'all' && permission.canMaintainArchive(this.data.member, this.data.organization, categoryId, 'update'),
        canDelete: categoryId !== 'all' && permission.canMaintainArchive(this.data.member, this.data.organization, categoryId, 'delete'),
        isSuperAdmin: permission.isSuperAdmin(this.data.member),
        loading: false,
        loadError: ''
      })
      wx.setNavigationBarTitle({ title: `${this.data.organization.shortName} · ${categoryName}` })
    } catch (error) {
      this.setData({ loading: false, loadError: '档案列表加载失败，请重新编译后重试。' })
      api.showError(error)
    }
  },

  async changeCategory(event) {
    const categoryIndex = Number(event.detail.value)
    const category = this.data.categoryOptions[categoryIndex]
    if (!category) return
    this.setData({ categoryIndex })
    await this.loadEntries(category.id)
  },

  async changeEventMonth(event) {
    const eventMonth = event.detail.value
    this.setData({
      eventMonth,
      eventMonthLabel: `${eventMonth.slice(0, 4)}年${Number(eventMonth.slice(5, 7))}月`
    })
    await this.loadEntries()
  },

  async changeEventCategory(event) {
    const eventCategoryIndex = Number(event.detail.value) || 0
    this.setData({
      eventCategoryIndex,
      eventCategory: EVENT_CATEGORIES[eventCategoryIndex - 1] || ''
    })
    await this.loadEntries()
  },

  async resetFilters() {
    this.setData({
      eventMonth: '',
      eventMonthLabel: '全部时间',
      eventCategory: '',
      eventCategoryIndex: 0
    })
    await this.loadEntries()
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/archive/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  addEntry() {
    wx.navigateTo({
      url: `/pages/archive/edit/index?organization=${this.data.organizationId}&category=${this.data.categoryId}`
    })
  },

  importWord() {
    wx.navigateTo({
      url: `/pages/archive/import/index?organization=${this.data.organizationId}&category=${this.data.categoryId}`
    })
  },

  moveEntry(event) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = event.currentTarget.dataset.direction
    const entries = this.data.entries.slice()
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= entries.length) return
    ;[entries[index], entries[target]] = [entries[target], entries[index]]
    this.setData({ entries })
    api.call('saveArchiveOrder', { ids: entries.map(item => item._id) })
  },

  editEntry(event) {
    wx.navigateTo({
      url: `/pages/archive/edit/index?id=${event.currentTarget.dataset.id}&organization=${this.data.organizationId}&category=${this.data.categoryId}`
    })
  },

  deleteEntry(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除档案',
      content: '删除后将不再显示，确认删除这条档案吗？',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteArchiveEntry', { id })
          this.setData({ entries: this.data.entries.filter(item => item._id !== id) })
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
