const cloudbase = require('./providers/cloudbase-adapter')
const { uploadOrgFile, archivePort } = require('./file-upload-service')

const ORGANIZATION_IDS = {
  district: 'org_region_21_suihua',
  linghang: 'org_team_linghang',
  ailinghang: 'org_team_ailinghang',
  yuanhang: 'org_team_yuanhang',
  jingying: 'org_team_jingying'
}

const LOCAL_ORGANIZATION_IDS = Object.keys(ORGANIZATION_IDS).reduce((result, key) => {
  result[ORGANIZATION_IDS[key]] = key
  return result
}, {})

const ACTIONS = [
  'listArchiveEntries',
  'getArchiveEntry',
  'saveArchiveEntry',
  'deleteArchiveEntry',
  'listHonorConfirmations',
  'listHonorVerifications',
  'confirmArchiveEvent',
  'confirmGrantHonor',
  'markHonorNotGranted',
  'verifyHonorForWall',
  'markHonorNeedRecheck',
  'getArchiveHonorStats'
  ,'listLedgerRecords'
  ,'saveLedgerRecord'
  ,'deleteLedgerRecord'
]

function handles(action) {
  return ACTIONS.includes(action)
}

function toCloudOrganizationId(id) {
  return ORGANIZATION_IDS[id] || id
}

function toLocalOrganizationId(id) {
  return LOCAL_ORGANIZATION_IDS[id] || id
}

function recordToArchiveEntry(record) {
  const images = record.images || []
  const photos = images.map(item => item.fileId || item.imageUrl).filter(Boolean)
  return {
    _id: record.id,
    cloudDocumentId: record._id,
    organizationId: toLocalOrganizationId(record.organizationId),
    categoryId: record.categoryId || record.category,
    positionId: record.positionId || record.categoryId || '',
    date: record.eventDate || '',
    dateLabel: record.eventDate || '',
    location: record.location || '',
    participantCount: Number(record.participantCount) || 0,
    participants: Array.isArray(record.participants) ? record.participants : [],
    title: record.title || '',
    team: '',
    uploadedBy: record.ownerName || '',
    uploaderRole: record.category || '',
    status: record.status || 'draft',
    eventStatus: record.eventStatus || '',
    honorRequestedLevel: record.honorRequestedLevel || 'none',
    honorConfirmedLevel: record.honorConfirmedLevel || '',
    honorStatus: record.honorStatus || 'none',
    honorStatusLabel: record.honorStatusLabel || '',
    honorRequestedLabel: record.honorRequestedLabel || '',
    honorConfirmedLabel: record.honorConfirmedLabel || '',
    honorLevelLabel: record.honorLevelLabel || '',
    confirmPositionId: record.confirmPositionId || '',
    confirmUnavailableReason: record.confirmUnavailableReason || '',
    honorRecipientUserId: record.honorRecipientUserId || '',
    honorRecipientName: record.honorRecipientName || '',
    honorRecipientPositionId: record.honorRecipientPositionId || '',
    termStartDate: record.termStartDate || '',
    termEndDate: record.termEndDate || '',
    confirmedBy: record.confirmedBy || '',
    confirmedByName: record.confirmedByName || '',
    confirmedAt: record.confirmedAt || '',
    honorVerifiedBy: record.honorVerifiedBy || '',
    honorVerifiedByName: record.honorVerifiedByName || '',
    honorVerifiedAt: record.honorVerifiedAt || '',
    photoCount: Number(record.imageCount) || photos.length,
    photos,
    tone: 'blue',
    keywords: record.keywords || [],
    summary: record.summary || '',
    content: record.content || '',
    source: 'cloud'
  }
}

function archiveEntryToRecord(entry) {
  const organizationId = toCloudOrganizationId(entry.organizationId)
  const isTeam = String(organizationId).includes('_team_')
  const positionId = entry.positionId || entry.categoryId || ''
  return {
    id: entry._id && !String(entry._id).startsWith('local-') ? entry._id : undefined,
    title: entry.title,
    content: entry.content,
    summary: entry.summary,
    keywords: entry.keywords || [],
    areaId: 'org_region_21_suihua',
    teamId: isTeam ? organizationId : null,
    organizationId,
    organizationAncestorIds: [
      'org_federation_china',
      'org_office_haerbin',
      'org_region_21_suihua'
    ],
    category: entry.uploaderRole || entry.categoryId || '纪事',
    categoryId: entry.categoryId || '',
    positionId,
    archiveId: `archive_${organizationId}_${positionId || 'main'}`,
    eventDate: entry.date,
    location: entry.location || '',
    participantCount: Number(entry.participantCount) || 0,
    participants: Array.isArray(entry.participants) ? entry.participants : [],
    ownerName: entry.uploadedBy || '',
    status: entry.status || 'draft',
    eventStatus: entry.eventStatus || (entry.honorRequestedLevel && entry.honorRequestedLevel !== 'none' ? 'pending_leader_confirm' : 'archived'),
    honorRequestedLevel: entry.honorRequestedLevel || 'none',
    honorConfirmedLevel: entry.honorConfirmedLevel || null,
    honorStatus: entry.honorStatus || (entry.honorRequestedLevel && entry.honorRequestedLevel !== 'none' ? 'pending_leader_confirm' : 'none'),
    confirmPositionId: entry.confirmPositionId || '',
    honorRecipientUserId: entry.honorRecipientUserId || '',
    honorRecipientName: entry.honorRecipientName || '',
    honorRecipientPositionId: entry.honorRecipientPositionId || '',
    termStartDate: entry.termStartDate || '',
    termEndDate: entry.termEndDate || '',
    confirmedBy: entry.confirmedBy || '',
    confirmedByName: entry.confirmedByName || '',
    confirmedAt: entry.confirmedAt || null,
    honorVerifiedBy: entry.honorVerifiedBy || '',
    honorVerifiedByName: entry.honorVerifiedByName || '',
    honorVerifiedAt: entry.honorVerifiedAt || null,
    visibility: 'organization',
    imageCount: Number(entry.photoCount) || 0
  }
}

