const api = require('../../utils/api')
const mediaDriveService = require('../../services/media-drive-service')

const DEFAULT_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'meeting', name: '会议照片' },
  { id: 'fellowship', name: '联谊照片' },
  { id: 'care', name: '关爱记录' },
  { id: 'service', name: '服务记录' },
  { id: 'uncategorized', name: '未分类' }
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

const LIVE_SYNC_INTERVAL = 5000

Page({
  data: {
    teams: [],
    teamIndex: 0,
    organizationId: '',
    organizationName: '',
    categories: DEFAULT_CATEGORIES,
    uploadCategories: DEFAULT_CATEGORIES.slice(1),
    category: 'all',
    albums: [],
    permissions: {},
    loading: true,
    loadError: '',
    page: 1,
    hasMore: false,
    showUploadForm: false,
    uploadForm: { title: '', eventDate: '', category: 'uncategorized' },
    uploadCategoryIndex: 4,
    pendingFiles: [],
    pendingSizeText: '',
    uploading: false,
    uploadProgress: '',
    liveSyncing: false,
    lastSyncedAt: ''
  },

  onLoad(options = {}) {
    this.requestedOrganizationId = options.organizationId || ''
  },

  async onShow() {
    if (!this.data.teams.length) await this.initialize()
    else await this.loadAlbums(true)
    this.startLiveSync()
  },

  onHide() { this.stopLiveSync() },
  onUnload() { this.stopLiveSync() },

  async onPullDownRefresh() {
    await this.loadAlbums(true)
    wx.stopPullDownRefresh()
  },

  async onReachBottom() {
    if (!this.data.loading && this.data.hasMore) await this.loadAlbums(false)
  },

  async initialize() {
    this.setData({ loading: true, loadError: '' })
    try {
      const teams = await api.call('listMediaTeams')
      if (!teams.length) throw new Error('当前账号没有可查看的服务队云盘')
      const requested = String(this.requestedOrganizationId || '').replace(/^(linghang|ailinghang|yuanhang|jingying)$/, 'org_team_$1')
      const teamIndex = Math.max(0, teams.findIndex(item => item.id === requested))
      this.setData({ teams, teamIndex, organizationId: teams[teamIndex].id, organizationName: teams[teamIndex].name })
      await this.loadAlbums(true)
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '云盘加载失败' })
    }
  },

  async loadAlbums(reset) {
    if (!this.data.organizationId) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, loadError: '' })
    try {
      const result = await api.call('listMediaAlbums', {
        organizationId: this.data.organizationId,
        category: this.data.category,
        page,
        pageSize: 20
      }, { forceRefresh: true })
      this.setData({
        organizationName: result.organizationName,
        categories: [{ id: 'all', name: '全部' }].concat(result.categories || DEFAULT_CATEGORIES.slice(1)),
        uploadCategories: result.categories || DEFAULT_CATEGORIES.slice(1),
        permissions: result.permissions || {},
        albums: reset ? result.albums : this.data.albums.concat(result.albums || []),
        page,
        hasMore: Boolean(result.hasMore),
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '云盘加载失败' })
    }
  },

  startLiveSync() {
    this.stopLiveSync()
    if (!this.data.organizationId) return
    this.liveSyncTimer = setInterval(() => this.syncAlbums(), LIVE_SYNC_INTERVAL)
  },

  stopLiveSync() {
    if (this.liveSyncTimer) clearInterval(this.liveSyncTimer)
    this.liveSyncTimer = null
    this.liveSyncing = false
  },

  async syncAlbums() {
    if (this.liveSyncing || this.data.loading || this.data.uploading || this.data.showUploadForm || !this.data.organizationId) return
    this.liveSyncing = true
    this.setData({ liveSyncing: true })
    try {
      const result = await api.call('listMediaAlbums', {
        organizationId: this.data.organizationId,
        category: this.data.category,
        page: 1,
        pageSize: 20
      }, { forceRefresh: true })
      const freshAlbums = result.albums || []
      const freshIds = new Set(freshAlbums.map(item => item.id))
      const loadedTail = this.data.page > 1
        ? this.data.albums.slice(20).filter(item => !freshIds.has(item.id))
        : []
      const date = new Date()
      this.setData({
        albums: freshAlbums.concat(loadedTail),
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

  onTeamChange(event) {
    const teamIndex = Number(event.detail.value)
    const team = this.data.teams[teamIndex]
    this.setData({ teamIndex, organizationId: team.id, organizationName: team.name, albums: [] })
    this.loadAlbums(true)
    this.startLiveSync()
  },

  selectCategory(event) {
    this.setData({ category: event.currentTarget.dataset.id, albums: [] })
    this.loadAlbums(true)
  },

  openAlbum(event) {
    wx.navigateTo({ url: `/pages/media-drive/album/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
  },

  openUploadForm() {
    if (!this.data.permissions.canUpload) return
    const selected = this.data.category === 'all' ? 'uncategorized' : this.data.category
    const categories = this.data.uploadCategories
    const uploadCategoryIndex = Math.max(0, categories.findIndex(item => item.id === selected))
    this.setData({
      showUploadForm: true,
      uploadCategoryIndex,
      pendingFiles: [],
      pendingSizeText: '',
      uploadForm: { title: '', eventDate: today(), category: categories[uploadCategoryIndex].id }
    })
  },

  closeUploadForm() {
    if (!this.data.uploading) this.setData({ showUploadForm: false })
  },

  onTitleInput(event) { this.setData({ 'uploadForm.title': event.detail.value }) },
  onDateChange(event) { this.setData({ 'uploadForm.eventDate': event.detail.value }) },
  onUploadCategoryChange(event) {
    const uploadCategoryIndex = Number(event.detail.value)
    const categories = this.data.uploadCategories
    this.setData({ uploadCategoryIndex, 'uploadForm.category': categories[uploadCategoryIndex].id })
  },

  async chooseUploadFiles() {
    if (this.data.uploading) return
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
      this.setData({
        pendingFiles,
        pendingSizeText: totalSize >= 1024 * 1024 ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(totalSize / 1024)}KB`
      })
      if (this.data.pendingFiles.length + files.length > 50) wx.showToast({ title: '单次队列最多50个文件', icon: 'none' })
    } catch (error) {
      if (!String(error && error.errMsg || '').includes('cancel')) api.showError(error)
    }
  },

  removePendingFile(event) {
    if (this.data.uploading) return
    const index = Number(event.currentTarget.dataset.index)
    const pendingFiles = this.data.pendingFiles.filter((item, itemIndex) => itemIndex !== index)
    const totalSize = pendingFiles.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
    this.setData({
      pendingFiles,
      pendingSizeText: pendingFiles.length ? (totalSize >= 1024 * 1024 ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(totalSize / 1024)}KB`) : ''
    })
  },

  async saveFolderOnly() {
    if (this.data.uploading) return
    if (!String(this.data.uploadForm.title || '').trim()) {
      wx.showToast({ title: '请填写文件夹名称', icon: 'none' })
      return
    }
    const categories = this.data.uploadCategories
    const categoryItem = categories[this.data.uploadCategoryIndex] || categories[categories.length - 1]
    try {
      this.setData({ uploading: true })
      await api.call('saveMediaAlbum', { album: {
        organizationId: this.data.organizationId,
        title: this.data.uploadForm.title,
        eventDate: this.data.uploadForm.eventDate || today(),
        category: categoryItem.id,
        parentId: ''
      } })
      this.setData({ showUploadForm: false, uploading: false, pendingFiles: [] })
      wx.showToast({ title: '文件夹已创建', icon: 'success' })
      await this.loadAlbums(true)
    } catch (error) {
      this.setData({ uploading: false })
      api.showError(error)
    }
  },

  async startUploadQueue() {
    if (this.data.uploading || !this.data.pendingFiles.length) return
    const files = this.data.pendingFiles.slice()
    const categories = this.data.uploadCategories
    const categoryItem = categories[this.data.uploadCategoryIndex] || categories[categories.length - 1]
    let uploadedCount = 0
    try {
      this.setData({ uploading: true, uploadProgress: `准备上传 0/${files.length}` })
      const album = await api.call('saveMediaAlbum', {
        album: {
          organizationId: this.data.organizationId,
          title: this.data.uploadForm.title || '未分类相册',
          eventDate: this.data.uploadForm.eventDate || today(),
          category: categoryItem.id,
          parentId: ''
        }
      })
      for (let index = 0; index < files.length; index += 1) {
        this.setData({ uploadProgress: `正在上传 ${index + 1}/${files.length}` })
        await mediaDriveService.uploadMedia({
          file: files[index],
          organizationId: this.data.organizationId,
          albumId: album.id,
          albumTitle: album.title,
          eventDate: album.eventDate,
          category: album.category,
          categoryName: album.categoryName,
          sequence: index
        })
        uploadedCount = index + 1
      }
      this.setData({ showUploadForm: false, uploading: false, uploadProgress: '', pendingFiles: [], pendingSizeText: '' })
      wx.showToast({ title: '上传完成', icon: 'success' })
      await this.loadAlbums(true)
    } catch (error) {
      const pendingFiles = files.slice(uploadedCount)
      this.setData({ uploading: false, uploadProgress: '', pendingFiles })
      api.showError(error)
    }
  }
})
