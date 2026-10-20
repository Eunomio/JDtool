---
title: 岗位探索与求职准备助手
sdk: docker
app_port: 7860
---

# 岗位探索与求职准备助手

面向求职者的网页应用，用于保存目标岗位、理解JD、整理真实项目经历和准备面试。

## 当前实现

已建立 Next.js、React、TypeScript 和 Dexie 项目，可通过正文手动添加、编辑、搜索和删除岗位，修改投递状态与下一步行动。记录保存到当前浏览器的 IndexedDB，支持删除后撤销。

AI解析、截图识别、项目推荐、岗位比较、模拟面试和剧情按开发规划继续实现。当前无需配置 ChatECNU 即可运行岗位清单。

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

## ModelScope部署

选择 Docker 创空间，使用平台当前提供的免费CPU配置。应用监听 `0.0.0.0:7860`。当前空间：<https://modelscope.cn/studios/Eunomio/JDtool>。

Dockerfile包含生产构建，支持后续迁移到其他Docker托管环境。`GET /api/health` 用于检查程序是否启动。用户业务数据保存在浏览器；服务端调用额度等后续需要持久化的数据使用平台持久化目录。

GitHub仓库：<https://github.com/Eunomio/JDtool>。

浏览器测试覆盖桌面和手机尺寸下的新增、刷新保存、状态修改、编辑、删除与撤销。Windows使用已安装的Edge，其他系统先执行 `npx playwright install chromium`。

## 产品资料

- [产品需求](PRD-岗位探索与求职准备助手.md)
- [开发规划](开发规划-网页首版.md)
