const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

const CATEGORY_NAMES = {
  main: '记事本总目录',
  member: '会员发展',
  training: '领导力与培训',
  service: '公益服务',
  plan: '年度服务计划',
  meeting: '会议纪要',
  exchange: '对外交流',
  publicity: '新闻宣传',
  care: '狮友关爱',
  social: '聚会联谊',
  inventory: '物品清单',
  finance: '账目档案',
  captain: '队长——张明星',
  'first-vp': '第一副队长——张芳',
  'second-vp': '第二副队长——双龙',
  'third-vp': '第三副队长——媛媛',
  secretary: '秘书——玲玲',
  tamer: '纠察——振锋',
  treasurer: '司库——文强',
  admin: '总务——腾飞',
  'member-retention': '会员与保留委员会——大奇',
  'leadership-training': '领导力培训委员会——姗姗',
  'external-exchange': '对外交流委员会——丙刚',
  'service-plan': '服务与计划委员会——景辉',
  'news-publicity': '新闻宣传委员会——建鑫',
  'fundraising-plan': '筹款与计划委员会——珊珊',
  'care-committee': '关爱委员会——潘阳阳',
  'fellowship-committee': '联谊委员会——雪峰',
  'annual-meeting': '年会委员会——泉宏'
}

const DEFAULT_FORM_COPY = {
  titlePlaceholder: '请输入本岗位工作记录名称',
  keywordLabel: '记录主题',
  keywordPlaceholder: '请输入本次工作的主题和必要提示',
  keywordExamples: ['工作主题', '参与人员', '完成情况'],
  detailPlaceholder: '请记录工作背景、执行过程、完成情况和后续安排',
  photoTitle: '记录附件',
  photoDescription: '仅上传与本条内部档案直接相关的图片'
}

const HONOR_ELIGIBLE_CATEGORY_IDS = [
  'secretary',
  'treasurer',
  'admin',
  'tamer',
  'member-retention',
  'leadership-training',
  'external-exchange',
  'service-plan',
  'news-publicity',
  'fundraising-plan',
  'care-committee',
  'fellowship-committee',
  'annual-meeting'
]

const HONOR_LEVEL_OPTIONS = [
  { value: 'none', label: '不申报', desc: '仅归档为岗位事件' },
  { value: 'good', label: '优秀', desc: '提交给直属上级确认' },
  { value: 'great', label: '杰出', desc: '提交给直属上级确认' },
  { value: 'excellent', label: '卓越', desc: '提交给直属上级确认' }
]

const PARTICIPANT_TEAMS = [
  { id: 'linghang', cloudId: 'org_team_linghang', name: '领航服务队', shortName: '领航', tone: 'green' },
  { id: 'ailinghang', cloudId: 'org_team_ailinghang', name: '爱领航服务队', shortName: '爱领航', tone: 'red' },
  { id: 'yuanhang', cloudId: 'org_team_yuanhang', name: '远航服务队', shortName: '远航', tone: 'blue' },
  { id: 'jingying', cloudId: 'org_team_jingying', name: '精英服务队', shortName: '精英', tone: 'purple' }
]

const CONFIRM_POSITION_BY_CATEGORY = {
  secretary: '队长',
  treasurer: '队长',
  admin: '队长',
  tamer: '队长',
  'member-retention': '第一副队长',
  'leadership-training': '第一副队长',
  'external-exchange': '第一副队长',
  'service-plan': '第二副队长',
  'news-publicity': '第二副队长',
  'fundraising-plan': '第二副队长',
  'care-committee': '第三副队长',
  'fellowship-committee': '第三副队长',
  'annual-meeting': '第三副队长'
}

