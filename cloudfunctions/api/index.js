const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const COLLECTIONS = {
  members: 'members',
  tasks: 'tasks',
  org: 'org_units',
  activities: 'activities',
  photos: 'photos',
  notices: 'notices',
  history: 'history',
  auditLogs: 'audit_logs'
}

const success = (data = null) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })
const cleanText = (value, maxLength = 200) => String(value || '').trim().slice(0, maxLength)
const activeItems = items => items.filter(item => !item.deletedAt)

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function monthLabel(month) {
  if (!month || !month.includes('-')) return month || ''
  const [year, value] = month.split('-')
  return `${year}年${Number(value)}月`
}

async function findMember(openid) {
  const result = await db.collection(COLLECTIONS.members).where({ _openid: openid }).limit(1).get()
  return result.data[0] || null
}

async function requireApproved(openid) {
  let member = await findMember(openid)
  if (!member) {
    const now = new Date()
    const data = {
      _openid: openid,
      nickname: '微信成员',
      avatarUrl: '',
      status: 'approved',
      role: 'member',
      createdAt: now,
      updatedAt: now
    }
    const result = await db.collection(COLLECTIONS.members).add({ data })
    member = { ...data, _id: result._id }
  } else if (member.status !== 'approved') {
    await db.collection(COLLECTIONS.members).doc(member._id).update({
      data: { status: 'approved', updatedAt: new Date() }
    })
    member.status = 'approved'
  }
  return member
}

async function requireEditor(openid) {
  const member = await requireApproved(openid)
  if (!['superadmin', 'editor', 'admin'].includes(member.role)) {
    throw Object.assign(new Error('仅内容管理员可执行此操作'), { code: 'EDITOR_REQUIRED' })
  }
  return member
}

async function requireAdmin(openid) {
  const member = await requireApproved(openid)
  if (!['superadmin', 'admin'].includes(member.role)) {
    throw Object.assign(new Error('仅超级管理员可执行此操作'), { code: 'ADMIN_REQUIRED' })
  }
  return member
}

async function requireSuperAdmin(openid) {
  const member = await requireApproved(openid)
  if (member.role !== 'superadmin') {
    throw Object.assign(new Error('仅超级管理员可调整管理员身份'), { code: 'SUPERADMIN_REQUIRED' })
  }
  return member
}

async function writeAudit(member, action, targetType, targetId, targetTitle = '') {
  await db.collection(COLLECTIONS.auditLogs).add({
    data: {
      action,
      targetType,
      targetId,
      targetTitle: cleanText(targetTitle, 100),
      operatorOpenid: member._openid,
      operatorName: member.nickname,
      createdAt: new Date()
    }
  })
}

function publicMember(member) {
  if (!member) return { status: 'new', role: 'member' }
  return {
    _id: member._id,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    status: member.status,
    role: member.role || 'member'
  }
}

async function getSession(openid) {
  return publicMember(await requireApproved(openid))
}

async function applyMembership(openid, event) {
  const existing = await findMember(openid)
  if (existing) return publicMember(existing)

  const now = new Date()
  const data = {
    _openid: openid,
    nickname: cleanText(event.nickname, 40) || '微信成员',
    avatarUrl: cleanText(event.avatarUrl, 500),
    status: 'pending',
    role: 'member',
    createdAt: now,
    updatedAt: now
  }
  const result = await db.collection(COLLECTIONS.members).add({ data })
  return publicMember({ ...data, _id: result._id })
}

