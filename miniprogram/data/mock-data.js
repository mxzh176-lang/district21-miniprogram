const teams = [
  { id: 'district', name: '二十一协作区', shortName: '协作区', color: '#b1843d', members: 120 },
  { id: 'linghang', name: '领航服务队', shortName: '领航', color: '#2f6d5d', members: 31 },
  { id: 'ailinghang', name: '爱领航服务队', shortName: '爱领航', color: '#b55d57', members: 29 },
  { id: 'yuanhang', name: '远航服务队', shortName: '远航', color: '#346b8c', members: 32 },
  { id: 'jingying', name: '精英服务队', shortName: '精英', color: '#7a5b91', members: 28 }
]

const tasks = [
  { _id: 'task-1', month: '2026-06', day: '14', category: '公益服务', title: '暖阳助学走访', team: '二十一协作区', teamId: 'district', owner: '服务委员会', location: '绥化市北林区', status: 'pending', priority: 'important', description: '四队联合走访困难学生家庭，确认暑期助学物资与学习需求。' },
  { _id: 'task-2', month: '2026-06', day: '18', category: '狮友关爱', title: '住院狮友慰问', team: '爱领航服务队', teamId: 'ailinghang', owner: '关爱主席', location: '绥化市第一医院', status: 'pending', priority: 'important', description: '具体关爱信息仅对授权岗位显示，普通成员仅查看时间和集合安排。' },
  { _id: 'task-3', month: '2026-06', day: '21', category: '狮友生日', title: '六月狮友集体生日会', team: '领航服务队', teamId: 'linghang', owner: '联谊委员会', location: '绥化市兰西路活动中心', status: 'pending', priority: 'normal', description: '本月共有8位狮友生日，准备祝福卡片和纪念合影。' },
  { _id: 'task-4', month: '2026-06', day: '25', category: '聚会联谊', title: '四队夏季交流联谊', team: '二十一协作区', teamId: 'district', owner: '联谊委员会', location: '绥化市森林公园', status: 'pending', priority: 'normal', description: '四个服务队联合交流，预计80人参加。' },
  { _id: 'task-5', month: '2026-06', day: '28', category: '会议培训', title: '2026—2027年度岗位交接会', team: '二十一协作区', teamId: 'district', owner: '秘书处', location: '协作区会议室', status: 'pending', priority: 'urgent', description: '确认新一届岗位任职、系统权限及资料交接。' },
  { _id: 'task-6', month: '2026-06', day: '08', category: '公益服务', title: '社区爱心衣物整理', team: '精英服务队', teamId: 'jingying', owner: '张海峰', location: '祥和社区', status: 'done', priority: 'normal', description: '完成衣物分类、消毒和社区发放，共服务46户家庭。' }
]

const activities = [
  { _id: 'event-1', title: '圆梦助学·春季走访', type: '公益服务', team: '二十一协作区', teamId: 'district', date: '2026-05-24', dateLabel: '2026年5月24日', location: '绥化市北林区', owner: '李明浩', participants: '四队共36名狮友', photoCount: 42, tone: 'green', mark: '助学', description: '四个服务队联合走访困难学生家庭，为孩子们送去学习用品，并建立长期助学档案。', summary: '本次共走访12户家庭，确认6名长期帮扶学生。后续由服务委员会按季度回访。' },
  { _id: 'event-2', title: '致敬老兵慰问行动', type: '公益服务', team: '远航服务队', teamId: 'yuanhang', date: '2026-04-19', dateLabel: '2026年4月19日', location: '绥化市光荣院', owner: '徐双龙', participants: '远航服务队22名狮友', photoCount: 28, tone: 'blue', mark: '敬老', description: '看望退伍老兵，聆听历史故事，为老人送去生活物资和陪伴。', summary: '活动形成长期结对计划，每季度安排一次慰问与健康关怀。' },
  { _id: 'event-3', title: '城市清洁红色行动', type: '公益服务', team: '爱领航服务队', teamId: 'ailinghang', date: '2026-03-16', dateLabel: '2026年3月16日', location: '绥化市人民广场', owner: '张芳', participants: '爱领航服务队18名狮友', photoCount: 35, tone: 'red', mark: '环保', description: '开展城市环境清洁和文明宣传，以实际行动倡导绿色生活。', summary: '清理公共区域6处，发放环保宣传单500份。' },
  { _id: 'event-4', title: '四队迎新联谊会', type: '聚会联谊', team: '二十一协作区', teamId: 'district', date: '2026-02-22', dateLabel: '2026年2月22日', location: '绥化市青冈厅', owner: '景雅东', participants: '四队共86名狮友', photoCount: 68, tone: 'gold', mark: '联谊', description: '促进四队狮友相互认识，分享新年度公益计划和企业资源。', summary: '现场完成四个跨队公益项目的初步协作对接。' },
  { _id: 'event-5', title: '暖冬物资捐赠', type: '公益服务', team: '领航服务队', teamId: 'linghang', date: '2025-12-12', dateLabel: '2025年12月12日', location: '绥化市儿童福利院', owner: '王志强', participants: '领航服务队25名狮友', photoCount: 51, tone: 'purple', mark: '暖冬', description: '向儿童福利院捐赠冬衣、图书和生活用品。', summary: '累计捐赠物资价值3.6万元，并建立图书角。' },
  { _id: 'event-6', title: '企业资源公益对接会', type: '会议培训', team: '精英服务队', teamId: 'jingying', date: '2025-11-08', dateLabel: '2025年11月8日', location: '绥化创业大厦', owner: '赵宏伟', participants: '精英服务队及协作区代表', photoCount: 24, tone: 'teal', mark: '资源', description: '梳理狮友企业可提供的场地、车辆、物资、媒体和专业服务资源。', summary: '形成首批48项公益资源清单。' }
]

