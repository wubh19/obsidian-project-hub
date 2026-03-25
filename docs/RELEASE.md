# 版本发布与文档同步清单

每次版本更新，都必须同步更新代码、版本号和文档，避免发布包与说明不一致。

## 必改文件

- `package.json`
- `manifest.json`
- `versions.json`
- `README.md`
- `docs/DEPLOY.md`
- `docs/RELEASE.md`
- `demo/README.md`
- `demo/Projects/**`

## 发布步骤

1. 更新功能代码
2. 运行 `npm.cmd run build`
3. 更新版本号
4. 更新 README 中的功能范围和安装说明
5. 同步更新 demo 数据，确保可以直接复制到 Vault 使用
6. 更新部署说明中新增或变更的步骤
7. 记录本版本新增能力、限制和已知风险
8. 在真实 Vault 中完成回归验证

## 每次版本至少要确认的用户可见能力

- 数据解析是否兼容现有 Markdown
- `Projects/<项目>/Versions` 和 `Projects/<项目>/Ops` 目录是否能正确识别和归属
- `Projects/<项目>/Versions/*.md` 内的 checklist 是否能正确解析为版本任务
- `Projects/<项目>/Ops/Ops.md` 内的 checklist 是否能正确解析为运维任务
- 复制 `demo/Projects` 到 Vault 根目录后是否可以直接使用
- Dashboard 是否正常打开
- 看板拖拽是否会回写 `status`
- 快速新建任务是否生成正确 Frontmatter
- 版本中心统计是否正确
- Roadmap 是否可正常渲染

## 建议的发布说明模板

```md
## x.y.z

### Added
- 新增能力

### Changed
- 行为变化

### Fixed
- 问题修复

### Notes
- 已知限制或迁移说明
```