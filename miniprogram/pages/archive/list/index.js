const api = require('../../../utils/api')

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
  finance: '账目档案'
}

Page({
  data: {
    organizationId: '',
    categoryId: '',
    categoryName: '',
    organization: {},
    entries: [],
    canEdit: false,
    isSuperAdmin: false,
    loadError: ''
  },

  onLoad(options) {
    const categoryId = options.category || 'main'
    this.setData({
      organizationId: options.organization || 'district',
      categoryId,
      categoryName: CATEGORY_NAMES[categoryId] || '档案事件'
    })
  },

  async onShow() {
    try {
      const [organizations, entries, member] = await Promise.all([
        api.call('listArchives'),
        api.call('listArchiveEntries', {
          organizationId: this.data.organizationId,
          categoryId: this.data.categoryId
        }),
        api.call('getSession')
      ])
      const organization = organizations.find(
        (item) => item.id === this.data.organizationId
      ) || organizations[0]
      const sortedEntries = entries
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0) || b.date.localeCompare(a.date))
        .map((item) => ({
          ...item,
          dateDay: item.date.slice(8, 10),
          dateMonth: `${Number(item.date.slice(5, 7))}月`,
          coverImage: item.photos && item.photos.length ? item.photos[0] : ''
        }))
      this.setData({
        organization,
        entries: sortedEntries,
        canEdit: ['superadmin', 'admin', 'editor'].includes(member.role),
        isSuperAdmin: member.role === 'superadmin',
        loadError: ''
      })
      wx.setNavigationBarTitle({ title: `${organization.shortName} · ${this.data.categoryName}` })
    } catch (error) {
      this.setData({ loadError: '档案列表加载失败，请重新编译后重试。' })
      api.showError(error)
    }
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
        await api.call('deleteArchiveEntry', { id })
        this.setData({ entries: this.data.entries.filter(item => item._id !== id) })
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
