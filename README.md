# obsidian-project-hub

一个基于 Markdown + YAML 的 Obsidian 项目管理插件，围绕 Task 建模，提供项目面板、版本中心、任务看板、Dashboard 图表和 Roadmap 可视化。

## 当前版本

- 版本号：0.4.1
- 数据模型：`project`、`version`、`task`、`roadmap`
- 支持真实 Kanban 拖拽修改状态
- 支持快速新建任务并自动生成 Markdown 文件
- 支持版本中心、状态分布、按人统计、燃尽图、Roadmap 时间线

## 安装与打包

### 本地开发

```bash
npm.cmd install
npm.cmd run dev
```

### 生产构建

```bash
npm.cmd run build
```

构建后会生成以下插件发布文件：

- `main.js`
- `manifest.json`
- `styles.css`

### 部署到 Obsidian

1. 打开 Obsidian Vault 的插件目录：`.obsidian/plugins/obsidian-project-hub/`
2. 将 `main.js`、`manifest.json`、`styles.css` 复制进去
3. 在 Obsidian 设置中启用社区插件并打开 `Project Hub`

更完整的打包和发布说明见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## Demo

仓库内置了一个可直接使用的演示目录：`demo/`

- 将 `demo/Projects` 复制到 Vault 根目录后即可直接使用
- Demo 只保留一个项目，项目名称固定为 `demo`
- 打开插件面板后，可以立刻看到版本、运维任务、任务看板、版本中心、Dashboard 图表和 Roadmap
- Demo 使用说明见 [demo/README.md](demo/README.md)

## 使用说明

### 推荐目录结构

插件默认推荐下面这套目录约定，并且会从 `Projects/<项目名>/...` 自动推断 `project` 归属：

```text
Projects/
├── DataSync/
│   ├── 00_Project.md
│   ├── 01_Roadmap.md
│   ├── Versions/
│   │   ├── V3.5.0.md
│   │   ├── V3.6.0.md
│   ├── Ops/
│   │   ├── Ops.md
│   ├── Docs/
│   │   ├── 技术方案.md
│   │   ├── 会议记录.md
```

### 数据约定

所有业务对象都基于 Markdown Frontmatter。字段存在时优先读取 YAML；字段缺失时会按目录路径推断项目。

### Project

```md
---
type: project
name: DataSync
owner: 张三
status: active
start: 2026-01-01
end: 2026-06-01
---

# DataSync 项目
```

### Version

```md
---
type: version
version: 3.5.0
status: doing
start: 2026-03-01
end: 2026-04-15
---

# V3.5.0
```

### 版本任务

```md
---
type: version
version: 3.5.0
status: doing
start: 2026-03-01
end: 2026-04-15
---

# V3.5.0

## Tasks

- [ ] 升级 JDK17 @张三 🔥
- [ ] 升级 SpringBoot @李四
- [x] 完成方案设计 @王五
```

### 运维任务

```md
---
type: ops
---

# 运维任务

## Tasks

- [ ] 服务器巡检 @运维A
- [ ] 数据备份 @运维B
- [x] 日志清理
```

### Checklist 解析规则

- `@张三`：负责人
- `🔥`：高优先级
- `⚠️`：中优先级
- `🚧`：进行中任务标记
- `📅2026-03-30`：截止日期

### Roadmap

```md
---
type: roadmap
---

| Version | Start | End | Status |
|--------|------|-----|--------|
| 3.5.0  | 03-01 | 04-15 | 开发中 |
| 3.6.0  | 04-20 | 06-01 | 规划中 |
```

也支持结构化全日期表格：

```md
| version | start | end | status |
|--------|------|-----|--------|
| 3.5.0  | 2026-03-01 | 2026-04-15 | doing |
| 3.6.0  | 2026-04-20 | 2026-06-01 | plan |
```

## 主要功能

### Dashboard

- 项目健康度卡片
- 状态分布
- 按人统计
- 燃尽图

### Kanban

- Todo / Doing / Done 看板
- 卡片拖拽更新 checklist 状态
- 面板内菜单修改状态
- 快速打开对应 Markdown 任务文件
- 快速创建默认写入版本文件；未选版本时写入 `Projects/<项目>/Ops/Ops.md`

### 版本中心

- 版本列表
- 版本完成率
- 版本任务聚合

### Roadmap

- 解析 Markdown 表格
- 渲染时间线风格甘特条

## 命令

- `Open Project Hub dashboard`
- `Refresh Project Hub data`
- `Quick create project task`

## 版本维护要求

后续每个版本发布时都要同步更新文档和版本号，最少需要一起更新：

- `README.md`
- `docs/DEPLOY.md`
- `docs/RELEASE.md`
- `demo/README.md`
- `demo/Projects/**`
- `package.json`
- `manifest.json`
- `versions.json`

具体检查项见 [docs/RELEASE.md](docs/RELEASE.md)。