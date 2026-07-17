const api = require('../../../utils/api')
const orgScope = require('../../../utils/org-scope')
const MEMBER_SYNC_INTERVAL = 5000

const TEAM_COLORS = {
  linghang: { tone: 'green', color: '#24d18f', name: '领航' },
  ailinghang: { tone: 'red', color: '#ff5e7a', name: '爱领航' },
  yuanhang: { tone: 'blue', color: '#4fb0ff', name: '远航' },
  jingying: { tone: 'purple', color: '#b96eff', name: '精英' },
  district: { tone: 'gold', color: '#e3c78e', name: '协作区' },
  all: { tone: 'gold', color: '#e3c78e', name: '协作区' }
}
const PROFESSION_LABELS = { teacher: '教师', nurse: '护士', doctor: '医生' }

function birthdayLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text.match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/)
  if (!match) return text
  return `${Number(match[1])}月${Number(match[2])}日`
}

function decorateMember(member = {}) {
  const teamId = orgScope.normalizeTeamId(member.teamId || member.organizationId || member.defaultOrganizationId || 'district')
  const meta = TEAM_COLORS[teamId] || TEAM_COLORS.district
  return {
    ...member,
    teamId,
    teamTone: meta.tone,
    teamShortName: member.teamShortName || meta.name,
    birthdayLabel: birthdayLabel(member.birthday),
    professionLabel: PROFESSION_LABELS[member.profession] || '',
    memberCodeLabel: member.memberCode || member.accountSuffix || '',
    position: member.position || '成员'
  }
}

Page({
  data: {
    id: '',
    member: {},
    canManage: false
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  async onShow() {
    await this.loadMember()
    this.startMemberSync()
  },

  onHide() {
    this.stopMemberSync()
  },

  onUnload() {
    this.stopMemberSync()
  },

  async loadMember() {
    if (!this.data.id || this._memberSyncing) return
    this._memberSyncing = true
    try {
      const result = await api.call('getMember', { id: this.data.id })
      this.setData({ ...result, member: decorateMember(result.member) })
      wx.setNavigationBarTitle({ title: result.member.name || '狮友详情' })
    } catch (error) {
      if (!['MEMBER_NOT_FOUND', 'NOT_FOUND'].includes(error && error.code)) throw error
      if (!this._memberRemoved) {
        this._memberRemoved = true
        this.setData({ member: {} })
        wx.showToast({ title: '该成员已被删除', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 500)
      }
    } finally {
      this._memberSyncing = false
    }
  },

  startMemberSync() {
    this.stopMemberSync()
    this._memberSyncTimer = setInterval(() => this.loadMember().catch(() => {}), MEMBER_SYNC_INTERVAL)
  },

  stopMemberSync() {
    if (!this._memberSyncTimer) return
    clearInterval(this._memberSyncTimer)
    this._memberSyncTimer = null
  },

  editMember() {
    wx.navigateTo({ url: `/pages/org/edit/index?id=${this.data.id}` })
  }
})