const photoTones = ['green', 'gold', 'blue', 'red', 'purple', 'teal']
function photosFor(activity) {
  const labels = ['集体合影', '服务现场', '物资交接', '狮友协作', '温暖瞬间', '活动记录']
  return labels.map((label, index) => ({ _id: `${activity._id}-photo-${index + 1}`, label, tone: photoTones[(index + activities.indexOf(activity)) % photoTones.length] }))
}

const members = [
  { _id: 'm1', name: '李晶', letter: 'L', team: '远航服务队', teamId: 'yuanhang', position: '第一副队长', company: '晶诚商贸有限公司', industry: '商贸流通', resource: '公益物资、供应链', birthday: '06-12', initial: '李', avatarTone: 'green' },
  { _id: 'm2', name: '徐雪峰', letter: 'X', team: '远航服务队', teamId: 'yuanhang', position: '会员发展主席', company: '雪峰文化传媒', industry: '文化传媒', resource: '摄影摄像、宣传设计', birthday: '09-08', initial: '徐', avatarTone: 'red' },
  { _id: 'm3', name: '王志强', letter: 'W', team: '领航服务队', teamId: 'linghang', position: '服务主席', company: '志强物流运输', industry: '物流运输', resource: '车辆、仓储、配送', birthday: '06-21', initial: '王', avatarTone: 'blue' },
  { _id: 'm4', name: '刘静', letter: 'L', team: '爱领航服务队', teamId: 'ailinghang', position: '关爱主席', company: '静心健康管理', industry: '健康服务', resource: '健康咨询、义诊资源', birthday: '07-03', initial: '刘', avatarTone: 'purple' },
  { _id: 'm5', name: '赵宏伟', letter: 'Z', team: '精英服务队', teamId: 'jingying', position: '队长', company: '宏伟农业科技', industry: '现代农业', resource: '农产品、乡村项目', birthday: '11-16', initial: '赵', avatarTone: 'green' },
  { _id: 'm6', name: '景雅东', letter: 'J', team: '远航服务队', teamId: 'yuanhang', position: '联谊主席', company: '小鱼故事中餐厅', industry: '餐饮服务', resource: '活动场地、餐饮保障', birthday: '06-28', initial: '景', avatarTone: 'red' },
  { _id: 'm7', name: '陈晓梅', letter: 'C', team: '领航服务队', teamId: 'linghang', position: '秘书', company: '晓梅教育咨询', industry: '教育培训', resource: '课程、教师、助学咨询', birthday: '08-19', initial: '陈', avatarTone: 'blue' },
  { _id: 'm8', name: '孙海峰', letter: 'S', team: '精英服务队', teamId: 'jingying', position: '新闻宣传主席', company: '海峰网络科技', industry: '互联网技术', resource: '小程序、网站、直播支持', birthday: '10-05', initial: '孙', avatarTone: 'purple' }
]

