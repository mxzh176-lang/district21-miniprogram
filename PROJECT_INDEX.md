# 21纪事本项目索引

本文件用于快速定位项目结构、核心模块、发布流程和常见问题。新对话或集成发布前，优先读取：

1. `PROJECT_CONTEXT.md`
2. `AGENTS.md`
3. `docs/DEVELOPMENT_GUARDRAILS.md`
4. 本文件 `PROJECT_INDEX.md`

## 1. 项目基本信息

- 项目名称：21纪事本
- 正式目录：`/Users/xz/Documents/Codex/district21-miniprogram`
- 正式分支：`codex/main`
- 小程序 AppID：`wxfe3c3da5ae16aa1d`
- 云环境 ID：`cloud1-d6ghj5dev32a15a81`
- 小程序前端目录：`miniprogram/`
- 云函数目录：`cloudfunctions/`
- 主云函数：`cloudfunctions/api`
- 微信开发者工具导入目录：项目根目录，不是 `miniprogram/`

## 2. 产品边界与审核底线

项目定位固定为内部组织管理工具，核心是：

- 协作区与服务队档案
- 成员通讯录
- 岗位与负责人
- 待办事项
- 历史事件
- 荣誉档案
- 管理员权限

默认禁止加入：

- 公开发帖、公开社区、论坛、评论、点赞、关注、粉丝
- 开放聊天、陌生人互动
- 公开用户生成内容流
- AI 助手或知识库入口
- 募捐、支付、金融服务、医疗健康信息
- 身份证、人脸、证件照等敏感实名采集

新增功能前必须判断审核影响：

- `审核安全`：内部工具、最小权限、无公开社交
- `有风险但已缓解`：说明限制范围和前后端权限控制
- `阻塞`：缺少平台规则或驳回原文，暂停实现

## 3. 代码边界

### 3.1 页面层规则

页面必须通过 `miniprogram/utils/api.js` 调用数据接口。

页面层禁止：

- `wx.cloud.database()`
- 直接写集合名
- 直接拼接云存储路径
- 绕过权限工具判断关键按钮

### 3.2 服务层规则

- 用户、角色、授权：`miniprogram/services/user-service.js`
- 组织、成员、通讯录：`miniprogram/services/organization-service.js`
- 档案、历史事件、照片、账目：`miniprogram/services/event-service.js`
- 荣誉相关：`miniprogram/services/honor-service.js`
- CloudBase 适配：`miniprogram/services/providers/cloudbase-adapter.js`
- 文件上传：`miniprogram/services/file-upload-service.js`

### 3.3 权限规则

前端权限工具：

- `miniprogram/utils/permission.js`

主要角色：

- `super_admin`：超级管理员，全局管理
- `area_admin` / `region_admin`：协作区管理员
- `team_admin`：服务队管理员
- `role_manager`：岗位负责人
- `member`：普通成员

原则：

- 页面隐藏按钮不是安全边界
- 写操作必须在 `cloudfunctions/api/index.js` 再次鉴权
- 数据必须按组织、服务队、岗位和任期隔离
- 岗位负责人只维护自己有效授权范围内的档案

## 4. 组织范围映射

前端常用本地组织 ID：

- `district`：二十一协作区
- `linghang`：领航服务队
- `ailinghang`：爱领航服务队
- `yuanhang`：远航服务队
- `jingying`：精英服务队

云端组织 ID：

- `org_region_21_suihua`：二十一协作区
- `org_team_linghang`：领航服务队
- `org_team_ailinghang`：爱领航服务队
- `org_team_yuanhang`：远航服务队
- `org_team_jingying`：精英服务队

相关工具：

- 当前首页/档案范围切换：`miniprogram/utils/org-scope.js`
- 权限组织别名：`miniprogram/utils/permission.js`
- 云函数组织别名：`cloudfunctions/api/index.js`

## 5. 主要页面索引

### 5.1 首页

目录：

- `miniprogram/pages/home/`

负责：

