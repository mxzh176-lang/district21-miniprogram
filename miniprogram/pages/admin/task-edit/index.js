const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

Page({
  data: {
    id: '',
    statuses: [
      { value: 'pending', label: '进行中' },
      { value: 'done', label: '已完成' }
    ],
    categories: [
      { value: 'second-vp', label: '公益服务 / 第二副队长', category: '公益服务', owner: '景辉', location: '待定' },
      { value: 'secretary', label: '会议纪要 / 秘书', category: '会议纪要', owner: '玲玲', location: '远航会议室' },
      { value: 'first-vp', label: '对外交流 / 第一副队长', category: '对外交流', owner: '丙刚', location: '公益伙伴单位' },
      { value: 'third-vp', label: '狮友关爱 / 第三副队长', category: '狮友关爱', owner: '潘阳阳', location: '待定' },
      { value: 'captain', label: '队长档案', category: '队务推进', owner: '张明星', location: '远航服务队' },
      { value: 'tamer', label: '纠察档案', category: '会务秩序', owner: '振锋', location: '活动现场' },
      { value: 'treasurer', label: '司库档案', category: '司库账目', owner: '文强', location: '远航服务队' },
      { value: 'admin', label: '总务档案', category: '总务后勤', owner: '腾飞', location: '远航服务队' }
    ],
    statusIndex: 0,
    categoryIndex: 0,
    saving: false,
    canDelete: false,
    form: {
      title: '',
      month: '',
      day: '',
      category: '服务',
      categoryId: 'second-vp',
      owner: '',
      location: '',
      status: 'pending',
      description: ''
    }
  },

  async onLoad(options) {
    const member = await api.call('getSession')
    const action = options.id ? 'update' : 'create'
    if (!permission.canPerform(member, 'tasks', action)) {
      wx.showToast({ title: '当前账号没有待办管理权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.session = member
    this.setData({ canDelete: permission.canPerform(member, 'todo', 'delete') })
    if (options.id) {
      this.setData({ id: options.id })
      await this.loadTask()
    } else {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      this.setData({
        'form.month': month,
        'form.day': String(now.getDate()).padStart(2, '0')
      })
      this.applyCategory(0, false)
    }
  },

  async loadTask() {
    try {
      const form = await api.call('getTask', { id: this.data.id })
      const statusIndex = this.data.statuses.findIndex(item => item.value === form.status)
      const categoryIndex = this.data.categories.findIndex(item => item.value === form.categoryId)
      this.setData({ form, statusIndex: Math.max(statusIndex, 0), categoryIndex: Math.max(categoryIndex, 0) })
    } catch (error) {
      api.showError(error)
    }
  },

  input(event) {
    this.setData({
      [`form.${event.currentTarget.dataset.key}`]: event.detail.value
    })
  },

  changeMonth(event) {
    this.setData({ 'form.month': event.detail.value })
  },

  changeStatus(event) {
    const statusIndex = Number(event.detail.value)
    this.setData({
      statusIndex,
      'form.status': this.data.statuses[statusIndex].value
    })
  },

  changeCategory(event) {
    this.applyCategory(Number(event.detail.value), true)
  },

  applyCategory(categoryIndex, regenerate) {
    const option = this.data.categories[categoryIndex] || this.data.categories[0]
    this.setData({
      categoryIndex,
      'form.categoryId': option.value,
      'form.category': option.category,
      'form.owner': this.data.form.owner || option.owner,
      'form.location': this.data.form.location || option.location
    })
    if (regenerate) this.generateDraft()
  },

  generateDraft() {
    const form = this.data.form
    const topic = form.description || form.title || '待补充事项'
    const owner = form.owner || '负责人'
    const templates = {
      'second-vp': {
        title: `${owner}狮兄狮姐带领远航做了${topic}`,
        description: `请补充服务对象、服务地点、参与狮友、服务过程、服务成果和嘉许说明。`
      },
      secretary: {
        title: `${owner}狮姐组织召开远航服务队${topic}`,
        description: `会议纪要模板：一、会议主题；二、参会人员；三、会议议题；四、会议决议；五、后续待办；六、嘉许记录。`
      },
      'first-vp': {
        title: `${owner}狮兄狮姐开展远航对外交流`,
        description: `请补充交流对象、交流主题、达成共识、后续跟进和嘉许对象。`
      },
      'third-vp': {
        title: `${owner}狮兄狮姐组织远航开展${topic}`,
        description: `请补充关爱对象、联谊主题、参与人员、现场成果和后续跟进。`
      },
      captain: {
        title: `${owner}狮兄带领远航推进${topic}`,
        description: `请补充队务目标、分工安排、完成情况和需要嘉许的狮友贡献。`
      },
      tamer: {
        title: `${owner}狮兄维护远航${topic}`,
        description: `请补充现场流程、礼仪要求、执行情况和改进建议。`
      },
      treasurer: {
        title: `${owner}狮兄整理远航${topic}`,
        description: `请补充收支摘要、凭证情况、物资价值和审核说明。`
      },
      admin: {
        title: `${owner}狮兄完成远航${topic}`,
        description: `请补充物资、场地、车辆、人员分工和后续改进。`
      }
    }
    const draft = templates[form.categoryId] || templates['second-vp']
    this.setData({
      'form.title': draft.title,
      'form.description': draft.description
    })
    wx.showToast({ title: '模板已生成', icon: 'success' })
  },

  async save() {
    if (!this.data.form.title.trim() || !this.data.form.month || !this.data.form.day) {
      wx.showToast({ title: '请填写事项名称、月份和日期', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveTask', {
        id: this.data.id,
        task: {
          ...this.data.form,
          createdBy: this.data.form.createdBy || (this.session && (this.session.id || this.session._id))
        }
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    } finally {
      this.setData({ saving: false })
    }
  },

  async remove() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '移入回收站',
        content: '事项将不再对成员显示，并保留管理员操作记录。',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('deleteTask', { id: this.data.id })
      wx.showToast({ title: '已移入回收站', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      api.showError(error)
    }
  }
})
