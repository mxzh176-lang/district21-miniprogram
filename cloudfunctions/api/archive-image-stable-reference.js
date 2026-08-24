function decodePath(value) {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    return value
  }
}

function storageObjectKey(value = '') {
  const source = String(value || '').trim()
  if (!source) return ''
  if (source.startsWith('cloud://')) {
    const slashIndex = source.indexOf('/', 'cloud://'.length)
    return slashIndex === -1 ? '' : decodePath(source.slice(slashIndex + 1))
  }
  if (/^https?:\/\//i.test(source)) {
    try {
      return decodePath(new URL(source).pathname.replace(/^\/+/, ''))
    } catch (error) {
      return ''
    }
  }
  return decodePath(source.replace(/^\/+/, ''))
}

function preserveStableArchiveImages(images = [], existingImages = []) {
  const activeStableByObjectKey = new Map()
  existingImages.forEach(image => {
    const fileId = String(image && (image.fileId || image.fileID) || '').trim()
    if (!image || image.status !== 'active' || !fileId.startsWith('cloud://')) return
    const objectKey = storageObjectKey(image.objectKey || fileId)
    if (objectKey && !activeStableByObjectKey.has(objectKey)) {
      activeStableByObjectKey.set(objectKey, {
        fileId,
        objectKey: String(image.objectKey || '').trim() || objectKey
      })
    }
  })

  const normalized = images.map(image => {
    const current = image || {}
    const fileId = String(current.fileId || current.fileID || '').trim()
    if (fileId.startsWith('cloud://')) return current
    const displayUrl = current.imageUrl || current.src || current.url
    if (!isCloudBaseSignedTemporaryUrl(displayUrl)) return current
    const objectKey = storageObjectKey(displayUrl)
    const stable = activeStableByObjectKey.get(objectKey)
    if (!stable) return current
    return {
      ...current,
      fileId: stable.fileId,
      imageUrl: '',
      objectKey: stable.objectKey
    }
  })
  const seen = new Set()
  return normalized.filter(image => {
    const key = String(image.fileId || image.fileID || image.imageUrl || image.src || image.url || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

module.exports = { preserveStableArchiveImages, storageObjectKey }
const { isCloudBaseSignedTemporaryUrl } = require('./image-display-resolver')
