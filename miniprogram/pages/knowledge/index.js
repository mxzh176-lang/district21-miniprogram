const api = require('../../utils/api')

Page({
  data: {
    categories: [],
    selectedCategory: '全部',
    keyword: '',
    items: [],
    filteredItems: [],
    expandedId: ''
  },

  async onLoad() {
    const result = await api.call('listKnowledge')
    this.setData({
      categories: result.categories,
      items: result.items,
      filteredItems: result.items
    })
  },

  search(event) {
    this.setData({ keyword: event.detail.value })
    this.applyFilter()
  },

  selectCategory(event) {
    this.setData({ selectedCategory: event.currentTarget.dataset.category })
    this.applyFilter()
  },

  applyFilter() {
    const keyword = this.data.keyword.trim().toLowerCase()
    const category = this.data.selectedCategory
    const filteredItems = this.data.items.filter(item => {
      const categoryMatch = category === '全部' || item.category === category
      const text = `${item.title}${item.summary}${item.content.join('')}${item.keywords.join('')}`.toLowerCase()
      return categoryMatch && (!keyword || text.includes(keyword))
    })
    this.setData({ filteredItems })
  },

  toggleItem(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  copySource(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '官方链接已复制', icon: 'success' })
    })
  }
})
