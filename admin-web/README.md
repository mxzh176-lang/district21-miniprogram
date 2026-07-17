# 21纪事本权限图谱后台

## 本地运行

1. 将 `.env.example` 复制为 `.env.local`，确认云环境 ID 与云函数名。
2. 执行 `npm install` 和 `npm run dev`。
3. 在 CloudBase Web 安全域名中登记本地及正式后台域名，并允许匿名身份调用 `api`；业务鉴权仍由后台令牌完成。

## 首次管理员初始化

1. 创建 `admin_accounts`、`admin_sessions` 集合及 `cloudbase/schema.json` 中的索引。
2. 为 `api` 云函数设置强随机环境变量 `ADMIN_BOOTSTRAP_SECRET`。
3. 调用 `api` 的 `bootstrapAdminAccount`，传入 `bootstrapSecret`、`username`、至少 12 位密码和现有超级管理员 `userId`。
4. 后台当前使用账号密码登录，密码必须至少 12 位。
5. 首次账号创建成功后删除 `ADMIN_BOOTSTRAP_SECRET` 并重新部署 `api`。

后台静态文件由 `npm run build` 输出到 `dist/`，可发布至同一 CloudBase 环境的静态网站托管。