- 当前协作区/服务队切换
- 首页顶部轮播图
- 月度重点待办
- 本月生日、本月服务入口
- 最新归档展示
- 通知入口

重点文件：

- `index.js`：数据加载、范围切换、轮播图编辑、待办交互
- `index.wxml`：首页结构
- `index.wxss`：首页样式

相关接口：

- `getHome`
- `getSession`
- `listTasks`
- `listHomeBanners`
- `saveHomeBanners`
- `listArchiveEntries`
- `getArchiveEntry`

轮播图规则：

- 超级管理员、协作区管理员、当前服务队管理员可编辑
- 切换协作区/服务队后，顶部轮播图随范围切换
- 上传必须走 `uploadOrgFile`
- 云端保存集合：`home_banners`

### 5.2 待办事项

目录：

- `miniprogram/pages/tasks/`
- `miniprogram/pages/admin/task-edit/`

负责：

- 本月重点待办列表
- 待办详情与完成状态
- 管理员创建/编辑待办
- 完成后进入归档逻辑

重点工具：

- `miniprogram/utils/todo-display.js`

相关接口：

- `listTasks`
- `getTask`
- `saveTask`
- `completeTask`
- `deleteTask`

注意：

- 首页重点待办只展示摘要
- 第二页待办入口曾按需求隐藏/弱化，修改前先确认现状
- 待办权限不能只靠前端隐藏按钮

### 5.3 档案首页

目录：

- `miniprogram/pages/archive/`

负责：

- 协作区/服务队档案目录
- 岗位负责人展示
- 荣誉事件统计
- 最近归档/历史入口
- 档案岗位负责人编辑入口

相关页面：

- `archive/index`：档案目录首页
- `archive/list`：历史档案列表
- `archive/detail`：档案详情
- `archive/edit`：新增/编辑事件记录
- `archive/confirm`：荣誉确认
- `archive/honor-wall`：荣誉墙
- `archive/position-edit`：岗位负责人编辑
- `archive/ledger`：账目
- `archive/import`：导入

相关接口：

- `listArchives`
- `listArchiveEntries`
- `getArchiveEntry`
- `saveArchiveEntry`
- `deleteArchiveEntry`
- `saveArchiveOrder`
- `listEventRecords`
- `saveEventRecord`
- `getEventRecord`
- `archiveEventRecord`

注意：

- 档案模板按分类区分，不能把公益服务模板套给所有档案
- 图片不直接塞进事件主表，必须通过图片/文件记录关联
- 岗位负责人修改后，需要同步权限授予

### 5.4 新增/编辑事件记录

目录：

- `miniprogram/pages/archive/edit/`

负责：

- 新增事件记录
- 编辑历史事件
- 上传照片
- 参与人数/参与人
- 分类记录模板
- 荣誉申报字段

相关服务：

- `miniprogram/services/event-service.js`
- `miniprogram/services/file-upload-service.js`

关键规则：

- 图片上传必须走 `uploadOrgFile`
- 事件写入必须云函数鉴权
- 普通成员不能直接编辑
- 旧数据兼容要保留

### 5.5 成员页 / 通讯录

目录：

- `miniprogram/pages/org/`

负责：

- 成员列表
- 成员详情
- 成员编辑
- 服务队筛选
- 管理员维护成员生日、资料等

相关页面：

- `org/index`
- `org/detail`
- `org/edit`

相关接口：

- `listOrg`
- `getMember`
- `saveMember`
- `deleteMember`

注意：

- 成员资料只用于内部识别，不叫实名认证
- 默认不收集身份证、人脸、证件照
- 如果成员姓名出现括号双名，按既定规则使用括号中的正式姓名

### 5.6 权限中心

目录：

- `miniprogram/pages/admin/`

相关页面：

- `admin/index`
- `admin/user-roles`
- `admin/permission-grants`
- `admin/role-assignments`
- `admin/logs`

相关接口：