async function getHome(openid) {
  await requireApproved(openid)
  const [tasksResult, memberCount, noticeResult, activityResult] = await Promise.all([
    db.collection(COLLECTIONS.tasks).limit(200).get(),
    db.collection(COLLECTIONS.members).where({ status: 'approved' }).count(),
    db.collection(COLLECTIONS.notices).limit(50).get(),
    db.collection(COLLECTIONS.activities).limit(50).get()
  ])
  const tasks = activeItems(tasksResult.data).sort((a, b) => {
    return String(a.month).localeCompare(String(b.month)) || (a.order || 0) - (b.order || 0)
  })
  const notices = activeItems(noticeResult.data)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3)
  const activities = activeItems(activityResult.data)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 3)

  return {
    summary: {
      pendingCount: tasks.filter(item => item.status !== 'done').length,
      doneCount: tasks.filter(item => item.status === 'done').length,
      memberCount: memberCount.total
    },
    tasks: tasks.filter(item => item.status !== 'done').slice(0, 4)
      .map(item => ({ ...item, monthLabel: monthLabel(item.month) })),
    notices,
    activities
  }
}

async function listTasks(openid, event) {
  await requireApproved(openid)
  const result = await db.collection(COLLECTIONS.tasks).limit(200).get()
  const allTasks = activeItems(result.data).sort((a, b) => {
    return String(a.month).localeCompare(String(b.month)) || (a.order || 0) - (b.order || 0)
  })
  const tasks = allTasks.filter(item => {
    const monthMatches = !event.month || event.month === 'all' || item.month === event.month
    const statusMatches = !event.status || event.status === 'all' || item.status === event.status
    return monthMatches && statusMatches
  })
  const months = [...new Set(allTasks.map(item => item.month).filter(Boolean))]
    .sort()
    .map(value => ({ value, label: monthLabel(value) }))
  return { tasks, months }
}

async function getTask(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(COLLECTIONS.tasks).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveTask(openid, event) {
  const member = await requireEditor(openid)
  const task = event.task || {}
  const data = {
    title: cleanText(task.title, 100),
    month: cleanText(task.month, 7),
    category: cleanText(task.category, 30) || '其他',
    owner: cleanText(task.owner, 40),
    status: task.status === 'done' ? 'done' : 'pending',
    description: cleanText(task.description, 1000),
    order: Number(task.order) || 100,
    updatedAt: new Date()
  }
  if (!data.title || !/^\d{4}-\d{2}$/.test(data.month)) {
    throw Object.assign(new Error('事项名称或月份格式不正确'), { code: 'INVALID_TASK' })
  }
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.tasks).doc(id).update({ data })
    await writeAudit(member, 'update', 'task', id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.tasks).add({ data })
  await writeAudit(member, 'create', 'task', result._id, data.title)
  return { id: result._id }
}

async function deleteTask(openid, event) {
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.tasks).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'task', id)
  return true
}

async function listOrg(openid) {
  await requireApproved(openid)
  const result = await db.collection(COLLECTIONS.org).orderBy('order', 'asc').limit(200).get()
  return activeItems(result.data)
}

async function getOrg(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(COLLECTIONS.org).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveOrg(openid, event) {
  const member = await requireEditor(openid)
  const unit = event.unit || {}
  const data = {
    position: cleanText(unit.position, 100),
    person: cleanText(unit.person, 40),
    committee: cleanText(unit.committee, 100),
    description: cleanText(unit.description, 1500),
    order: Number(unit.order) || 100,
    updatedAt: new Date()
  }
  if (!data.position) throw Object.assign(new Error('请填写岗位名称'), { code: 'INVALID_ORG' })
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.org).doc(id).update({ data })
    await writeAudit(member, 'update', 'org', id, data.position)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.org).add({ data })
  await writeAudit(member, 'create', 'org', result._id, data.position)
  return { id: result._id }
}

async function deleteOrg(openid, event) {
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.org).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'org', id)
  return true
}

async function listActivities(openid) {
  await requireApproved(openid)
  const [activityResult, photoResult] = await Promise.all([
    db.collection(COLLECTIONS.activities).limit(200).get(),
    db.collection(COLLECTIONS.photos).limit(1000).get()
  ])
  const photos = activeItems(photoResult.data)
  return activeItems(activityResult.data)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(item => {
      const related = photos.filter(photo => photo.activityId === item._id)
      const cover = related.find(photo => photo.isCover) || related[0]
      return {
        ...item,
        dateLabel: item.date || '',
        photoCount: related.length,
        coverUrl: cover ? cover.fileID : ''
      }
    })
}

