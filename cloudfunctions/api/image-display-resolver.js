function fileIdOf(record = {}) {
  return String(record.fileId || record.fileID || '').trim()
}

function externalUrlOf(record = {}) {
  return [record.imageUrl, record.src, record.url]
    .map(value => String(value || '').trim())
    .find(value => value.startsWith('http://') || value.startsWith('https://')) || ''
}

function batches(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function resolveImageDisplayUrls(records = [], dependencies = {}) {
  const normalized = records.map(record => ({ ...record, fileId: fileIdOf(record) }))
  const ids = Array.from(new Set(normalized.map(fileIdOf).filter(value => value.startsWith('cloud://'))))
  const urlMap = {}
  const batchSize = Math.max(1, Number(dependencies.batchSize) || 50)
  const warn = typeof dependencies.warn === 'function' ? dependencies.warn : () => {}
  const fileBatches = batches(ids, batchSize)
  await Promise.all(fileBatches.map(async (fileList, batchIndex) => {
    try {
      const response = await dependencies.getTempFileURL({ fileList })
      const requestedIds = new Set(fileList)
      ;(response.fileList || []).forEach(item => {
        const fileID = String(item.fileID || '').trim()
        const tempFileURL = String(item.tempFileURL || '').trim()
        if (requestedIds.has(fileID) && tempFileURL) urlMap[fileID] = tempFileURL
      })
      const resolvedCount = fileList.filter(fileID => urlMap[fileID]).length
      if (resolvedCount < fileList.length) {
        warn('image temp url batch incomplete', {
          batchIndex: batchIndex + 1,
          batchCount: fileBatches.length,
          batchSize: fileList.length,
          resolvedCount,
          unresolvedCount: fileList.length - resolvedCount
        })
      }
    } catch (error) {
      warn('image temp url batch failed', { batchSize: fileList.length, error })
    }
  }))
  return normalized.map(record => ({
    ...record,
    imageUrl: urlMap[fileIdOf(record)] || externalUrlOf(record) ||
      (fileIdOf(record).startsWith('cloud://') ? fileIdOf(record) : '')
  }))
}

module.exports = { fileIdOf, externalUrlOf, resolveImageDisplayUrls }
