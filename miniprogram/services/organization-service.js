const cloudbase = require('./providers/cloudbase-adapter')

const LOCAL_IDS = {
  org_region_21_suihua: 'district',
  org_team_linghang: 'linghang',
  org_team_ailinghang: 'ailinghang',
  org_team_yuanhang: 'yuanhang',
  org_team_jingying: 'jingying'
}

const READ_ACTIONS = [
  'listOrganizations',
  'listPositions',
  'listArchives',
  'listTeams',
  'listOrg',
  'getOrg',
  'listStructure'
]

function handles(action) {
  return READ_ACTIONS.includes(action)
}

async function execute(action, payload, localFallback) {
  if (action === 'listOrganizations') return listCanonicalOrganizations(payload)
  if (action === 'listPositions') return cloudbase.invoke('listPositions', payload)
  if (action === 'listTeams') {
    const organizations = await listCanonicalOrganizations(payload)
    return organizations
      .filter(item => ['region', 'team'].includes(item.type))
      .map(item => ({
        id: LOCAL_IDS[item.id] || item.id,
        cloudId: item.id,
        name: item.name,
        shortName: item.shortName || item.name,
        color: item.type === 'region' ? '#b1843d' : '#346b8c',
        members: 0,
        type: item.type,
        parentId: item.parentId,
        ancestorIds: item.ancestorIds || []
      }))
  }
  if (action === 'listArchives') {
    const [localViews, organizations] = await Promise.all([
      localFallback(action, payload),
      listCanonicalOrganizations(payload)
    ])
    const views = {}
    localViews.forEach(item => { views[item.id] = item })
    organizations
      .filter(item => ['region', 'team'].includes(item.type))
      .forEach(item => {
        const id = LOCAL_IDS[item.id] || item.id
        if (views[id]) {
          views[id] = {
            ...views[id],
            cloudId: item.id,
            parentId: item.parentId,
            ancestorIds: item.ancestorIds || [],
            type: item.type
          }
        } else {
          views[id] = {
            id,
            cloudId: item.id,
            name: item.name,
            shortName: item.shortName || item.name,
            color: item.type === 'region' ? '#b1843d' : '#346b8c',
            seal: (item.shortName || item.name).slice(0, 1),
            description: '岗位资料尚待配置',
            photoCount: 0,
            parentId: item.parentId,
            ancestorIds: item.ancestorIds || [],
            type: item.type,
            categories: []
          }
        }
      })
    return Object.values(views)
  }
  return localFallback(action, payload)
}

function listCanonicalOrganizations(payload = {}) {
  return cloudbase.invoke('listOrganizations', payload)
}

module.exports = { handles, execute, listCanonicalOrganizations }
