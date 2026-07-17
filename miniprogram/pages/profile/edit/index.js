const api = require('../../../utils/api')
const { uploadOrgFile } = require('../../../services/file-upload-service')

Page({
  data: {
    name: '',
    organizations: [],
    organizationIndex: 0,
    accountId: '',
    accountSuffix: '',
    avatarUrl: '',
    consentAccepted: false,
    saving: false,
    focusedField: ''
  },

  async onLoad() {
    try {
      const [session, teams] = await Promise.all([
        api.call('getSession'),
        api.call('listProfileOrganizations')
      ])
      const organizations = teams.filter(item => ['region', 'team'].includes(item.type))
      const organizationIndex = Math.max(0, organizations.findIndex(item =>
        item.id === session.organizationId
      ))
      this.setData({
        name: session.profileCompleted ? session.nickname : '',
        organizations,
        organizationIndex,
        accountId: session.id || session._id || '',
        accountSuffix: String(session.id || session._id || '').slice(-6),
        avatarUrl: session.avatarUrl || ''
      })
    } catch (error) {
      api.showError(error)
    }
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value })
  },

  onFieldFocus(event) {
    this.setData({ focusedField: event.currentTarget.dataset.field || '' })
  },

  onFieldBlur() {
    this.setData({ focusedField: '' })
  },

  onPickerOpen() {
    this.setData({ focusedField: 'organization' })
  },

  onPickerCancel() {
    this.setData({ focusedField: '' })
  },

  onOrganizationChange(event) {
    this.setData({ organizationIndex: Number(event.detail.value), focusedField: '' })
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: result => {
        const file = (result.tempFiles || [])[0]
        if (!file) return
        this.pendingAvatarFile = file
        this.setData({ avatarUrl: file.tempFilePath || file.path || '' })
      }
    })
  },

  onConsentChange(event) {
    this.setData({ consentAccepted: (event.detail.value || []).includes('accepted') })
  },

  openUserAgreement() {
    wx.navigateTo({ url: '/pages/profile/agreement/index' })
  },

  openPrivacyPolicy() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '请升级微信后查看隐私保护指引', icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请先在小程序后台配置隐私保护指引', icon: 'none' })
    })
  },

  async save() {
    const name = this.data.name.trim()
    const organization = this.data.organizations[this.data.organizationIndex]
    if (name.length < 2 || !organization) {
      wx.showToast({ title: '请填写姓名并选择所属组织', icon: 'none' })
      return
    }
    if (!this.data.consentAccepted) {
      wx.showToast({ title: '请先阅读并同意资料使用说明', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      let avatarFileID = ''
      let avatarRecordId = ''
      if (this.pendingAvatarFile) {
        const file = this.pendingAvatarFile
        const uploaded = await uploadOrgFile({
          filePath: file.tempFilePath || file.path,
          organizationId: organization.id,
          leaderRole: '成员头像',
          eventName: `${name}成员头像`,
          resourceType: 'user_avatar',
          resourceId: this.data.accountId,
          module: 'contacts',
          size: Number(file.size) || 0
        })
        avatarFileID = uploaded.fileID
        avatarRecordId = uploaded.fileRecord && uploaded.fileRecord.id || ''
      }
      await api.call('saveMyProfile', {
        profile: {
          name,
          organizationId: organization.id,
          avatarFileID,
          avatarRecordId,
          consentAccepted: true
        }
      })
      wx.showToast({ title: '身份资料已提交', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      api.showError(error)
    } finally {
      this.setData({ saving: false })
    }
  }
})