function uniquePhotos(photos) {
  const seen = new Set()
  return (photos || []).filter(photo => {
    const value = String(photo || '').trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

async function execute(action, payload, localFallback) {
  if (action === 'listLedgerRecords') {
    return cloudbase.invoke('listLedgerRecords', {
      organizationId: toCloudOrganizationId(payload.organizationId)
    })
  }
  if (action === 'saveLedgerRecord') {
    const organizationId = toCloudOrganizationId(payload.record.organizationId)
    return cloudbase.invoke('saveLedgerRecord', {
      record: {
        ...payload.record,
        organizationId,
        areaId: 'org_region_21_suihua',
        teamId: organizationId.includes('_team_') ? organizationId : null,
        positionId: 'treasurer'
      }
    })
  }
  if (action === 'deleteLedgerRecord') return cloudbase.invoke('deleteLedgerRecord', payload)
  if (action === 'listArchiveEntries') {
    const records = await cloudbase.invoke('listEventRecords', {
      organizationId: toCloudOrganizationId(payload.organizationId),
      categoryId: payload.categoryId,
      eventMonth: payload.eventMonth,
      status: payload.status || 'published',
      limit: 100
    })
    const localEntries = await localFallback(action, payload)
    const merged = {}
    localEntries.concat(records.map(recordToArchiveEntry)).forEach(item => { merged[item._id] = item })
    return Object.values(merged)
  }
  if (action === 'listHonorConfirmations') {
    const records = await cloudbase.invoke('listHonorConfirmations', {
      organizationId: toCloudOrganizationId(payload.organizationId)
    })
    return records.map(recordToArchiveEntry)
  }
  if (action === 'listHonorVerifications') {
    const records = await cloudbase.invoke('listHonorVerifications', {
      organizationId: toCloudOrganizationId(payload.organizationId)
    })
    return records.map(recordToArchiveEntry)
  }
  if (action === 'confirmArchiveEvent') return cloudbase.invoke('confirmArchiveEvent', payload)
  if (action === 'confirmGrantHonor') return cloudbase.invoke('confirmGrantHonor', payload)
  if (action === 'markHonorNotGranted') return cloudbase.invoke('markHonorNotGranted', payload)
  if (action === 'verifyHonorForWall') return cloudbase.invoke('verifyHonorForWall', payload)
  if (action === 'markHonorNeedRecheck') return cloudbase.invoke('markHonorNeedRecheck', payload)
  if (action === 'getArchiveHonorStats') {
    const response = await cloudbase.invoke('getArchiveHonorStats', {
      ...payload,
      organizationId: toCloudOrganizationId(payload.organizationId)
    })
    return {
      ...response,
      events: (response.events || []).map(recordToArchiveEntry)
    }
  }
  if (action === 'getArchiveEntry') {
    return recordToArchiveEntry(await cloudbase.invoke('getEventRecord', { id: payload.id }))
  }
  if (action === 'saveArchiveEntry') {
    const response = await cloudbase.invoke('saveEventRecord', {
      id: payload.entry && payload.entry._id,
      record: archiveEntryToRecord(payload.entry || {})
    })
    const photos = uniquePhotos(payload.entry && payload.entry.photos)
    const images = []
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index]
      if (String(photo).startsWith('cloud://')) {
        images.push({ fileId: photo, objectKey: '' })
        continue
      }
      if (/^https?:\/\//.test(String(photo))) {
        images.push({ imageUrl: photo, objectKey: '' })
        continue
      }
      const port = archivePort(payload.entry.categoryId, payload.entry.uploaderRole)
      const uploaded = await uploadOrgFile({
        filePath: photo,
        organizationId: payload.entry.organizationId,
        leaderRole: port.leaderRole,
        departmentName: port.departmentName,
        eventName: payload.entry.title,
        sequence: index,
        resourceType: 'event_record',
        resourceId: response.id,
        module: 'archives'
      })
      images.push({ fileId: uploaded.fileID, objectKey: uploaded.cloudPath })
    }
    await cloudbase.invoke('saveEventImages', { eventId: response.id, images })
    return {
      ...payload.entry,
      _id: response.id,
      cloudDocumentId: response._id,
      photos: images.map(item => item.fileId || item.imageUrl).filter(Boolean),
      photoCount: images.length,
      source: 'cloud'
    }
  }
  if (action === 'deleteArchiveEntry') {
    if (!String(payload.id || '').startsWith('event_')) return localFallback(action, payload)
    return cloudbase.invoke('archiveEventRecord', { id: payload.id })
  }
  return localFallback(action, payload)
}

module.exports = {
  handles,
  execute,
  toCloudOrganizationId,
  toLocalOrganizationId
}
