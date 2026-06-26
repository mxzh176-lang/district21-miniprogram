const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

const TEAMS = [
  { id: 'all', name: '全部服务队', shortName: '全部', initial: '全' },
  { id: 'linghang', name: '领航服务队', shortName: '领航', initial: '领' },
  { id: 'ailinghang', name: '爱领航服务队', shortName: '爱领航', initial: '爱' },
  { id: 'yuanhang', name: '远航服务队', shortName: '远航', initial: '远' },
  { id: 'jingying', name: '精英服务队', shortName: '精英', initial: '精' }
]

const CATEGORY_TONES = [
  { tone: 'service', keywords: ['公益服务', '服务'] },
  { tone: 'meeting', keywords: ['工作会议', '会议纪要', '会议'] },
  { tone: 'birthday', keywords: ['狮友生日', '生日'] },
  { tone: 'social', keywords: ['联谊活动', '联谊聚餐', '聚会联谊', '联谊', '聚餐'] },
  { tone: 'visit', keywords: ['走访慰问', '狮友关爱', '慰问', '走访', '关爱'] },
  { tone: 'training', keywords: ['培训活动', '会议培训', '培训'] }
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function normalizeTeamId(value) {
  return String(value || '').replace(/^org_team_/, '')
}

function taskTeamIds(task) {
  const values = Array.isArray(task.teamIds)
    ? task.teamIds
    : Array.isArray(task.teamId) ? task.teamId : String(task.teamId || '').split(/[|,，、+]/)
  return values.map(normalizeTeamId).filter(Boolean)
}

function matchesTeam(task, teamId) {
  if (!teamId || teamId === 'all') return true
  const ids = taskTeamIds(task)
  if (ids.includes(teamId)) return true
  const team = TEAMS.find(item => item.id === teamId)
  return Boolean(team && String(task.team || '').includes(team.shortName))
}

function categoryTone(category) {
  const text = String(category || '')
  const matched = CATEGORY_TONES.find(item => item.keywords.some(keyword => text.includes(keyword)))
  return matched ? matched.tone : 'default'
}

function categoryLabel(category) {
  const tone = categoryTone(category)
  const labels = {
    service: '公益服务',
    meeting: '工作会议',
    birthday: '狮友生日',
    social: '联谊活动',
    visit: '走访慰问',
    training: '培训活动'
  }
  return labels[tone] || category || '其他事项'
}

function parseTaskDate(task) {
  const month = /^\d{4}-\d{2}$/.test(String(task.month || '')) ? task.month : ''
  const day = Number(task.day)
  if (!month || !day || day < 1 || day > 31) return null
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1, day)
  return date.getFullYear() === year && date.getMonth() === monthNumber - 1 && date.getDate() === day ? date : null
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function decorateTask(item, session) {
  const date = parseTaskDate(item)
  const now = new Date()
  const today = startOfDay(now)
  const difference = date ? Math.round((startOfDay(date) - today) / 86400000) : null
  const time = item.startTime || item.time || item.beginTime || ''
  const completed = ['done', 'completed'].includes(item.status)
  const teamNames = Array.isArray(item.teams)
    ? item.teams.map(team => typeof team === 'string' ? team : team.name).filter(Boolean)
    : String(item.team || '').split(/[|,，、+]/).map(name => name.trim()).filter(Boolean)
  const weekday = date ? `周${'日一二三四五六'[date.getDay()]}` : ''
  let countdownPrefix = ''
  let countdownValue = '日期待定'
  let countdownUnit = ''
  if (completed) {
    countdownValue = '已完成'
  } else if (difference === 0 && /^\d{1,2}:\d{2}/.test(time)) {
    const [hour, minute] = time.split(':').map(Number)
    const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
    const hours = Math.ceil((startsAt - now) / 3600000)
    if (hours > 0) {
      countdownPrefix = '还有'
      countdownValue = hours
      countdownUnit = '小时'
    } else {
      countdownValue = '今天'
    }
  } else if (difference === 0) {
    countdownValue = '今天'
  } else if (difference > 0) {
    countdownPrefix = '还有'
    countdownValue = difference
    countdownUnit = '天'
  } else if (difference < 0) {
    countdownPrefix = '逾期'
    countdownValue = Math.abs(difference)
    countdownUnit = '天'
  }

  return {
    ...item,
    completed,
    canComplete: permission.canCompleteTodo(session, item),
    tone: categoryTone(item.category),
    categoryLabel: categoryLabel(item.category),
    dateLabel: date ? `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}` : `${item.month || '本月'} 日期待定`,
    timeLabel: time || '时间待定',
    locationLabel: item.location || '地点待定',
    teamLabel: teamNames.length ? teamNames.join(' ｜ ') : '服务队待定',
    countdownPrefix,
    countdownValue,
    countdownUnit,
    countdownCompact: difference === null,
    difference,
    inThisWeek: difference !== null && difference > 1 && difference <= (7 - today.getDay())
  }
}

function buildGroups(tasks) {
  const groups = [
    { key: 'today', title: '今天', tasks: [] },
    { key: 'tomorrow', title: '明天', tasks: [] },
    { key: 'week', title: '本周', tasks: [] },
    { key: 'later', title: '以后', tasks: [] }
  ]
  const completedTasks = []
  tasks.forEach(task => {
    if (task.completed) {
      completedTasks.push(task)
    } else if (task.difference === 0) {
      groups[0].tasks.push(task)
    } else if (task.difference === 1) {
      groups[1].tasks.push(task)
    } else if (task.inThisWeek) {
      groups[2].tasks.push(task)
    } else {
      groups[3].tasks.push(task)
    }
  })
  return {
    taskGroups: groups.filter(group => group.tasks.length).map(group => ({ ...group, count: group.tasks.length })),
    completedTasks
  }
}

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
    teams: TEAMS,
    teamId: 'all',
    canEdit: false,
    canCreate: false,
    doneCount: 0,
    totalCount: 0
  },

  onLoad(options) {
    const now = new Date()
    const selectedMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
    const currentScope = orgScope.getCurrentScope()
    this.setData({
      selectedMonth,
      monthLabel: `${Number(selectedMonth.slice(5, 7))}月`,
      category: options.category || 'all',
      teamId: normalizeTeamId(options.teamId) || currentScope.teamId || 'all',
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
      .filter(item => matchesTeam(item, this.data.teamId))
      .map(item => decorateTask(item, this.session))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        if (a.difference === null) return 1
        if (b.difference === null) return -1
        return a.difference - b.difference
      })
    const grouped = buildGroups(tasks)
    this.setData({
      tasks,
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
    wx.navigateTo({ url: `/pages/admin/task-edit/index?id=${event.currentTarget.dataset.id}` })
  },

  async completeTask(event) {
    const id = event.currentTarget.dataset.id
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
