const cloudbase = require('./providers/cloudbase-adapter')
const { uploadOrgFile } = require('./file-upload-service')

const ACTIONS = [
  'listMediaAlbums',
  'listMediaTeams',
  'getMediaAlbum',
  'saveMediaAlbum',
  'deleteMediaFile',
  'deleteMediaAlbum',
  'createMediaShare',
  'getMediaShare',
  'createMediaExport'
]

function handles(action) {
  return ACTIONS.includes(action)
}

function execute(action, payload) {
  return cloudbase.invoke(action, payload)
}

async function uploadMedia(params = {}) {
  const file = params.file || {}
  const mediaType = file.fileType === 'video' || file.mediaType === 'video' ? 'video' : 'image'
  const filePath = file.tempFilePath || file.path
  const fallbackName = /\.[a-z0-9]{1,10}$/i.test(String(filePath || '')) ? '' : `media.${mediaType === 'video' ? 'mp4' : 'jpg'}`
  return uploadOrgFile({
    filePath,
    originalFileName: file.name || fallbackName,
    organizationId: params.organizationId,
    leaderRole: '服务队云盘',
    departmentName: params.categoryName || '未分类',
    eventName: params.albumTitle || '未分类相册',
    eventDate: params.eventDate,
    category: params.category,
    categoryName: params.categoryName,
    sequence: params.sequence,
    resourceType: 'media_album',
    resourceId: params.albumId,
    module: 'photos',
    mediaType,
    size: Number(file.size) || 0,
    duration: Number(file.duration) || 0,
    width: Number(file.width) || 0,
    height: Number(file.height) || 0,
    sortOrder: Number(params.sequence) || 0
  })
}

module.exports = { handles, execute, uploadMedia }