async function getActivity(openid, event) {
  await requireApproved(openid)
  const id = cleanText(event.id, 80)
  const [activityResult, photoResult] = await Promise.all([
    db.collection(COLLECTIONS.activities).doc(id).get(),
    db.collection(COLLECTIONS.photos).where({ activityId: id }).limit(500).get()
  ])
  const activity = activityResult.data
  if (activity.deletedAt) throw Object.assign(new Error('活动不存在或已归档'), { code: 'NOT_FOUND' })
  const photos = activeItems(photoResult.data).sort((a, b) => (a.order || 0) - (b.order || 0))
  const cover = photos.find(item => item.isCover) || photos[0]
  return {
    activity: { ...activity, dateLabel: activity.date || '', coverUrl: cover ? cover.fileID : '' },
    photos
  }
}

async function saveActivity(openid, event) {
  const member = await requireEditor(openid)
  const activity = event.activity || {}
  const data = {
    title: cleanText(activity.title, 100),
    date: cleanText(activity.date, 10),
    location: cleanText(activity.location, 100),
    owner: cleanText(activity.owner, 40),
    participants: cleanText(activity.participants, 500),
    description: cleanText(activity.description, 2000),
    summary: cleanText(activity.summary, 3000),
    updatedAt: new Date()
  }
  if (!data.title) throw Object.assign(new Error('请填写活动名称'), { code: 'INVALID_ACTIVITY' })
  if (event.id) {
    const id = cleanText(event.id, 80)
    await db.collection(COLLECTIONS.activities).doc(id).update({ data })
    await writeAudit(member, 'update', 'activity', id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await db.collection(COLLECTIONS.activities).add({ data })
  await writeAudit(member, 'create', 'activity', result._id, data.title)
  return { id: result._id }
}

async function deleteActivity(openid, event) {
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.activities).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'activity', id)
  return true
}

async function addPhoto(openid, event) {
  const member = await requireEditor(openid)
  const activityId = cleanText(event.activityId, 80)
  const fileID = cleanText(event.fileID, 1000)
  if (!activityId || !fileID.startsWith('cloud://')) {
    throw Object.assign(new Error('照片信息不正确'), { code: 'INVALID_PHOTO' })
  }
  const count = await db.collection(COLLECTIONS.photos).where({ activityId }).count()
  const result = await db.collection(COLLECTIONS.photos).add({
    data: {
      activityId,
      fileID,
      caption: '',
      isCover: count.total === 0,
      order: count.total,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })
  await writeAudit(member, 'upload', 'photo', result._id, activityId)
  return { id: result._id }
}

async function deletePhoto(openid, event) {
  const member = await requireEditor(openid)
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.photos).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', 'photo', id)
  return true
}

function contentCollection(type) {
  return type === 'history' ? COLLECTIONS.history : COLLECTIONS.notices
}