const FORM_COPY = {
  'member-retention': copy('例如：六月会员保留沟通记录', '会员工作主题', '请输入会员发展或保留工作主题', ['沟通主题', '负责人', '后续安排'], '仅记录必要的内部沟通与跟进情况，不填写身份证、手机号等非必要个人信息'),
  'leadership-training': copy('例如：逢五相约培训记录', '培训主题', '请输入培训名称或学习主题', ['培训主题', '讲师', '学习成果'], '请记录培训目标、参与情况、主要内容、学习成果和后续实践安排'),
  'external-exchange': copy('例如：服务队交流访问记录', '交流主题', '请输入交流对象和交流主题', ['交流对象', '交流主题', '后续事项'], '请记录交流目的、参与人员、主要内容、达成事项和后续负责人'),
  'service-plan': copy('例如：六月助学走访服务记录', '服务主题', '请输入服务项目、地点和参与情况', ['服务项目', '服务地点', '参与人员'], '请记录服务需求、参与分工、执行过程、完成情况和后续安排'),
  'news-publicity': copy('例如：六月服务资料报送记录', '资料主题', '请输入资料名称和内部报送事项', ['资料名称', '整理人', '报送情况'], '请记录资料来源、内部确认、素材清单、报送范围和留存位置'),
  'fundraising-plan': copy('例如：助学项目经费筹备记录', '经费事项', '请输入内部经费筹备或使用计划', ['经费用途', '预算安排', '凭证位置'], '仅记录组织内部经费筹备、使用计划和凭证留存，不提供公开募捐、支付或交易功能'),
  'care-committee': copy('例如：六月生日关爱记录', '关爱主题', '请输入关爱类型、时间和参与方式', ['关爱类型', '参与方式', '后续跟进'], '请记录关爱安排、参与方式和后续跟进；不填写病情、家庭状况等敏感隐私'),
  'fellowship-committee': copy('例如：六月内部联谊记录', '联谊主题', '请输入内部联谊名称和活动安排', ['联谊主题', '参与人员', '活动安排'], '请记录内部联谊的时间、安排、参与情况、完成情况和后续事项'),
  'annual-meeting': copy('例如：年度会议筹备记录', '年会主题', '请输入年会或年度会议主题', ['会议主题', '流程分工', '总结事项'], '请记录内部年度会议的筹备分工、流程、参与情况和总结事项'),
  secretary: copy('例如：六月服务队例会纪要', '会议主题', '请输入会议名称和主要议题', ['会议主题', '参会人员', '会议决议'], '请记录会议议题、参会人员、会议决议和后续待办'),
  tamer: copy('例如：六月例会纪律执行记录', '纠察事项', '请输入纪律、礼仪或会场秩序事项', ['纪律事项', '执行情况', '改进事项'], '请记录纪律与礼仪要求、现场执行情况和后续改进事项'),
  treasurer: copy('例如：六月财务资料归档记录', '财务事项', '请输入报表、凭证或财务工作主题', ['财务主题', '凭证范围', '核对情况'], '请记录内部财务资料的核对和归档情况；具体收支请使用司库账目模块'),
  admin: copy('例如：六月例会后勤保障记录', '后勤事项', '请输入物资、场地或后勤保障主题', ['保障事项', '物资清单', '完成情况'], '请记录物资、场地、车辆或其他内部后勤工作的准备和完成情况'),
  captain: copy('例如：年度重点工作推进记录', '统筹主题', '请输入年度方向或重点工作主题', ['工作主题', '岗位分工', '推进结果'], '请记录年度方向、岗位分工、推进情况、决议和后续安排'),
  'first-vp': copy('例如：第一副队长团队月度工作记录', '团队工作主题', '请输入会员、培训或交流工作主题', ['工作主题', '责任岗位', '完成情况'], '请按实际工作记录会员发展、培训或交流事项，不混用其他委员会模板'),
  'second-vp': copy('例如：第二副队长团队月度工作记录', '团队工作主题', '请输入服务、资料或经费工作主题', ['工作主题', '责任岗位', '完成情况'], '请按实际工作记录服务计划、资料报送或内部经费事项，不默认套用公益服务模板'),
  'third-vp': copy('例如：第三副队长团队月度工作记录', '团队工作主题', '请输入关爱、联谊或年会工作主题', ['工作主题', '责任岗位', '完成情况'], '请按实际工作记录关爱、联谊或年会事项，不在同一记录中混写不同类别')
}

