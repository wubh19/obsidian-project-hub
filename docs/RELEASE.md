# 版本发布与文档同步清单

每次版本更新，都必须同步更新代码、版本号和文档，避免发布包与说明不一致。

## 必改文件

- `package.json`
- `manifest.json`
- `versions.json`
- `README.md`
- `docs/DEPLOY.md`
- `docs/RELEASE.md`
- `docs/releases/<version>.md`
- `Projects/obsidian-project-hub/**`

## 发布步骤

1. 更新功能代码
2. 执行 `npm.cmd run version:bump -- <version>`
3. 更新 README 中的功能范围和安装说明
4. 同步更新当前项目数据 `Projects/obsidian-project-hub/**`
5. 填写 `docs/releases/<version>.md`
6. 更新部署说明中新增或变更的步骤
7. 执行 `npm.cmd run release`
8. 在真实 Vault 中完成回归验证

## 发布记录要求

每个版本必须新增一个对应文件：`docs/releases/<version>.md`。

该文件至少要包含：

- `Checklist`
- `Added`
- `Changed`
- `Fixed`
- `Notes`

其中 `Checklist` 必须勾选这些项目：

- `README.md`
- `docs/DEPLOY.md`
- `docs/RELEASE.md`
- `Projects/obsidian-project-hub/**`

`npm.cmd run release:check` 会自动验证这些项，缺一项就阻止发布。

## 版本升级脚本

执行：

```powershell
npm.cmd run version:bump -- 0.4.3
```

这个脚本会自动：

- 更新 `package.json` 中的版本号
- 更新 `manifest.json` 中的版本号
- 为 `versions.json` 新增当前版本对应的 `minAppVersion`
- 生成 `docs/releases/0.4.2.md` 模板

如果需要显式指定最低 Obsidian 版本：

```powershell
npm.cmd run version:bump -- 0.4.2 1.5.0
```

## 每次版本至少要确认的用户可见能力

- 数据解析是否兼容现有 Markdown
- `Projects/<项目>/Versions` 目录是否能正确识别和归属
- `Projects/<项目>/Versions/*.md` 内的 checklist 是否能正确解析为版本任务
- Dashboard 是否正常打开
- 看板拖拽是否会回写 `status`
- 快速新建任务是否生成正确 Frontmatter
- 版本中心统计是否正确
- Roadmap 是否可正常渲染

## 建议的发布说明模板

```md
## x.y.z

### Checklist
- [x] README.md
- [x] docs/DEPLOY.md
- [x] docs/RELEASE.md
- [x] Projects/obsidian-project-hub/**

### Added
- 新增能力

### Changed
- 行为变化

### Fixed
- 问题修复

### Notes
- 已知限制或迁移说明
```