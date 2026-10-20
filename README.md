---
title: 岗位探索与求职准备助手
sdk: docker
app_port: 7860
---

# 岗位探索与求职准备助手

面向求职者的网页应用，用于保存目标岗位、理解JD、整理真实项目经历和准备面试。

## 当前实现

采用 Next.js、React、TypeScript 和 Dexie 实现网页应用。岗位、项目、准备卡、比较、练习和计划保存在各自浏览器的 IndexedDB。

- 岗位链接读取、动态页面读取、最多3张截图识别、正文解析，共用可编辑的校对界面；读取失败后保留链接并可换截图或正文。
- 岗位按方向分组，可搜索筛选、编辑、删除撤销，记录投递状态、投递与面试日期、结束原因和下一步行动。
- DOCX、文字型PDF、扫描PDF、作品集与手动项目导入；事实核对、重复项目合并、项目阶段与脱敏展示预览。
- 真实模型按JD推荐、排序和改写项目；每条文字回指事实与岗位要求，增加事实语义核对，采用后可复制；支持手动事实组装与版本保存。
- 四栏准备卡、带来源的公司资料、已确认信息与业务方向推测分开呈现。
- 相近岗位及跨方向比较，准备事项加入本周计划，支持完成状态和手动排序。
- 文本面试、一次追问和分维度反馈；两节点岗位剧情、角色对话、后果与复盘；新JD可按职责生成对应任务。
- 本地数据备份与跨浏览器恢复，6个岗位样本和5个脱敏项目样本。

AI功能需要在服务端配置 `CHAT_ECNU_API_KEY`。招聘网站需要登录、岗位已下线或限制读取时，使用截图或正文继续。示例岗位采用已核对的摘要，最新内容以来源招聘页为准。

## 本地运行

使用 Node.js 24：

```sh
npm ci
npm run dev
```

访问 `http://localhost:7860`。

```sh
npm run typecheck
npm run build
npm run test:e2e
npm start
```

## 配置与账号检查

复制 `.env.example` 为 `.env.local`，在本地填写令牌。`.env.local` 和 `.local/` 不提交到仓库，Docker构建也不读取这些文件。

```sh
node scripts/modelscope.mjs probe
node scripts/modelscope.mjs info JDtool
```

`probe` 只读取账号名称与Docker可用规格。`create` 仅选择明确标记免费的CPU资源并创建私有创空间，`deploy` 触发已有免费空间部署。后两项会修改远程资源。

运行网站需要的模型配置：`CHAT_ECNU_API_KEY`、可选的 `CHAT_ECNU_BASE_URL` 与 `CHAT_ECNU_MODEL`。部署时将密钥写入创空间Secrets，普通配置写入Variables，避免把本地环境文件放进镜像。

`DAILY_MODEL_REQUEST_LIMIT` 默认200，统计每次实际模型调用；生成后的事实核对也计一次。`APP_DATA_DIR` 指向持久化目录，只存调用计数。另设每分钟请求限制与模型并发限制，日志省略用户正文和凭据。

## ModelScope部署

选择 Docker 创空间，使用平台当前提供的免费CPU配置。应用监听 `0.0.0.0:7860`。当前空间：<https://modelscope.cn/studios/Eunomio/JDtool>。

Dockerfile包含生产构建、PDF识别资源与动态网页读取使用的 Chromium，支持后续迁移到其他Docker托管环境。`GET /api/health` 用于检查程序是否启动。用户业务数据保存在浏览器，服务端调用额度保存在 `/mnt/workspace/jdtool`。

GitHub仓库：<https://github.com/Eunomio/JDtool>。

浏览器测试覆盖桌面和手机尺寸下的链接与截图校对、失败接续、DOCX/PDF读取、项目确认、准备与组装、比较与计划、面试与剧情、删除撤销和备份恢复。Windows使用已安装的Edge，其他系统先执行 `npx playwright install chromium`。浏览器交互检查使用固定接口响应；真实模型与真实招聘链接另行验证，避免将交互检查当作识别准确率证明。

## 产品资料

- [产品需求](PRD-岗位探索与求职准备助手.md)
- [开发规划](开发规划-网页首版.md)
