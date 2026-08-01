function imageKey(image = {}) {
  return String(image.fileId || image.fileID || image.imageUrl || '').trim()
}

function sortImages(images = []) {
  return images.slice().sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
}

function selectArchiveImages(records = [], eventImages = [], fileRecords = []) {
  const recordMap = new Map(records
    .filter(record => record && record.id && record.organizationId)
    .map(record => [record.id, record]))
  const selected = {}
  recordMap.forEach((record, eventId) => { selected[eventId] = [] })

  sortImages(eventImages).forEach(image => {
    const eventId = String(image && image.eventId || '')
    const record = recordMap.get(eventId)
    const key = imageKey(image)
    if (!record || image.status !== 'active' || image.organizationId !== record.organizationId || !key) return
    if (selected[eventId].some(item => imageKey(item) === key)) return
    selected[eventId].push({ ...image, fileId: image.fileId || image.fileID || '' })
  })

  const primaryCounts = Object.keys(selected).reduce((counts, eventId) => {
    counts[eventId] = selected[eventId].length
    return counts
  }, {})
  sortImages(fileRecords).forEach(file => {
    const eventId = String(file && file.resourceId || '')
    const record = recordMap.get(eventId)
    const key = imageKey(file)
    if (!record || !key) return
    const intendedCount = Number.isInteger(record.imageCount) && record.imageCount > 0
      ? record.imageCount
      : 0
    const selectedCount = selected[eventId].length
    if (intendedCount ? selectedCount >= intendedCount : primaryCounts[eventId] > 0) return
    if (file.resourceType !== 'event_record' || file.status !== 'active') return
    if (file.organizationId !== record.organizationId || !String(file.fileType || '').startsWith('image/')) return
    if (selected[eventId].some(item => imageKey(item) === key)) return
    selected[eventId].push({
      ...file,
      eventId,
      fileId: file.fileId || file.fileID || ''
    })
  })

  return selected
}

async function loadArchiveImages(records = [], dependencies = {}) {
  const warn = typeof dependencies.warn === 'function' ? dependencies.warn : () => {}
  const organizationIds = Array.from(new Set(records.map(record => record.organizationId).filter(Boolean)))
  const requests = [{
    source: 'event_image',
    promise: Promise.resolve().then(() => dependencies.listEventImages(records.map(record => record.id)))
  }].concat(organizationIds.map(organizationId => ({
    source: 'file_records',
    promise: Promise.resolve().then(() => dependencies.listFileRecords(
      organizationId,
      records.filter(record => record.organizationId === organizationId).map(record => record.id)
    ))
  })))
  const settled = await Promise.allSettled(requests.map(request => request.promise))
  let eventImages = []
  let fileRecords = []
  settled.forEach((result, index) => {
    const request = requests[index]
    if (result.status === 'rejected') {
      warn(`${request.source} list unavailable`, result.reason)
      return
    }
    if (request.source === 'event_image') eventImages = result.value || []
    else fileRecords = fileRecords.concat(result.value || [])
  })

  const selected = selectArchiveImages(records, eventImages || [], fileRecords)
  const resolved = await dependencies.attachImageUrls(Object.values(selected).flat())
  const result = {}
  records.forEach(record => { result[record.id] = [] })
  ;(resolved || []).forEach(image => {
    if (result[image.eventId]) result[image.eventId].push(image)
  })
  return result
}

module.exports = { selectArchiveImages, loadArchiveImages }
