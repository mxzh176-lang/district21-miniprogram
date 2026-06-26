const api = require('../../utils/api')
const permission = require('../../utils/permission')
const orgScope = require('../../utils/org-scope')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

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
    this.setData({
      members,
      teams: teams.slice(1),
      currentScope,
      teamId: currentScope.teamId || 'all',
      canManage: permission.canPerform(session, 'contacts', 'update') || permission.canPerform(session, 'contacts', 'create')
    })
    this.applyFilter()
  },

  selectTeam(event) {
    const teamId = event.currentTarget.dataset.id
    const currentScope = orgScope.setCurrentScopeByTeamId(teamId)
    this.setData({ teamId, currentScope })
    this.applyFilter()
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
        const text = `${item.name}${item.team}${item.position}`.toLowerCase()
        return teamMatch && (!keyword || text.includes(keyword))
      })
      .sort((a, b) =>
        a.letter.localeCompare(b.letter) ||
        a.name.localeCompare(b.name, 'zh-Hans-CN')
      )

    const map = {}
    filteredMembers.forEach(item => {
      if (!map[item.letter]) map[item.letter] = []
      map[item.letter].push(item)
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

  addMember() {
    wx.navigateTo({ url: '/pages/org/edit/index' })
  }
})
