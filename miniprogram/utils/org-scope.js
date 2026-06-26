const STORAGE_KEY = 'CURRENT_ORG_SCOPE'

const ORG_OPTIONS = [
  { orgType: 'district', orgId: 'district21', orgName: '二十一协作区', teamId: 'all', dataId: 'district', shortName: '协作区', members: 120 },
  { orgType: 'team', orgId: 'linghang', orgName: '领航服务队', teamId: 'linghang', dataId: 'linghang', shortName: '领航', members: 31 },
  { orgType: 'team', orgId: 'ailinghang', orgName: '爱领航服务队', teamId: 'ailinghang', dataId: 'ailinghang', shortName: '爱领航', members: 29 },
  { orgType: 'team', orgId: 'yuanhang', orgName: '远航服务队', teamId: 'yuanhang', dataId: 'yuanhang', shortName: '远航', members: 32 },
  { orgType: 'team', orgId: 'jingying', orgName: '精英服务队', teamId: 'jingying', dataId: 'jingying', shortName: '精英', members: 28 }
]

function normalizeTeamId(value) {
  return String(value || '').replace(/^org_team_/, '')
}

function fromCache(value) {
  const orgId = value && value.orgId
  const teamId = value && value.teamId
  return ORG_OPTIONS.find(item => item.orgId === orgId || item.teamId === teamId) || ORG_OPTIONS[0]
}

function getCurrentScope() {
  try {
    return fromCache(wx.getStorageSync(STORAGE_KEY))
  } catch (error) {
    return ORG_OPTIONS[0]
  }
}

function setCurrentScope(scope) {
  const current = fromCache(scope)
  try {
    wx.setStorageSync(STORAGE_KEY, {
      orgType: current.orgType,
      orgId: current.orgId,
      orgName: current.orgName,
      teamId: current.teamId
    })
  } catch (error) {}
  return current
}

function setCurrentScopeByTeamId(teamId) {
  const normalized = normalizeTeamId(teamId)
  const current = ORG_OPTIONS.find(item => item.teamId === normalized || item.orgId === normalized) || ORG_OPTIONS[0]
  return setCurrentScope(current)
}

function teamIdsForScope(scope) {
  const current = fromCache(scope)
  if (current.orgType === 'district') return []
  return [current.orgId, current.teamId, current.dataId, `org_team_${current.orgId}`].filter(Boolean)
}

function matchesScope(item, scope) {
  const current = fromCache(scope)
  if (current.orgType === 'district') return true
  const ids = teamIdsForScope(current).map(normalizeTeamId)
  return ids.includes(normalizeTeamId(item.teamId)) ||
    ids.includes(normalizeTeamId(item.organizationId)) ||
    ids.includes(normalizeTeamId(item.team)) ||
    String(item.team || '').includes(current.shortName) ||
    String(item.team || '').includes(current.orgName)
}

module.exports = {
  STORAGE_KEY,
  ORG_OPTIONS,
  normalizeTeamId,
  fromCache,
  getCurrentScope,
  setCurrentScope,
  setCurrentScopeByTeamId,
  teamIdsForScope,
  matchesScope
}