function copy(titlePlaceholder, keywordLabel, keywordPlaceholder, keywordExamples, detailPlaceholder) {
  return { ...DEFAULT_FORM_COPY, titlePlaceholder, keywordLabel, keywordPlaceholder, keywordExamples, detailPlaceholder }
}

function uniquePhotos(photos) {
  const seen = new Set()
  return (photos || []).filter(photo => {
    const value = String(photo || '').trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function normalizeTeamId(value) {
  return String(value || '').replace(/^org_team_/, '')
}

function normalizeParticipantName(value) {
  const text = String(value || '').trim()
  const match = text.match(/（([^）]+)）|\(([^)]+)\)/)
  return (match && (match[1] || match[2]) || text).trim()
}

function participantId(member) {
  return String(member.id || member._id || `${member.teamId || member.organizationId}-${member.name}`)
}

function selectedIdsFromParticipants(participants = []) {
  const ids = []
  participants.forEach(group => {
    ;(group.members || []).forEach(member => {
      const id = String(member.id || member._id || '')
      if (id) ids.push(id)
    })
  })
  return ids
}

Page({
  data: {
    id: '',
    organizationId: '',
    categoryId: '',
    positionId: '',
    organizationName: '',
    categoryName: '',
    canEdit: false,
    canUpload: false,
    form: {
      date: '',
      title: '',
      location: '',
      participantCount: '',
      keywords: '',
      summary: '',
      content: '',
      uploadedBy: '',
      photoCount: 0,
      photos: []
    },
    participantTeams: [],
    participantMembers: [],
    selectedParticipantIds: [],
    legacyParticipantNote: '',
    honorOptions: HONOR_LEVEL_OPTIONS,
    honorRequestedLevel: 'none',
    honorEligible: false,
    confirmPositionName: '',
    templateApplied: false,
    formCopy: DEFAULT_FORM_COPY
  },

  async onLoad(options) {
    const [member, organizations, participantMembers] = await Promise.all([
      api.call('getSession'),
      api.call('listArchives'),
      api.call('listOrg')
    ])
    const organization = organizations.find(
      (item) => item.id === (options.organization || 'yuanhang')
    ) || organizations[0]
    const categoryId = options.category || 'service'
    const position = permission.findArchivePosition(organization, categoryId)
    const baseData = {
      id: options.id || '',
      organizationId: organization.id,
      categoryId,
      positionId: position && (position.positionId || position.id) || categoryId,
      organizationName: organization.name,
      categoryName: position ? position.name : CATEGORY_NAMES[options.category] || '档案事件',
      canEdit: permission.canMaintainArchive(member, organization, categoryId, options.id ? 'update' : 'create'),
      canUpload: permission.hasPortPermission(member, 'history', 'upload', {
        organizationId: organization.id,
        cloudOrganizationId: organization.cloudId,
        positionId: position && (position.positionId || position.id)
      }) || (!permission.activePortPermissions(member).length && permission.canMaintainArchive(member, organization, categoryId, 'update')),
      honorEligible: !options.id && HONOR_ELIGIBLE_CATEGORY_IDS.includes(categoryId),
      honorRequestedLevel: 'none',
      confirmPositionName: CONFIRM_POSITION_BY_CATEGORY[categoryId] || '',
      formCopy: FORM_COPY[categoryId] || DEFAULT_FORM_COPY,
      'form.date': this.formatDate(new Date()),
      'form.uploadedBy': member.name || member.nickname || '当前岗位负责人',
      participantMembers,
      participantTeams: this.buildParticipantTeams(participantMembers, [])
    }
    this.setData(baseData)
    if (options.id) {
      const entry = await api.call('getArchiveEntry', { id: options.id })
      const selectedParticipantIds = selectedIdsFromParticipants(entry.participants)
      const legacyParticipantNote = !selectedParticipantIds.length && Number(entry.participantCount) > 0
        ? `旧记录仅保存了 ${entry.participantCount} 人，未保存参与人名单；可在此补选。`
        : ''
      this.setData({
        form: {
          date: entry.date || '',
          title: entry.title || '',
          location: entry.location || '',
          participantCount: selectedParticipantIds.length ? String(selectedParticipantIds.length) : (entry.participantCount === undefined ? '' : String(entry.participantCount)),
          keywords: (entry.keywords || []).join(' '),
          summary: entry.summary || '',
          content: entry.content || '',
          uploadedBy: entry.uploadedBy || member.nickname,
          photoCount: (entry.photos || []).length,
          photos: entry.photos || []
        },
        selectedParticipantIds,
        legacyParticipantNote,
        participantTeams: this.buildParticipantTeams(participantMembers, selectedParticipantIds)
      })
    }
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  onDateChange(event) {
    this.setData({ 'form.date': event.detail.value })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  buildParticipantTeams(members = [], selectedIds = []) {
    const selectedSet = new Set(selectedIds.map(String))
    const expandedMap = {}
    ;(this.data.participantTeams || []).forEach(team => {
      expandedMap[team.id] = Boolean(team.expanded)
    })
    const teams = PARTICIPANT_TEAMS.map(team => ({
      ...team,
      members: [],
      selectedCount: 0,
      expanded: Boolean(expandedMap[team.id])
    }))
    const teamMap = {}
    teams.forEach(team => { teamMap[team.id] = team })
    members.forEach(member => {
      const teamId = normalizeTeamId(member.teamId || member.organizationId || member.defaultOrganizationId)
      const team = teamMap[teamId]
      if (!team) return
      const id = participantId(member)
      const name = normalizeParticipantName(member.name || member.nickname)
      if (!id || !name) return
      const checked = selectedSet.has(String(id))
      team.members.push({
        id,
        name,
        teamId: team.id,
        teamName: team.name,
        checked
      })
      if (checked) team.selectedCount += 1
    })
    teams.forEach(team => {
      team.members.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    })
    return teams
  },

  syncParticipantTeams(selectedIds) {
    this.setData({
      selectedParticipantIds: selectedIds,
      'form.participantCount': String(selectedIds.length),
      legacyParticipantNote: '',
      participantTeams: this.buildParticipantTeams(this.data.participantMembers, selectedIds)
    })
  },

  toggleParticipantTeam(event) {
    const teamId = event.currentTarget.dataset.teamId
    const participantTeams = this.data.participantTeams.map(team => {
      if (team.id !== teamId) return team
      return { ...team, expanded: !team.expanded }
    })
    this.setData({ participantTeams })
  },

  toggleParticipant(event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    const selected = new Set(this.data.selectedParticipantIds.map(String))
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    this.syncParticipantTeams(Array.from(selected))
  },

  selectedParticipantsPayload() {
    const selected = new Set(this.data.selectedParticipantIds.map(String))
    return this.data.participantTeams
      .map(team => ({
        teamId: team.id,
        teamName: team.name,
        members: team.members
          .filter(member => selected.has(String(member.id)))
          .map(member => ({ id: member.id, name: member.name }))
      }))
      .filter(team => team.members.length)
  },

  choosePhotos() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        wx.showLoading({ title: '正在保存照片' })
        const saved = []
        for (const file of result.tempFiles) {
          try {
            const item = await new Promise((resolve, reject) => {
              wx.saveFile({
                tempFilePath: file.tempFilePath,
                success: resolve,
                fail: reject
              })
            })
            saved.push(item.savedFilePath)
          } catch (error) {
            saved.push(file.tempFilePath)
          }
        }
        const photos = uniquePhotos((this.data.form.photos || []).concat(saved)).slice(0, 9)
        this.setData({
          'form.photos': photos,
          'form.photoCount': photos.length
        })
        wx.hideLoading()
      }
    })
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const photos = this.data.form.photos.filter((item, photoIndex) => photoIndex !== index)
    this.setData({ 'form.photos': photos, 'form.photoCount': photos.length })
  },

  applyTemplate() {
    const { form, categoryName, organizationName, categoryId } = this.data
    const keywords = form.keywords.trim()
    if (!keywords) {
      wx.showToast({ title: '请先输入事件提示词', icon: 'none' })
      return
    }
    const owner = form.uploadedBy || '负责人'
    const templates = {
      'member-retention': {
        title: `${owner}狮兄狮姐跟进${keywords}加入远航的意向`,
        summary: `${organizationName}记录新狮友或意向参与人员的来源、兴趣方向和后续跟进情况。`,
        content: `记录日期：${form.date}\n所属组织：${organizationName}\n档案分类：会员发展与保留\n负责人：${owner}\n\n一、姓名或称呼：请补充\n二、认识渠道：朋友介绍／公益活动／媒体平台／其他\n三、介绍人或联系人：请补充\n四、关注的公益方向：请补充\n五、是否愿意参加近期服务：是／待考虑／暂不参加\n六、适合参与的活动或岗位：请补充\n七、后续联系时间与负责人：请补充\n八、沟通备注：请仅记录必要信息，不填写身份证等敏感资料。`
      },
      'leadership-training': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}培训`,
        summary: `${organizationName}围绕“${keywords}”形成领导力培训记录。`,
        content: `培训日期：${form.date}\n培训主题：${keywords}\n组织人：${owner}\n\n一、培训目标：请补充\n二、讲师与参与人员：请补充\n三、课程内容：请补充\n四、学习成果：请补充\n五、后续实践计划：请补充。`
      },
      'external-exchange': {
        title: `${owner}狮兄狮姐开展远航${keywords}对外交流`,
        summary: `${organizationName}围绕“${keywords}”开展对外交流并形成后续合作清单。`,
        content: `交流日期：${form.date}\n交流对象：请补充\n负责人：${owner}\n\n一、交流背景与目的：请补充\n二、参与人员：请补充\n三、交流内容：请补充\n四、达成共识：请补充\n五、后续合作与负责人：请补充。`
      },
      'service-plan': {
        title: `${owner}狮兄狮姐带领远航开展${keywords}服务`,
        summary: `${organizationName}完成“${keywords}”公益服务并形成服务档案。`,
        content: `服务日期：${form.date}\n服务项目：${keywords}\n负责人：${owner}\n\n一、服务对象与需求：请补充\n二、服务地点：请补充\n三、参与狮友与分工：请补充\n四、服务过程：请补充\n五、服务成果：请补充\n六、后续计划：请补充。`
      },
      'news-publicity': {
        title: `${owner}狮兄狮姐完成远航${keywords}资料整理`,
        summary: `${organizationName}完成“${keywords}”资料整理、内部确认和报送留存。`,
        content: `归档日期：${form.date}\n资料主题：${keywords}\n负责人：${owner}\n\n一、资料来源：请补充\n二、内部确认人：请补充\n三、文字与图片清单：请补充\n四、报送对象与范围：请补充\n五、资料留存位置：请补充\n六、后续改进：请补充。`
      },
      'fundraising-plan': {
        title: `${owner}狮兄狮姐完成远航${keywords}经费筹备记录`,
        summary: `${organizationName}形成“${keywords}”内部经费筹备与使用计划档案。`,
        content: `记录日期：${form.date}\n经费事项：${keywords}\n负责人：${owner}\n\n一、内部工作用途：请补充\n二、预算与资金安排：请补充\n三、内部确认情况：请补充\n四、经办与核对人员：请补充\n五、凭证归档位置：请补充\n六、后续事项：请补充\n\n说明：本模块仅用于组织内部档案留存，不提供公开募捐、支付或交易功能。`
      },
      'care-committee': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}关爱`,
        summary: `${organizationName}形成“${keywords}”狮友关爱记录。`,
        content: `关爱日期：${form.date}\n关爱主题：${keywords}\n负责人：${owner}\n\n一、关爱对象：请按最小必要原则填写\n二、关爱原因：请补充\n三、参与人员与方式：请补充\n四、关爱结果：请补充\n五、后续跟进：请补充\n六、隐私提示：敏感健康和家庭信息不得公开展示。`
      },
      'fellowship-committee': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}联谊`,
        summary: `${organizationName}完成“${keywords}”团队联谊记录。`,
        content: `活动日期：${form.date}\n联谊主题：${keywords}\n负责人：${owner}\n\n一、参与人员：请补充\n二、活动安排：请补充\n三、现场情况：请补充\n四、团队反馈：请补充\n五、后续安排：请补充。`
      },
      'annual-meeting': {
        title: `${owner}狮兄狮姐组织远航召开${keywords}年会`,
        summary: `${organizationName}形成“${keywords}”年会筹备与执行记录。`,
        content: `记录日期：${form.date}\n年会主题：${keywords}\n负责人：${owner}\n\n一、时间地点：请补充\n二、流程与分工：请补充\n三、参与人员：请补充\n四、预算与物资：请补充\n五、现场成果：请补充\n六、后续总结：请补充。`
      },
      'second-vp': {
        title: `${owner}狮兄狮姐推进远航${keywords}工作`,
        summary: `${organizationName}形成“${keywords}”第二副队长团队工作档案。`,
        content: `记录日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n一、工作类别：服务计划／资料报送／经费筹备\n二、工作目标：请补充\n三、责任岗位与参与人员：请补充\n四、执行情况：请补充\n五、完成结果：请补充\n六、后续事项：请补充。`
      },
      secretary: {
        title: `${owner}狮姐组织召开远航服务队${keywords}`,
        summary: `${organizationName}召开“${keywords}”，形成会议纪要、会议决议和后续待办。`,
        content: `会议日期：${form.date}\n会议组织：${organizationName}\n档案分类：${categoryName}\n记录人：${owner}\n\n一、会议主题：${keywords}\n二、参会人员：请补充\n三、会议议题：请补充\n四、会议决议：请补充\n五、后续待办：请补充。`
      },
      'first-vp': {
        title: `${owner}狮兄狮姐推进远航${keywords}工作`,
        summary: `${organizationName}形成“${keywords}”第一副队长团队工作档案。`,
        content: `记录日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n一、工作类别：会员发展／培训／对外交流\n二、工作目标：请补充\n三、责任岗位与参与人员：请补充\n四、执行情况：请补充\n五、完成结果：请补充\n六、后续事项：请补充。`
      },
      'third-vp': {
        title: `${owner}狮兄狮姐组织远航开展${keywords}`,
        summary: `${organizationName}围绕“${keywords}”开展关爱、联谊或年会相关工作。`,
        content: `记录日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n一、工作类别：关爱／联谊／年会\n二、工作目标：请补充\n三、责任岗位与参与人员：请补充\n四、执行情况：请补充\n五、完成结果：请补充\n六、后续事项：请补充。`
      },
      captain: {
        title: `${owner}狮兄狮姐推进远航${keywords}`,
        summary: `${organizationName}形成“${keywords}”队长统筹工作记录。`,
        content: `记录日期：${form.date}\n统筹主题：${keywords}\n负责人：${owner}\n\n一、工作背景与目标：请补充\n二、岗位分工：请补充\n三、推进情况：请补充\n四、形成决议：请补充\n五、后续安排：请补充。`
      },
      tamer: {
        title: `${owner}狮兄狮姐完成远航${keywords}纠察记录`,
        summary: `${organizationName}形成“${keywords}”纪律、礼仪与会场秩序档案。`,
        content: `记录日期：${form.date}\n纠察事项：${keywords}\n负责人：${owner}\n\n一、纪律与礼仪要求：请补充\n二、现场执行情况：请补充\n三、提醒事项：请补充\n四、完成结果：请补充\n五、后续改进：请补充。`
      },
      treasurer: {
        title: `${owner}狮兄狮姐完成远航${keywords}财务资料归档`,
        summary: `${organizationName}形成“${keywords}”财务资料核对与归档记录。`,
        content: `记录日期：${form.date}\n财务事项：${keywords}\n负责人：${owner}\n\n一、资料范围：请补充\n二、核对人员：请补充\n三、核对结果：请补充\n四、凭证留存位置：请补充\n五、后续事项：请补充\n\n说明：具体收支记录请使用司库账目模块。`
      },
      admin: {
        title: `${owner}狮兄狮姐完成远航${keywords}后勤保障`,
        summary: `${organizationName}形成“${keywords}”物资与后勤保障记录。`,
        content: `记录日期：${form.date}\n保障事项：${keywords}\n负责人：${owner}\n\n一、场地与时间：请补充\n二、物资清单：请补充\n三、人员分工：请补充\n四、完成情况：请补充\n五、后续补充事项：请补充。`
      }
    }
    const fallback = {
      title: `${owner}狮兄狮姐完成远航${categoryName}：${keywords}`,
      summary: `${organizationName}围绕“${keywords}”完成${categoryName}相关记录。`,
      content: `事件日期：${form.date}\n所属组织：${organizationName}\n档案分类：${categoryName}\n负责人：${owner}\n\n请补充工作背景、执行过程、完成情况和后续改进。`
    }
    const draft = templates[categoryId] || fallback
    this.setData({
      'form.title': form.title || draft.title,
      'form.summary': form.summary || draft.summary,
      'form.content': form.content || draft.content,
      templateApplied: true
    })
    wx.showToast({ title: '记录模板已填充', icon: 'success' })
  },

  validate() {
    const { date, title, location, content } = this.data.form
    if (!date || !title.trim() || !location.trim() || !content.trim()) {
      wx.showToast({ title: '请完整填写事件必填项', icon: 'none' })
      return false
    }
    if (!this.data.selectedParticipantIds.length) {
      wx.showToast({ title: '请勾选参与狮友', icon: 'none' })
      return false
    }
    return true
  },

  onHonorChange(event) {
    this.setData({ honorRequestedLevel: event.currentTarget.dataset.value || 'none' })
  },

  async saveEntry() {
    const { id, form, organizationId, categoryId, positionId, organizationName, categoryName, honorRequestedLevel, honorEligible } = this.data
    const requestedLevel = honorEligible ? honorRequestedLevel : 'none'
    const participants = this.selectedParticipantsPayload()
    const participantCount = participants.reduce((sum, team) => sum + team.members.length, 0)
    const entry = await api.call('saveArchiveEntry', {
      entry: {
        _id: id || undefined,
        organizationId,
        categoryId,
        positionId,
        date: form.date,
        dateLabel: form.date,
        title: form.title.trim(),
        location: form.location.trim(),
        participantCount,
        participants,
        team: organizationName,
        uploadedBy: form.uploadedBy,
        uploaderRole: categoryName,
        status: requestedLevel === 'none' ? 'published' : 'pending_leader_confirm',
        eventStatus: requestedLevel === 'none' ? 'archived' : 'pending_leader_confirm',
        honorRequestedLevel: requestedLevel,
        honorStatus: requestedLevel === 'none' ? 'none' : 'pending_leader_confirm',
        photoCount: form.photoCount,
        photos: uniquePhotos(form.photos),
        tone: 'blue',
        keywords: form.keywords.split(/[，,\s]+/).filter(Boolean),
        summary: form.summary.trim(),
        content: form.content.trim()
      }
    })
    if (entry) {
      const photos = uniquePhotos(entry.photos)
      this.setData({
        id: entry._id || id,
        'form.photos': photos,
        'form.photoCount': photos.length
      })
    }
    return entry
  },

  async saveEvent() {
    if (!this.validate()) return
    try {
      await this.saveEntry()
      wx.showToast({ title: '事件已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (error) {
      api.showError(error)
    }
  }
})
