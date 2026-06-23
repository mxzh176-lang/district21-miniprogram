const api = require('../../../utils/api')

Page({
  data: {
    name: '',
    organizations: [],
    organizationIndex: 0,
    accountId: '',
    accountSuffix: '',
    saving: false
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
        accountSuffix: String(session.id || session._id || '').slice(-6)
      })
    } catch (error) {
      api.showError(error)
    }
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value })
  },

  onOrganizationChange(event) {
    this.setData({ organizationIndex: Number(event.detail.value) })
  },

  async save() {
    const name = this.data.name.trim()
    const organization = this.data.organizations[this.data.organizationIndex]
    if (name.length < 2 || !organization) {
      wx.showToast({ title: '请填写姓名并选择所属组织', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('saveMyProfile', {
        profile: {
          name,
          organizationId: organization.id
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