const archiveCategories = [
  { id: 'main', name: '记事本总目录', icon: '总', role: '秘书', count: 18 },
  { id: 'member', name: '会员发展', icon: '员', role: '会员发展主席', count: 34 },
  { id: 'training', name: '领导力与培训', icon: '培', role: '培训主席', count: 8 },
  { id: 'service', name: '公益服务', icon: '服', role: '服务主席', count: 21 },
  { id: 'plan', name: '年度服务计划', icon: '计', role: '服务主席', count: 12 },
  { id: 'meeting', name: '会议纪要', icon: '会', role: '秘书', count: 16 },
  { id: 'exchange', name: '对外交流', icon: '外', role: '对外交流主席', count: 9 },
  { id: 'publicity', name: '新闻宣传', icon: '宣', role: '新闻宣传主席', count: 12 },
  { id: 'care', name: '狮友关爱', icon: '爱', role: '关爱主席', count: 26 },
  { id: 'social', name: '聚会联谊', icon: '联', role: '联谊主席', count: 31 },
  { id: 'inventory', name: '物品清单', icon: '物', role: '总务', count: 48 },
  { id: 'finance', name: '账目档案', icon: '账', role: '仅司库与最高管理员', count: 125, restricted: true }
]

const archiveOrganizations = teams.map((team, index) => ({
  ...team,
  seal: team.id === 'district' ? '21' : team.shortName.slice(0, 1),
  description: index === 0 ? '四队联合资料与协作区公共档案' : `${team.shortName}服务队岗位资料`,
  photoCount: [328, 246, 218, 384, 196][index],
  categories: archiveCategories.map(item => ({ ...item, count: Math.max(2, item.count - index * 2) }))
}))

