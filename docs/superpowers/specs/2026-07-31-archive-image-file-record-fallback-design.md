# 历史事件图片关联回退设计

## 审核影响

分类：`审核安全`。

本次只修复内部组织档案中已授权图片的读取，不新增公开发布、社交互动、敏感个人信息或跨组织访问。页面仍通过 `miniprogram/utils/api.js` 调用接口，云函数继续执行现有历史档案读取权限。

## 问题与根因

历史事件页面只使用 `listArchiveEntries` 返回的 `photos`。数据链路为：

1. `miniprogram/services/event-service.js` 将云端 `record.images` 映射成 `photos`；
2. `cloudfunctions/api/index.js` 的 `listEventRecords` 目前只从 `event_image` 读取图片关联；
3. 上传流程先通过 `uploadOrgFile()` 上传并写入 `file_records`，之后才调用 `saveEventImages` 写入 `event_image`。

因此旧数据、历史导入数据，或上传成功后 `saveEventImages` 未完成的数据，会出现文件及 `file_records` 仍存在，但 `event_image` 缺少有效关联的情况。页面最终得到空 `photos`，只能显示无图占位。

## 采用方案

保持 `event_image` 为事件图片的主要关联来源，并在某一可见事件没有有效 `event_image` 时，从 `file_records` 读取满足以下条件的记录作为兼容回退：

- `resourceType = event_record`；
- `resourceId` 等于当前事件业务 ID；
- `status = active`；
- 文件类型为图片；
- 组织 ID 与事件组织一致。

将 `file_records.fileID` 规范化为列表现有的 `fileId` 结构，再统一调用临时访问链接转换。已经存在有效 `event_image` 的事件不混入回退记录，避免重复和顺序变化。

## 数据与权限边界

- 先按现有 `listEventRecords` 权限过滤出用户可见事件，再只为这些事件关联文件。
- 不允许通过 `file_records` 获取其他组织或其他资源类型的文件。
- 不修改、不删除旧 `event_image`、`file_records` 或云存储文件。
- 不在页面层直接访问 CloudBase 或集合。
- 新上传仍必须走 `uploadOrgFile()`，本次不改变上传入口。

## 异常处理

- `event_image` 正常时沿用当前结果。
- `file_records` 不存在或查询失败时记录警告并保持现有行为，不使整个历史事件列表失败。
- 临时链接转换失败时保留原有可用 URL；无可用地址的记录不输出到 `photos`。

## 测试与验收

- 回归测试证明：有 `event_image` 时仍优先使用原关联。
- 回归测试证明：无 `event_image` 但有匹配的活动 `file_records` 时能返回图片。
- 回归测试证明：其他组织、其他资源类型、已删除和非图片文件不会回退展示。
- 执行云函数语法检查、相关测试、完整测试和 `git diff --check`。
- 修改涉及 `cloudfunctions/api`，测试线上效果前必须重新部署 API 云函数；同时需要重新上传小程序版本，确保客户端使用对应代码版本。
