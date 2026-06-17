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
  finance: '账目档案',
  captain: '队长档案',
  'first-vp': '第一副队长档案',
  'second-vp': '第二副队长档案',
  'third-vp': '第三副队长档案',
  secretary: '秘书档案',
  tamer: '纠察档案',
  treasurer: '司库档案',
  admin: '总务档案'
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
    const { form, categoryName, organizationName, categoryId } = this.data
    const keywords = form.keywords.trim()
    if (!keywords) {
      wx.showToast({ title: '请先输入事件提示词', icon: 'none' })
      return
    }
    const owner = form.uploadedBy || '负责人'
    const templates = {
      'second-vp': {
        title: `${owner}狮兄狮姐带领远航做了${keywords}`,
        summary: `${organizationName}围绕“${keywords}”完成公益服务并形成服务档案。`,
        content: `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n${owner}狮兄狮姐带领远航做了“${keywords}”。\n\n一、服务对象：请补充\n二、服务地点：请补充\n三、参与狮友：请补充\n四、服务过程：请补充\n五、服务成果：请补充\n六、嘉许记录：请补充本次值得表扬的狮兄狮姐。`
      },
      secretary: {
        title: `${owner}狮姐组织召开远航服务队${keywords}`,
        summary: `${organizationName}召开“${keywords}”，形成会议纪要、会议决议和后续待办。`,
        content: `会议日期：${form.date}\n会议组织：${organizationName}\n档案分类：${categoryName}\n记录人：${owner}\n\n一、会议主题：${keywords}\n二、参会人员：请补充\n三、会议议题：请补充\n四、会议决议：请补充\n五、后续待办：请补充\n六、嘉许记录：请补充本次推动会议和落实事项的狮兄狮姐。`
      },
      'first-vp': {
        title: `${owner}狮兄狮姐开展远航对外交流`,
        summary: `${organizationName}围绕“${keywords}”开展会员发展、领导力或对外交流工作。`,
        content: `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n${owner}狮兄狮姐开展“${keywords}”。请补充交流对象、交流主题、达成共识、后续跟进和嘉许对象。`
      },
      'third-vp': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}`,
        summary: `${organizationName}围绕“${keywords}”开展关爱、联谊或年会相关工作。`,
        content: `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n${owner}狮兄狮姐组织远航开展“${keywords}”。请补充关爱对象、联谊主题、参与人员、现场成果和后续跟进。`
      }
    }
    const fallback = {
      title: `${owner}狮兄狮姐完成远航${categoryName}：${keywords}`,
      summary: `${organizationName}围绕“${keywords}”完成${categoryName}相关记录。`,
      content: `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n请补充工作背景、执行过程、完成情况、后续改进和嘉许记录。`
    }
    const draft = templates[categoryId] || fallback
    this.setData({
      'form.title': form.title || draft.title,
      'form.summary': form.summary || draft.summary,
      'form.content': form.content || draft.content,
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
