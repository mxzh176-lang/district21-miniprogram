const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')
const todoDisplay = require('../../utils/todo-display')

Page({
  data: {
    selectedMonth: '',
    monthLabel: '',
    selectedDay: 'all',
    status: 'all',
    category: 'all',
    categories: [],
    tasks: [],
    taskGroups: [],
    completedTasks: [],
    completedExpanded: false,
    taskDates: [],
    teams: todoDisplay.TEAMS,
    teamId: 'all',
    currentScope: orgScope.ORG_OPTIONS[0],
    canEdit: false,
    canCreate: false,
    doneCount: 0,
    totalCount: 0
  },

  onLoad(options) {
    const selectedMonth = todoDisplay.currentMonth()
    const currentScope = orgScope.getCurrentScope()
    this.setData({
      selectedMonth,
      monthLabel: `${Number(selectedMonth.slice(5, 7))}月`,
      category: options.category || 'all',
      teamId: todoDisplay.normalizeTeamId(options.teamId) || currentScope.teamId || 'all',
      currentScope
    })
  },

  async onShow() {
    const currentScope = orgScope.getCurrentScope()
    const session = await api.call('getSession')
    this.setData({
      currentScope,
      teamId: currentScope.teamId || 'all',
      canEdit: permission.canPerform(session, 'todo', 'update'),
      canCreate: permission.canPerform(session, 'todo', 'create')
    })
    this.session = session
    await this.loadDates()
    await this.loadTasks()
  },

  async loadDates() {
    const data = await api.call('listTasks', { month: this.data.selectedMonth })
    const grouped = {}
    data.tasks.forEach(item => {
      if (item.day) grouped[item.day] = (grouped[item.day] || 0) + 1
    })
    const taskDates = Object.keys(grouped)
      .sort()
      .map(day => ({ day, count: grouped[day] }))
    this.setData({ taskDates })
  },

  selectDay(event) {
    this.setData({ selectedDay: event.currentTarget.dataset.day })
    this.loadTasks()
  },

  async loadTasks() {
    const monthData = await api.call('listTasks', { month: this.data.selectedMonth })
    const tasks = monthData.tasks
      .filter(item => this.data.status === 'all' || (this.data.status === 'done'
        ? ['done', 'completed'].includes(item.status)
        : item.status === this.data.status))
      .filter(item => this.data.category === 'all' || item.category === this.data.category)
      .filter(item => this.data.selectedDay === 'all' || String(item.day) === String(this.data.selectedDay))
      .filter(item => todoDisplay.matchesTeam(item, this.data.teamId))
      .map(item => todoDisplay.decorateTask(item, this.session))
    const sortedTasks = todoDisplay.sortTasks(tasks)
    const grouped = todoDisplay.buildGroups(sortedTasks)
    this.setData({
      tasks: sortedTasks,
      ...grouped,
      categories: monthData.categories || [...new Set(monthData.tasks.map(item => item.category).filter(Boolean))],
      doneCount: monthData.tasks.filter(item => ['done', 'completed'].includes(item.status)).length,
      totalCount: monthData.tasks.length
    })
  },

  selectCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category })
    this.loadTasks()
  },

  selectStatus(event) {
    this.setData({ status: event.currentTarget.dataset.status })
    this.loadTasks()
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.teamId
    const currentScope = orgScope.setCurrentScopeByTeamId(teamId)
    this.setData({ teamId, currentScope })
    this.loadTasks()
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: orgScope.ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentScope = orgScope.setCurrentScope(orgScope.ORG_OPTIONS[result.tapIndex])
        this.setData({ currentScope, teamId: currentScope.teamId || 'all' })
        this.loadTasks()
      }
    })
  },

  toggleCompleted() {
    this.setData({ completedExpanded: !this.data.completedExpanded })
  },

  createTask() {
    wx.navigateTo({ url: '/pages/admin/task-edit/index' })
  },

  openTask(event) {
    if (!this.data.canEdit) return
    const id = event.detail && event.detail.id ? event.detail.id : event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/task-edit/index?id=${id}` })
  },

  async completeTask(event) {
    const id = event.detail && event.detail.id ? event.detail.id : event.currentTarget.dataset.id
    const task = this.data.tasks.find(item => item._id === id)
    if (!task || task.completed) return
    if (!task.canComplete) {
      wx.showToast({ title: '仅创建人、岗位负责人或管理员可完成', icon: 'none' })
      return
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '完成待办',
        content: '确认完成后，会自动生成历史事件并归入对应档案。',
        confirmText: '完成',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('completeTask', { id })
      wx.showToast({ title: '已完成并入档案', icon: 'success' })
      await this.loadDates()
      await this.loadTasks()
    } catch (error) {
      api.showError(error)
    }
  }
})
