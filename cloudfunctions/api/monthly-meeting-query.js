const LEGACY_MONTHLY_MEETING_TITLE = '远航第二次例会'

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

function createMonthlyMeetingQueryAdapter({ db, collectionName, organizationId, pageSize = 100 }) {
  return {
    async findTaskById(id) {
      const result = await db.collection(collectionName).where({ organizationId, id }).limit(1).get()
      return result.data[0] || null
    },
    findMatchingTasks(target) {
      return readAllPages(db, collectionName, {
        organizationId,
        date: target.date,
        title: db.command.in([LEGACY_MONTHLY_MEETING_TITLE, target.title])
      }, pageSize)
    }
  }
}

module.exports = { createMonthlyMeetingQueryAdapter, LEGACY_MONTHLY_MEETING_TITLE }