async function listContent(openid, event) {
  await requireApproved(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const result = await db.collection(contentCollection(type)).limit(200).get()
  const items = activeItems(result.data)
  if (type === 'history') {
    return items.sort((a, b) => String(b.year || '').localeCompare(String(a.year || '')))
  }
  return items
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(item => ({ ...item, dateLabel: formatDate(item.updatedAt).slice(0, 10) }))
}

async function getContent(openid, event) {
  await requireEditor(openid)
  const result = await db.collection(contentCollection(event.type)).doc(cleanText(event.id, 80)).get()
  return result.data
}

async function saveContent(openid, event) {
  const member = await requireEditor(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const content = event.content || {}
  const data = {
    title: cleanText(content.title, 100),
    content: cleanText(content.content, 5000),
    updatedAt: new Date()
  }
  if (type === 'history') data.year = cleanText(content.year, 10)
  if (type === 'notice') data.pinned = Boolean(content.pinned)
  if (!data.title) throw Object.assign(new Error('请填写标题'), { code: 'INVALID_CONTENT' })
  const collection = db.collection(contentCollection(type))
  if (event.id) {
    const id = cleanText(event.id, 80)
    await collection.doc(id).update({ data })
    await writeAudit(member, 'update', type, id, data.title)
    return { id }
  }
  data.createdAt = new Date()
  const result = await collection.add({ data })
  await writeAudit(member, 'create', type, result._id, data.title)
  return { id: result._id }
}

async function deleteContent(openid, event) {
  const member = await requireEditor(openid)
  const type = event.type === 'history' ? 'history' : 'notice'
  const id = cleanText(event.id, 80)
  await db.collection(contentCollection(type)).doc(id).update({ data: { deletedAt: new Date(), deletedBy: openid } })
  await writeAudit(member, 'delete', type, id)
  return true
}

async function listMembers(openid, event) {
  await requireAdmin(openid)
  const allowed = ['pending', 'approved', 'rejected']
  const status = allowed.includes(event.status) ? event.status : 'pending'
  const result = await db.collection(COLLECTIONS.members).where({ status }).limit(200).get()
  return result.data
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(item => ({
      _id: item._id,
      nickname: item.nickname,
      initial: (item.nickname || '成').slice(0, 1),
      avatarUrl: item.avatarUrl,
      role: item.role,
      status: item.status,
      createdAtLabel: formatDate(item.createdAt)
    }))
}

async function reviewMember(openid, event) {
  const member = await requireAdmin(openid)
  const status = event.status === 'approved' ? 'approved' : 'rejected'
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({
    data: { status, reviewedBy: openid, reviewedAt: new Date(), updatedAt: new Date() }
  })
  await writeAudit(member, 'review', 'member', id, status)
  return true
}

async function setMemberRole(openid, event) {
  const member = await requireSuperAdmin(openid)
  const role = ['member', 'editor', 'admin'].includes(event.role) ? event.role : 'member'
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({ data: { role, updatedAt: new Date() } })
  await writeAudit(member, 'role', 'member', id, role)
  return true
}

async function listAdminMembers(openid) {
  await requireAdmin(openid)
  const result = await db.collection(COLLECTIONS.members)
    .where({ status: 'approved', role: db.command.in(['admin', 'editor']) })
    .limit(200)
    .get()
  return result.data.map(item => ({
    _id: item._id,
    name: item.nickname,
    nickname: item.nickname,
    initial: (item.nickname || '管').slice(0, 1),
    team: item.team || '',
    role: item.role,
    permissions: item.permissions || []
  }))
}

async function listAdminCandidates(openid) {
  await requireSuperAdmin(openid)
  const result = await db.collection(COLLECTIONS.members)
    .where({ status: 'approved' })
    .limit(200)
    .get()
  return result.data
    .filter(item => !['superadmin', 'admin', 'editor'].includes(item.role))
    .map(item => ({
      _id: item._id,
      name: item.nickname,
      nickname: item.nickname,
      initial: (item.nickname || '成').slice(0, 1),
      team: item.team || ''
    }))
}

async function saveAdminPermissions(openid, event) {
  const member = await requireSuperAdmin(openid)
  const allowed = ['tasks', 'archives', 'contacts', 'photos', 'notices']
  const permissions = Array.isArray(event.permissions)
    ? event.permissions.filter(value => allowed.includes(value))
    : []
  const id = cleanText(event.id, 80)
  await db.collection(COLLECTIONS.members).doc(id).update({
    data: { permissions, updatedAt: new Date() }
  })
  await writeAudit(member, 'role', 'member', id, `permissions:${permissions.join(',')}`)
  return true
}

async function getAdminStats(openid) {
  await requireEditor(openid)
  const [tasks, org, activities] = await Promise.all([
    db.collection(COLLECTIONS.tasks).count(),
    db.collection(COLLECTIONS.org).count(),
    db.collection(COLLECTIONS.activities).count()
  ])
  return {
    taskCount: tasks.total,
    orgCount: org.total,
    activityCount: activities.total,
    hasSeedData: tasks.total > 0 || org.total > 0
  }
}

async function listAuditLogs(openid) {
  await requireAdmin(openid)
  const result = await db.collection(COLLECTIONS.auditLogs).limit(300).get()
  const labels = {
    create: '新增',
    update: '修改',
    delete: '移入回收站',
    upload: '上传',
    review: '成员审核',
    role: '权限变更'
  }
  return result.data
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(item => ({ ...item, actionLabel: labels[item.action] || item.action, createdAtLabel: formatDate(item.createdAt) }))
}

const seedTasks = [
  ['2025-06', '服务', '孩子走访', '双龙', 'done'],
  ['2025-06', '外交', '哈尔滨八协联合换届', '款姐', 'done'],
  ['2025-06', '资产', '名牌、马甲和短袖订制', '泉宏', 'done'],
  ['2025-06', '关爱', '芳姐孩子高考关爱', '建鑫', 'done'],
  ['2025-06', '服务', '垃圾桶到货', '芳姐', 'done'],
  ['2025-06', '外交', '爱领航换届', '款姐', 'done'],
  ['2025-06', '服务', '红色行动', '芳姐', 'done'],
  ['2025-06', '协作区', '投票', '明星', 'done'],
  ['2025-06', '培训', '大庆13-15候任干部培训', '丙刚', 'done'],
  ['2025-06', '联谊', '户外烤肉团建', '砖哥', 'pending'],
  ['2025-06', '外交', '哈尔滨27主任', '款姐', 'pending'],
  ['2025-06', '服务队', '签约社区', '丙刚', 'pending'],
  ['2025-07', '会议', '4日开会', '', 'pending'],
  ['2025-07', '服务', '8日捐赠垃圾桶', '', 'pending'],
  ['2025-07', '助学', '22日圆梦助学', '', 'pending'],
  ['2025-07', '关爱', '31日慰问老兵', '', 'pending'],
  ['2025-08', '服务', '战立行动', '', 'pending'],
  ['2025-08', '活动', '28日慕思音乐会', '', 'pending']
]

const seedOrg = [
  ['第一副队长', '李晶', '', 10],
  ['会员发展与保留委员会主席', '徐雪峰', '会员发展与保留委员会', 11],
  ['领导力发展培训委员会主席', '李明浩', '领导力发展培训委员会', 12],
  ['对外交流委员会主席', '吕媛媛', '对外交流委员会', 13],
  ['第二副队长', '张芳', '', 20],
  ['服务与计划委员会主席', '李珊珊', '服务与计划委员会', 21],
  ['筹款委员会主席', '荆立月', '筹款委员会', 22],
  ['新闻与宣传委员会主席', '杨景辉', '新闻与宣传委员会', 23],
  ['第三副队长', '徐双龙', '', 30],
  ['狮友关爱委员会主席', '刘建鑫', '狮友关爱委员会', 31],
  ['狮友联谊委员会主席', '景雅东', '狮友联谊委员会', 32],
  ['年会委员会主席', '李文强', '年会委员会', 33],
  ['司库', '王奇', '', 40],
  ['总务', '刘泉宏', '', 50],
  ['纠察', '潘洋洋', '', 60],
  ['秘书', '张明星', '', 70]
]

async function seedData(openid) {
  const member = await requireEditor(openid)
  const [taskCount, orgCount] = await Promise.all([
    db.collection(COLLECTIONS.tasks).count(),
    db.collection(COLLECTIONS.org).count()
  ])
  const now = new Date()
  if (taskCount.total === 0) {
    await Promise.all(seedTasks.map((item, index) => db.collection(COLLECTIONS.tasks).add({
      data: {
        month: item[0],
        category: item[1],
        title: item[2],
        owner: item[3],
        status: item[4],
        description: '',
        order: index,
        createdAt: now,
        updatedAt: now
      }
    })))
  }
  if (orgCount.total === 0) {
    await Promise.all(seedOrg.map(item => db.collection(COLLECTIONS.org).add({
      data: {
        position: item[0],
        person: item[1],
        committee: item[2],
        order: item[3],
        description: item[2] === '新闻与宣传委员会'
          ? '每次活动结束后，主席需要收集所有照片和信息并存储至网盘。'
          : '',
        createdAt: now,
        updatedAt: now
      }
    })))
  }
  await writeAudit(member, 'create', 'seed', 'initial-data', '导入文档初始数据')
  return true
}

function requestJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, response => {
      let raw = ''
      response.on('data', chunk => { raw += chunk })
      response.on('end', () => {
        try {
          const parsed = JSON.parse(raw || '{}')
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.error && parsed.error.message
              ? parsed.error.message
              : `AI service returned ${response.statusCode}`))
            return
          }
          resolve(parsed)
        } catch (error) {
          reject(new Error('AI service returned invalid JSON'))
        }
      })
    })
    request.on('error', reject)
    request.setTimeout(20000, () => request.destroy(new Error('AI request timed out')))
    request.write(JSON.stringify(body))
    request.end()
  })
}

