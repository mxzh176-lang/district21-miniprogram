const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

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
    organizationName: '',
    categoryName: '',
    canImport: false,
    fileName: '',
    analyzing: false,
    analyzed: false,
    eventCount: 0,
    imageCount: 0,
    drafts: []
  },

  async onLoad(options) {
    const [member, organizations] = await Promise.all([
      api.call('getSession'),
      api.call('listArchives')
    ])
    const organization = organizations.find(
      (item) => item.id === (options.organization || 'yuanhang')
    ) || organizations[0]
    this.setData({
      organizationId: organization.id,
      categoryId: options.category || 'service',
      organizationName: organization.name,
      categoryName: CATEGORY_NAMES[options.category] || '档案事件',
      canImport: permission.isSuperAdmin(member)
    })
  },

  chooseWord() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['docx'],
      success: (result) => {
        this.setData({
          fileName: result.tempFiles[0].name,
          analyzed: false,
          drafts: []
        })
      },
      fail: () => wx.showToast({ title: '请从微信会话选择 .docx 文件', icon: 'none' })
    })
  },

  analyzeWord() {
    if (!this.data.fileName) {
      wx.showToast({ title: '请先选择 Word 文件', icon: 'none' })
      return
    }
    this.setData({ analyzing: true })
    setTimeout(() => {
      this.setData({
        analyzing: false,
        analyzed: true,
        eventCount: 3,
        imageCount: 8,
        drafts: [1, 2, 3].map((number) => ({
          id: `draft-${number}`,
          title: `${this.data.categoryName}事件草稿（${number}）`
        }))
      })
    }, 900)
  },

  importDrafts() {
    wx.showModal({
      title: '导入为草稿',
      content: '系统不会自动归档。导入后需逐条检查日期、标题、文字、附件和所属服务队。',
      confirmText: '确认导入',
      success: async (result) => {
        if (!result.confirm) return
        const today = new Date()
        const date = [
          today.getFullYear(),
          `${today.getMonth() + 1}`.padStart(2, '0'),
          `${today.getDate()}`.padStart(2, '0')
        ].join('-')
        await api.call('importArchiveDrafts', {
          entries: this.data.drafts.map((item) => ({
            organizationId: this.data.organizationId,
            categoryId: this.data.categoryId,
            date,
            dateLabel: '日期待核对',
            title: item.title,
            team: this.data.organizationName,
            uploadedBy: '超级管理员',
            uploaderRole: this.data.categoryName,
            status: 'draft',
            photoCount: 0,
            tone: 'gold',
            keywords: ['Word导入', '待核对'],
            summary: '由 Word 识别生成的事件草稿，等待管理员核对。',
            content: '请核对原 Word 中的日期、正文、附件及所属服务队后再人工归档。'
          }))
        })
        wx.showToast({ title: '草稿已导入', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      }
    })
  }
})
