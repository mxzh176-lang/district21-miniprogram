const api = require('../utils/api')
const permission = require('../utils/permission')

const BASE_ITEMS = [
  { pagePath: '/pages/home/index', text: '首页', icon: '首' },
  { pagePath: '/pages/archive/index', text: '档案', icon: '档' },
  { pagePath: '/pages/org/index', text: '成员', icon: '员' },
  { pagePath: '/pages/profile/index', text: '我的', icon: '我' }
]

Component({
  data: {
    items: BASE_ITEMS,
    selectedPath: '/pages/home/index'
  },

  lifetimes: {
    attached() {
      this.syncSelectedPath()
      this.refresh()
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelectedPath()
      this.refresh()
    }
  },

  methods: {
    syncSelectedPath() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      if (!currentPage || !currentPage.route) return
      this.setData({ selectedPath: `/${currentPage.route}` })
    },

    switchTab(event) {
      const pagePath = event.currentTarget.dataset.path
      if (!pagePath || pagePath === this.data.selectedPath) return
      wx.switchTab({ url: pagePath })
    },

    async refresh() {
      let canOpenCreate = false
      try {
        canOpenCreate = permission.canOpenCreateCenter(await api.call('getSession'))
      } catch (error) {}
      const items = BASE_ITEMS.slice()
      if (canOpenCreate) {
        items.splice(2, 0, { pagePath: '/pages/archive/create/index', text: '＋', icon: '＋', primary: true })
      }
      this.setData({ items })
      this.syncSelectedPath()
    }
  }
})
