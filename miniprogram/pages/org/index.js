const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const MEMBER_SYNC_INTERVAL = 5000
const TEAM_COLORS = {
  linghang: { tone: 'green', color: '#24d18f', name: '领航' },
  ailinghang: { tone: 'red', color: '#ff5e7a', name: '爱领航' },
  yuanhang: { tone: 'blue', color: '#4fb0ff', name: '远航' },
  jingying: { tone: 'purple', color: '#b96eff', name: '精英' },
  district: { tone: 'gold', color: '#e3c78e', name: '协作区' },
  all: { tone: 'gold', color: '#e3c78e', name: '协作区' }
}

function normalizeTeamId(value) {
  return orgScope.normalizeTeamId(value || 'district') || 'district'
}

function birthdayLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text.match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/)
  if (!match) return text
  return `${Number(match[1])}月${Number(match[2])}日`
}

Page({
  data: {
    members: [],
    filteredMembers: [],
    groups: [],
    teams: [],
    teamId: 'all',
    currentScope: orgScope.ORG_OPTIONS[0],
    keyword: '',
    alphabet: ALPHABET.map(letter => ({ letter, available: false })),
    availableLetters: [],
    activeLetter: '',
    scrollIntoView: '',
    groupOffsets: [],
    canManage: false
  },

  async onShow() {
    const currentScope = orgScope.getCurrentScope()
    const [members, teams, session] = await Promise.all([
      api.call('listOrg'),
      api.call('listTeams'),
      api.call('getSession')
    ])
    this.session = session
    const serviceTeams = teams.slice(1)
    this.setData({
      members: this.decorateMembers(members),
      teams: serviceTeams.map(item => {
        const meta = TEAM_COLORS[normalizeTeamId(item.id)] || TEAM_COLORS.district
        return { ...item, tone: meta.tone, color: item.color || meta.color }
      }),
      currentScope,
      teamId: currentScope.teamId || 'all',
      canManage: serviceTeams.some(item => {
        const organizationId = item.cloudId || item.id
        return permission.canPerform(session, 'contacts', 'create', {
          organizationId,
          cloudOrganizationId: organizationId,
          teamId: item.id
        })
      })
    })
    this.applyFilter()
    this.startMemberSync()
  },

  onHide() {
    this.stopMemberSync()
  },

  onUnload() {
    this.stopMemberSync()
  },

  startMemberSync() {
    this.stopMemberSync()
    this._memberSyncTimer = setInterval(() => {
      this.refreshMembers().catch(() => {})
    }, MEMBER_SYNC_INTERVAL)
  },

  stopMemberSync() {
    if (!this._memberSyncTimer) return
    clearInterval(this._memberSyncTimer)
    this._memberSyncTimer = null
  },

  async refreshMembers() {
    if (this._memberSyncing) return
    this._memberSyncing = true
    try {
      const members = await api.call('listOrg', {}, { forceRefresh: true })
      this.setData({ members: this.decorateMembers(members) })
      this.applyFilter()
    } finally {
      this._memberSyncing = false
    }
  },

  decorateMembers(members = []) {
    return members.map(item => {
      const teamId = normalizeTeamId(item.teamId || item.organizationId || item.defaultOrganizationId)
      const meta = TEAM_COLORS[teamId] || TEAM_COLORS.district
      const teamShortName = item.teamShortName || meta.name
      return {
        ...item,
        teamId,
        teamTone: meta.tone,
        teamColor: item.teamColor || meta.color,
        teamShortName,
        displayName: `${teamShortName}-${item.name}`,
        birthdayLabel: birthdayLabel(item.birthday),
        memberCodeLabel: item.memberCode || item.accountSuffix || '',
        position: item.position || '成员',
        canManageMember: permission.canPerform(this.session, 'contacts', 'update', {
          organizationId: item.organizationId || item.defaultOrganizationId,
          cloudOrganizationId: item.organizationId || item.defaultOrganizationId,
          teamId
        })
      }
    })
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.id
    const currentScope = orgScope.setCurrentScopeByTeamId(teamId)
    this.setData({ teamId, currentScope })
    this.applyFilter()
  },

  chooseOrgScope() {
    wx.showActionSheet({
      itemList: orgScope.ORG_OPTIONS.map(item => item.orgName),
      success: result => {
        const currentScope = orgScope.setCurrentScope(orgScope.ORG_OPTIONS[result.tapIndex])
        this.setData({ currentScope, teamId: currentScope.teamId || 'all' })
        this.applyFilter()
      }
    })
  },

  search(event) {
    this.setData({ keyword: event.detail.value })
    this.applyFilter()
  },

  applyFilter() {
    const keyword = this.data.keyword.trim().toLowerCase()
    const filteredMembers = this.data.members
      .filter(item => {
        const teamMatch = this.data.teamId === 'all' || item.teamId === this.data.teamId
        const text = `${item.name}${item.team}${item.teamShortName}${item.position}${item.memberCodeLabel}`.toLowerCase()
        return teamMatch && (!keyword || text.includes(keyword))
      })
      .sort((a, b) =>
        String(a.letter || '#').localeCompare(String(b.letter || '#')) ||
        a.name.localeCompare(b.name, 'zh-Hans-CN')
      )

    const map = {}
    filteredMembers.forEach(item => {
      const letter = item.letter || '#'
      if (!map[letter]) map[letter] = []
      map[letter].push(item)
    })
    const groups = Object.keys(map).sort().map(letter => ({ letter, members: map[letter] }))
    let offset = 0
    const groupOffsets = groups.map(group => {
      const current = { letter: group.letter, offset }
      offset += 66 + group.members.length * 126
      return current
    })
    const availableLetters = groups.map(item => item.letter)
    this.setData({
      filteredMembers,
      groups,
      groupOffsets,
      availableLetters,
      alphabet: ALPHABET.map(letter => ({ letter, available: availableLetters.includes(letter) })),
      activeLetter: availableLetters[0] || '',
      scrollIntoView: ''
    })
  },

  selectLetter(event) {
    const letter = event.currentTarget.dataset.letter
    if (!this.data.availableLetters.includes(letter)) return
    this.setData({ activeLetter: letter, scrollIntoView: `letter-${letter}` })
  },

  onContactScroll(event) {
    const scrollTop = event.detail.scrollTop
    let activeLetter = this.data.activeLetter
    this.data.groupOffsets.forEach(item => {
      if (scrollTop + 30 >= item.offset) activeLetter = item.letter
    })
    if (activeLetter !== this.data.activeLetter) this.setData({ activeLetter })
  },

  openMember(event) {
    wx.navigateTo({ url: `/pages/org/detail/index?id=${event.currentTarget.dataset.id}` })
  },

  editMember(event) {
    wx.navigateTo({ url: `/pages/org/edit/index?id=${event.currentTarget.dataset.id}` })
  },

  addMember() {
    wx.navigateTo({ url: '/pages/org/edit/index' })
  }
})
