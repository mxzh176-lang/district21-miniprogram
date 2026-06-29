const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const SURNAME_LETTERS = {
  安: 'A', 白: 'B', 陈: 'C', 崔: 'C', 丁: 'D', 董: 'D', 付: 'F', 冯: 'F',
  高: 'G', 郭: 'G', 关: 'G', 韩: 'H', 何: 'H', 胡: 'H', 黄: 'H',
  荆: 'J', 景: 'J', 姜: 'J', 孔: 'K', 李: 'L', 刘: 'L', 吕: 'L',
  梁: 'L', 林: 'L', 米: 'M', 马: 'M', 潘: 'P', 彭: 'P', 任: 'R',
  宋: 'S', 孙: 'S', 滕: 'T', 田: 'T', 王: 'W', 吴: 'W', 徐: 'X',
  许: 'X', 谢: 'X', 杨: 'Y', 姚: 'Y', 张: 'Z', 赵: 'Z', 周: 'Z'
}

Page({
  data: {
    id: '',
    teams: [],
    teamIndex: 0,
    canManage: false,
    form: {
      name: '',
      position: '',
      birthday: '',
      company: '',
      industry: '',
      resource: '',
      benefit: '',
      companyAddress: '',
      phone: '',
      avatarUrl: ''
    }
  },

  async onLoad(options) {
    this.session = null
    const [session, teams] = await Promise.all([
      api.call('getSession'),
      api.call('listTeams')
    ])
    this.session = session
    const serviceTeams = teams.slice(1)
    const defaultOrganizationId = serviceTeams[0] && (serviceTeams[0].cloudId || serviceTeams[0].id)
    this.setData({
      id: options.id || '',
      teams: serviceTeams,
      canManage: permission.canPerform(session, 'contacts', options.id ? 'update' : 'create', {
        organizationId: defaultOrganizationId,
        cloudOrganizationId: defaultOrganizationId
      })
    })
    if (options.id) {
      const result = await api.call('getMember', { id: options.id })
      const teamIndex = Math.max(
        0,
        serviceTeams.findIndex(item =>
          item.id === result.member.teamId ||
          item.cloudId === result.member.organizationId ||
          item.cloudId === result.member.defaultOrganizationId
        )
      )
      const memberOrganizationId = result.member.organizationId || result.member.defaultOrganizationId || (serviceTeams[teamIndex] && serviceTeams[teamIndex].cloudId)
      this.setData({
        form: result.member,
        teamIndex,
        canManage: Boolean(result.canManage) || permission.canPerform(session, 'contacts', 'update', {
          organizationId: memberOrganizationId,
          cloudOrganizationId: memberOrganizationId,
          teamId: result.member.teamId
        })
      })
    }
  },

  onInput(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  onTeamChange(event) {
    this.setData({ teamIndex: Number(event.detail.value) })
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: result => {
        const tempFilePath = result.tempFiles[0].tempFilePath
        wx.saveFile({
          tempFilePath,
          success: saved => this.setData({ 'form.avatarUrl': saved.savedFilePath }),
          fail: () => this.setData({ 'form.avatarUrl': tempFilePath })
        })
      }
    })
  },

  async save() {
    const { form, teams, teamIndex, id } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写成员姓名', icon: 'none' })
      return
    }
    const birthday = String(form.birthday || '').trim()
    if (birthday && !/^(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/.test(birthday)) {
      wx.showToast({ title: '生日请按 MM-DD 填写', icon: 'none' })
      return
    }
    const team = teams[teamIndex]
    if (!team) {
      wx.showToast({ title: '请选择所属服务队', icon: 'none' })
      return
    }
    const normalizedBirthday = birthday
      ? birthday.split('-').map(part => part.padStart(2, '0')).join('-')
      : ''
    await api.call('saveMember', {
      member: {
        ...form,
        _id: id || form._id,
        name: form.name.trim(),
        birthday: normalizedBirthday,
        letter: SURNAME_LETTERS[form.name.trim().slice(0, 1)] || '#',
        team: team.name,
        teamId: team.id,
        organizationId: team.cloudId || team.id,
        initial: form.name.trim().slice(0, 1),
        avatarTone: form.avatarTone || 'green'
      }
    })
    wx.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 700)
  }
})
