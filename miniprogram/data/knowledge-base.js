const updatedAt = '2026-06-13'

const categories = ['全部', '联会概况', '制度规范', '服务文化', '国际资料', '协作区资料']

const items = [
  {
    _id: 'cclions-overview',
    category: '联会概况',
    title: '中国狮子联会简介',
    summary: '了解中国狮子联会的成立时间、组织性质与基本定位。',
    content: [
      '中国狮子联会于2005年6月14日在北京成立。',
      '根据联会官方网站公开介绍，联会是经国务院批准设立、在民政部登记注册，具有独立法人资格的全国性、联合性、非营利性社会团体。',
      '本条目仅用于公益团队内部学习，具体表述和最新信息以中国狮子联会官方网站为准。'
    ],
    sourceName: '中国狮子联会官方网站',
    sourceUrl: 'https://www.cclions.org.cn/',
    updatedAt,
    keywords: ['中国狮子联会', '成立', '简介', '社会团体', '公益']
  },
  {
    _id: 'cclions-charter',
    category: '制度规范',
    title: '中国狮子联会章程',
    summary: '联会宗旨、业务范围、会员、组织机构等事项的正式依据。',
    content: [
      '章程属于正式制度文件，使用时应以中国狮子联会官网发布的现行版本为准。',
      '小程序知识库只提供索引、摘要和官方来源，不替代章程原文，也不自行解释具有约束力的条款。',
      '需要制定协作区或服务队制度时，应先核对联会章程及所属代表机构的有效制度。'
    ],
    sourceName: '中国狮子联会：信息公开－联会章程',
    sourceUrl: 'https://www.cclions.org.cn/page-7332/',
    updatedAt,
    keywords: ['章程', '宗旨', '会员', '组织机构', '制度']
  },
  {
    _id: 'cclions-rules',
    category: '制度规范',
    title: '制度规范索引',
    summary: '集中查阅章程、工作规则、财务管理制度和会费收取办法等公开制度。',
    content: [
      '中国狮子联会官网“制度规范”栏目集中发布正式制度文件。',
      '涉及财务、会费、岗位职责、会议程序和组织管理时，应打开官方页面核对文件名称、发布日期及现行版本。',
      '协作区内部记录可引用制度名称和官方链接，但不建议复制后长期离线使用，以免版本过期。'
    ],
    sourceName: '中国狮子联会：制度规范',
    sourceUrl: 'https://www.cclions.org.cn/category/zhiduguifan/',
    updatedAt,
    keywords: ['工作规则', '财务', '会费', '管理制度', '制度规范']
  },
  {
    _id: 'lions-service-culture',
    category: '服务文化',
    title: '服务文化与记录原则',
    summary: '用真实、清晰、尊重隐私的方式记录公益服务。',
    content: [
      '公益记录应包含时间、地点、服务对象、参与人员、服务过程、结果和照片说明。',
      '涉及未成年人、残障人士、困难家庭和个人联系方式时，应取得必要授权并减少敏感信息展示。',
      '照片与文字应真实反映服务，不夸大成果，不公开不适合传播的个人信息。',
      '二十一协作区与各服务队的内部流程，可在本知识库中另建“协作区资料”条目。'
    ],
    sourceName: '二十一协作区内部整理',
    sourceUrl: '',
    updatedAt,
    keywords: ['服务', '记录', '隐私', '照片', '公益活动']
  },
  {
    _id: 'lions-international',
    category: '国际资料',
    title: '国际狮子会官方资料入口',
    summary: '查阅国际狮子会公开介绍、服务项目和全球资源。',
    content: [
      '国际资料应优先查阅国际狮子会官方中文网站。',
      '国际组织的制度、术语和组织结构不应直接替代中国狮子联会及境内相关组织的现行制度。',
      '用于培训或对外介绍时，请标注资料来源和查阅日期。'
    ],
    sourceName: '国际狮子会官方网站（简体中文）',
    sourceUrl: 'https://www.lionsclubs.org/zh-hans',
    updatedAt,
    keywords: ['国际狮子会', 'Lions International', 'We Serve', '国际资料']
  },
  {
    _id: 'district-knowledge-guide',
    category: '协作区资料',
    title: '二十一协作区知识库使用说明',
    summary: '区分官方公开资料、协作区制度和服务队内部工作资料。',
    content: [
      '“官方公开资料”必须保留来源链接和更新时间。',
      '“协作区资料”由二十一协作区管理员维护，适用于五个组织共同遵循的工作内容。',
      '“服务队资料”应标明所属服务队、适用年度、发布人和审核状态。',
      '人员联系方式、关爱详情、财务明细等敏感内容不进入公开知识库，应继续使用权限控制的档案模块。'
    ],
    sourceName: '二十一协作区内部整理',
    sourceUrl: '',
    updatedAt,
    keywords: ['二十一协作区', '知识库', '权限', '服务队', '资料分类']
  }
]

module.exports = { categories, items, updatedAt }