async function askAssistant(openid, event) {
  await requireApproved(openid)
  const question = cleanText(event.question, 300)
  if (!question) throw Object.assign(new Error('请输入问题'), { code: 'QUESTION_REQUIRED' })

  const apiKey = process.env.AI_API_KEY
  const apiUrl = process.env.AI_API_URL
  const model = process.env.AI_MODEL
  if (!apiKey || !apiUrl || !model) {
    throw Object.assign(new Error('AI 云函数尚未配置'), { code: 'AI_NOT_CONFIGURED' })
  }

  const context = Array.isArray(event.context)
    ? event.context.slice(0, 4).map(item => ({
      title: cleanText(item.title, 100),
      content: Array.isArray(item.content)
        ? item.content.slice(0, 8).map(value => cleanText(value, 500))
        : [],
      sourceName: cleanText(item.sourceName, 100),
      sourceUrl: cleanText(item.sourceUrl, 300)
    }))
    : []
  const knowledgeText = context.map((item, index) =>
    `[资料${index + 1}] ${item.title}\n${item.content.join('\n')}\n来源：${item.sourceName} ${item.sourceUrl}`
  ).join('\n\n')
  const systemPrompt = [
    '你是二十一协作区微信小程序内的公益知识助手。',
    '只依据提供的知识库资料回答，不编造制度、人员、财务或组织事实。',
    '涉及手机号、家庭住址、关爱详情、身份证、财务明细等敏感信息时拒绝展示，并提示去权限页面查看。',
    '回答使用简洁中文，区分官方资料和协作区内部整理；制度问题提醒以官方现行文件为准。',
    knowledgeText ? `可用知识库：\n${knowledgeText}` : '当前没有可用知识库资料。'
  ].join('\n')
  const response = await requestJson(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  }, {
    model,
    temperature: 0.2,
    max_tokens: 800,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ]
  })
  const answer = response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content
  if (!answer) throw new Error('AI service returned an empty answer')
  return {
    answer: cleanText(answer, 4000),
    sources: context.map(item => ({
      title: item.title,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl
    })),
    mode: 'cloud'
  }
}

const handlers = {
  getSession,
  getHome,
  listTasks,
  getTask,
  saveTask,
  deleteTask,
  listOrg,
  getOrg,
  saveOrg,
  deleteOrg,
  listActivities,
  getActivity,
  saveActivity,
  deleteActivity,
  addPhoto,
  deletePhoto,
  listContent,
  getContent,
  saveContent,
  deleteContent,
  listAdminMembers,
  listAdminCandidates,
  saveAdminPermissions,
  setMemberRole,
  getAdminStats,
  listAuditLogs,
  seedData,
  askAssistant
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()
  const handler = handlers[event.action]
  if (!handler) return fail('UNKNOWN_ACTION', '不支持的操作')
  try {
    return success(await handler(OPENID, event))
  } catch (error) {
    console.error(event.action, error)
    return fail(error.code || 'SERVER_ERROR', error.message || '服务暂不可用')
  }
}
