const data = require('../data/mock-data')
const knowledgeBase = require('../data/knowledge-base')

let importedDataCache = null
function importedData() {
  if (!importedDataCache) importedDataCache = require('../data/imported-archives')
  return importedDataCache
}

const demoMember = {
  _id: 'demo-admin',
  nickname: '演示管理员',
  avatarUrl: '',
  status: 'approved',
  role: 'superadmin',
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

function allTasks() {
  const tasks = {}
  data.tasks.concat(getLocalTasks()).forEach(item => {
    tasks[item._id] = item
  })
  return Object.values(tasks)
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
  return imported.archiveEntries.concat(getLocalArchiveEntries())
    .filter(item => !hidden.includes(item._id))
    .map((item, index) => ({
      ...item,
      order: orders[item._id] === undefined ? index : orders[item._id]
    }))
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
    title: (owner, org, topic) => `${owner}狮兄狮姐开展${org}会员发展与对外交流`,
    summary: (org, topic) => `${org}围绕“${topic || '会员发展与对外交流'}”形成工作记录。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄狮姐开展“${topic || '会员发展与对外交流'}”，请补充参与人员、交流对象、达成共识、后续跟进和嘉许对象。`
  },
  'second-vp': {
    role: '第二副队长',
    tone: 'green',
    title: (owner, org, topic) => `${owner}狮兄狮姐带领${org}做了${topic || '一项公益服务'}`,
    summary: (org, topic) => `${org}完成“${topic || '公益服务'}”并形成服务档案。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄狮姐带领${org}做了“${topic || '一项公益服务'}”。请补充服务对象、服务地点、参与狮友、服务过程、服务成果和嘉许说明。`
  },
  'third-vp': {
    role: '第三副队长',
    tone: 'red',
    title: (owner, org, topic) => `${owner}狮兄狮姐组织${org}开展${topic || '关爱联谊活动'}`,
    summary: (org, topic) => `${org}围绕“${topic || '关爱联谊'}”开展成员关怀与团队凝聚。`,
    content: (date, org, category, owner, topic) => `事件日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄狮姐组织${org}开展“${topic || '关爱联谊活动'}”。请补充关爱对象、联谊主题、参与人员、现场成果和后续跟进。`
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
    summary: (org, topic) => `${org}完成“${topic || '司库账目'}”记录，敏感明细仅授权人员查看。`,
    content: (date, org, category, owner, topic) => `记录日期：${date}\n所属组织：${org}\n档案分类：${category}\n负责人：${owner}\n\n${owner}狮兄整理${org}“${topic || '司库账目记录'}”。请补充收支摘要、凭证情况、物资价值和审核说明，敏感明细请按权限维护。`
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
  return org && org.categories ? org.categories.find(item => item.id === categoryId) : null
}

function knowledgeScore(item, question) {
  const text = `${item.title}${item.summary}${item.content.join('')}${item.keywords.join('')}`.toLowerCase()
  const normalized = question.toLowerCase().replace(/[，。？！、\s]/g, '')
  let score = text.includes(normalized) ? 20 : 0
  item.keywords.forEach(keyword => {
    if (question.includes(keyword) || keyword.includes(question)) score += 8
  })
  for (let index = 0; index < normalized.length - 1; index += 1) {
    if (text.includes(normalized.slice(index, index + 2))) score += 1
  }
  return score
}

function cleanAssistantQuestion(value) {
  return String(value || '').trim().slice(0, 300)
}

function localAssistantAnswer(question) {
  if (!question) {
    return {
      answer: '请输入你想了解的问题，例如“中国狮子联会章程在哪里查看？”',
      sources: [],
      context: [],
      mode: 'knowledge'
    }
  }
  const sensitiveWords = ['电话', '手机号', '财务明细', '关爱详情', '家庭住址', '身份证']
  if (sensitiveWords.some(word => question.includes(word))) {
    return {
      answer: '这类内容可能涉及成员或服务对象隐私，我不能在 AI 对话中直接展示。请由有权限的管理员进入通讯录或档案页面查看，并遵守内部资料保护要求。',
      sources: [],
      context: [],
      mode: 'privacy'
    }
  }
  const ranked = knowledgeBase.items
    .map(item => ({ item, score: knowledgeScore(item, question) }))
    .sort((a, b) => b.score - a.score)
  const matched = ranked.filter(result => result.score > 0).slice(0, 3).map(result => result.item)
  const selected = matched.length ? matched : knowledgeBase.items.slice(0, 2)
  const answer = selected.length === 1
    ? `${selected[0].title}\n\n${selected[0].content.join('\n')}\n\n具体制度和最新表述请以所列官方来源为准。`
    : `我在知识库中找到以下相关内容：\n\n${selected.map((item, index) => `${index + 1}. ${item.title}：${item.summary}`).join('\n')}\n\n你可以继续追问其中一项，我会根据知识库进一步说明。`
  return {
    answer,
    sources: selected.map(item => ({
      title: item.title,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl
    })),
    context: selected.map(item => ({
      title: item.title,
      content: item.content,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl
    })),
    mode: 'knowledge'
  }
}

function call(action, payload = {}) {
  let result
  switch (action) {
    case 'getSession':
      result = demoMember
      break
    case 'getHome':
      const visibleHomeTasks = allTasks().filter(item => item.status !== 'deleted' && (item.status === 'pending' || item.month === '2026-06'))
      result = {
        summary: { pendingCount: visibleHomeTasks.filter(item => item.status !== 'done').length, doneCount: visibleHomeTasks.filter(item => item.status === 'done').length, memberCount: 120, photoCount: 3 },
        tasks: visibleHomeTasks.slice(0, 4),
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
      const tasks = allTasks().filter(item => {
        if (item.status === 'deleted') return false
        const monthMatch = !payload.month || payload.month === 'all' || item.month === payload.month
        const statusMatch = !payload.status || payload.status === 'all' || item.status === payload.status
        const categoryMatch = !payload.category || payload.category === 'all' || item.category === payload.category
        const dayMatch = !payload.day || payload.day === 'all' || item.day === payload.day
        const teamMatch = !payload.teamId || payload.teamId === 'all' || item.teamId === payload.teamId
        return monthMatch && statusMatch && categoryMatch && dayMatch && teamMatch
      })
      result = { tasks, months: [{ value: '2026-06', label: '2026年6月' }], categories: ['公益服务', '会议纪要', '对外交流', '狮友关爱', '聚会联谊', '会员发展', '新闻宣传', '司库账目', '总务后勤'] }
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
      result = data.archiveOrganizations.map(organization => ({
        ...organization,
        categories: organization.categories.map(category => ({
          ...category,
          count: entriesForCount.filter(item =>
            item.organizationId === organization.id &&
            item.categoryId === category.id &&
            item.status === 'published'
          ).length
        }))
      }))
      break
    case 'listArchiveEntries':
      result = allArchiveEntries()
        .filter(item => {
          const organizationMatch = !payload.organizationId || item.organizationId === payload.organizationId
          const categoryMatch = !payload.categoryId || item.categoryId === payload.categoryId
          return organizationMatch && categoryMatch
        })
        .map(archiveListItem)
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
        description: base.description || ''
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
      task = { ...task, status: 'done', completedAt: new Date().toISOString() }
      const index = localTasks.findIndex(item => item._id === id)
      if (index >= 0) localTasks[index] = task
      else localTasks.push(task)
      saveLocalTasks(localTasks)

      const entries = getLocalArchiveEntries()
      const entry = buildArchiveDraftFromTask(task, 'published')
      const entryIndex = entries.findIndex(item => item._id === entry._id)
      if (entryIndex >= 0) entries[entryIndex] = entry
      else entries.push(entry)
      saveLocalArchiveEntries(entries)
      result = { task, entry }
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
        canViewContact: ['superadmin', 'admin'].includes(demoMember.role),
        canManage: ['superadmin', 'admin'].includes(demoMember.role)
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
        .filter(item => ['admin', 'editor'].includes(roles[item._id] || item.role))
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
        .filter(item => !['admin', 'editor'].includes(roles[item._id] || item.role))
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
    case 'askAssistant':
      result = localAssistantAnswer(cleanAssistantQuestion(payload.question))
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
      result = { id: payload.id || `demo-${Date.now()}`, demo: true }
  }
  return new Promise(resolve => setTimeout(() => resolve(clone(result)), 60))
}

function showError(error) {
  wx.showToast({ title: error && error.message ? error.message : '演示数据加载失败', icon: 'none' })
}

module.exports = { call, showError }
