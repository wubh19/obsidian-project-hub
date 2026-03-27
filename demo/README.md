# Demo 使用说明

这个目录提供一套可以直接复制到 Obsidian Vault 根目录的单项目演示数据。

## 目录说明

- `demo/Projects` 可以直接复制到 Vault 根目录
- 演示项目名称固定为 `demo`
- 任务采用“版本内 checklist + Ops 兜底”模式
- 复制完成后，打开 `Project Hub` 就能看到项目面板、任务看板、版本中心、图表和 Roadmap

## 快速使用

1. 将 `demo/Projects` 整个复制到你的 Vault 根目录
2. 确保插件文件已经放到 `.obsidian/plugins/obsidian-project-hub/`
3. 在 Obsidian 里启用 `Project Hub`
4. 打开命令面板，执行 `Open Project Hub dashboard`

如果你在本仓库内发布版本，推荐直接执行 `npm.cmd run release`，它会自动把插件文件、当前项目数据和 `demo/Projects` 一起同步到本地 Vault。

## Windows 复制示例

```powershell
$vault = "C:\path\to\YourVault"
Copy-Item .\demo\Projects -Destination $vault -Recurse -Force
```

## Demo 约束

- 这个 demo 是发布资产的一部分
- 后续每个版本更新时，都必须同步检查和更新 `demo/`
- 新功能如果需要示例数据，必须先补进 demo 再发布