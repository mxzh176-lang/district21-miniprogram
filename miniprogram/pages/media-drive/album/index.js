const api = require('../../../utils/api')
const mediaDriveService = require('../../../services/media-drive-service')

const CATEGORIES = [
  { id: 'meeting', name: '会议照片' },
  { id: 'fellowship', name: '联谊照片' },
  { id: 'care', name: '关爱记录' },
  { id: 'service', name: '服务记录' },
  { id: 'uncategorized', name: '未分类' }
]
const LIVE_SYNC_INTERVAL = 5000

Page({
  data: {
    id: '',
    album: {},
    childFolders: [],
    breadcrumbs: [],
    files: [],
    permissions: {},
    loading: true,
    loadError: '',
    uploading: false,
    uploadProgress: '',
    showUploadQueue: false,
    pendingFiles: [],
    pendingSizeText: '',
    shareReady: false,
    sharePath: '',
    exporting: false,
    page: 1,
    hasMore: false,
    liveSyncing: false,
    lastSyncedAt: ''
  },

  onLoad(options = {}) {
    this.setData({ id: options.id || '' })
  },

  async onShow() {
    await this.loadAlbum(true)
    this.startLiveSync()
  },

  onHide() { this.stopLiveSync() },
  onUnload() { this.stopLiveSync() },

  async onPullDownRefresh() {
    await this.loadAlbum(true)
    wx.stopPullDownRefresh()
  },

  async onReachBottom() {
    if (!this.data.loading && this.data.hasMore) await this.loadAlbum(false)
  },

  async loadAlbum(reset = true) {
    if (!this.data.id) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, loadError: '' })
    try {
      const result = await api.call('getMediaAlbum', { id: this.data.id, page, pageSize: 30 }, { forceRefresh: true })
      this.setData({
        album: result.album,
        childFolders: result.childFolders || [],
        breadcrumbs: result.breadcrumbs || [],
        files: reset ? result.files || [] : this.data.files.concat(result.files || []),
        permissions: result.permissions || {},
        page,
        hasMore: Boolean(result.hasMore),
        loading: false
      })
      wx.setNavigationBarTitle({ title: result.album.title || '活动相册' })
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '相册加载失败' })
    }
  },

  startLiveSync() {
    this.stopLiveSync()
    if (!this.data.id) return
    this.liveSyncTimer = setInterval(() => this.syncAlbum(), LIVE_SYNC_INTERVAL)
  },

  stopLiveSync() {
    if (this.liveSyncTimer) clearInterval(this.liveSyncTimer)
    this.liveSyncTimer = null
    this.liveSyncing = false
  },

  async syncAlbum() {
    if (this.liveSyncing || this.data.loading || this.data.uploading || !this.data.id) return
    this.liveSyncing = true
    this.setData({ liveSyncing: true })
    try {
      const result = await api.call('getMediaAlbum', { id: this.data.id, page: 1, pageSize: 30 }, { forceRefresh: true })
      const freshFiles = result.files || []
      const freshIds = new Set(freshFiles.map(item => item.id))
      const loadedTail = this.data.page > 1
        ? this.data.files.slice(30).filter(item => !freshIds.has(item.id))
        : []
      const date = new Date()
      this.setData({
        album: result.album,
        childFolders: result.childFolders || [],
        breadcrumbs: result.breadcrumbs || [],
        files: freshFiles.concat(loadedTail),
        permissions: result.permissions || this.data.permissions,
        hasMore: this.data.page > 1 ? this.data.hasMore : Boolean(result.hasMore),
        liveSyncing: false,
        lastSyncedAt: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      })
    } catch (error) {
      this.setData({ liveSyncing: false })
    } finally {
      this.liveSyncing = false
    }
  },

  previewImage(event) {
    const current = event.currentTarget.dataset.url
    const urls = this.data.files.filter(item => item.mediaType !== 'video').map(item => item.url).filter(Boolean)
    wx.previewImage({ current, urls })
  },

  openChildFolder(event) {
    wx.navigateTo({ url: `/pages/media-drive/album/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
  },

  createSubfolder() {
    if (!this.data.permissions.canManage) return
    wx.showModal({
      title: '新建子文件夹',
      editable: true,
      placeholderText: '请输入文件夹名称',
      success: async result => {
        const title = String(result.content || '').trim()
        if (!result.confirm || !title) return
        try {
          await api.call('saveMediaAlbum', { album: {
            organizationId: this.data.album.organizationId,
            parentId: this.data.album.id,
            title,
            eventDate: this.data.album.eventDate,
            category: this.data.album.category
          } })
          wx.showToast({ title: '已创建', icon: 'success' })
          await this.loadAlbum(true)
        } catch (error) { api.showError(error) }
      }
    })
  },

  renameFolder() {
    if (!this.data.permissions.canManage) return
    wx.showModal({
      title: '重命名文件夹',
      editable: true,
      content: this.data.album.title,
      placeholderText: '请输入新名称',
      success: async result => {
        const title = String(result.content || '').trim()
        if (!result.confirm || !title || title === this.data.album.title) return
        try {
          await api.call('saveMediaAlbum', { album: { ...this.data.album, title } })
          wx.showToast({ title: '名称已更新', icon: 'success' })
          await this.loadAlbum(true)
        } catch (error) { api.showError(error) }
      }
    })
  },

  async prepareShare() {
    if (!this.data.permissions.canShare) return
    try {
      const share = await api.call('createMediaShare', { albumId: this.data.album.id, expiresDays: 7 })
      this.setData({ shareReady: true, sharePath: share.sharePath })
      wx.showToast({ title: '分享口令已生成', icon: 'success' })
    } catch (error) { api.showError(error) }
  },

  closeShareReady() { this.setData({ shareReady: false }) },

  onShareAppMessage() {
    return {
      title: `${this.data.album.title}｜内部云盘分享`,
      path: this.data.sharePath || `/pages/media-drive/album/index?id=${encodeURIComponent(this.data.album.id)}`
    }
  },

  exportFolder() {
    if (!this.data.permissions.canExport || this.data.exporting) return
    wx.showActionSheet({
      itemList: ['打包照片视频（ZIP）', '导出文件清单（CSV）'],
      success: result => this.runExport(result.tapIndex === 1 ? 'csv' : 'zip')
    })
  },

  async runExport(format) {
    try {
      this.setData({ exporting: true })
      wx.showLoading({ title: format === 'zip' ? '正在打包' : '正在生成' })
      const result = await api.call('createMediaExport', { albumId: this.data.album.id, format })
      wx.hideLoading()
      this.setData({ exporting: false })
      await new Promise((resolve, reject) => wx.setClipboardData({ data: result.downloadUrl, success: resolve, fail: reject }))
      wx.showModal({ title: '导出完成', content: '24小时临时下载链接已复制，可粘贴到浏览器下载。', showCancel: false })
    } catch (error) {
      wx.hideLoading()
      this.setData({ exporting: false })
      api.showError(error)
    }
  },

  openUploadQueue() {
    if (!this.data.permissions.canUpload || this.data.uploading) return
    this.setData({ showUploadQueue: true, pendingFiles: [], pendingSizeText: '' })
  },

  closeUploadQueue() {
    if (!this.data.uploading) this.setData({ showUploadQueue: false })
  },

  async chooseMoreFiles() {
    if (!this.data.permissions.canUpload || this.data.uploading) return
    try {
      const selection = await new Promise((resolve, reject) => wx.chooseMedia({
        count: 9,
        mediaType: ['image', 'video'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: resolve,
        fail: reject
      }))
      const files = selection.tempFiles || []
      if (!files.length) return
      const pendingFiles = this.data.pendingFiles.concat(files).slice(0, 50)
      const totalSize = pendingFiles.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
      this.setData({ pendingFiles, pendingSizeText: totalSize >= 1024 * 1024 ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(totalSize / 1024)}KB` })
    } catch (error) {
      if (!String(error && error.errMsg || '').includes('cancel')) api.showError(error)
    }
  },

  removePendingFile(event) {
    if (this.data.uploading) return
    const removeIndex = Number(event.currentTarget.dataset.index)
    const pendingFiles = this.data.pendingFiles.filter((item, index) => index !== removeIndex)
    this.setData({ pendingFiles })
  },

  async startUploadQueue() {
    if (!this.data.permissions.canUpload || this.data.uploading || !this.data.pendingFiles.length) return
    const files = this.data.pendingFiles.slice()
    let uploadedCount = 0
    try {
      this.setData({ uploading: true, uploadProgress: `准备上传 0/${files.length}` })
      for (let index = 0; index < files.length; index += 1) {
        this.setData({ uploadProgress: `正在上传 ${index + 1}/${files.length}` })
        await mediaDriveService.uploadMedia({
          file: files[index],
          organizationId: this.data.album.organizationId,
          albumId: this.data.album.id,
          albumTitle: this.data.album.title,
          eventDate: this.data.album.eventDate,
          category: this.data.album.category,
          categoryName: this.data.album.categoryName,
          sequence: this.data.files.length + index
        })
        uploadedCount = index + 1
      }
      this.setData({ uploading: false, uploadProgress: '', showUploadQueue: false, pendingFiles: [], pendingSizeText: '' })
      wx.showToast({ title: '上传完成', icon: 'success' })
      await this.loadAlbum(true)
    } catch (error) {
      this.setData({ uploading: false, uploadProgress: '', pendingFiles: files.slice(uploadedCount) })
      api.showError(error)
    }
  },

  editAlbum() {
    if (!this.data.permissions.canManage) return
    wx.showActionSheet({
      itemList: CATEGORIES.map(item => item.name),
      success: async result => {
        const category = CATEGORIES[result.tapIndex]
        try {
          await api.call('saveMediaAlbum', { album: { ...this.data.album, category: category.id } })
          wx.showToast({ title: '分类已更新', icon: 'success' })
          await this.loadAlbum(true)
        } catch (error) { api.showError(error) }
      }
    })
  },

  deleteFile(event) {
    if (!this.data.permissions.canDelete) return
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这个文件？',
      content: '删除后将不再显示，并保留操作记录。',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteMediaFile', { id })
          await this.loadAlbum(true)
        } catch (error) { api.showError(error) }
      }
    })
  },

  deleteAlbum() {
    if (!this.data.permissions.canDelete) return
    wx.showModal({
      title: '删除整个相册？',
      content: `相册内 ${this.data.album.mediaCount || this.data.files.length} 个文件将一并删除，请确认。`,
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteMediaAlbum', { id: this.data.album.id })
          wx.navigateBack()
        } catch (error) { api.showError(error) }
      }
    })
  }
})
