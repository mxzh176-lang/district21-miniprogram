import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, DatePicker, Drawer, Form, Input, Layout, Modal, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { call, clearSession, hasSession, refreshSession, saveSession } from './api'

const { Header, Content, Sider } = Layout
const MODULES = [
  ['all', '全部模块'],
  ['home', '首页与轮播'], ['tasks', '待办事项'], ['archives', '档案目录'],
  ['history', '历史事件'], ['photos', '事件照片'], ['honors', '荣誉档案'],
  ['ledger', '司库账目'], ['contacts', '成员名册'], ['contact_private', '成员敏感资料'],
  ['positions', '岗位设置'], ['role_assignments', '岗位任期'], ['notices', '内部公告'],
  ['files', '文件上传'], ['permissions', '权限管理'], ['logs', '操作日志']
]
const ACTIONS = [
  { value: 'read', label: '查看' }, { value: 'create', label: '新增' },
  { value: 'update', label: '修改' }, { value: 'delete', label: '删除' },
  { value: 'upload', label: '上传' }, { value: 'approve', label: '审核' },
  { value: 'complete', label: '完成' }, { value: 'export', label: '导出' }
]
const MODULE_ACTIONS = {
  home: ['read', 'create', 'update', 'delete', 'upload'], tasks: ['read', 'create', 'update', 'delete', 'complete'], archives: ['read', 'create', 'update', 'delete', 'export'],
  history: ['read', 'create', 'update', 'delete', 'export'], photos: ['read', 'upload', 'delete'], honors: ['read', 'create', 'update', 'approve'],
  ledger: ['read'], contacts: ['read', 'create', 'update', 'delete', 'export'], contact_private: ['read', 'update'],
  positions: ['read', 'create', 'update', 'delete'], role_assignments: ['read', 'create', 'update', 'delete'], notices: ['read', 'create', 'update', 'delete'],
  files: ['read', 'upload', 'delete'], permissions: ['read', 'create', 'update', 'delete'], logs: ['read', 'export']
}
const ACTION_LABELS = Object.fromEntries(ACTIONS.map(item => [item.value, item.label]))
const ADMIN_ROLES = [{ value: 'super_admin', label: '超级管理员' }, { value: 'team_admin', label: '服务队管理员' }]
const ADMIN_CAPABILITIES = [
  { value: 'create', label: '创建' }, { value: 'delete', label: '删除' }, { value: 'update', label: '修改' },
  { value: 'search', label: '查找' }, { value: 'access', label: '访问' }
]
const TEAM_ADMIN_CAPABILITIES = ADMIN_CAPABILITIES.filter(item => item.value !== 'delete')
const PORT_MODULES = [
  ['home', '轮播图管理', [['read', '查找轮播图'], ['create', '新增轮播图'], ['update', '修改轮播图'], ['delete', '删除轮播图'], ['upload', '上传轮播图片']]],
  ['history', '历史事件', [['read', '查看历史事件'], ['create', '新增历史事件'], ['update', '修改历史事件'], ['delete', '删除历史事件'], ['upload', '上传事件图片']]],
  ['archive', '档案目录', [['read', '查看档案'], ['update', '修改档案'], ['upload', '上传档案图片'], ['delete', '删除档案内容']]],
  ['todo', '待办事项', [['read', '查看待办'], ['create', '新增待办'], ['update', '修改待办'], ['complete', '完成待办'], ['delete', '删除待办']]],
  ['finance', '司库账目', [['read', '查看账目']]],
  ['member', '成员管理', [['read', '查找成员'], ['create', '添加成员'], ['update', '修改成员'], ['delete', '删除成员']]],
  ['honor', '荣誉表彰', [['read', '查看荣誉'], ['create', '新增荣誉'], ['update', '修改荣誉'], ['delete', '删除荣誉']]],
  ['permission', '权限中心', [['read', '查看权限'], ['create', '授权用户'], ['update', '修改授权'], ['delete', '删除授权']]]
]
const PORT_ROLES = [
  { value: 'member', label: '普通成员' }, { value: 'team_admin', label: '服务队管理员' },
  { value: 'area_admin', label: '二十一协作区管理员' }, { value: 'super_admin', label: '超级管理员' }
]
const TEAM_ADMIN_ROLE_PRESETS = [
  { value: 'team_admin', label: '服务队管理员' },
  { value: 'first-vp', label: '第一副队长' }, { value: 'second-vp', label: '第二副队长' },
  { value: 'third-vp', label: '第三副队长' }, { value: 'secretary', label: '秘书' },
  { value: 'treasurer', label: '司库' }
]
const TEAM_ADMIN_ROLE_CODES = new Set(TEAM_ADMIN_ROLE_PRESETS.map(item => item.value))
function adminRoleLabel(roleCode, teamName = '') {
  if (roleCode === 'super_admin') return '超级管理员'
  if (roleCode === 'area_admin') return '二十一协作区管理员'
  const preset = TEAM_ADMIN_ROLE_PRESETS.find(item => item.value === roleCode)
  if (!preset) return roleCode
  return roleCode === 'team_admin' ? `${teamName || '服务队'}管理员` : `${teamName || '服务队'}${preset.label}`
}
const PORT_SCOPES = [
  { value: 'district', label: '协作区全部' }, { value: 'team', label: '本服务队全部' },
  { value: 'position', label: '本岗位/委员会' }, { value: 'self', label: '仅自己创建的内容' }
]
function portRoleDefaults(roleCode) {
  const permissions = Object.fromEntries(PORT_MODULES.map(([module]) => [module, []]))
  if (roleCode === 'member') PORT_MODULES.forEach(([module]) => { permissions[module] = ['read'] })
  if (roleCode === 'super_admin' || roleCode === 'area_admin' || TEAM_ADMIN_ROLE_CODES.has(roleCode)) {
    PORT_MODULES.forEach(([module, , actions]) => {
      permissions[module] = actions.map(([action]) => action).filter(action => !TEAM_ADMIN_ROLE_CODES.has(roleCode) || action !== 'delete')
    })
    permissions.finance = ['read']
    permissions.permission = ['super_admin', 'area_admin'].includes(roleCode) ? permissions.permission : ['read']
  }
  if (!PORT_ROLES.some(item => item.value === roleCode) && !TEAM_ADMIN_ROLE_CODES.has(roleCode)) {
    permissions.history = ['read', 'create', 'update', 'upload']
    permissions.archive = ['read', 'update', 'upload']
    permissions.todo = ['read', 'create', 'update']
    permissions.honor = ['read']
  }
  return permissions
}
function deduplicateUsers(users = []) {
  const normalizedName = name => String(name || '').trim().replace(/^[^—-]{1,20}[—-]/, '')
  const preferred = new Map()
  users
    .slice()
    .sort((a, b) => Number(!/^[^—-]{1,20}[—-]/.test(b.name || '')) - Number(!/^[^—-]{1,20}[—-]/.test(a.name || '')) || Number(String(a.id).startsWith('directory_')) - Number(String(b.id).startsWith('directory_')))
    .forEach(item => {
      const key = `${item.organizationId || item.defaultOrganizationId || ''}:${normalizedName(item.name)}`
      if (!preferred.has(key)) preferred.set(key, item)
    })
  return Array.from(preferred.values())
}
const SCOPE_OPTIONS = [
  { value: 'organization', label: '当前组织' }, { value: 'organization_tree', label: '当前组织及下级' },
  { value: 'position', label: '指定岗位' }, { value: 'position_tree', label: '指定岗位及下级' }
]

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [form] = Form.useForm()
  const submit = async values => {
    setLoading(true)
    setLoginError('')
    try {
      const session = await call('adminLogin', values, false)
      saveSession(session)
      onLogin()
    } catch (error) { setLoginError(error.message); message.error(error.message) } finally { setLoading(false) }
  }
  return <main className="login-shell">
    <section className="login-brand"><div className="brand-mark">21</div><h1>把复杂权限，变成一张清晰的图</h1><p>组织、岗位、人员、任期与操作范围统一审计。</p></section>
    <Card className="login-card" title="权限管理后台">
      <Alert type="info" showIcon message="仅限已绑定的内部管理员使用" />
      {loginError && <Alert className="login-error" type="error" showIcon message={loginError} />}
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="username" label="管理员账号" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Button block type="primary" htmlType="submit" loading={loading} onClick={() => form.submit()}>安全登录</Button>
      </Form>
    </Card>
  </main>
}

