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
    id: '',
    organizationId: '',
    categoryId: '',
    organizationName: '',
    categoryName: '',
    canEdit: false,
    form: {
      date: '',
      title: '',
      keywords: '',
      summary: '',
      content: '',
      uploadedBy: '',
      photoCount: 0,
      photos: []
    },
    aiGenerated: false
  },

  async onLoad(options) {
    const [member, organizations] = await Promise.all([
      api.call('getSession'),
      api.call('listArchives')
    ])
    const organization = organizations.find(
      (item) => item.id === (options.organization || 'yuanhang')
    ) || organizations[0]
    const baseData = {
      id: options.id || '',
      organizationId: organization.id,
      categoryId: options.category || 'service',
      organizationName: organization.name,
      categoryName: CATEGORY_NAMES[options.category] || '档案事件',
      canEdit: ['superadmin', 'admin', 'editor'].includes(member.role),
      'form.date': this.formatDate(new Date()),
      'form.uploadedBy': member.nickname || '当前管理员'
    }
    this.setData(baseData)
    if (options.id) {
      const entry = await api.call('getArchiveEntry', { id: options.id })
      this.setData({
        form: {
          date: entry.date || '',
          title: entry.title || '',
          keywords: (entry.keywords || []).join(' '),
          summary: entry.summary || '',
          content: entry.content || '',
          uploadedBy: entry.uploadedBy || member.nickname,
          photoCount: (entry.photos || []).length,
          photos: entry.photos || []
        }
      })
    }
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  onDateChange(event) {
    this.setData({ 'form.date': event.detail.value })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  choosePhotos() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        wx.showLoading({ title: '正在保存照片' })
        const saved = []
        for (const file of result.tempFiles) {
          try {
            const item = await new Promise((resolve, reject) => {
              wx.saveFile({
                tempFilePath: file.tempFilePath,
                success: resolve,
                fail: reject
              })
            })
            saved.push(item.savedFilePath)
          } catch (error) {
            saved.push(file.tempFilePath)
          }
        }
        const photos = (this.data.form.photos || []).concat(saved).slice(0, 9)
        this.setData({
          'form.photos': photos,
          'form.photoCount': photos.length
        })
        wx.hideLoading()
      }
    })
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const photos = this.data.form.photos.filter((item, photoIndex) => photoIndex !== index)
    this.setData({ 'form.photos': photos, 'form.photoCount': photos.length })
  },

  generateDraft() {
    const { form, categoryName, organizationName } = this.data
    const keywords = form.keywords.trim()
    if (!keywords) {
      wx.showToast({ title: '请先输入事件提示词', icon: 'none' })
      return
    }
    this.setData({
      'form.title': form.title || `${form.date} ${organizationName}${categoryName}记录`,
      'form.summary': form.summary ||
        `${organizationName}围绕“${keywords}”开展相关工作，本条内容由管理员核对后发布。`,
      'form.content': form.content ||
        `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n事件提示词：${keywords}\n\n请管理员补充参与人员、活动过程、结果和照片说明。`,
      aiGenerated: true
    })
    wx.showToast({ title: '草稿已生成', icon: 'success' })
  },

  validate() {
    const { date, title, content } = this.data.form
    if (!date || !title.trim() || !content.trim()) {
      wx.showToast({ title: '请填写日期、标题和详情', icon: 'none' })
      return false
    }
    return true
  },

  async saveDraft() {
    if (!this.validate()) return
    await this.saveEntry('draft')
    wx.showToast({ title: '草稿已保存', icon: 'success' })
  },

  saveEntry(status) {
    const { id, form, organizationId, categoryId, organizationName, categoryName } = this.data
    return api.call('saveArchiveEntry', {
      entry: {
        _id: id || undefined,
        organizationId,
        categoryId,
        date: form.date,
        dateLabel: form.date,
        title: form.title.trim(),
        team: organizationName,
        uploadedBy: form.uploadedBy,
        uploaderRole: categoryName,
        status,
        photoCount: form.photoCount,
        photos: form.photos || [],
        tone: 'blue',
        keywords: form.keywords.split(/[，,\s]+/).filter(Boolean),
        summary: form.summary.trim(),
        content: form.content.trim()
      }
    })
  },

  publish() {
    if (!this.validate()) return
    wx.showModal({
      title: '确认人工发布',
      content: '发布后将自动出现在历史事件中。请确认文字、照片和所属服务队均已核对。',
      confirmText: '确认发布',
      success: async (result) => {
        if (!result.confirm) return
        await this.saveEntry('published')
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      }
    })
  }
})