const archiveEntries = [
  { _id: 'ar-1', organizationId: 'yuanhang', categoryId: 'member', date: '2024-11-08', dateLabel: '2024年11月8日', title: '远航服务队召集小组成立', team: '远航服务队', uploadedBy: '会员发展主席', uploaderRole: '会员发展', status: 'published', photoCount: 5, tone: 'blue', keywords: ['创队', '会员发展'], summary: '远航服务队召集小组正式成立，形成首批创队成员和企业资源记录。', content: '本条由原会员发展Word档案拆分形成。系统保留成立日期、参与人员、组织关系和发展节点，敏感联系方式不在普通事件详情中展示。' },
  { _id: 'ar-2', organizationId: 'yuanhang', categoryId: 'member', date: '2024-11-14', dateLabel: '2024年11月14日', title: '第六名创队会员加入远航服务队', team: '远航服务队', uploadedBy: '会员发展主席', uploaderRole: '会员发展', status: 'published', photoCount: 1, tone: 'green', keywords: ['新会员', '创队'], summary: '新增一名创队会员，并记录介绍人、企业类型和加入日期。', content: '会员加入事件只向授权人员展示完整资料。普通成员看到姓名、服务队、加入日期和经本人同意公开的企业信息。' },
  { _id: 'ar-3', organizationId: 'yuanhang', categoryId: 'training', date: '2024-11-19', dateLabel: '2024年11月19日', title: '第一次培训：短视频运营分享', team: '远航服务队', uploadedBy: '领导力发展主席', uploaderRole: '培训', status: 'published', photoCount: 2, tone: 'purple', keywords: ['培训', '短视频'], summary: '围绕短视频运营开展内部经验分享。', content: '培训档案记录培训主题、讲师、参加人员、主要内容、现场照片和后续应用计划。' },
  { _id: 'ar-4', organizationId: 'yuanhang', categoryId: 'training', date: '2024-12-04', dateLabel: '2024年12月4日', title: '第二次培训：创队说明会', team: '远航服务队', uploadedBy: '领导力发展主席', uploaderRole: '培训', status: 'published', photoCount: 3, tone: 'gold', keywords: ['创队说明会', '组织认知'], summary: '通过说明会帮助成员认识组织理念与服务方式。', content: '本条由领导力与培训Word档案拆分形成，并关联培训照片。' },
  { _id: 'ar-5', organizationId: 'yuanhang', categoryId: 'service', date: '2024-12-22', dateLabel: '2024年12月22日', title: '联合关爱环卫工人服务', team: '远航服务队', uploadedBy: '服务主席', uploaderRole: '公益服务', status: 'published', photoCount: 4, tone: 'red', keywords: ['环卫工人', '联合服务'], summary: '远航发起联合服务，为环卫工人送去暖心餐食，并走访需要帮助的家庭。', content: '活动由多个服务队联合开展。事件详情记录主办组织、联合组织、服务对象、参与人员、服务成果和后续走访安排。' },
  { _id: 'ar-6', organizationId: 'yuanhang', categoryId: 'service', date: '2025-03-01', dateLabel: '2025年3月1日', title: '四队联合“金剪刀”公益服务', team: '远航服务队', uploadedBy: '服务主席', uploaderRole: '公益服务', status: 'published', photoCount: 7, tone: 'green', keywords: ['敬老', '义剪', '联合'], summary: '四个服务队联合为养老中心老人提供暖心义剪。', content: '活动记录参与服务队、现场人员、服务过程、服务对象反馈和影像资料。联合活动可同时出现在协作区及相关服务队档案中。' },
  { _id: 'ar-7', organizationId: 'yuanhang', categoryId: 'service', date: '2025-03-27', dateLabel: '2025年3月27日', title: '点亮蓝灯·关爱自闭症儿童', team: '远航服务队', uploadedBy: '服务主席', uploaderRole: '公益服务', status: 'published', photoCount: 9, tone: 'blue', keywords: ['自闭症儿童', '四队联合'], summary: '四支服务队联合开展互动陪伴和公益宣传活动。', content: '事件保留活动介绍、参与组织、服务过程、现场成果与宣传照片。涉及儿童的照片按照内部授权范围展示。' },
  { _id: 'ar-8', organizationId: 'yuanhang', categoryId: 'publicity', date: '2025-02-02', dateLabel: '2025年2月2日', title: '养老院义剪活动宣传稿', team: '远航服务队', uploadedBy: '新闻宣传主席', uploaderRole: '新闻宣传', status: 'published', photoCount: 2, tone: 'gold', keywords: ['宣传稿', '养老院'], summary: '记录活动宣传标题、正文、配图和发布情况。', content: '新闻宣传档案与对应公益服务事件关联，避免重复录入基础信息。宣传角色负责整理标题、摘要、正文和照片。' },
  { _id: 'ar-9', organizationId: 'yuanhang', categoryId: 'care', date: '2025-01-12', dateLabel: '2025年1月12日', title: '第一次生日关爱', team: '远航服务队', uploadedBy: '关爱主席', uploaderRole: '狮友关爱', status: 'published', photoCount: 3, tone: 'red', keywords: ['生日', '关爱'], summary: '开展生日祝福与内部关爱活动。', content: '普通成员可查看公开祝福、日期和照片；健康、家庭困难等敏感详情仅关爱岗位和最高管理员可见。' },
  { _id: 'ar-10', organizationId: 'yuanhang', categoryId: 'social', date: '2025-03-02', dateLabel: '2025年3月2日', title: '第七次联谊活动', team: '远航服务队', uploadedBy: '联谊主席', uploaderRole: '聚会联谊', status: 'published', photoCount: 4, tone: 'purple', keywords: ['联谊', '团队交流'], summary: '狮友开展内部交流联谊，增进团队了解。', content: '联谊档案记录日期、地点、召集人、参与成员、活动说明和照片。' },
  { _id: 'ar-11', organizationId: 'yuanhang', categoryId: 'plan', date: '2025-07-10', dateLabel: '2025年7月10日', title: '年度计划：公共设施捐赠服务', team: '远航服务队', uploadedBy: '服务主席', uploaderRole: '年度计划', status: 'published', photoCount: 0, tone: 'teal', keywords: ['年度计划', '公共设施'], summary: '纳入年度计划的七月公益服务事项。', content: '年度计划事件保存执行主席、计划月份、准备事项和当前状态，完成后转入正式公益服务档案。' },
  { _id: 'ar-12', organizationId: 'yuanhang', categoryId: 'social', date: '2025-04-28', dateLabel: '2025年4月28日', title: '开业祝贺联谊活动', team: '远航服务队', uploadedBy: '联谊主席', uploaderRole: '聚会联谊', status: 'draft', photoCount: 5, tone: 'gold', keywords: ['开业', '联谊'], summary: 'Word导入后生成的草稿，等待管理员核对参与人员和照片。', content: 'AI已根据日期、地点和提示词形成草稿。管理员检查标题、正文及照片后才能点击发布。' }
]

