function uniqueIds(values = []) {
  return Array.from(new Set(values.map(value => String(value || '')).filter(Boolean)))
}

function batches(values = [], size = 20) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function readAllPages(db, collectionName, where, pageSize) {
  const rows = []
  let skip = 0
  while (true) {
    const result = await db.collection(collectionName).where(where).skip(skip).limit(pageSize).get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < pageSize) return rows
    skip += page.length
  }
}

function createArchiveImageQueryAdapter({ db, collections, idBatchSize = 20, pageSize = 100 }) {
  async function readByEventIds(collectionName, idField, eventIds) {
    const ids = uniqueIds(eventIds)
    const pages = await Promise.all(batches(ids, idBatchSize).map(batch =>
      readAllPages(db, collectionName, {
        [idField]: db.command.in(batch)
      }, pageSize)
    ))
    return pages.flat()
  }

  return {
    listEventImages: eventIds => readByEventIds(collections.eventImage, 'eventId', eventIds),
    listFileRecords: (_organizationId, eventIds) => readByEventIds(
      collections.fileRecord,
      'resourceId',
      eventIds
    )
  }
}

module.exports = { createArchiveImageQueryAdapter }
