const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')
const todoDisplay = require('../../utils/todo-display')
const TODO_SYNC_INTERVAL = 5000

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
    const currentScope = orgScope.getCurrentScope()
    this.setData({
      selectedMonth: 'all',
      monthLabel: '全部',
      category: options.category || 'all',
      teamId: todoDisplay.normalizeTeamId(options.teamId) || currentScope.teamId || 'all',
      currentScope
    })
  },

  async onShow() {
    const currentScope = orgScope.getCurrentScope()
    const [session, monthData] = await Promise.all([
      api.call('getSession'),
      api.call('listTasks', { month: this.data.selectedMonth })
    ])
    this.setData({
      currentScope,
      teamId: currentScope.teamId || 'all',
      canEdit: permission.canManageTodo(session),
      canCreate: permission.canCreateTodo(session)
    })
    this.session = session
    this.applyMonthData(monthData)
    this.startTodoSync()
  },

  onHide() {
    this.stopTodoSync()
  },

  onUnload() {
    this.stopTodoSync()
  },

  buildTaskDates(data) {
    const grouped = {}
    data.tasks.forEach(item => {
      if (item.date) grouped[item.date] = (grouped[item.date] || 0) + 1
    })
    return Object.keys(grouped)
      .sort()
      .map(date => ({
        date,
        label: `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`,
        count: grouped[date]
      }))
  },

  selectDay(event) {
    this.setData({ selectedDay: event.currentTarget.dataset.day })
    this.loadTasks()
  },

  async loadTasks(options = {}) {
    if (this.todoSyncing) return
    this.todoSyncing = true
    try {
      const monthData = await api.call('listTasks', { month: this.data.selectedMonth }, options)
      this.applyMonthData(monthData)
    } finally {
      this.todoSyncing = false
    }
  },

  startTodoSync() {
    this.stopTodoSync()
    this.todoSyncTimer = setInterval(() => {
      this.loadTasks({ forceRefresh: true }).catch(() => {})
    }, TODO_SYNC_INTERVAL)
  },

  stopTodoSync() {
    if (!this.todoSyncTimer) return
    clearInterval(this.todoSyncTimer)
    this.todoSyncTimer = null
  },

  applyMonthData(monthData) {
    const tasks = monthData.tasks
      .filter(item => this.data.status === 'all' || (this.data.status === 'done'
        ? ['done', 'completed'].includes(item.status)
        : item.status === this.data.status))
      .filter(item => this.data.category === 'all' || item.category === this.data.category)
      .filter(item => this.data.selectedDay === 'all' || item.date === this.data.selectedDay)
      .filter(item => todoDisplay.matchesTeam(item, this.data.teamId))
      .map(item => todoDisplay.decorateTask(item, this.session))
    const sortedTasks = todoDisplay.sortTasks(tasks)
    const grouped = todoDisplay.buildGroups(sortedTasks)
    this.setData({
      tasks: sortedTasks,
      ...grouped,
      taskDates: this.buildTaskDates(monthData),
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
      wx.showToast({ title: '仅管理员可完成待办', icon: 'none' })
      return
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '完成待办',
        content: '确认将此内部提醒标记为已完成？',
        confirmText: '完成',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('completeTask', { id })
      wx.showToast({ title: '已标记完成', icon: 'success' })
      await this.loadTasks()
    } catch (error) {
      api.showError(error)
    }
  },

  async reopenTask(event) {
    const id = event.detail && event.detail.id ? event.detail.id : event.currentTarget.dataset.id
    const task = this.data.completedTasks.find(item => item._id === id || item.id === id)
    if (!task || !task.completed) return
    if (!task.canComplete) {
      wx.showToast({ title: '仅管理员可重新待办', icon: 'none' })
      return
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '重新变为待办',
        content: '确认将该已完成事项重新发回待办列表？',
        confirmText: '重新待办',
        success: result => resolve(result.confirm)
      })
    })
    if (!confirmed) return
    try {
      await api.call('reopenTask', { id })
      wx.showToast({ title: '已重新变为待办', icon: 'success' })
      await this.loadTasks({ forceRefresh: true })
    } catch (error) {
      api.showError(error)
    }
  }
})