- `getPlatformSession`
- `listUserRoles`
- `saveUserRole`
- `revokeUserRole`
- `listPermissionGrants`
- `savePermissionGrant`
- `revokePermissionGrant`
- `listRoleAssignments`
- `saveRoleAssignment`
- `listPlatformUsers`
- `listUserPermissions`
- `saveUserPermissions`

注意：

- 授权必须有组织范围
- 岗位授权必须有任期
- 操作必须写入 `operation_log`
- 不允许为了方便功能而扩大普通成员权限

### 5.7 荣誉模块

目录：

- `miniprogram/pages/honors/`
- `miniprogram/pages/archive/honor-wall/`
- `miniprogram/pages/archive/confirm/`

负责：

- 荣誉记录
- 荣誉确认
- 荣誉墙展示
- 星级统计

相关接口：

- `listHonorRecords`
- `saveHonorRecord`
- `deleteHonorRecord`
- `listHonorConfirmations`
- `confirmArchiveEvent`
- `confirmGrantHonor`
- `markHonorNotGranted`
- `listHonorVerifications`
- `verifyHonorForWall`
- `markHonorNeedRecheck`
- `getArchiveHonorStats`

注意：

- 当前荣誉事件星级按五星、四星、三星、二星、一星方向调整
- 修改荣誉逻辑时要同时检查档案页统计和荣誉墙

### 5.8 我的 / 个人中心

目录：

- `miniprogram/pages/profile/`

负责：

- 当前登录信息
- 个人资料编辑
- 组织归属展示

相关接口：

- `getSession`
- `getPlatformSession`
- `saveMyProfile`
- `saveUserMemberCode`
- `listProfileOrganizations`

### 5.9 服务队云盘

目录：

- `miniprogram/pages/media-drive/`
- `miniprogram/services/media-drive-service.js`

负责：

- 四个服务队相册互相查看
- 目标服务队管理员上传、分类和删除照片视频
- 会议、联谊、关爱、服务与未分类相册

相关接口：

- `listMediaTeams`
- `listMediaAlbums`
- `getMediaAlbum`
- `saveMediaAlbum`
- `deleteMediaFile`
- `deleteMediaAlbum`

## 6. 云函数索引

主文件：

- `cloudfunctions/api/index.js`

主要职责：

- 登录态与平台用户
- 权限与角色
- 组织、成员、岗位
- 档案、事件、照片
- 待办、通知、活动
- 账目、荣誉
- 首页轮播图
- 操作日志

新增或修改云函数后必须：

1. 本地语法检查
2. 跑相关测试
3. 部署 `api`
4. 微信开发者工具重新预览

## 7. 云数据库集合索引

核心集合：

- `organization`
- `user`
- `user_role`
- `permission_grant`
- `user_permissions`
- `position`
- `role_assignment`
- `event_record`
- `event_image`
- `media_album`
- `file_records`
- `operation_log`
- `ledger_record`
- `honor_record`
- `home_banners`

兼容/旧集合：

- `members`
- `tasks`
- `org_units`
- `activities`
- `photos`
- `notices`
- `history`
- `audit_logs`

原则：

- 新模型优先使用业务主键 `id`
- 不把 CloudBase `_id` 当跨平台业务主键
- 图片和文件保存在独立记录中
- 删除优先软删除，保留审计链路

## 8. 文件上传规则

统一入口：

- `miniprogram/services/file-upload-service.js`
- 方法：`uploadOrgFile(params)`

禁止：

- 页面自己拼 `cloudPath`
- 页面直接调用云存储上传后不写 `file_records`
- 图片直接塞进事件记录

上传后应写入：

- `file_records`
- 必要时关联 `event_image`

首页轮播图：

- `resourceType = home_banner`
- `resourceId = 当前组织 ID`
- `module = photos`
- `leaderRole = 首页轮播`

事件照片：

- `resourceType = event_record`
- `resourceId = 事件 ID`
- `module = archives` 或 `history`

服务队云盘：

- `resourceType = media_album`
- `resourceId = 相册业务 ID`
- `module = photos`
- `leaderRole = 服务队云盘`

