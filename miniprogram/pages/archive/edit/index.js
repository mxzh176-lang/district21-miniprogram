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
    templateApplied: false
  },

  async onLoad(options) {
    const [member, organizations] = await Promise.all([
      api.call('getSession'),
      api.call('listArchives')
    ])
    const organization = organizations.find(
      (item) => item.id === (options.organization || 'yuanhang')
    ) || organizations[0]
    const categoryId = options.category || 'service'
    const position = permission.findArchivePosition(organization, categoryId)
    const baseData = {
      id: options.id || '',
      organizationId: organization.id,
      categoryId,
      organizationName: organization.name,
      categoryName: position ? position.name : CATEGORY_NAMES[options.category] || '档案事件',
      canEdit: permission.canMaintainArchive(member, organization, categoryId, options.id ? 'update' : 'create'),
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

  applyTemplate() {
    const { form, categoryName, organizationName, categoryId } = this.data
    const keywords = form.keywords.trim()
    if (!keywords) {
      wx.showToast({ title: '请先输入事件提示词', icon: 'none' })
      return
    }
    const owner = form.uploadedBy || '负责人'
    const templates = {
      'member-retention': {
        title: `${owner}狮兄狮姐跟进${keywords}加入远航的意向`,
        summary: `${organizationName}记录新狮友或意向参与人员的来源、兴趣方向和后续跟进情况。`,
        content: `记录日期：${form.date}\n所属组织：${organizationName}\n档案分类：会员发展与保留\n负责人：${owner}\n\n一、姓名或称呼：请补充\n二、认识渠道：朋友介绍／公益活动／媒体平台／其他\n三、介绍人或联系人：请补充\n四、关注的公益方向：请补充\n五、是否愿意参加近期服务：是／待考虑／暂不参加\n六、适合参与的活动或岗位：请补充\n七、后续联系时间与负责人：请补充\n八、沟通备注：请仅记录必要信息，不填写身份证等敏感资料。`
      },
      'leadership-training': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}培训`,
        summary: `${organizationName}围绕“${keywords}”形成领导力培训记录。`,
        content: `培训日期：${form.date}\n培训主题：${keywords}\n组织人：${owner}\n\n一、培训目标：请补充\n二、讲师与参与人员：请补充\n三、课程内容：请补充\n四、学习成果：请补充\n五、后续实践计划：请补充\n六、嘉许记录：请补充。`
      },
      'external-exchange': {
        title: `${owner}狮兄狮姐开展远航${keywords}对外交流`,
        summary: `${organizationName}围绕“${keywords}”开展对外交流并形成后续合作清单。`,
        content: `交流日期：${form.date}\n交流对象：请补充\n负责人：${owner}\n\n一、交流背景与目的：请补充\n二、参与人员：请补充\n三、交流内容：请补充\n四、达成共识：请补充\n五、后续合作与负责人：请补充\n六、嘉许记录：请补充。`
      },
      'service-plan': {
        title: `${owner}狮兄狮姐带领远航开展${keywords}服务`,
        summary: `${organizationName}完成“${keywords}”公益服务并形成服务档案。`,
        content: `服务日期：${form.date}\n服务项目：${keywords}\n负责人：${owner}\n\n一、服务对象与需求：请补充\n二、服务地点：请补充\n三、参与狮友与分工：请补充\n四、服务过程：请补充\n五、服务成果：请补充\n六、后续计划：请补充\n七、嘉许记录：请补充。`
      },
      'news-publicity': {
        title: `${owner}狮兄狮姐完成远航${keywords}宣传记录`,
        summary: `${organizationName}完成“${keywords}”新闻宣传和素材归档。`,
        content: `发布日期：${form.date}\n宣传主题：${keywords}\n负责人：${owner}\n\n一、信息来源与审核人：请补充\n二、发布渠道：请补充\n三、核心内容：请补充\n四、照片与素材清单：请补充\n五、传播结果：请补充\n六、后续改进：请补充。`
      },
      'fundraising-plan': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}筹款工作`,
        summary: `${organizationName}记录“${keywords}”筹款计划、执行和结果。`,
        content: `记录日期：${form.date}\n筹款事项：${keywords}\n负责人：${owner}\n\n一、筹款目的：请补充\n二、预算与目标：请补充\n三、执行方式：请补充\n四、参与人员：请补充\n五、结果与凭证归档位置：请补充\n六、风险和后续事项：请补充。`
      },
      'care-committee': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}关爱`,
        summary: `${organizationName}形成“${keywords}”狮友关爱记录。`,
        content: `关爱日期：${form.date}\n关爱主题：${keywords}\n负责人：${owner}\n\n一、关爱对象：请按最小必要原则填写\n二、关爱原因：请补充\n三、参与人员与方式：请补充\n四、关爱结果：请补充\n五、后续跟进：请补充\n六、隐私提示：敏感健康和家庭信息不得公开展示。`
      },
      'fellowship-committee': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}联谊`,
        summary: `${organizationName}完成“${keywords}”团队联谊记录。`,
        content: `活动日期：${form.date}\n联谊主题：${keywords}\n负责人：${owner}\n\n一、参与人员：请补充\n二、活动安排：请补充\n三、现场情况：请补充\n四、团队反馈：请补充\n五、后续安排与嘉许：请补充。`
      },
      'annual-meeting': {
        title: `${owner}狮兄狮姐组织远航召开${keywords}年会`,
        summary: `${organizationName}形成“${keywords}”年会筹备与执行记录。`,
        content: `记录日期：${form.date}\n年会主题：${keywords}\n负责人：${owner}\n\n一、时间地点：请补充\n二、流程与分工：请补充\n三、参与人员：请补充\n四、预算与物资：请补充\n五、现场成果：请补充\n六、嘉许名单与后续总结：请补充。`
      },
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
      templateApplied: true
    })
    wx.showToast({ title: '记录模板已填充', icon: 'success' })
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
    try {
      await this.saveEntry('draft')
      wx.showToast({ title: '草稿已保存', icon: 'success' })
    } catch (error) {
      api.showError(error)
    }
  },

  async saveEntry(status) {
    const { id, form, organizationId, categoryId, organizationName, categoryName } = this.data
    const entry = await api.call('saveArchiveEntry', {
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
    if (!id && entry && entry._id) this.setData({ id: entry._id })
    return entry
  },

  publish() {
    if (!this.validate()) return
    wx.showModal({
      title: '确认内部归档',
      content: '归档后将进入组织内部历史记录。请确认文字、附件和所属服务队均已核对。',
      confirmText: '确认归档',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await this.saveEntry('published')
          wx.showToast({ title: '归档成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
