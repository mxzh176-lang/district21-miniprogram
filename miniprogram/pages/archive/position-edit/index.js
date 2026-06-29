const api = require('../../../utils/api')

Page({
  data: {
    organizationId: '',
    positionId: '',
    name: '',
    memberName: '',
    memberId: '',
    users: [],
    userIndex: 0,
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    loading: true,
    saving: false
  },

  async onLoad(options) {
    const organizationId = decodeURIComponent(options.organizationId || '')
    const positionId = decodeURIComponent(options.positionId || '')
    this.setData({ organizationId, positionId })
    try {
      const [directory, platformUsers] = await Promise.all([
        api.call('listPositionDirectory', { organizationId }),
        api.call('listPlatformUsers')
      ])
      const position = directory.find(item => item.id === positionId)
      if (!position || !position.canEdit) {
        wx.showToast({ title: '当前账号没有修改权限', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 700)
        return
      }
      const users = platformUsers
        .filter(item => item.profileCompleted && item.defaultOrganizationId && item.name && !item.name.startsWith('待认证用户'))
        .map(item => ({
          ...item,
          displayName: `${item.name} · ${item.memberCode || item.accountSuffix || String(item.id).slice(-6)}`
        }))
      const matchedUserIndex = users.findIndex(item => item.id === position.userId)
      const userIndex = Math.max(0, matchedUserIndex)
      const selectedUser = users[userIndex]
      this.setData({
        name: position.name,
        memberName: selectedUser
          ? selectedUser.name
          : position.person === '待授权' ? '' : position.person,
        memberId: selectedUser ? selectedUser.id : '',
        users,
        userIndex,
        startDate: position.startDate || this.data.startDate,
        endDate: position.endDate || this.data.endDate,
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      api.showError(error)
    }
  },

  onNameInput(event) { this.setData({ name: event.detail.value }) },
  onUserChange(event) {
    const userIndex = Number(event.detail.value)
    const user = this.data.users[userIndex]
    this.setData({
      userIndex,
      memberId: user && user.id || '',
      memberName: user && user.name || this.data.memberName
    })
  },
  onStartDateChange(event) { this.setData({ startDate: event.detail.value }) },
  onEndDateChange(event) { this.setData({ endDate: event.detail.value }) },

  async save() {
    const name = this.data.name.trim()
    const memberName = this.data.memberName.trim()
    if (!name || !memberName || !this.data.memberId) {
      wx.showToast({ title: '请选择职务负责人', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.call('savePositionDirectory', {
        position: {
          id: this.data.positionId,
          organizationId: this.data.organizationId,
          name,
          memberName,
          memberId: this.data.memberId,
          startDate: this.data.startDate,
          endDate: this.data.endDate
        }
      })
      wx.showToast({ title: '岗位资料已更新', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 300)
    } catch (error) {
      api.showError(error)
    } finally {
      this.setData({ saving: false })
    }
  }
})
