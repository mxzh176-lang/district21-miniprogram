const teams = [
  { id: 'district', name: '二十一协作区', shortName: '协作区', color: '#b1843d', members: 120 },
  { id: 'linghang', name: '领航服务队', shortName: '领航', color: '#2f6d5d', members: 31 },
  { id: 'ailinghang', name: '爱领航服务队', shortName: '爱领航', color: '#b55d57', members: 29 },
  { id: 'yuanhang', name: '远航服务队', shortName: '远航', color: '#346b8c', members: 32 },
  { id: 'jingying', name: '精英服务队', shortName: '精英', color: '#7a5b91', members: 28 }
]

const tasks = [
  { _id: 'task-1', month: '2026-06', day: '14', category: '公益服务', categoryId: 'second-vp', title: '景辉狮兄带领远航开展暖阳助学走访', team: '远航服务队', teamId: 'yuanhang', owner: '景辉', location: '绥化市北林区', status: 'pending', priority: 'important', description: '走访困难学生家庭，确认暑期助学物资与学习需求。' },
  { _id: 'task-2', month: '2026-06', day: '18', category: '狮友关爱', categoryId: 'third-vp', title: '潘阳阳狮姐组织远航开展住院狮友慰问', team: '远航服务队', teamId: 'yuanhang', owner: '潘阳阳', location: '绥化市第一医院', status: 'pending', priority: 'important', description: '具体关爱信息仅对授权岗位显示，普通成员仅查看时间和集合安排。' },
  { _id: 'task-3', month: '2026-06', day: '21', category: '聚会联谊', categoryId: 'third-vp', title: '雪峰狮兄组织远航开展六月狮友集体生日会', team: '远航服务队', teamId: 'yuanhang', owner: '雪峰', location: '绥化市兰西路活动中心', status: 'pending', priority: 'normal', description: '准备祝福卡片、纪念合影和联谊流程。' },
  { _id: 'task-4', month: '2026-06', day: '25', category: '对外交流', categoryId: 'first-vp', title: '丙刚狮兄开展远航对外交流走访', team: '远航服务队', teamId: 'yuanhang', owner: '丙刚', location: '绥化市公益伙伴单位', status: 'pending', priority: 'normal', description: '走访公益伙伴，介绍远航公益方向并形成后续协作清单。' },
  { _id: 'task-5', month: '2026-06', day: '28', category: '会议纪要', categoryId: 'secretary', title: '玲玲狮姐组织召开远航服务队岗位交接会议', team: '远航服务队', teamId: 'yuanhang', owner: '玲玲', location: '远航会议室', status: 'pending', priority: 'urgent', description: '确认新一届岗位任职、系统权限及资料交接。' },
  { _id: 'task-6', month: '2026-06', day: '08', category: '公益服务', categoryId: 'second-vp', title: '景辉狮兄带领远航完成社区爱心衣物整理服务', team: '远航服务队', teamId: 'yuanhang', owner: '景辉', location: '祥和社区', status: 'done', priority: 'normal', description: '完成衣物分类、消毒和社区发放，共服务46户家庭。' }
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

const memberLetters = {
  安: 'A', 白: 'B', 陈: 'C', 崔: 'C', 丁: 'D', 董: 'D', 付: 'F', 冯: 'F',
  高: 'G', 郭: 'G', 关: 'G', 韩: 'H', 何: 'H', 胡: 'H', 黄: 'H',
  荆: 'J', 景: 'J', 姜: 'J', 孔: 'K', 李: 'L', 刘: 'L', 吕: 'L',
  梁: 'L', 林: 'L', 米: 'M', 马: 'M', 潘: 'P', 彭: 'P', 任: 'R',
  宋: 'S', 孙: 'S', 滕: 'T', 田: 'T', 王: 'W', 吴: 'W', 徐: 'X',
  许: 'X', 谢: 'X', 杨: 'Y', 姚: 'Y', 张: 'Z', 赵: 'Z', 周: 'Z',
  朱: 'Z', 蒋: 'J', 辛: 'X', 侯: 'H', 金: 'J', 范: 'F', 邓: 'D',
  薛: 'X', 裴: 'P', 程: 'C', 毛: 'M', 邰: 'T', 谭: 'T'
}

const memberRoster = {
  linghang: ['王刚', '刘宝山', '于波', '范信银', '陈维凡', '刘金辉', '腾保国', '贾晓梅', '杨磊', '吴含', '朱连春', '蒋萧彤', '辛志武', '马玉红', '李洪志', '李力安', '侯盛楠', '王连会', '孙建', '金萍', '徐红霞', '王玉宝', '王洪伟', '王立彬', '关向星'],
  jingying: ['王丽', '杨帆', '陈纯玉', '杨丽莹', '付艳秋', '张永祺', '孙明龙', '孙洪涛', '于永和', '张影', '周玉慧', '裴大伟', '林衍伟', '安铁', '薛允丽', '郭晓红', '张淑云', '李永生', '王继芳', '吕洪威', '任凤影', '张南翔', '程传海'],
  ailinghang: ['陈纯颖', '王必东', '张书慧', '杨振忠', '陈冬彬', '孙显波', '王秋香', '谢志琴', '邓福友', '陈瓯', '王磊', '辛福恩', '毛烨', '吴亚娟', '杨秀娟', '张成功', '孙慧霖', '刘磊', '李红太', '刘金岭', '范晓波', '李玉博', '邰欢欢'],
  yuanhang: ['关丙刚', '张明星', '徐双龙', '张芳', '李晶', '刘建鑫', '李姗姗', '刘圣亮', '杨景辉', '李文强', '吕媛媛', '王奇', '潘洋洋', '景树生', '徐雪峰', '胡世领', '徐铭宣', '徐春梅', '吴雪', '谭振峰', '腾飞']
}

const teamInfo = teams.reduce((map, team) => {
  map[team.id] = team
  return map
}, {})

const members = Object.keys(memberRoster).flatMap(teamId => {
  const team = teamInfo[teamId]
  return memberRoster[teamId].map((name, index) => ({
    _id: `member-${teamId}-${index + 1}`,
    name,
    letter: memberLetters[name.slice(0, 1)] || '#',
    team: team.name,
    teamId,
    position: '成员',
    initial: name.slice(0, 1),
    avatarTone: teamId === 'linghang' ? 'green' : teamId === 'ailinghang' ? 'red' : teamId === 'yuanhang' ? 'blue' : 'purple'
  }))
})

const archiveCategories = [
  {
    id: 'captain',
    name: '队长',
    person: '张明星',
    icon: '队',
    role: '队长——张明星',
    count: 1,
    desc: '统筹远航服务队年度方向、重要嘉许和队务推进'
  },
  {
    id: 'first-vp',
    name: '第一副队长',
    person: '张芳',
    icon: '一',
    role: '第一副队长——张芳',
    count: 3,
    desc: '会员与保留、领导力培训、对外交流',
    children: [
      { id: 'member-retention', name: '会员与保留委员会', person: '大奇', role: '会员与保留委员会主席——大奇' },
      { id: 'leadership-training', name: '领导力培训委员会', person: '姗姗', role: '领导力培训委员会主席——姗姗' },
      { id: 'external-exchange', name: '对外交流委员会', person: '丙刚', role: '对外交流委员会主席——丙刚' }
    ]
  },
  {
    id: 'second-vp',
    name: '第二副队长',
    person: '双龙',
    icon: '二',
    role: '第二副队长——双龙',
    count: 3,
    desc: '服务与计划、新闻宣传、筹款与计划',
    children: [
      { id: 'service-plan', name: '服务与计划委员会', person: '景辉', role: '服务与计划委员会主席——景辉' },
      { id: 'news-publicity', name: '新闻宣传委员会', person: '建鑫', role: '新闻宣传委员会主席——建鑫' },
      { id: 'fundraising-plan', name: '筹款与计划委员会', person: '珊珊', role: '筹款与计划委员会主席——珊珊' }
    ]
  },
  {
    id: 'third-vp',
    name: '第三副队长',
    person: '媛媛',
    icon: '三',
    role: '第三副队长——媛媛',
    count: 3,
    desc: '关爱、联谊、年会',
    children: [
      { id: 'care-committee', name: '关爱委员会', person: '潘阳阳', role: '关爱委员会主席——潘阳阳' },
      { id: 'fellowship-committee', name: '联谊委员会', person: '雪峰', role: '联谊委员会主席——雪峰' },
      { id: 'annual-meeting', name: '年会委员会', person: '泉宏', role: '年会主席——泉宏' }
    ]
  },
  { id: 'secretary', name: '秘书', person: '玲玲', icon: '秘', role: '秘书——玲玲', count: 1, desc: '会议纪要、通知、队务文字资料' },
  { id: 'tamer', name: '纠察', person: '振锋', icon: '纠', role: '纠察——振锋', count: 1, desc: '会场秩序、礼仪流程、纪律执行' },
  { id: 'treasurer', name: '司库', person: '文强', icon: '库', role: '司库——文强', count: 1, restricted: true, desc: '账目、收支、物资价值记录' },
  { id: 'admin', name: '总务', person: '腾飞', icon: '务', role: '总务——腾飞', count: 1, desc: '物资、场地、后勤、车辆与清单管理' }
]

const archiveOrganizations = [{
  id: 'yuanhang',
  name: '远航服务队',
  shortName: '远航',
  color: '#346b8c',
  members: 32,
  seal: '远',
  captain: '张明星',
  description: '远航服务队队长——张明星；一二三副队长与秘书、纠察、司库、总务共 8 个主栏目',
  photoCount: 3,
  categories: archiveCategories
}]

const archiveEntries = [
  { _id: 'ar-1', organizationId: 'yuanhang', categoryId: 'captain', date: '2026-06-01', dateLabel: '2026年6月1日', title: '张明星狮兄带领远航明确年度服务方向', team: '远航服务队', uploadedBy: '队长档案', uploaderRole: '队长', status: 'published', photoCount: 0, photos: [], tone: 'blue', keywords: ['队长', '年度方向'], summary: '远航服务队年度方向与岗位协作要求。', content: '张明星狮兄带领远航服务队明确年度服务方向，推动各委员会围绕服务、关爱、联谊、会员发展和对外交流建立协作机制。' },
  { _id: 'ar-2', organizationId: 'yuanhang', categoryId: 'second-vp', date: '2026-06-14', dateLabel: '2026年6月14日', title: '景辉狮兄带领远航开展暖阳助学走访', team: '远航服务队', uploadedBy: '服务与计划委员会', uploaderRole: '公益服务', status: 'published', photoCount: 1, photos: ['/images/archives/word-service-001/01.jpg'], tone: 'green', keywords: ['公益服务', '助学'], summary: '远航服务队围绕助学开展走访服务。', content: '景辉狮兄带领远航服务队开展暖阳助学走访，确认学生家庭需求、后续帮扶计划和参与狮友分工。' },
  { _id: 'ar-3', organizationId: 'yuanhang', categoryId: 'secretary', date: '2026-06-28', dateLabel: '2026年6月28日', title: '玲玲狮姐组织召开远航岗位交接会议', team: '远航服务队', uploadedBy: '秘书处', uploaderRole: '会议纪要', status: 'published', photoCount: 0, photos: [], tone: 'gold', keywords: ['会议纪要', '岗位交接'], summary: '记录远航岗位交接会议议题、决议和待办。', content: '玲玲狮姐组织召开远航服务队岗位交接会议，记录会议议题、形成决议事项，并明确各岗位后续资料交接责任。' }
]

const structureTerms = [
  {
    term: '2026—2027年度',
    district: [
      { position: '执委会主席', person: '侯盛楠', initial: '侯' },
      { position: '上届主席', person: '王刚', initial: '王' },
      { position: '秘书长', person: '张明星', initial: '张' },
      { position: '财务长', person: '吴含', initial: '吴' },
      { position: '总务长', person: '刘磊', initial: '刘' },
      { position: '纠察长', person: '孙明龙', initial: '孙' },
      { position: '副秘书长', person: '张南翔', initial: '张' }
    ],
    teams: [
      {
        name: '领航服务队',
        leader: '王刚',
        leaderTitle: '创队队长',
        roles: [
          { position: '第一副队长', person: '吴含' },
          { position: '第二副队长', person: '徐红雷' },
          { position: '第三副队长', person: '李力安' },
          { position: '秘书', person: '蒋燕彤' },
          { position: '司库', person: '关向星' },
          { position: '总务', person: '宋严' },
          { position: '纠察', person: '腾保国' },
          { position: '会员发展与保留委员会主席', person: '朱连春' },
          { position: '领导力发展与培训委员会主席', person: '贾晓梅' },
          { position: '对外交流委员会主席', person: '刘宝山' },
          { position: '服务委员会主席', person: '刘金辉' },
          { position: '公共关系与宣传委员会主席', person: '金萍' },
          { position: '筹款委员会主席', person: '王洪伟' },
          { position: '狮友关爱委员会主席', person: '王立秋' },
          { position: '狮友联谊委员会主席', person: '魏远超' },
          { position: '狮友联谊委员会副主席', person: '杨磊' },
          { position: '年会委员会主席', person: '王连会' },
          { position: '年会委员会副主席', person: '王明库' }
        ]
      },
      {
        name: '爱领航服务队',
        leader: '王必东',
        leaderTitle: '创队队长',
        roles: [
          { position: '第一副队长', person: '张成功' },
          { position: '第二副队长', person: '刘磊' },
          { position: '第三副队长', person: '谢志琴' },
          { position: '秘书', person: '邰欢欢' },
          { position: '司库', person: '李月' },
          { position: '总务', person: '范晓波' },
          { position: '纠察', person: '孙显波' },
          { position: '对外交流委员会主席', person: '王磊' },
          { position: '狮友关爱委员会主席', person: '吴亚娟' },
          { position: '狮友关爱委员会副主席', person: '孙慧霖' },
          { position: '狮友联谊委员会主席', person: '杨秀娟' },
          { position: '狮友联谊委员会副主席', person: '李玉博' },
          { position: '年会委员会主席', person: '杨振忠' }
        ]
      },
      {
        name: '远航服务队',
        leader: '关丙刚',
        leaderTitle: '创队队长',
        roles: [
          { position: '第一副队长', person: '王丽' },
          { position: '第二副队长', person: '徐双龙' },
          { position: '第三副队长', person: '吕媛媛' },
          { position: '秘书', person: '李玲玲' },
          { position: '司库', person: '李文强' },
          { position: '总务', person: '谭振峰' },
          { position: '纠察', person: '腾飞' },
          { position: '服务委员会主席', person: '杨景辉' },
          { position: '会员发展与保留委员会主席', person: '王奇' },
          { position: '领导力发展与培训委员会主席', person: '关丙刚' },
          { position: '对外交流委员会主席', person: '关丙刚' },
          { position: '公共关系与宣传委员会主席', person: '刘建鑫' },
          { position: '筹款委员会主席', person: '徐铭宣' },
          { position: '狮友关爱委员会主席', person: '潘洋洋' },
          { position: '狮友联谊委员会主席', person: '徐雪峰' },
          { position: '年会委员会主席', person: '李明浩' }
        ]
      },
      {
        name: '精英服务队',
        leader: '王丽',
        leaderTitle: '创队队长',
        roles: [
          { position: '第一副队长', person: '孙明龙' },
          { position: '第二副队长', person: '周玉慧' },
          { position: '第三副队长', person: '郭晓红' },
          { position: '秘书', person: '薛允丽' },
          { position: '司库', person: '张影' },
          { position: '总务', person: '裴大伟' },
          { position: '纠察', person: '吕洪威' },
          { position: '会员发展与保留委员会主席', person: '王丽' },
          { position: '领导力发展与培训委员会主席', person: '任凤影' },
          { position: '对外交流委员会主席', person: '张南翔' },
          { position: '服务委员会主席', person: '孙洪涛' },
          { position: '公共关系与宣传委员会主席', person: '范新卓' },
          { position: '筹款委员会主席', person: '林衍伟' },
          { position: '狮友关爱委员会主席', person: '王继芳' },
          { position: '狮友联谊委员会主席', person: '李永生' },
          { position: '年会委员会主席', person: '杨丽宝' }
        ]
      }
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
