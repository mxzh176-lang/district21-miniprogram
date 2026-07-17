const expiryState = value => {
  if (!value) return '异常：缺少任期'
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
  if (days < 0) return '已到期'
  if (days <= 30) return `${days} 天后到期`
  return ''
}

const MODULE_LABELS = {
  all: '全部模块', home: '首页与轮播', tasks: '待办事项', archives: '档案目录',
  history: '历史事件', photos: '事件照片', honors: '荣誉档案', ledger: '司库账目',
  contacts: '成员名册', contact_private: '成员敏感资料', positions: '岗位设置',
  role_assignments: '岗位任期', notices: '内部公告', files: '文件上传',
  permissions: '权限管理', logs: '操作日志'
}
const ACTION_LABELS = { read: '查看', create: '新增', update: '修改', delete: '删除', upload: '上传', approve: '审核', complete: '完成', export: '导出' }
const SCOPE_LABELS = { global: '全局', organization: '当前组织', organization_tree: '组织及下级', position: '指定岗位', position_tree: '岗位及下级' }
const PORT_MODULE_LABELS = { history: '历史事件', archive: '档案目录', contacts: '成员名册', todo: '待办事项', finance: '司库账目', member: '成员管理', honor: '荣誉档案', permission: '权限管理' }
const PORT_SCOPE_LABELS = { district: '协作区', team: '当前服务队', position: '指定岗位', self: '本人创建' }
const DETAIL_MODULES = Object.keys(MODULE_LABELS).filter(key => key !== 'all')

const grantLabel = item => {
  const moduleLabel = MODULE_LABELS[item.module] || item.module || '权限'
  const actions = (item.actions || []).map(action => ACTION_LABELS[action] || action).join(' / ')
  return `${moduleLabel}\n允许：${actions}\n范围：${SCOPE_LABELS[item.scopeType] || item.scopeType || ''} ${expiryState(item.endDate)}`
}

const portPermissionLabel = item => {
  const details = Object.entries(item.permissions || {}).filter(([, actions]) => actions?.length).map(([module, actions]) =>
    `${PORT_MODULE_LABELS[module] || module}：${actions.map(action => ACTION_LABELS[action] || action).join('/')}`
  )
  return `${item.roleName || '其他权限'}\n${details.join('\n') || '未配置具体操作'}\n范围：${PORT_SCOPE_LABELS[item.dataScope] || item.dataScope || ''}${item.positionId ? ` · ${item.positionId}` : ''}`
}

export function buildGraph(data, filters = {}, callbacks = {}) {
  const matchText = value => !filters.keyword || String(value || '').toLowerCase().includes(filters.keyword.toLowerCase())
  const organizations = (data.organizations || []).filter(item => !filters.organizationId || item.id === filters.organizationId)
  const orgIds = new Set(organizations.map(item => item.id))
  const positions = (data.positions || []).filter(item => orgIds.has(item.organizationId) && matchText(item.name))
  const positionIds = new Set(positions.map(item => item.id))
  const assignments = (data.assignments || []).filter(item => orgIds.has(item.organizationId) && (!filters.term || `${item.startDate}_${item.endDate}` === filters.term))
  const grants = (data.grants || []).filter(item => orgIds.has(item.organizationId) && (!filters.module || item.module === filters.module))
  const users = (data.users || []).filter(item =>
    (!filters.organizationId || item.organizationId === filters.organizationId) && matchText(item.name)
  )
  const userIds = new Set(users.map(item => item.id))
  const nodes = []
  const edges = []

  organizations.forEach((item, index) => nodes.push({
    id: `org:${item.id}`, type: 'default', position: { x: 20, y: index * 150 },
    data: { label: `${item.name}\n${item.type === 'team' ? '服务队' : '协作区'}`, entity: item, kind: 'organization' }, className: 'node organization'
  }))
  positions.forEach((item, index) => {
    const grantCount = grants.filter(grant => grant.scopeId === item.id).length
    nodes.push({ id: `position:${item.id}`, type: 'positionGrant', position: { x: 310, y: index * 112 }, data: { label: item.name, entity: item, kind: 'position', grantCount, onGrant: callbacks.onPositionGrant }, className: 'node position' })
    edges.push({ id: `org-position:${item.id}`, source: `org:${item.organizationId}`, target: `position:${item.id}`, animated: false })
  })
  users.forEach((item, index) => {
    const statusLabel = item.status === 'active' ? '已启用' : item.status === 'disabled' ? '已停用' : '待完善'
    nodes.push({ id: `user:${item.id}`, position: { x: 610, y: index * 112 }, data: { label: `${item.name}\n${item.memberCode || statusLabel}`, entity: item, kind: 'user' }, className: `node user ${item.status !== 'active' ? 'warning' : ''}` })
  })
  assignments.filter(item => userIds.has(item.userId) && positionIds.has(item.positionId)).forEach(item => edges.push({
    id: `assignment:${item.id}`, source: `position:${item.positionId}`, target: `user:${item.userId}`,
    label: expiryState(item.endDate) || '岗位任期', className: expiryState(item.endDate) ? 'edge-warning' : ''
  }))
  let grantNodeIndex = 0
  grants.filter(item => userIds.has(item.userId)).forEach(item => {
    const modules = item.module === 'all' ? DETAIL_MODULES : [item.module]
    modules.forEach(module => {
      const expanded = { ...item, module, sourceModule: item.module }
      const permissionId = item.module === 'all' ? `grant:${item.id}:${module}` : `grant:${item.id}`
      nodes.push({ id: permissionId, position: { x: 930, y: grantNodeIndex * 124 }, data: {
        label: grantLabel(expanded),
        entity: expanded, kind: item.module === 'all' ? 'grant-module' : 'grant'
      }, className: `node grant ${expiryState(item.endDate) ? 'warning' : ''}` })
      edges.push({ id: `user-grant:${item.id}:${module}`, source: `user:${item.userId}`, target: permissionId, label: MODULE_LABELS[module] || module })
      grantNodeIndex += 1
    })
  })
  const portPermissions = (data.portPermissions || []).filter(item => orgIds.has(item.teamId) && userIds.has(item.userId))
  organizations.filter(org => portPermissions.some(item => item.teamId === org.id)).forEach((org, orgIndex) => {
    const groupItems = portPermissions.filter(item => item.teamId === org.id)
    const groupY = orgIndex * Math.max(260, groupItems.length * 145)
    nodes.push({ id: `port-group:${org.id}`, position: { x: 1260, y: groupY }, data: { label: `${org.name}\n其他权限（${groupItems.length}）`, entity: org, kind: 'permission-group' }, className: 'node permission-group' })
    groupItems.forEach((item, itemIndex) => {
      const id = `port-permission:${item.id}`
      nodes.push({ id, position: { x: 1530, y: groupY + itemIndex * 145 }, data: { label: portPermissionLabel(item), entity: item, kind: 'port-permission' }, className: `node port-permission ${expiryState(item.endDate) ? 'warning' : ''}` })
      edges.push({ id: `user-port:${item.id}`, source: `user:${item.userId}`, target: id, label: org.name })
    })
  })
  return { nodes, edges }
}
