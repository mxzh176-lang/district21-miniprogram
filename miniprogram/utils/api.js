const data = require('../data/mock-data')
const knowledgeBase = require('../data/knowledge-base')
const platformService = require('../services/platform-service')
const organizationService = require('../services/organization-service')
const eventService = require('../services/event-service')
const userService = require('../services/user-service')
const honorService = require('../services/honor-service')
const permission = require('./permission')

let importedDataCache = null
function importedData() {
  if (!importedDataCache) importedDataCache = require('../data/imported-archives')
  return importedDataCache
}

const demoMember = {
  _id: 'readonly-guest',
  nickname: '未授权访客',
  avatarUrl: '',
  status: 'readonly',
  role: 'member',
  team: '二十一协作区',
  term: '2026—2027年度'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function findById(items, id) {
  return items.find(item => item._id === id)
}

function getLocalArchiveEntries() {
  try {
    return wx.getStorageSync('demoArchiveEntries') || []
  } catch (error) {
    return []
  }
}

function saveLocalArchiveEntries(entries) {
  wx.setStorageSync('demoArchiveEntries', entries)
}

function getArchiveOrders() {
  return wx.getStorageSync('demoArchiveOrders') || {}
}

function saveArchiveOrders(orders) {
  wx.setStorageSync('demoArchiveOrders', orders)
}

function getLocalTasks() {
  try {
    return wx.getStorageSync('demoTasks') || []
  } catch (error) {
    return []
  }
}

function saveLocalTasks(tasks) {
  wx.setStorageSync('demoTasks', tasks)
}

function getLocalLedgerRecords() {
  try {
    return wx.getStorageSync('demoLedgerRecords') || []
  } catch (error) {
    return []
  }
}

function saveLocalLedgerRecords(records) {
  wx.setStorageSync('demoLedgerRecords', records)
}

function allTasks() {
  const tasks = {}
  data.tasks.concat(getLocalTasks()).forEach(item => {
    tasks[item._id] = item
  })
  return Object.values(tasks)
}

function isTaskCompleted(task) {
  return ['done', 'completed'].includes(task.status)
}

function effectiveTaskStatus(task) {
  if (isTaskCompleted(task) || task.status === 'deleted') return task.status
  const fullDate = `${task.month || ''}-${String(task.day || '').padStart(2, '0')}`
  return fullDate.length === 10 && fullDate < new Date().toISOString().slice(0, 10)
    ? 'overdue'
    : 'pending'
}

function nextMonth(month) {
  const [year, value] = String(month || '').split('-').map(Number)
  if (!year || !value) return ''
  const date = new Date(year, value, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function completedTaskHistoryEntries() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  return allTasks()
    .filter(task => isTaskCompleted(task) && task.archiveMonth && task.archiveMonth <= currentMonth)
    .map(task => buildArchiveDraftFromTask(task, 'published'))
}

function dateLabel(date) {
  const value = String(date || '')
  if (value.length < 10) return value
  return `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
}

function allArchiveEntries() {
  const imported = importedData()
  const orders = getArchiveOrders()
  const hidden = wx.getStorageSync('hiddenArchiveEntries') || []
  return imported.archiveEntries.concat(getLocalArchiveEntries(), completedTaskHistoryEntries())
    .filter(item => !hidden.includes(item._id))
    .map((item, index) => ({
      ...item,
      order: orders[item._id] === undefined ? index : orders[item._id]
    }))
}

const MAIN_POSITION_ORDER = ['captain', 'secretary', 'tamer', 'treasurer', 'admin', 'first-vp', 'second-vp', 'third-vp']
const TOP_POSITION_ORDER = ['captain', 'first-vp', 'second-vp', 'third-vp']
const CAPTAIN_CHILD_IDS = ['secretary', 'tamer', 'treasurer', 'admin']
const POSITION_META = {
  captain: { name: '队长', icon: '队', match: '队长' },
  secretary: { name: '秘书', icon: '秘', match: '秘书' },
  tamer: { name: '纠察', icon: '纠', match: '纠察' },
  treasurer: { name: '司库', icon: '库', match: '司库', restricted: true },
  admin: { name: '总务', icon: '务', match: '总务' },
  'first-vp': { name: '第一副队长', icon: '一', match: '第一副队长' },
  'second-vp': { name: '第二副队长', icon: '二', match: '第二副队长' },
  'third-vp': { name: '第三副队长', icon: '三', match: '第三副队长' }
}
const COMMITTEE_GROUPS = {
  'first-vp': ['会员', '领导力', '对外交流'],
  'second-vp': ['服务', '公共关系', '新闻宣传', '筹款'],
  'third-vp': ['关爱', '联谊', '年会']
}

function cleanPositionName(name) {
  return String(name || '')
    .replace(/^狮友/, '')
    .replace(/委员会副主席$/, '委员会副主席')
    .replace(/委员会主席$/, '委员会')
    .replace(/主席$/, '')
}

function nestCaptainChildren(categories) {
  const categoryMap = {}
  categories.forEach(category => { categoryMap[category.id] = category })
  if (categoryMap.captain) {
    categoryMap.captain = {
      ...categoryMap.captain,
      children: CAPTAIN_CHILD_IDS
        .map(id => categoryMap[id])
        .filter(Boolean)
        .map(item => ({ ...item, children: undefined, compact: true }))
    }
  }
  return TOP_POSITION_ORDER.map(id => categoryMap[id]).filter(Boolean)
}

function buildTeamCategories(team) {
  const roles = team.roles || []
  const categories = MAIN_POSITION_ORDER.map(id => {
    const meta = POSITION_META[id]
    const assignment = id === 'captain'
      ? { person: team.leader }
      : roles.find(item => item.position === meta.match)
    const keywords = COMMITTEE_GROUPS[id] || []
    const children = roles
      .filter(item => keywords.some(keyword => item.position.includes(keyword)))
      .map((item, index) => ({
        id: `${id}-committee-${index + 1}`,
        name: cleanPositionName(item.position),
        person: item.person || '待授权'
      }))
    return {
      id,
      positionId: `${team.id || ''}:${id}`,
      name: meta.name,
      person: assignment && assignment.person ? assignment.person : '待授权',
      icon: meta.icon,
      restricted: Boolean(meta.restricted),
      children
    }
  })
  return nestCaptainChildren(categories)
}

function buildAreaCategories(term) {
  const roles = term.district || []
  const definitions = [
    ['area-chair', '区域主席', '区执委会主席', '区'],
    ['area-coordinator', '区域协调长', '协调长', '协'],
    ['secretary-general', '秘书长', '秘书长', '秘'],
    ['finance-chief', '财务长', '财务长', '财'],
    ['gmt', 'GMT', 'GMT', 'G'],
    ['glt', 'GLT', 'GLT', 'L'],
    ['gst', 'GST', 'GST', 'S'],
    ['marketing', '营销宣传', '宣传', '宣'],
    ['membership', '会员发展', '会员', '会'],
    ['service-development', '服务发展', '服务', '服'],
    ['area-other', '其他协作区岗位', '', '其']
  ]
  return definitions.map(([id, name, keyword, icon]) => {
    const assignment = keyword && roles.find(item => item.position.includes(keyword))
    return { id, positionId: `district:${id}`, name, person: assignment ? assignment.person : '待授权', icon, children: [] }
  })
}

function buildArchiveOrganizations() {
  const term = data.structureTerms[0] || { district: [], teams: [] }
  const teamMap = {}
  ;(term.teams || []).forEach(team => { teamMap[team.name] = team })
  return data.teams.map(organization => {
    if (organization.id === 'district') {
      return {
        ...organization,
        seal: '区',
        description: '协作区独立岗位与历史资料空间',
        photoCount: 0,
        categories: buildAreaCategories(term)
      }
    }
    const team = teamMap[organization.name] || { name: organization.name, roles: [] }
    team.id = organization.id
    const confirmedYuanhang = organization.id === 'yuanhang' && data.archiveOrganizations[0]
      ? nestCaptainChildren(data.archiveOrganizations[0].categories
        .slice()
        .sort((a, b) => MAIN_POSITION_ORDER.indexOf(a.id) - MAIN_POSITION_ORDER.indexOf(b.id))
        .map(category => ({
          id: category.id,
          positionId: `${organization.id}:${category.id}`,
          name: category.name,
          person: category.person,
          icon: category.icon,
          restricted: Boolean(category.restricted),
          children: (category.children || []).map(child => ({
            id: child.id,
            positionId: `${organization.id}:${child.id}`,
            name: child.name,
            person: child.person
          }))
        })))
      : null
    return {
      ...organization,
      seal: organization.shortName.slice(0, 1),
      captain: confirmedYuanhang ? '张明星' : team.leader || '待授权',
      description: `${organization.name}独立岗位与历史资料空间`,
      photoCount: 0,
      categories: confirmedYuanhang || buildTeamCategories(team)
    }
  })
}

function getLocalMembers() {
  try {
    return wx.getStorageSync('demoMembers') || []
  } catch (error) {
    return []
  }
}

function saveLocalMembers(members) {
  wx.setStorageSync('demoMembers', members)
}

function getAdminPermissions() {
  return wx.getStorageSync('demoAdminPermissions') || {}
}

function getMemberRoles() {
  return wx.getStorageSync('demoMemberRoles') || {}
}

function allMembers() {
  const imported = importedData()
  const members = {}
  data.members.concat(imported.members, getLocalMembers()).forEach(item => {
    members[item.name] = item
  })
  if (members['关丙刚']) {
    members['关丙刚'] = {
      ...members['关丙刚'],
      company: '巧媳妇铁锅炖'
    }
  }
  if (members['景雅东']) {
    members['景雅东'] = {
      ...members['景雅东'],
      company: '小鱼故事中餐厅'
    }
  }
  return Object.values(members)
}

function archiveListItem(item) {
  return {
    _id: item._id,
    organizationId: item.organizationId,
    categoryId: item.categoryId,
    date: item.date,
    dateLabel: item.dateLabel,
    title: item.title,
    team: item.team,
    uploadedBy: item.uploadedBy,
    uploaderRole: item.uploaderRole,
    status: item.status,
    photoCount: item.photoCount,
    photos: item.photos && item.photos.length ? [item.photos[0]] : [],
    tone: item.tone,
    keywords: item.keywords,
    summary: item.summary
  }
}

const categoryTemplates = {
  captain: {
    role: '队长',
    tone: 'blue',
    title: (owner, org, topic) => `${owner}狮兄带领${org}推进${topic || '年度重点工作'}`,
    summary: (org, topic) => `${org}围绕“${topic || '年度重点工作'}”推进队务协作和嘉许文化。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄带领${org}推进“${topic || '年度重点工作'}”，明确目标、分工、完成情况和需要嘉许的狮友贡献。`
  },
  'first-vp': {
    role: '第一副队长',
    tone: 'purple',
    title: (owner, org, topic) => `${owner}狮兄狮姐推进${org}${topic || '第一副队长团队工作'}`,
    summary: (org, topic) => `${org}围绕“${topic || '第一副队长团队工作'}”形成内部岗位记录。`,
    content: (date, org, category, owner, topic) => `记录日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n工作类别：会员发展／培训／对外交流\n工作主题：${topic || '请补充'}\n请补充工作目标、责任岗位、参与人员、执行情况、完成结果和后续事项。`
  },
  'second-vp': {
    role: '第二副队长',
    tone: 'green',
    title: (owner, org, topic) => `${owner}狮兄狮姐推进${org}${topic || '第二副队长团队工作'}`,
    summary: (org, topic) => `${org}围绕“${topic || '第二副队长团队工作'}”形成内部岗位记录。`,
    content: (date, org, category, owner, topic) => `记录日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n工作类别：服务计划／资料报送／经费筹备\n工作主题：${topic || '请补充'}\n请补充工作目标、责任岗位、参与人员、执行情况、完成结果和后续事项。`
  },
  'third-vp': {
    role: '第三副队长',
    tone: 'red',
    title: (owner, org, topic) => `${owner}狮兄狮姐推进${org}${topic || '第三副队长团队工作'}`,
    summary: (org, topic) => `${org}围绕“${topic || '第三副队长团队工作'}”形成内部岗位记录。`,
    content: (date, org, category, owner, topic) => `记录日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n工作类别：关爱／联谊／年会\n工作主题：${topic || '请补充'}\n请按实际类别补充工作目标、责任岗位、参与人员、执行情况、完成结果和后续事项，不混写其他类别。`
  },
  secretary: {
    role: '会议纪要',
    tone: 'gold',
    title: (owner, org, topic) => `${owner}狮姐组织召开${org}${topic || '工作会议'}`,
    summary: (org, topic) => `${org}召开“${topic || '工作会议'}”，形成会议纪要和待办事项。`,
    content: (date, org, category, owner, topic) => `会议日期：${date}\n会议组织：${org}\n档案分类：${category}\n记录人：${owner}\n\n一、会议主题：${topic || '工作会议'}\n二、参会人员：请补充\n三、会议议题：请补充\n四、会议决议：请补充\n五、后续待办：请补充\n六、嘉许记录：请补充本次推动会议和落实事项的狮兄狮姐。`
  },
  tamer: {
    role: '纠察',
    tone: 'teal',
    title: (owner, org, topic) => `${owner}狮兄维护${org}${topic || '会议活动秩序'}`,
    summary: (org, topic) => `${org}完成“${topic || '会议活动秩序'}”相关纠察记录。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄维护${org}“${topic || '会议活动秩序'}”，请补充现场流程、礼仪要求、执行情况和改进建议。`
  },
  treasurer: {
    role: '司库',
    tone: 'blue',
    title: (owner, org, topic) => `${owner}狮兄整理${org}${topic || '司库账目记录'}`,
    summary: (org, topic) => `${org}完成“${topic || '财务资料'}”核对与内部归档。`,
    content: (date, org, category, owner, topic) => `记录日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄整理${org}“${topic || '财务资料'}”。请补充资料范围、核对人员、核对结果、凭证留存位置和后续事项；具体收支请使用司库账目模块。`
  },
  admin: {
    role: '总务',
    tone: 'purple',
    title: (owner, org, topic) => `${owner}狮兄完成${org}${topic || '总务后勤保障'}`,
    summary: (org, topic) => `${org}完成“${topic || '总务后勤'}”保障记录。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄完成${org}“${topic || '总务后勤保障'}”。请补充物资、场地、车辆、人员分工和后续改进。`
  }
}

function buildArchiveDraftFromTask(task, status = 'published') {
  const org = task.team || '远航服务队'
  const categoryId = task.categoryId || 'second-vp'
  const category = archiveOrganizationsCategory(categoryId)
  const template = categoryTemplates[categoryId] || categoryTemplates['second-vp']
  const owner = task.owner || '负责人'
  const topic = task.title || task.description || task.category
  const date = `${task.month || '2026-06'}-${String(task.day || '01').padStart(2, '0')}`
  return {
    _id: `task-entry-${task._id}`,
    organizationId: task.teamId || 'yuanhang',
    categoryId,
    date,
    dateLabel: dateLabel(date),
    title: task.title && task.title.includes(owner) ? task.title : template.title(owner, org, topic),
    team: org,
    uploadedBy: owner,
    uploaderRole: category ? category.name : template.role,
    status,
    photoCount: 0,
    photos: [],
    tone: template.tone,
    keywords: [task.category, owner].filter(Boolean),
    summary: task.description || template.summary(org, topic),
    content: template.content(date, org, category ? category.name : task.category, owner, topic)
  }
}

function archiveOrganizationsCategory(categoryId) {
  const org = data.archiveOrganizations.find(item => item.id === 'yuanhang') || data.archiveOrganizations[0]
  if (!org || !org.categories) return null
  for (const category of org.categories) {
    if (category.id === categoryId) return category
    const child = (category.children || []).find(item => item.id === categoryId)
    if (child) return child
  }
  return null
}

function localCall(action, payload = {}) {
  let result
  switch (action) {
    case 'getSession':
      result = demoMember
      break
    case 'getHome':
      const currentMonth = new Date().toISOString().slice(0, 7)
      const visibleHomeTasks = allTasks().filter(item => item.status !== 'deleted' && item.month === currentMonth)
      const pendingHomeTasks = visibleHomeTasks.filter(item => !isTaskCompleted(item))
      const doneHomeTasks = visibleHomeTasks.filter(isTaskCompleted)
      result = {
        currentMonth,
        monthLabel: `${Number(currentMonth.slice(5, 7))}月`,
        summary: { pendingCount: pendingHomeTasks.length, doneCount: doneHomeTasks.length, memberCount: 120, photoCount: 3 },
        tasks: pendingHomeTasks.slice(0, 4),
        completedTasks: doneHomeTasks.slice(0, 4),
        careOverview: { birthdayCount: 8, careCount: 2 },
        notices: data.notices,
        activities: data.activities.slice(0, 3),
        teams: data.teams,
        banners: [
          '/images/archives/word-service-001/01.jpg',
          '/images/archives/word-service-003/01.jpg',
          '/images/archives/word-care-001/01.jpg',
          '/images/archives/word-social-001/01.jpg',
          '/images/archives/word-training-001/01.jpg'
        ]
      }
      break
    case 'listTasks': {
      const tasks = allTasks().map(item => ({ ...item, status: effectiveTaskStatus(item) })).filter(item => {
        if (item.status === 'deleted') return false
        const monthMatch = !payload.month || payload.month === 'all' || item.month === payload.month
        const statusMatch = !payload.status || payload.status === 'all' ||
          (payload.status === 'done' ? isTaskCompleted(item) : item.status === payload.status)
        const categoryMatch = !payload.category || payload.category === 'all' || item.category === payload.category
        const dayMatch = !payload.day || payload.day === 'all' || item.day === payload.day
        const teamMatch = !payload.teamId || payload.teamId === 'all' || item.teamId === payload.teamId
        return monthMatch && statusMatch && categoryMatch && dayMatch && teamMatch
      })
      const selectedMonth = payload.month && payload.month !== 'all' ? payload.month : new Date().toISOString().slice(0, 7)
      result = { tasks, months: [{ value: selectedMonth, label: `${selectedMonth.slice(0, 4)}年${Number(selectedMonth.slice(5, 7))}月` }], categories: ['公益服务', '会议纪要', '对外交流', '狮友关爱', '聚会联谊', '会员发展', '新闻宣传', '司库账目', '总务后勤'] }
      break
    }
    case 'listActivities':
      result = data.activities
      break
    case 'getActivity': {
      const activity = findById(data.activities, payload.id) || data.activities[0]
      result = { activity, photos: data.photosFor(activity) }
      break
    }
    case 'listOrg':
      result = allMembers()
      break
    case 'listTeams':
      result = data.teams
      break
    case 'listArchives':
      const entriesForCount = allArchiveEntries()
      result = buildArchiveOrganizations().map(organization => ({
        ...organization,
        categories: organization.categories.map(category => ({
          ...category,
          children: (category.children || []).map(child => ({
            ...child,
            count: entriesForCount.filter(item =>
              item.organizationId === organization.id &&
              item.categoryId === child.id &&
              item.status === 'published'
            ).length
          })),
          count: entriesForCount.filter(item =>
            item.organizationId === organization.id &&
            item.categoryId === category.id &&
            item.status === 'published'
          ).length
        }))
      }))
      break
    case 'listPositions': {
      const organizations = buildArchiveOrganizations()
      const organization = organizations.find(item =>
        item.id === payload.organizationId || item.cloudId === payload.organizationId
      )
      result = (organization && organization.categories || []).flatMap(category => [
        { id: category.positionId || category.id, organizationId: organization.id, code: category.id, name: category.name, sortOrder: 0 },
        ...(category.children || []).map(child => ({
          id: child.positionId || child.id,
          organizationId: organization.id,
          code: child.id,
          name: child.name,
          parentPositionId: category.positionId || category.id,
          sortOrder: 0
        }))
      ])
      break
    }
    case 'listRoleAssignments':
      result = []
      break
    case 'listPlatformUsers':
      result = allMembers().map(item => ({
        id: item._id,
        name: item.name,
        defaultOrganizationId: item.teamId,
        profileCompleted: Boolean(item.name && item.teamId),
        accountSuffix: String(item._id || '').slice(-6),
        memberCode: item.memberCode || ''
      }))
      break
    case 'listUserRoles':
      result = []
      break
    case 'listArchiveEntries':
      result = allArchiveEntries()
        .filter(item => {
          const organizationMatch = !payload.organizationId || item.organizationId === payload.organizationId
          const categoryMatch = !payload.categoryId || item.categoryId === payload.categoryId
          const monthMatch = !payload.eventMonth || String(item.date || '').slice(0, 7) === payload.eventMonth
          return organizationMatch && categoryMatch && monthMatch
        })
        .map(archiveListItem)
      break
    case 'listLedgerRecords':
      result = getLocalLedgerRecords()
        .filter(item => !payload.organizationId || item.organizationId === payload.organizationId)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      break
    case 'saveLedgerRecord': {
      const records = getLocalLedgerRecords()
      const record = {
        ...payload.record,
        id: payload.record.id || `local-ledger-${Date.now()}`,
        createdAt: payload.record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const index = records.findIndex(item => item.id === record.id)
      if (index >= 0) records[index] = record
      else records.push(record)
      saveLocalLedgerRecords(records)
      result = record
      break
    }
    case 'deleteLedgerRecord':
      saveLocalLedgerRecords(getLocalLedgerRecords().filter(item => item.id !== payload.id))
      result = true
      break
    case 'getArchiveEntry':
      result = findById(allArchiveEntries(), payload.id) || data.archiveEntries[0]
      break
    case 'saveArchiveEntry': {
      const entries = getLocalArchiveEntries()
      const entry = {
        ...payload.entry,
        _id: payload.entry._id || `local-${Date.now()}`
      }
      const index = entries.findIndex(item => item._id === entry._id)
      if (index >= 0) entries[index] = entry
      else entries.push(entry)
      saveLocalArchiveEntries(entries)
      result = entry
      break
    }
    case 'saveTask': {
      const tasks = getLocalTasks()
      const now = new Date()
      const base = payload.task || {}
      const id = payload.id || base._id || `local-task-${Date.now()}`
      const task = {
        _id: id,
        month: base.month || '2026-06',
        day: String(base.day || now.getDate()).padStart(2, '0'),
        category: base.category || '公益服务',
        categoryId: base.categoryId || 'second-vp',
        title: base.title || '待补充事项',
        team: base.team || '远航服务队',
        teamId: base.teamId || 'yuanhang',
        owner: base.owner || '负责人',
        location: base.location || '',
        status: base.status || 'pending',
        priority: base.priority || 'normal',
        description: base.description || '',
        positionId: base.positionId || base.categoryId || 'main',
        organizationId: base.organizationId || base.teamId || 'district',
        createdBy: base.createdBy || demoMember._id,
        createdAt: base.createdAt || now.toISOString(),
        completedAt: base.completedAt || null,
        completedBy: base.completedBy || null,
        archiveMonth: base.archiveMonth || ''
      }
      const index = tasks.findIndex(item => item._id === id)
      if (index >= 0) tasks[index] = task
      else tasks.push(task)
      saveLocalTasks(tasks)
      result = task
      break
    }
    case 'deleteTask': {
      const tasks = getLocalTasks().filter(item => item._id !== payload.id)
      const seeded = data.tasks.find(item => item._id === payload.id)
      if (seeded) {
        tasks.push({ ...seeded, status: 'deleted' })
      }
      saveLocalTasks(tasks)
      result = true
      break
    }
    case 'completeTask': {
      const id = payload.id
      const localTasks = getLocalTasks()
      let task = localTasks.find(item => item._id === id) || data.tasks.find(item => item._id === id)
      if (!task) {
        result = false
        break
      }
      task = {
        ...task,
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: demoMember._id,
        archiveMonth: nextMonth(task.month)
      }
      const index = localTasks.findIndex(item => item._id === id)
      if (index >= 0) localTasks[index] = task
      else localTasks.push(task)
      saveLocalTasks(localTasks)

      result = { task, entry: null }
      break
    }
    case 'deleteArchiveEntry': {
      const entries = getLocalArchiveEntries()
      const localIndex = entries.findIndex(item => item._id === payload.id)
      if (localIndex >= 0) {
        entries.splice(localIndex, 1)
        saveLocalArchiveEntries(entries)
      } else {
        const hidden = wx.getStorageSync('hiddenArchiveEntries') || []
        if (!hidden.includes(payload.id)) hidden.push(payload.id)
        wx.setStorageSync('hiddenArchiveEntries', hidden)
      }
      result = true
      break
    }
    case 'saveArchiveOrder': {
      const orders = getArchiveOrders()
      ;(payload.ids || []).forEach((id, index) => { orders[id] = index })
      saveArchiveOrders(orders)
      result = true
      break
    }
    case 'importArchiveDrafts': {
      const entries = getLocalArchiveEntries()
      const importedEntries = (payload.entries || []).map((item, index) => ({
        ...item,
        _id: `word-${Date.now()}-${index}`
      }))
      saveLocalArchiveEntries(entries.concat(importedEntries))
      result = importedEntries
      break
    }
    case 'getMember': {
      const member = findById(allMembers(), payload.id) || allMembers()[0]
      result = {
        member,
        canViewContact: permission.canManage(demoMember),
        canManage: permission.canManage(demoMember)
      }
      break
    }
    case 'saveMember': {
      const members = getLocalMembers()
      const member = {
        ...payload.member,
        _id: payload.member._id || `local-member-${Date.now()}`
      }
      const index = members.findIndex(item => item._id === member._id)
      if (index >= 0) members[index] = member
      else members.push(member)
      saveLocalMembers(members)
      result = member
      break
    }
    case 'deleteMember': {
      const members = getLocalMembers().filter(item => item._id !== payload.id)
      saveLocalMembers(members)
      result = true
      break
    }
    case 'listAdminMembers': {
      const permissions = getAdminPermissions()
      const roles = getMemberRoles()
      result = allMembers()
        .filter(item => permission.isAdministrativeRoleValue(roles[item._id] || item.role))
        .map(item => ({
          ...item,
          role: roles[item._id] || item.role,
          permissions: permissions[item._id] || []
        }))
      break
    }
    case 'listAdminCandidates': {
      const roles = getMemberRoles()
      result = allMembers()
        .filter(item => !permission.isAdministrativeRoleValue(roles[item._id] || item.role))
        .map(item => ({
          _id: item._id,
          name: item.name,
          team: item.team,
          initial: item.initial
        }))
      break
    }
    case 'setMemberRole': {
      const roles = getMemberRoles()
      const role = ['admin', 'editor', 'member'].includes(payload.role) ? payload.role : 'member'
      roles[payload.id] = role
      wx.setStorageSync('demoMemberRoles', roles)
      result = true
      break
    }
    case 'saveAdminPermissions': {
      const permissions = getAdminPermissions()
      permissions[payload.id] = payload.permissions || []
      wx.setStorageSync('demoAdminPermissions', permissions)
      result = true
      break
    }
    case 'listStructure':
      result = data.structureTerms
      break
    case 'listContent':
      result = payload.type === 'history' ? data.history : data.notices
      break
    case 'listKnowledge':
      result = {
        categories: knowledgeBase.categories,
        items: knowledgeBase.items
      }
      break
    case 'getKnowledge':
      result = findById(knowledgeBase.items, payload.id) || {}
      break
    case 'getAdminStats':
      result = { taskCount: 6, orgCount: 8, activityCount: 6, memberCount: 120, photoCount: 1248, hasSeedData: true }
      break
    case 'listAuditLogs':
      result = data.auditLogs
      break
    case 'listAppointments':
      result = data.appointments
      break
    case 'getTask':
      result = findById(allTasks(), payload.id) || {}
      break
    case 'getOrg':
      result = findById(data.members, payload.id) || {}
      break
    case 'getContent':
      result = findById(payload.type === 'history' ? data.history : data.notices, payload.id) || {}
      break
    default:
      result = { id: payload.id || `local-${Date.now()}`, local: true }
  }
  return new Promise(resolve => setTimeout(() => resolve(clone(result)), 60))
}

function canFallbackToLocal(action) {
  return [
    'getSession',
    'listOrganizations',
    'listPositions',
    'listRoleAssignments',
    'listPlatformUsers',
    'listUserRoles',
    'listArchives',
    'listTeams',
    'listOrg',
    'getOrg',
    'getMember',
    'listStructure',
    'listArchiveEntries',
    'listLedgerRecords',
    'getArchiveEntry'
  ].includes(action)
}

async function call(action, payload = {}) {
  const service = [organizationService, eventService, userService, honorService].find(item => item.handles(action))
  if (!service) return localCall(action, payload)
  try {
    return await service.execute(action, payload, localCall)
  } catch (error) {
    if (canFallbackToLocal(action)) {
      console.warn(`[cloud fallback] ${action}`, error)
      return localCall(action, payload)
    }
    console.error(`[cloud write failed] ${action}`, error)
    throw error
  }
}

function initialize(options = {}) {
  return platformService.initialize(options)
}

function showError(error) {
  wx.showToast({ title: error && error.message ? error.message : '数据加载失败', icon: 'none' })
}

module.exports = { initialize, call, showError }
