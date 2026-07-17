const api = require('../../../utils/api')

Page({
  data: {
    token: '',
    loading: true,
    loadError: '',
    share: null
  },

  onLoad(options = {}) {
    this.setData({ token: options.token || '' })
    this.loadShare()
  },

  async loadShare() {
    if (!this.data.token) {
      this.setData({ loading: false, loadError: '分享口令无效' })
      return
    }
    try {
      const share = await api.call('getMediaShare', { token: this.data.token }, { forceRefresh: true })
      this.setData({ loading: false, share })
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '分享已失效' })
    }
  },

  openFolder() {
    if (!this.data.share || !this.data.share.album) return
    wx.redirectTo({ url: `/pages/media-drive/album/index?id=${encodeURIComponent(this.data.share.album.id)}` })
  }
})
