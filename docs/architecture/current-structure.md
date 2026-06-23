# 当前架构与升级顺序

## 调用边界

```text
pages
  -> utils/api.js
      -> organization-service
      -> user-service
      -> event-service
      -> assistant-service
          -> providers/cloudbase-adapter
              -> cloudfunctions/api
```

- 页面不直接访问数据库或调用云函数。
- 页面权限展示统一调用 `utils/permission.js`。
- 远端读取采用云端优先、本地兜底。
- 远端写入失败直接报错，避免界面成功但云数据库无记录。
- CloudBase 专有 API 仅存在于 `services/providers/cloudbase-adapter.js`。

## 当前目录

```text
district21-miniprogram/
├── cloudbase/
│   ├── schema.json
│   ├── seed-data.json
│   └── function-invoke-policy.json
├── cloudfunctions/
│   └── api/
│       ├── index.js
│       └── package.json
├── miniprogram/
│   ├── data/                       # 本地兜底和少量示例
│   ├── images/
│   ├── pages/
│   ├── services/
│   │   ├── organization-service.js
│   │   ├── user-service.js
│   │   ├── event-service.js
│   │   ├── assistant-service.js
│   │   ├── platform-service.js
│   │   └── providers/
│   │       └── cloudbase-adapter.js
│   └── utils/
│       ├── api.js                  # 页面统一 API 入口
│       ├── permission.js           # 角色、组织、菜单、岗位权限
│       ├── auth.js
│       └── assistant.js
└── docs/
    └── architecture/
```

## 数据集合状态

### 已在云端建立并投入当前流程

| 集合 | 用途 | 当前状态 |
|---|---|---|
| organization | 无限层级组织树 | 已建立，已有协作区和四个服务队数据 |
| user | 微信登录用户 | 已建立，登录会话已接入 |
| user_role | 用户组织角色 | 已建立，超级管理员已初始化 |
| event_record | 档案和历史事件的统一主记录 | 已建立，纪事增删改查已接入 |
| event_image | 纪事图片独立记录 | 已建立，查询已接入，上传待迁移 |
| operation_log | 新增、修改、删除、授权日志 | 已建立，核心写操作已记录 |

### 已完成 Schema，需下一阶段在云控制台创建

| 集合 | 用途 | 优先级 |
|---|---|---|
| position | 协作区、服务队和委员会岗位定义 | P0 |
| role_assignment | 年度岗位负责人授权与有效期 | P0 |
| todo | 待办、完成状态与次月归档 | P1 |
| ledger_record | 公开账目与受限维护 | P1 |

对应云函数和页面状态：

- `position`、`role_assignment`：岗位初始化、授权查询、任期保存和自动交接逻辑已实现。
- `ledger_record`：公开查询、司库/管理员写权限和独立账目页面已实现。
- `todo`：当前仍使用本地兜底实现本月完成与次月归档，云端迁移排在岗位授权稳定之后。
- 新集合尚未在云控制台创建前，读取会回退本地；写入不会伪装成功。

`event_record` 同时承担档案内容和历史事件，不再另建 `archives` 与
`history_events` 两份重复数据。页面通过组织、岗位、状态和日期生成不同视图。

## 实施顺序

1. 创建并初始化 `position`、`role_assignment`。
2. 将当前页面岗位人员替换为年度授权查询结果。
3. 将管理员角色维护迁移到 `user_role` 和 `role_assignment` 云函数。
4. 创建 `todo`、`ledger_record` 并迁移本地兜底数据。
5. 完成上述基础后，再开发纪事审核流程。
