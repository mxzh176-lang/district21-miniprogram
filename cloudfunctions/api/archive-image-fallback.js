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

  const primaryEventIds = new Set(Object.keys(selected).filter(eventId => selected[eventId].length))
  sortImages(fileRecords).forEach(file => {
    const eventId = String(file && file.resourceId || '')
    const record = recordMap.get(eventId)
    const key = imageKey(file)
    if (!record || primaryEventIds.has(eventId) || !key) return
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

module.exports = { selectArchiveImages }