function Dashboard({ onLogout }) {
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState({})
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [impact, setImpact] = useState('')
  const [saving, setSaving] = useState(false)
  const [preflighting, setPreflighting] = useState(false)
  const [positionContext, setPositionContext] = useState(null)
  const [roleGrantMode, setRoleGrantMode] = useState(false)
  const [adminRoleOnly, setAdminRoleOnly] = useState(false)
  const [permissionTab, setPermissionTab] = useState('team')
  const [selectedRole, setSelectedRole] = useState('team_admin')
  const [teamLocked, setTeamLocked] = useState(false)
  const [selectedGrantTeam, setSelectedGrantTeam] = useState('')
  const [selectedGrantTeams, setSelectedGrantTeams] = useState([])
  const [permissionMatrix, setPermissionMatrix] = useState({})
  const [portPermissionMatrix, setPortPermissionMatrix] = useState(portRoleDefaults('team_admin'))
  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const load = useCallback(async () => {
    try { setData(await call('adminGraph', { organizationId: filters.organizationId })) }
    catch (error) {
      if (error.code === 'ADMIN_SESSION_EXPIRED' && await refreshSession()) return load()
      message.error(error.message)
    }
  }, [filters.organizationId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [load])
  const openPositionGrant = useCallback(position => {
    const initial = { userId: undefined, startDate: dayjs(), endDate: dayjs().add(1, 'year') }
    form.setFieldsValue(initial); setRoleGrantMode(false); setPositionContext(position); setPermissionMatrix({}); setDraft(initial); setImpact('')
  }, [form])
  const adminRows = useMemo(() => {
    if (!data) return []
    const keyword = String(filters.keyword || '').toLowerCase()
    const orgNames = new Map(data.organizations.map(item => [item.id, item.name]))
    return deduplicateUsers(data.users).filter(item => {
      const hasAdminRole = data.roles.some(role => role.userId === item.id && ['super_admin', 'area_admin', 'team_admin'].includes(role.role)) ||
        data.portPermissions.some(grant => grant.userId === item.id && (['super_admin', 'area_admin'].includes(grant.roleCode) || TEAM_ADMIN_ROLE_CODES.has(grant.roleCode)))
      return (item.profileCompleted || hasAdminRole) && (!keyword || item.name.toLowerCase().includes(keyword))
    }).map(user => {
      const roles = data.roles.filter(item => item.userId === user.id)
      const grants = data.grants.filter(item => item.userId === user.id)
      const portGrants = data.portPermissions.filter(item => item.userId === user.id)
      const effectiveRoleCodes = Array.from(new Set(roles.map(item => item.role).concat(portGrants.map(item => item.roleCode)).filter(Boolean)))
      const roleCode = ['super_admin', 'area_admin', 'team_admin'].find(code => effectiveRoleCodes.includes(code)) || effectiveRoleCodes[0] || ''
      const role = roles.find(item => item.role === roleCode) || roles[0]
      const roleGrant = grants.find(item => item.roleCode === role?.role)
      const portActions = portGrants.flatMap(item => Object.values(item.permissions || {}).flat())
      const syncedActions = portActions.length ? portActions : grants.flatMap(item => item.actions || [])
      const capabilities = portActions.length
        ? Array.from(new Set(portActions.map(action => action === 'read' ? 'access' : action))).filter(item => ADMIN_CAPABILITIES.some(option => option.value === item))
        : roleGrant?.capabilities || Array.from(new Set(syncedActions.map(action => action === 'read' ? 'access' : action))).filter(item => ADMIN_CAPABILITIES.some(option => option.value === item))
      const linkedGrantIds = new Set(portGrants.map(item => item.sourcePermissionId).filter(Boolean))
      const primaryPortGrant = portGrants.find(item => item.roleCode === roleCode) || portGrants[0]
      const scopeNames = Object.fromEntries(PORT_SCOPES.map(item => [item.value, item.label]))
      const roleLabels = effectiveRoleCodes.map(code => {
        const grant = portGrants.find(item => item.roleCode === code)
        return grant?.roleName || adminRoleLabel(code, orgNames.get(grant?.teamId) || '')
      })
      return {
        ...user, key: user.id, roleCode, roleCodes: effectiveRoleCodes, roleOrganizationId: primaryPortGrant?.teamId || role?.organizationId || '',
        roleLabel: roleLabels[0] || '普通成员', roleLabels: roleLabels.length ? roleLabels : ['普通成员'],
        scopeLabel: primaryPortGrant ? (scopeNames[primaryPortGrant.dataScope] || primaryPortGrant.dataScope) : role?.role === 'super_admin' ? '全体' : role?.role === 'team_admin' ? (orgNames.get(role.organizationId) || '本服务队') : '—',
        organizationName: orgNames.get(user.organizationId) || orgNames.get(user.defaultOrganizationId) || '未分组',
        capabilities, grantCount: portGrants.length + grants.filter(item => !linkedGrantIds.has(item.id)).length,
        portGrant: primaryPortGrant || null
      }
    })
  }, [data, filters.keyword])
  const fullActions = ACTIONS.map(item => item.value)
  const quickScopes = useMemo(() => {
    const options = [{ label: '整个小程序全部权限', value: 'global' }]
    const district = data?.organizations?.find(item => item.id === 'org_region_21_suihua')
    if (district) options.push({ label: '二十一协作区全部权限（包含服务队）', value: `tree:${district.id}` })
    ;(data?.organizations || []).filter(item => item.type === 'team').forEach(item => {
      options.push({ label: `${item.name}全部权限`, value: `team:${item.id}` })
    })
    return options
  }, [data])
  const openCheckedGrant = targetUser => {
    const existingPortGrant = targetUser?.portGrant
    const existingTeamId = existingPortGrant?.teamId || (TEAM_ADMIN_ROLE_CODES.has(targetUser?.roleCode) ? targetUser.roleOrganizationId : '')
    const roleCode = existingPortGrant?.roleCode || (targetUser?.roleCode === 'super_admin' ? 'super_admin' : 'team_admin')
    const existingEndDate = existingPortGrant?.endDate
    const initial = {
      userId: targetUser?.id,
      roleCode, organizationId: existingTeamId || data.organizations.find(item => item.type === 'team')?.id,
      organizationIds: [existingTeamId || data.organizations.find(item => item.type === 'team')?.id].filter(Boolean),
      dataScope: existingPortGrant?.dataScope || (roleCode === 'super_admin' || roleCode === 'area_admin' ? 'district' : 'team'),
      positionId: existingPortGrant?.positionId || '',
      startDate: dayjs(existingPortGrant?.startDate || undefined), endDate: existingEndDate && dayjs(existingEndDate).isValid() ? dayjs(existingEndDate) : dayjs().add(1, 'year')
    }
    const viewerIsSuperAdmin = data.viewer.roles.some(item => item.role === 'super_admin')
    setSelectedRole(roleCode); setTeamLocked(Boolean(existingTeamId)); setSelectedGrantTeam(initial.organizationId); setSelectedGrantTeams(initial.organizationIds); setPortPermissionMatrix(existingPortGrant?.permissions || portRoleDefaults(roleCode)); setAdminRoleOnly(false); setRoleGrantMode(true); setPositionContext(null); form.setFieldsValue(initial); setDraft(initial); setImpact('')
  }
  const openAdminRoleGrant = (preset = {}) => {
    const organizationId = preset.teamId || data.organizations.find(item => item.type === 'team')?.id
    const roleCode = preset.roleCode || 'team_admin'
    const initial = { userId: [], groupName: preset.groupName || '', roleCode, organizationId, organizationIds: [organizationId].filter(Boolean), dataScope: 'team', positionId: '', startDate: dayjs(), endDate: dayjs().add(1, 'year') }
    setSelectedRole(roleCode); setTeamLocked(Boolean(preset.teamId)); setSelectedGrantTeam(organizationId); setSelectedGrantTeams(initial.organizationIds); setPortPermissionMatrix(preset.permissions || portRoleDefaults(roleCode)); setAdminRoleOnly(true); setRoleGrantMode(true); setPositionContext(null); form.setFieldsValue(initial); setDraft(initial); setImpact('')
  }
  const runPreflight = async () => {
    const values = await form.validateFields()
    if (positionContext) {
      const selected = Object.entries(permissionMatrix).filter(([, actions]) => actions.length)
      if (!selected.length) return message.error('请至少勾选一项界面权限')
      const common = { userId: values.userId, organizationId: positionContext.organizationId, scopeType: 'position', scopeId: positionContext.id, startDate: values.startDate.format('YYYY-MM-DD'), endDate: values.endDate.format('YYYY-MM-DD') }
      const payloads = selected.map(([module, actions]) => ({ ...common, module, actions }))
      try { const results = await Promise.all(payloads.map(payload => call('adminGrantPreflight', { draft: payload }))); setDraft(payloads); setImpact(results.map(item => item.impact).join('；')) }
      catch (error) { message.error(error.message) }
      return
    }
    if (roleGrantMode) {
      const teamIds = Array.from(new Set((values.organizationIds || [values.organizationId]).filter(Boolean)))
      if (!teamIds.length) return message.error('请至少选择一个服务队')
      if (values.dataScope === 'position' && teamIds.length !== 1) return message.error('岗位范围一次只能选择一个服务队')
      if (values.dataScope === 'position' && !values.positionId) return message.error('岗位范围必须选择具体岗位')
      if (!Object.values(portPermissionMatrix).some(actions => actions.length)) return message.error('请至少勾选一项权限')
      const role = PORT_ROLES.find(item => item.value === selectedRole)
      const userIds = adminRoleOnly ? values.userId : [values.userId]
      const payloads = userIds.flatMap(userId => teamIds.map(teamId => {
        const target = adminRows.find(item => item.id === userId)
        const selectedTeamName = data.organizations.find(item => item.id === teamId)?.name || ''
        const fixedRoleName = adminRoleLabel(selectedRole, selectedTeamName)
        return { userPermissions: {
          id: adminRoleOnly ? undefined : target?.portGrant?.id, userId, userName: target?.name || '',
          teamId, roleCode: selectedRole, roleName: fixedRoleName || role?.label || selectedRole,
          groupName: values.groupName || fixedRoleName || role?.label || selectedRole,
          dataScope: values.dataScope, positionId: values.dataScope === 'position' ? values.positionId : '',
          permissions: portPermissionMatrix,
          startDate: values.startDate.format('YYYY-MM-DD'), endDate: values.endDate.format('YYYY-MM-DD')
        } }
      }))
      setDraft(payloads)
      setImpact(`将生成 ${payloads.length} 条授权，覆盖 ${userIds.length} 人、${teamIds.length} 个服务队：${PORT_SCOPES.find(item => item.value === values.dataScope)?.label}，有效期 ${payloads[0].userPermissions.startDate} 至 ${payloads[0].userPermissions.endDate}`)
      return
    }
    const base = { ...values, startDate: values.startDate.format('YYYY-MM-DD'), endDate: values.endDate.format('YYYY-MM-DD') }
    const selectedScopes = values.quickScopes || []
    const payloads = selectedScopes.length ? selectedScopes.map(value => {
      if (value === 'global') return { ...base, organizationId: 'org_federation_china', scopeType: 'global', scopeId: '', module: 'all', actions: fullActions }
      const [type, organizationId] = value.split(':')
      return { ...base, organizationId, scopeType: type === 'tree' ? 'organization_tree' : 'organization', scopeId: '', module: 'all', actions: fullActions }
    }) : [base]
    try {
      const results = await Promise.all(payloads.map(payload => call('adminGrantPreflight', { draft: payload })))
      setDraft(payloads); setImpact(results.map(item => item.impact).join('；'))
    }
    catch (error) { message.error(error.message) }
  }
  const preflight = async () => {
    setPreflighting(true)
    try { await runPreflight() } finally { setPreflighting(false) }
  }
  const commit = async () => {
    setSaving(true)
    try {
      const drafts = Array.isArray(draft) ? draft : [draft]
      await Promise.all(drafts.map(item => item.userPermissions
        ? call('adminSaveUserPermissions', item)
        : call('adminGrantCommit', { draft: item })))
      message.success(`${drafts.length} 项授权已生效`); setDraft(null); setRoleGrantMode(false); setAdminRoleOnly(false); setPositionContext(null); setImpact(''); await load()
    }
    catch (error) { message.error(error.message) } finally { setSaving(false) }
  }
  const revoke = async entity => {
    Modal.confirm({ title: '撤销这条授权？', content: '撤销后将立即影响对应成员的操作权限。', okText: '确认撤销', okButtonProps: { danger: true }, onOk: async () => {
      try { await call('adminGrantRevoke', { id: entity.id }); message.success('授权已撤销'); setSelected(null); await load() } catch (error) { message.error(error.message) }
    } })
  }
  const deleteUser = user => {
    Modal.confirm({
      title: `删除用户“${user.name}”？`,
      content: '删除后该用户将被停用，其角色和全部授权同时撤销。',
      okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => {
        try { await call('adminDeleteUser', { userId: user.id }); message.success('用户已删除'); await load() }
        catch (error) { message.error(error.message); throw error }
      }
    })
  }
  const revokePortGrant = row => {
    const grants = (row.memberRows || [row]).map(item => item.portGrant).filter(Boolean)
    if (!grants.length) return
    Modal.confirm({
      title: `撤销“${row.groupName || row.name}”的管理权限？`, content: `将同步撤销 ${grants.length} 名成员在小程序与 Web 后台的权限。`,
      okText: '确认撤销', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => {
        try { await Promise.all(grants.map(grant => call('adminRevokeUserPermissions', { id: grant.id }))); message.success('管理权限已撤销'); await load() }
        catch (error) { message.error(error.message); throw error }
      }
    })
  }
  const logout = async () => { try { await call('adminLogout') } catch {} clearSession(); onLogout() }
  const changePassword = async values => {
    setChangingPassword(true)
    try {
      await call('adminChangePassword', { currentPassword: values.currentPassword, newPassword: values.newPassword })
      message.success('密码修改成功，请重新登录')
      clearSession(); setPasswordOpen(false); passwordForm.resetFields(); onLogout()
    } catch (error) { message.error(error.message) } finally { setChangingPassword(false) }
  }
  if (!data) return <div className="loading"><Spin size="large" /></div>
  const viewerIsSuper = data.viewer.roles.some(item => item.role === 'super_admin' && item.status === 'active')
  const viewerIsAreaAdmin = data.viewer.roles.some(item => ['area_admin', 'region_admin'].includes(item.role) && item.status === 'active')
  const viewerCanDelete = viewerIsSuper || viewerIsAreaAdmin
  const terms = [...new Set((data.assignments || []).map(item => `${item.startDate}_${item.endDate}`))].filter(Boolean)
  const capabilityLabels = Object.fromEntries(ADMIN_CAPABILITIES.map(item => [item.value, item.label]))
  const columns = [
    { title: '用户', dataIndex: 'name', key: 'name', render: (name, row) => <div className="user-cell"><strong>{name}</strong><small>{row.memberCode || row.id}</small></div> },
    { title: '所属服务队', dataIndex: 'organizationName', key: 'organizationName' },
    { title: '角色', dataIndex: 'roleLabels', key: 'roleLabels', render: values => <Space size={[4, 4]} wrap>{values.map(value => <Tag key={value} color={value === '超级管理员' ? 'red' : value.includes('服务队') ? 'blue' : 'default'}>{value}</Tag>)}</Space> },
    { title: '范围', dataIndex: 'scopeLabel', key: 'scopeLabel' },
    { title: '权限', dataIndex: 'capabilities', key: 'capabilities', render: values => values.length ? <Space size={[4, 4]} wrap>{values.map(value => <Tag key={value}>{capabilityLabels[value]}</Tag>)}</Space> : <span className="muted">仅普通访问</span> },
    { title: '授权记录', dataIndex: 'grantCount', key: 'grantCount', width: 90 },
    { title: '操作', key: 'actions', width: 220, fixed: 'right', render: (_, row) => <Space>{(viewerIsSuper || !['super_admin', 'area_admin', 'team_admin'].includes(row.roleCode)) && <Button type="link" onClick={() => openCheckedGrant(row)}>授权</Button>}<Button type="link" onClick={() => setSelected({ kind: 'user', entity: row })}>查看</Button>{viewerCanDelete && row.id !== data.viewer.id && !row.roleCodes.includes('super_admin') && <Button type="link" danger onClick={() => deleteUser(row)}>删除</Button>}</Space> }
  ]
  const moduleNames = Object.fromEntries(PORT_MODULES.map(([module, label]) => [module, label]))
  const managementColumns = [
    { title: '管理组名称', key: 'groupName', width: 190, render: (_, row) => <strong>{row.roleCode === 'super_admin' ? '主管理员' : row.groupName || row.portGrant?.groupName || `${row.organizationName} · ${row.roleLabel}`}</strong> },
    { title: '管理员', dataIndex: 'name', key: 'name', width: 220, render: value => <span className="admin-members">{value}</span> },
    { title: '管理范围', dataIndex: 'scopeLabel', key: 'scopeLabel', width: 150 },
    { title: '拥有权限', key: 'modulePermissions', render: (_, row) => {
      const enabledModules = Object.entries(row.portGrant?.permissions || {}).filter(([, actions]) => actions?.length).map(([module]) => moduleNames[module] || module)
      return enabledModules.length ? <Space size={[4, 4]} wrap>{enabledModules.map(label => <Tag key={label}>{label}</Tag>)}</Space> : <Tag>{row.roleCode === 'super_admin' ? '全部' : '仅基础访问'}</Tag>
    } },
    { title: '数据来源', key: 'source', width: 130, render: (_, row) => <Tag color={row.portGrant ? 'blue' : 'default'}>{row.portGrant ? '小程序同步' : '系统角色'}</Tag> },
    { title: '操作', key: 'actions', width: 210, render: (_, row) => <Space>{viewerIsSuper && row.isPresetTeamRole && <Button type="link" onClick={() => openAdminRoleGrant({ teamId: row.teamId, roleCode: row.roleCode, groupName: row.groupName, permissions: row.portGrant?.permissions })}>添加人员</Button>}{row.portGrant && <Button type="link" onClick={() => openCheckedGrant(row)}>编辑</Button>}{viewerIsSuper && row.portGrant && row.roleCode !== 'super_admin' && <Button type="link" danger onClick={() => revokePortGrant(row)}>撤销</Button>}</Space> }
  ]
  const primaryAdminRows = adminRows.filter(row => row.roleCodes.includes('super_admin'))
  const areaAdminRows = adminRows
    .filter(row => row.roleCodes.includes('area_admin'))
    .map(row => {
      const portGrant = data.portPermissions.find(grant => grant.userId === row.id && grant.roleCode === 'area_admin')
      return { ...row, roleCode: 'area_admin', roleLabel: '二十一协作区管理员', roleLabels: ['二十一协作区管理员'], portGrant: portGrant || row.portGrant, scopeLabel: '协作区全部' }
    })
  const userById = new Map(data.users.map(user => [user.id, user]))
  const teamAdminRows = data.portPermissions
    .filter(grant => TEAM_ADMIN_ROLE_CODES.has(grant.roleCode))
    .map(grant => {
      const user = userById.get(grant.userId) || { id: grant.userId, name: grant.userName || '未知成员' }
      return {
        ...user,
        key: `${grant.id}:${grant.userId}`,
        roleCode: grant.roleCode,
        roleOrganizationId: grant.teamId,
        roleLabel: grant.roleName || adminRoleLabel(grant.roleCode),
        scopeLabel: PORT_SCOPES.find(item => item.value === grant.dataScope)?.label || grant.dataScope,
        portGrant: grant
      }
    })
  const groupAdminRows = rows => Array.from(rows.reduce((groups, row) => {
    const groupName = row.portGrant?.groupName || row.portGrant?.roleName || `${row.organizationName} · ${row.roleLabel}`
    const key = `${groupName}:${row.portGrant?.teamId || row.roleOrganizationId}:${row.portGrant?.dataScope || row.scopeLabel}`
    if (!groups.has(key)) groups.set(key, { ...row, key, groupName, memberRows: [], name: '' })
    const group = groups.get(key)
    group.memberRows.push(row)
    group.name = group.memberRows.map(item => item.name).join('、')
    return groups
  }, new Map()).values())
  const groupedAreaAdminRows = groupAdminRows(areaAdminRows)
  const groupedTeamAdminRows = data.organizations
    .filter(item => item.type === 'team')
    .flatMap(team => TEAM_ADMIN_ROLE_PRESETS.map(preset => {
      const memberRows = teamAdminRows.filter(row =>
        row.roleCode === preset.value &&
        (row.portGrant?.teamId || row.roleOrganizationId) === team.id)
      const representative = memberRows[0]
      const groupName = adminRoleLabel(preset.value, team.name)
      return {
        ...(representative || {}),
        key: `preset:${team.id}:${preset.value}`,
        id: representative?.id || `preset:${team.id}:${preset.value}`,
        teamId: team.id,
        roleCode: preset.value,
        roleLabel: groupName,
        groupName,
        organizationName: team.name,
        scopeLabel: '本服务队全部',
        name: memberRows.length ? memberRows.map(item => item.name).join('、') : '暂未添加人员',
        memberRows,
        portGrant: representative?.portGrant || null,
        isPresetTeamRole: true
      }
    }))
  const selectedGrantTeamName = data.organizations.find(item => item.id === selectedGrantTeam)?.name || '未选择服务队'
  return <Layout className="app-shell">
    <Header><div className="logo"><span>21</span><div><strong>权限管理</strong><small>主管理员 · 协作区管理员 · 服务队管理员 · 用户权限</small></div></div><Space>{viewerIsSuper && <Button onClick={openAdminRoleGrant}>新增管理组</Button>}<Button type="primary" onClick={() => openCheckedGrant()}>新增用户授权</Button><Tag color="geekblue">{data.viewer.name}</Tag><Button type="text" onClick={() => setPasswordOpen(true)}>修改密码</Button><Button type="text" onClick={logout}>退出</Button></Space></Header>
    <Layout>
      <Sider width={280} breakpoint="lg" collapsedWidth="0" className="filters">
        <Typography.Title level={5}>筛选视图</Typography.Title>
        <Select allowClear placeholder="全部组织" value={filters.organizationId} onChange={value => setFilters(v => ({ ...v, organizationId: value }))} options={data.organizations.map(item => ({ value: item.id, label: item.name }))} />
        <Select allowClear placeholder="全部任期" onChange={value => setFilters(v => ({ ...v, term: value }))} options={terms.map(value => ({ value, label: value.replace('_', ' → ') }))} />
        <Select allowClear placeholder="全部模块" onChange={value => setFilters(v => ({ ...v, module: value }))} options={MODULES.map(([value, label]) => ({ value, label }))} />
        <Input.Search allowClear placeholder="查找人员或岗位" onSearch={value => setFilters(v => ({ ...v, keyword: value }))} />
        <div className="stats"><Statistic title="成员" value={data.users.length} /><Statistic title="有效授权" value={data.grants.length + data.portPermissions.length} /></div>
        {viewerIsSuper && <Button block onClick={openAdminRoleGrant}>新增管理组</Button>}
        <Button block type="primary" onClick={() => openCheckedGrant()}>新增用户授权</Button>
        <Alert type="info" showIcon message="按用户逐行查看角色、范围和权限，点击“授权”进行修改。" />
      </Sider>
      <Content className="admin-table-wrap">
        <div className="table-heading"><div><Typography.Title level={4}>权限管理</Typography.Title><p>管理范围与小程序权限中心共用 user_permissions 数据</p></div><Space>{viewerIsSuper && <Button onClick={openAdminRoleGrant}>新增管理组</Button>}<Button type="primary" onClick={() => openCheckedGrant()}>新增用户授权</Button></Space></div>
        <Tabs activeKey={permissionTab} onChange={setPermissionTab} items={[
          { key: 'primary', label: `主管理员（${primaryAdminRows.length}）`, children: <><Alert type="info" showIcon message="主管理员拥有全组织权限，可创建管理组和配置子管理员。" /><Table columns={managementColumns} dataSource={primaryAdminRows} pagination={false} scroll={{ x: 1050 }} /></> },
          { key: 'area', label: `协作区管理员（${areaAdminRows.length}）`, children: <><Alert type="info" showIcon message="协作区管理员负责二十一协作区范围，权限由主管理员统一配置。" /><Table columns={managementColumns} dataSource={groupedAreaAdminRows} pagination={{ pageSize: 50, showSizeChanger: false }} scroll={{ x: 1150 }} /></> },
          { key: 'team', label: `服务队管理员（${teamAdminRows.length} 人）`, children: <><Alert type="info" showIcon message="固定展示四支服务队的管理员、副队长、秘书和司库；点击对应岗位的“添加人员”即可任命。" /><Table columns={managementColumns} dataSource={groupedTeamAdminRows} pagination={false} scroll={{ x: 1150 }} /></> },
          { key: 'users', label: `用户权限（${adminRows.length}）`, children: <Table columns={columns} dataSource={adminRows} pagination={{ pageSize: 50, showSizeChanger: false }} scroll={{ x: 1000 }} /> }
        ]} />
      </Content>
    </Layout>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="节点详情" width={420}>
      {selected && <><Tag>{selected.kind}</Tag><pre className="detail-json">{JSON.stringify(selected.entity, null, 2)}</pre>{selected.kind === 'grant' && <Button danger onClick={() => revoke(selected.entity)}>撤销授权</Button>}</>}
    </Drawer>
    <Modal width={positionContext || roleGrantMode ? 760 : 520} open={Boolean(draft)} onCancel={() => { setDraft(null); setRoleGrantMode(false); setAdminRoleOnly(false); setPositionContext(null); setImpact('') }} title={positionContext ? `为“${positionContext.name}”指定人员权限` : adminRoleOnly ? '新增管理员角色' : roleGrantMode ? '小程序用户授权' : '授权草案'} footer={impact ? [<Button key="back" onClick={() => setImpact('')}>返回修改</Button>, <Button key="save" type="primary" loading={saving} onClick={commit}>确认生效</Button>] : [<Button key="cancel" onClick={() => { setDraft(null); setRoleGrantMode(false); setAdminRoleOnly(false); setPositionContext(null) }}>取消</Button>, <Button key="next" type="primary" loading={preflighting} onClick={preflight}>查看影响</Button>] }>
      {impact ? <Alert type="warning" showIcon message="即将改变成员权限" description={impact} /> : <Form form={form} layout="vertical">
        <Form.Item name="userId" label={adminRoleOnly ? '子管理员' : '成员'} rules={[{ required: true }]}><Select mode={adminRoleOnly ? 'multiple' : undefined} maxTagCount="responsive" showSearch optionFilterProp="label" options={deduplicateUsers(data.users).filter(item => {
          return item.profileCompleted || data.roles.some(role => role.userId === item.id && ['super_admin', 'team_admin'].includes(role.role))
        }).map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
        {positionContext ? <><Alert type="info" showIcon message={`权限范围已锁定：${positionContext.name}`} description="每一行可独立勾选；未勾选的操作不会授予。" /><div className="permission-matrix">{MODULES.filter(([module]) => MODULE_ACTIONS[module]).map(([module, label]) => <div className="permission-row" key={module}><strong>{label}</strong><Checkbox.Group value={permissionMatrix[module] || []} options={MODULE_ACTIONS[module].map(action => ({ value: action, label: ACTION_LABELS[action] }))} onChange={actions => setPermissionMatrix(current => ({ ...current, [module]: actions }))} /></div>)}</div></> : roleGrantMode ? <>
        <Alert type="info" showIcon message={adminRoleOnly ? '先选择服务队，再配置管理员在该服务队内的权限范围' : '与小程序后台共用 user_permissions 权限结构'} />
        {adminRoleOnly && <Form.Item name="groupName" label="管理组名称" rules={[{ required: true, message: '请输入管理组名称' }]}><Input disabled={teamLocked} placeholder="例如：远航服务队内容管理组" /></Form.Item>}
        <Form.Item name="organizationIds" label="服务队（可多选）" rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个服务队' }]}><Select mode="multiple" maxTagCount="responsive" disabled={teamLocked} onChange={values => { setSelectedGrantTeams(values); setSelectedGrantTeam(values[0] || ''); form.setFieldsValue({ organizationId: values[0] || '', positionId: '' }) }} options={data.organizations.filter(item => item.type === 'team').map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
        <div className="team-permission-picker" aria-label="按服务队选择权限范围">
          {data.organizations.filter(item => item.type === 'team').map(item => {
            const active = selectedGrantTeams.includes(item.id)
            const disabled = teamLocked
            return <button key={item.id} type="button" className={active ? 'active' : ''} disabled={disabled && !active} onClick={() => {
              if (disabled) return
              const values = active ? selectedGrantTeams.filter(id => id !== item.id) : selectedGrantTeams.concat(item.id)
              setSelectedGrantTeams(values)
              setSelectedGrantTeam(values[0] || '')
              form.setFieldsValue({ organizationIds: values, organizationId: values[0] || '', positionId: '' })
            }}><span>{active ? '✓' : ''}</span><strong>{item.name}</strong><small>{active ? '已选择' : '选择此队'}</small></button>
          })}
        </div>
        {teamLocked && <Alert type="warning" showIcon message="所属服务队首次设置后不可变更" />}
        <Form.Item name="roleCode" label={adminRoleOnly ? '管理员角色' : '角色/岗位'} rules={[{ required: true }]}><Select disabled={adminRoleOnly && teamLocked} options={adminRoleOnly ? [
          { value: 'super_admin', label: '超级管理员' },
          { value: 'area_admin', label: '二十一协作区管理员' },
          ...TEAM_ADMIN_ROLE_PRESETS.map(item => ({ value: item.value, label: adminRoleLabel(item.value, data.organizations.find(org => org.id === selectedGrantTeam)?.name) }))
        ] : (data.viewer.roles.some(item => item.role === 'super_admin') ? PORT_ROLES : PORT_ROLES.filter(item => item.value === 'member')).concat(data.positions.filter(item => !selectedGrantTeam || item.organizationId === selectedGrantTeam).map(item => ({ value: item.code || item.id, label: item.name })))} onChange={value => {
          setSelectedRole(value)
          setPortPermissionMatrix(portRoleDefaults(value))
          form.setFieldsValue({ dataScope: value === 'super_admin' || value === 'area_admin' ? 'district' : TEAM_ADMIN_ROLE_CODES.has(value) || PORT_ROLES.some(item => item.value === value) ? 'team' : 'position', positionId: TEAM_ADMIN_ROLE_CODES.has(value) || PORT_ROLES.some(item => item.value === value) ? '' : data.positions.find(item => (item.code || item.id) === value && (!selectedGrantTeam || item.organizationId === selectedGrantTeam))?.id })
        }} /></Form.Item>
        <Form.Item name="dataScope" label="数据范围" rules={[{ required: true }]}><Select options={data.viewer.roles.some(item => item.role === 'super_admin') ? PORT_SCOPES : PORT_SCOPES.filter(item => item.value !== 'district')} /></Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.dataScope !== current.dataScope}>{({ getFieldValue }) => getFieldValue('dataScope') === 'position' && <Form.Item name="positionId" label="岗位/委员会范围" rules={[{ required: true }]}><Select options={data.positions.filter(item => !selectedGrantTeam || item.organizationId === selectedGrantTeam).map(item => ({ value: item.id, label: item.name }))} /></Form.Item>}</Form.Item>
        <div className="team-permission-heading"><div><strong>{selectedGrantTeams.length > 1 ? `已选 ${selectedGrantTeams.length} 个服务队` : selectedGrantTeamName} · 功能权限</strong><small>下方勾选会分别保存到每个已选服务队，数据仍按队隔离</small></div><Tag color="blue">逐队授权</Tag></div>
        <div className="permission-matrix team-scoped-matrix">{PORT_MODULES.map(([module, label, actions]) => {
          const viewerCanConfigureDelete = data.viewer.roles.some(item => ['super_admin', 'area_admin', 'region_admin'].includes(item.role))
          const availableActions = actions.filter(([action]) =>
            (!TEAM_ADMIN_ROLE_CODES.has(selectedRole) || action !== 'delete') &&
            (viewerCanConfigureDelete || action !== 'delete') &&
            (viewerCanConfigureDelete || module !== 'permission' || action === 'read'))
          return <div className="permission-row" key={module}><strong>{label}</strong><Checkbox.Group value={portPermissionMatrix[module] || []} options={availableActions.map(([value, actionLabel]) => ({ value, label: actionLabel }))} onChange={selectedActions => setPortPermissionMatrix(current => ({ ...current, [module]: selectedActions }))} /></div>
        })}</div>
        {TEAM_ADMIN_ROLE_CODES.has(selectedRole) && <Alert type="info" showIcon message="服务队管理员岗位不能删除；财务账目所有人只读" />}
        </> : <>
        <Form.Item name="quickScopes" label="快速勾选权限层级">
          <Checkbox.Group options={quickScopes} />
        </Form.Item>
        <Alert type="info" showIcon message="勾选上方层级后，会授予该范围内全部模块和全部操作权限；不勾选时可在下方做精细授权。" />
        <Form.Item name="organizationId" label="组织" rules={[{ required: true }]}><Select options={data.organizations.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="module" label="模块" rules={[{ required: true }]}><Select options={MODULES.map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="actions" label="允许操作" rules={[{ required: true }]}><Checkbox.Group options={ACTIONS} /></Form.Item>
        <Form.Item name="scopeType" label="数据范围" rules={[{ required: true }]}><Select options={SCOPE_OPTIONS} /></Form.Item>
        <Form.Item name="scopeId" label="岗位范围"><Select allowClear options={data.positions.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
        </>}
        <div className="date-row"><Form.Item name="startDate" label="开始日期" rules={[{ required: true }]}><DatePicker /></Form.Item><Form.Item name="endDate" label="结束日期" rules={[{ required: true }]}><DatePicker /></Form.Item></div>
      </Form>}
    </Modal>
    <Modal title="修改登录密码" open={passwordOpen} onCancel={() => { setPasswordOpen(false); passwordForm.resetFields() }} footer={null} destroyOnHidden>
      <Alert type="info" showIcon message="修改成功后，所有已登录设备都会退出。" />
      <Form form={passwordForm} layout="vertical" onFinish={changePassword}>
        <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 12, message: '新密码至少需要 12 位' }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirmPassword" label="再次输入新密码" dependencies={['newPassword']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('newPassword') === value ? Promise.resolve() : Promise.reject(new Error('两次输入的新密码不一致')) } })]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Button block type="primary" htmlType="submit" loading={changingPassword}>确认修改</Button>
      </Form>
    </Modal>
  </Layout>
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(hasSession())
  return loggedIn ? <Dashboard onLogout={() => setLoggedIn(false)} /> : <Login onLogin={() => setLoggedIn(true)} />
}
