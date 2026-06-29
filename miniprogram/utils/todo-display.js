const permission = require('./permission')

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

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
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

function sortTasks(tasks) {
  return tasks.slice().sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    if (a.difference === null) return 1
    if (b.difference === null) return -1
    return a.difference - b.difference
  })
}

function buildGroups(tasks, options = {}) {
  const includeTomorrow = options.includeTomorrow !== false
  const groups = [
    { key: 'today', title: '今天', tasks: [] },
    includeTomorrow ? { key: 'tomorrow', title: '明天', tasks: [] } : null,
    { key: 'week', title: '本周', tasks: [] },
    { key: 'later', title: '以后', tasks: [] }
  ].filter(Boolean)
  const completedTasks = []
  const byKey = groups.reduce((map, group) => {
    map[group.key] = group
    return map
  }, {})
  tasks.forEach(task => {
    if (task.completed) {
      completedTasks.push(task)
    } else if (task.difference === 0) {
      byKey.today.tasks.push(task)
    } else if (task.difference === 1 && includeTomorrow) {
      byKey.tomorrow.tasks.push(task)
    } else if (task.difference !== null && task.difference > 0 && (task.inThisWeek || (!includeTomorrow && task.difference === 1))) {
      byKey.week.tasks.push(task)
    } else {
      byKey.later.tasks.push(task)
    }
  })
  return {
    taskGroups: groups.filter(group => group.tasks.length).map(group => ({ ...group, count: group.tasks.length })),
    completedTasks
  }
}

function buildHomeGroups(tasks) {
  const pendingTasks = sortTasks(tasks).filter(task => !task.completed)
  const grouped = buildGroups(pendingTasks, { includeTomorrow: false }).taskGroups
  const limits = { today: 1, week: 2, later: 2 }
  let used = 0
  return grouped.map(group => {
    const limit = limits[group.key] || 0
    const sliced = group.tasks.slice(0, Math.max(0, limit))
    used += sliced.length
    return { ...group, tasks: sliced, count: group.tasks.length }
  }).filter(group => group.tasks.length && used <= 5)
}

module.exports = {
  TEAMS,
  pad,
  currentMonth,
  normalizeTeamId,
  matchesTeam,
  decorateTask,
  sortTasks,
  buildGroups,
  buildHomeGroups
}
