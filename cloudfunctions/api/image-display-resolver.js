function fileIdOf(record = {}) {
  return String(record.fileId || record.fileID || '').trim()
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
  await Promise.all(batches(ids, batchSize).map(async fileList => {
    try {
      const response = await dependencies.getTempFileURL({ fileList })
      ;(response.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
    } catch (error) {
      warn('image temp url batch failed', { batchSize: fileList.length, error })
    }
  }))
  return normalized.map(record => ({
    ...record,
    imageUrl: urlMap[fileIdOf(record)] || record.imageUrl || record.src || record.url || fileIdOf(record)
  }))
}

module.exports = { fileIdOf, resolveImageDisplayUrls }