const structureTerms = [
  {
    term: '2026—2027年度',
    district: [
      { position: '协调长', person: '演示人员', initial: '演' },
      { position: '秘书长', person: '张秘书', initial: '张' },
      { position: '服务委员会', person: '王主席', initial: '王' },
      { position: '关爱委员会', person: '刘主席', initial: '刘' }
    ],
    teams: [
      { name: '领航服务队', leader: '队长 王志强', committees: ['秘书', '服务', '关爱', '联谊', '宣传'] },
      { name: '爱领航服务队', leader: '队长 刘静', committees: ['秘书', '服务', '关爱', '联谊', '宣传'] },
      { name: '远航服务队', leader: '队长 关丙刚', committees: ['第一副队长', '第二副队长', '第三副队长', '秘书', '司库', '总务'] },
      { name: '精英服务队', leader: '队长 赵宏伟', committees: ['秘书', '服务', '关爱', '联谊', '宣传'] }
    ]
  },
  {
    term: '2025—2026年度',
    district: [
      { position: '协调长', person: '上届协调长', initial: '协' },
      { position: '秘书长', person: '上届秘书长', initial: '秘' }
    ],
    teams: [
      { name: '领航服务队', leader: '上届队长', committees: ['队长团队', '委员会主席'] },
      { name: '爱领航服务队', leader: '上届队长', committees: ['队长团队', '委员会主席'] },
      { name: '远航服务队', leader: '创队队长', committees: ['三位副队长', '秘书', '司库', '总务'] },
      { name: '精英服务队', leader: '创队队长', committees: ['队长团队', '委员会主席'] }
    ]
  }
]

const history = [
  { _id: 'h1', year: '2026', team: '二十一协作区', title: '四队联合档案平台启动', content: '领航、爱领航、远航、精英四个服务队共同启动数字化公益档案建设。' },
  { _id: 'h2', year: '2025', team: '二十一协作区', title: '年度公益服务突破40场', content: '全年围绕助学、敬老、环保和社区服务开展联合行动，累计服务超过3,000人次。' },
  { _id: 'h3', year: '2024', team: '精英服务队', title: '精英服务队成立', content: '进一步扩大绥化市公益服务力量，强化企业资源和专业服务协同。' },
  { _id: 'h4', year: '2023', team: '远航服务队', title: '远航服务队开启新一届服务', content: '建立服务、关爱、联谊、宣传等委员会协作机制。' },
  { _id: 'h5', year: '2022', team: '爱领航服务队', title: '爱领航关爱项目启动', content: '持续开展狮友关爱和困难家庭帮扶。' },
  { _id: 'h6', year: '2020', team: '领航服务队', title: '领航服务队成立', content: '二十一协作区公益服务力量在绥化市稳步发展。' }
]

const notices = [
  { _id: 'n1', title: '2026—2027年度岗位资料交接通知', content: '请各服务队于6月28日前完成新一届岗位名单、资料和系统权限交接。', pinned: true, dateLabel: '2026-06-10' },
  { _id: 'n2', title: '六月联合公益服务报名', content: '暖阳助学走访开始报名，各队请于6月12日前提交参加人员。', pinned: false, dateLabel: '2026-06-08' }
]

const appointments = [
  { position: '协作区主席', person: '演示人员', organization: '二十一协作区', term: '2026—2027年度' },
  { position: '服务委员会主席', person: '王志强', organization: '二十一协作区', term: '2026—2027年度' },
  { position: '狮友关爱主席', person: '刘静', organization: '二十一协作区', term: '2026—2027年度' },
  { position: '秘书', person: '陈晓梅', organization: '二十一协作区', term: '2026—2027年度' }
]

const auditLogs = [
  { _id: 'log1', actionLabel: '新增', operatorName: '演示管理员', targetType: '公益服务', targetTitle: '暖阳助学走访', createdAtLabel: '2026-06-10 09:30' },
  { _id: 'log2', actionLabel: '上传', operatorName: '宣传主席', targetType: '活动照片', targetTitle: '圆梦助学·春季走访', createdAtLabel: '2026-06-09 18:20' },
  { _id: 'log3', actionLabel: '权限变更', operatorName: '超级管理员', targetType: '年度岗位', targetTitle: '2026—2027届秘书', createdAtLabel: '2026-06-08 14:10' }
]

module.exports = { teams, tasks, activities, photosFor, members, history, notices, appointments, auditLogs, archiveOrganizations, archiveEntries, structureTerms }
