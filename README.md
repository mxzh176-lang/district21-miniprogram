# 二十一协作区微信小程序

这是二十一协作区/远航服务队公益服务档案与协作小程序。当前版本是可直接在微信开发者工具运行的演示版，数据使用本地模拟数据，不依赖服务器即可预览。

## 快速打开

微信开发者工具导入目录：

```text
/Users/xz/Documents/Codex/district21-miniprogram
```

请导入项目根目录，不要导入 `miniprogram/` 子目录。

VS Code 打开目录：

```text
/Users/xz/Documents/Codex/district21-miniprogram
```

旧目录仍可作为备份：

```text
/Users/xz/Documents/Codex/2026-06-16/github/district21-miniprogram
```

AppID 已写入 `project.config.json`：

```text
wxfe3c3da5ae16aa1d
```

## 目录结构

```text
district21-miniprogram/
├── miniprogram/          # 微信小程序前端源码
│   ├── pages/            # 页面
│   ├── data/             # 本地演示数据与知识库
│   ├── utils/            # 本地 API、权限、AI 辅助工具
│   ├── images/           # 小程序图片资源
│   ├── app.js
│   ├── app.json
│   └── app.wxss
├── cloudfunctions/       # 云函数占位与后续接口
├── docs/                 # 需求、说明、开发文档
│   ├── requirements/     # 需求文档
│   └── guides/           # 配置和演示说明
├── design/               # 页面概念稿和视觉参考
├── scripts/              # 文档转换、档案导入脚本
├── project.config.json   # 微信开发者工具项目配置
├── database.rules.json   # 云数据库规则占位
└── README.md
```

## 当前重点功能

- 首页轮播与六月重点待办
- 待办创建、筛选、勾选完成
- 完成待办后自动生成历史事件并归入档案
- 远航服务队 8 个主档案：队长、一二三副队长、秘书、纠察、司库、总务
- 副队长档案展开显示对应委员会主席
- 管理员按分类模板创建待办：公益服务、会议纪要、对外交流、狮友关爱、司库、总务等
- 档案上传按分类生成草稿，会议纪要和公益服务模板已分离
- 中国狮子联会与地方狮子会公开资料知识库入口

## 常用命令

查看当前改动：

```bash
git status
```

提交代码：

```bash
git add .
git commit -m "整理项目目录"
```

推送到 GitHub：

```bash
git push origin codex/main:main
```

## 开发提示

- 微信开发者工具必须选择项目根目录，也就是包含 `project.config.json` 的目录。
- 如果页面没有更新，先执行“清缓存 -> 清除全部缓存”，再重新编译。
- `project.private.config.json` 是本机开发者工具配置，已被 `.gitignore` 忽略。
- 当前演示数据在 `miniprogram/data/`，后续接入云开发或正式后端时再替换 `miniprogram/utils/api.js`。
