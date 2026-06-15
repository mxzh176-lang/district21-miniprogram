const data = require('../data/mock-data')
const importedData = require('../data/imported-archives')
const knowledgeBase = require('../data/knowledge-base')

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

function allArchiveEntries() {
  const orders = getArchiveOrders()
  const hidden = wx.getStorageSync('hiddenArchiveEntries') || []
  return importedData.archiveEntries.concat(getLocalArchiveEntries())
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
  const members = {}
  data.members.concat(importedData.members, getLocalMembers()).forEach(item => {
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
      result = {
        summary: { pendingCount: 5, doneCount: 1, memberCount: 120, photoCount: 1248 },
        tasks: data.tasks.filter(item => item.status === 'pending').slice(0, 4),
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
      const tasks = data.tasks.filter(item => {
        const monthMatch = !payload.month || payload.month === 'all' || item.month === payload.month
        const statusMatch = !payload.status || payload.status === 'all' || item.status === payload.status
        const categoryMatch = !payload.category || payload.category === 'all' || item.category === payload.category
        const dayMatch = !payload.day || payload.day === 'all' || item.day === payload.day
        const teamMatch = !payload.teamId || payload.teamId === 'all' || item.teamId === payload.teamId
        return monthMatch && statusMatch && categoryMatch && dayMatch && teamMatch
      })
      result = { tasks, months: [{ value: '2026-06', label: '2026年6月' }], categories: ['公益服务', '狮友关爱', '狮友生日', '聚会联谊', '会议培训'] }
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
      result = data.archiveOrganizations.map(organization => {
        if (organization.id !== 'yuanhang') return organization
        return {
          ...organization,
          categories: organization.categories.map(category => ({
            ...category,
            count: importedData.archiveEntries.filter(
              item => item.organizationId === organization.id &&
                item.categoryId === category.id
            ).length
          }))
        }
      })
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
      result = findById(data.tasks, payload.id) || {}
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
