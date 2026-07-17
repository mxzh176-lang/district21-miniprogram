const cloudbase = require('./providers/cloudbase-adapter')

const FIXED_ORGANIZATION_PATH = ['中国狮子联会', '哈尔滨代表处', '二十一协作区']

const SERVICE_TEAMS = {
  district: '协作区公共档案',
  org_region_21_suihua: '协作区公共档案',
  yuanhang: '远航服务队',
  org_team_yuanhang: '远航服务队',
  linghang: '领航服务队',
  org_team_linghang: '领航服务队',
  ailinghang: '爱领航服务队',
  org_team_ailinghang: '爱领航服务队',
  jingying: '精英服务队',
  org_team_jingying: '精英服务队'
}

const ARCHIVE_PORTS = {
  captain: ['队长', ''],
  secretary: ['队长', '秘书'],
  treasurer: ['队长', '司库'],
  admin: ['队长', '总务'],
  tamer: ['队长', '纠察'],
  'first-vp': ['第一副队长', ''],
  'member-retention': ['第一副队长', '会员与保留委员会'],
  'leadership-training': ['第一副队长', '领导力培训委员会'],
  'external-exchange': ['第一副队长', '对外交流委员会'],
  'second-vp': ['第二副队长', ''],
  'service-plan': ['第二副队长', '服务与计划委员会'],
  'news-publicity': ['第二副队长', '新闻宣传委员会'],
  'fundraising-plan': ['第二副队长', '筹款与计划委员会'],
  'third-vp': ['第三副队长', ''],
  'care-committee': ['第三副队长', '关爱委员会'],
  'fellowship-committee': ['第三副队长', '联谊委员会'],
  'annual-meeting': ['第三副队长', '年会委员会']
}

function safePathSegment(value, fallback = '未分类', maxLength = 60) {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|#%&+\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, maxLength)
  return normalized || fallback
}

function serviceTeamName(organizationId, explicitName) {
  const name = explicitName || SERVICE_TEAMS[organizationId]
  if (!name) throw new Error('请选择文件所属服务队')
  return safePathSegment(name, '未分类服务队', 30)
}

function archivePort(categoryId, categoryName) {
  const values = ARCHIVE_PORTS[categoryId]
  if (values) return { leaderRole: values[0], departmentName: values[1] }
  return { leaderRole: '服务队公共活动', departmentName: safePathSegment(categoryName, '', 40) }
}

function fileExtension(filePath, originalFileName) {
  const match = String(originalFileName || filePath || '').match(/\.([a-zA-Z0-9]{1,10})(?:\?|$)/)
  return match ? match[1].toLowerCase() : 'jpg'
}

function originalFileName(filePath, providedName, sequence) {
  const suffix = fileExtension(filePath, providedName)
  const candidate = String(providedName || filePath || '').split(/[\\/]/).pop().split('?')[0]
  const fallback = `${String((sequence || 0) + 1).padStart(3, '0')}.${suffix}`
  if (!candidate || candidate.startsWith('tmp_') || candidate.length > 80) return fallback
  const dotIndex = candidate.lastIndexOf('.')
  const base = dotIndex > 0 ? candidate.slice(0, dotIndex) : candidate
  return `${safePathSegment(base, String((sequence || 0) + 1).padStart(3, '0'), 60)}.${suffix}`
}

function buildOrgCloudPath(params) {
  const eventName = safePathSegment(params.eventName, '', 80)
  if (!params.eventName || !String(params.eventName).trim()) throw new Error('请先填写事件名称')
  const teamName = serviceTeamName(params.organizationId, params.serviceTeamName)
  const suffix = fileExtension(params.filePath, params.originalFileName)
  if (params.resourceType === 'media_album') {
    const categoryName = safePathSegment(params.categoryName, '未分类', 30)
    const year = /^\d{4}/.test(String(params.eventDate || '')) ? String(params.eventDate).slice(0, 4) : String(new Date().getFullYear())
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `${eventName}_${unique}.${suffix}`
    return `${FIXED_ORGANIZATION_PATH.concat([teamName, '服务队云盘', categoryName, year, eventName, name]).join('/')}`
  }
  const leaderRole = safePathSegment(params.leaderRole, '服务队公共活动', 30)
  const departmentName = params.departmentName
    ? safePathSegment(params.departmentName, '', 40)
    : ''
  const name = `${eventName}_${Number(params.sequence || 0) + 1}.${suffix}`
  const folders = FIXED_ORGANIZATION_PATH.concat([teamName, leaderRole])
  if (departmentName) folders.push(departmentName)
  folders.push(eventName)
  return `${folders.join('/')}/${name}`
}

function inferFileType(fileName) {
  const suffix = fileExtension(fileName, fileName)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(suffix)) return `image/${suffix === 'jpg' ? 'jpeg' : suffix}`
  if (['mp4', 'mov', 'm4v', 'avi', 'webm'].includes(suffix)) return `video/${suffix === 'mov' ? 'quicktime' : suffix}`
  if (suffix === 'pdf') return 'application/pdf'
  return `application/${suffix}`
}

async function uploadOrgFile(params = {}) {
  if (!params.filePath) throw new Error('请选择需要上传的文件')
  const cloudPath = buildOrgCloudPath(params)
  const sourceName = originalFileName(params.filePath, params.originalFileName, params.sequence)
  const uploaded = await cloudbase.uploadFile(cloudPath, params.filePath)
  try {
    const record = await cloudbase.invoke('saveFileRecord', {
      record: {
        organizationId: params.organizationId,
        orgLevel: FIXED_ORGANIZATION_PATH[0],
        representativeOffice: FIXED_ORGANIZATION_PATH[1],
        cooperationArea: FIXED_ORGANIZATION_PATH[2],
        serviceTeamName: serviceTeamName(params.organizationId, params.serviceTeamName),
        leaderRole: params.leaderRole,
        departmentName: params.departmentName || '',
        eventName: String(params.eventName).trim(),
        cloudPath,
        fileID: uploaded.fileID,
        fileType: params.fileType || inferFileType(sourceName),
        originalFileName: sourceName,
        resourceType: params.resourceType || 'event_record',
        resourceId: params.resourceId || '',
        module: params.module || 'archives',
        category: params.category || '',
        mediaType: params.mediaType || '',
        size: Number(params.size) || 0,
        duration: Number(params.duration) || 0,
        width: Number(params.width) || 0,
        height: Number(params.height) || 0,
        sortOrder: Number(params.sortOrder) || 0
      }
    })
    return { ...uploaded, cloudPath, objectKey: cloudPath, fileRecord: record }
  } catch (error) {
    await cloudbase.deleteFiles([uploaded.fileID]).catch(() => {})
    throw error
  }
}

module.exports = {
  uploadOrgFile,
  buildOrgCloudPath,
  safePathSegment,
  archivePort
}