## 9. 发布与集成流程

正式集成目录：

```bash
/Users/xz/Documents/Codex/district21-miniprogram
```

正式分支：

```bash
codex/main
```

集成前检查：

```bash
git status --short --branch
git branch --show-current
git log -1 --oneline
```

推荐检查命令：

```bash
node --check cloudfunctions/api/index.js
node --check miniprogram/pages/home/index.js
node --check miniprogram/utils/api.js
node --check miniprogram/services/user-service.js
git diff --check
node --test tests/*.test.js
rg -n "<<<<<<<|=======|>>>>>>>|wx\\.cloud\\.database\\(" miniprogram cloudfunctions tests
```

同步 GitHub：

```bash
git add <changed-files>
git commit -m "<message>"
git push origin codex/main
```

部署 `api` 云函数：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d6ghj5dev32a15a81 \
  --names api \
  --project /Users/xz/Documents/Codex/district21-miniprogram \
  --remote-npm-install
```

如果 CLI 失败，用微信开发者工具手动部署：

1. 打开微信开发者工具
2. 导入 `/Users/xz/Documents/Codex/district21-miniprogram`
3. 找到 `cloudfunctions/api`
4. 右键 `api`
5. 选择“上传并部署：云端安装依赖”

## 10. 常见故障

### 10.1 云函数部署 ret=41002

表现：

```text
getCloudAPISignedHeader failed
ret=41002
system error
```

常见原因：

- 微信开发者工具登录态失效
- 当前账号没有云开发部署权限
- 微信云 API 临时签名失败
- 开发者工具后台服务异常

处理：

1. 重新登录微信开发者工具
2. 确认当前账号是小程序开发者/管理员
3. 在开发者工具里手动部署 `cloudfunctions/api`
4. 稍后重试 CLI

注意：这个错误通常不是代码语法错误。

### 10.2 前端无变化

检查：

- 是否导入了项目根目录，而不是 `miniprogram/`
- 是否切到正确分支 `codex/main`
- 是否拉取了最新 GitHub 代码
- 微信开发者工具是否重新编译
- 云函数是否已经部署
- 是否清理了本地缓存

### 10.3 云端写入无效

检查：

- 对应云函数 action 是否已部署
- 当前用户是否有平台用户身份
- 当前用户是否有组织管理员或岗位权限
- 写操作是否被云函数拒绝
- 是否使用了旧集合或本地 fallback 数据

### 10.4 管理员看得到按钮但保存失败

检查：

- 前端 `permission.js` 权限判断
- 云函数 `canAdministerOrganization`
- `user_role` 是否有有效组织权限
- `role_assignment` 是否在任期内
- 上传是否走 `uploadOrgFile`
- `file_records` 是否通过校验

## 11. 修改前定位建议

按用户说法快速定位：

- “首页”“切换服务队”“轮播图”：看 `pages/home`、`utils/org-scope.js`、`home_banners`
- “待办”“重点待办”：看 `pages/tasks`、`pages/admin/task-edit`、`utils/todo-display.js`
- “档案页”“历史事件”：看 `pages/archive`
- “新增事件记录”：看 `pages/archive/edit`
- “负责人”“岗位资料”：看 `pages/archive/position-edit`、`role_assignment`
- “成员页”“服务队成员”：看 `pages/org`、`listOrg`
- “权限中心”：看 `pages/admin/user-roles`、`permission-grants`、`role-assignments`
- “上传照片别人看不见”：看 `file-upload-service.js`、`saveFileRecord`、`listEventImages`
- “部署云”：看 `cloudfunctions/api`
- “审核驳回”：看 `docs/review-rejection-log.md`

## 12. 后续维护建议

每次完成较大功能后，更新本索引：

- 新增页面
- 新增云函数 action
- 新增集合
- 修改权限模型
- 修改发布流程
- 新增常见故障

索引目标不是替代源码，而是减少重复搜索和减少改错模块的概率。
