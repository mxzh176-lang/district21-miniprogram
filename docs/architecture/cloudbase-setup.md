# 21纪事本 CloudBase 初始化说明

当前云环境：

```text
cloud1-d6ghj5dev32a15a81
```

AppID：

```text
wxfe3c3da5ae16aa1d
```

## 1. 当前状态

微信开发者工具截图显示“环境不可用”。这通常不是项目代码错误，优先检查：

1. 微信开发者工具是否用正确微信号登录。
2. 当前微信号是否是该小程序/云开发环境的管理员或开发者。
3. 云开发环境是否被欠费、冻结、删除或尚未完成开通。
4. 开发者工具左上角云环境是否选中 `cloud1`。
5. 点击“刷新重试”，必要时退出开发者工具重新登录。

## 2. 必须创建的集合

请在云开发控制台“数据库”中创建以下集合：

```text
organization
user
user_role
event_record
event_image
operation_log
```

旧集合可以先保留：

```text
members
tasks
org_units
activities
photos
notices
history
audit_logs
```

这样不会影响已经上传的体验版/审核版。

## 3. 数据库权限

建议所有集合都设置为：

```json
{
  "read": false,
  "write": false
}
```

原因：

- 小程序端不直接读写数据库。
- 所有读写统一走云函数。
- 权限、日志、审核都在云函数中控制。

## 4. 初始数据

本仓库已准备：

```text
cloudbase/seed-data.json
```

里面包含：

- 中国狮子联会
- 哈尔滨代表处
- 第二十一协作区
- 领航、爱领航、远航、精英四个服务队
- 两条远航服务队纪事示例

如果控制台支持 JSON 导入，可先按集合分别导入：

- `organization` 导入 `seed-data.json` 中的 `organization`
- `event_record` 导入 `seed-data.json` 中的 `event_record`

## 5. 云函数部署

云函数目录：

```text
cloudfunctions/api
```

微信开发者工具操作：

1. 打开项目根目录。
2. 左侧找到 `cloudfunctions/api`。
3. 右键 `api`。
4. 选择“上传并部署：云端安装依赖”。

### 云函数调用权限

建议云函数调用权限使用：

```json
{
  "*": {
    "invoke": "auth != null && auth.loginType != 'ANONYMOUS'"
  }
}
```

本仓库已保存一份可复制文件：

```text
cloudbase/function-invoke-policy.json
```

这条规则的含义是：只有已登录微信用户，且不是匿名登录，才能调用云函数。

注意：这不是业务管理员权限。它只解决“能不能调用云函数”。真正的组织权限仍然要在云函数内部通过：

```text
user
user_role
organization
```

判断，例如 `team_admin` 只能管理本服务队，`region_admin` 才能管理协作区下所有服务队。

## 6. 下一步改造顺序

为了不影响当前体验版，建议分三步：

1. 保留旧接口，新增新集合。
2. 云函数新增新接口，例如：
   - `listOrganizations`
   - `listEventRecords`
   - `saveEventRecord`
   - `uploadEventImage`
   - `listUserRoles`
3. 小程序页面逐步从旧集合切换到新集合。

不要一次性删除旧集合。

## 7. 未来迁移准备

`event_image` 已预留：

```text
provider
fileId
objectKey
imageUrl
```

当前用微信云存储：

```text
provider = wechat_cloud
fileId = cloud://...
```

未来迁移阿里云 OSS：

```text
provider = aliyun_oss
objectKey = oss/path/to/file.jpg
imageUrl = https://...
```

纪事主表 `event_record` 不直接存图片，因此图片迁移不会影响纪事数据。
