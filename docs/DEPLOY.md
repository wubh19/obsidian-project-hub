# 打包与部署说明

## 构建环境

- Node.js 18+
- Windows PowerShell 下建议使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`

## 本地开发

```powershell
npm.cmd install
npm.cmd run dev
```

## 生产打包

```powershell
npm.cmd run build
```

## 推荐发布命令

```powershell
npm.cmd run release
```

如果是准备一个新版本，先执行：

```powershell
npm.cmd run version:bump -- 0.4.2
```

再补完 `docs/releases/0.4.2.md` 中的内容与勾选项，然后执行：

```powershell
npm.cmd run release
```

这个命令会自动完成三件事：

1. 构建插件产物
2. 检查版本号与发布文档是否同步
3. 自动部署到本地 Obsidian Vault，包括：
    - 插件文件 `main.js`、`manifest.json`、`styles.css`
    - 当前项目数据 `Projects/obsidian-project-hub/**`
    - demo 数据 `demo/Projects/**`

首次执行前，先在仓库根目录创建本地配置文件：

```powershell
Copy-Item .\obsidian-project-hub.deploy.example.json .\obsidian-project-hub.deploy.local.json
```

然后编辑 `obsidian-project-hub.deploy.local.json`，至少填写：

```json
{
   "vaultPath": "C:/path/to/YourVault"
}
```

当前仓库已经生成本地配置文件，并指向检测到的 Vault：`C:/wubh/note/ingenico`。

打包产物为项目根目录中的：

- `main.js`
- `manifest.json`
- `styles.css`

## 部署到本地 Obsidian Vault

假设 Vault 名称为 `MyVault`，插件目录一般是：

```text
<Vault>/.obsidian/plugins/obsidian-project-hub/
```

自动部署脚本会将下列文件复制到该目录：

- `main.js`
- `manifest.json`
- `styles.css`

然后在 Obsidian 中：

1. 打开 `Settings`
2. 进入 `Community plugins`
3. 关闭 `Restricted mode`（如果尚未关闭）
4. 启用 `Project Hub`

## 导入 Demo 数据

如果你想直接体验插件效果，可以把仓库里的 `demo/Projects` 复制到 Vault 根目录。

```powershell
$vault = "C:\path\to\YourVault"
Copy-Item .\demo\Projects -Destination $vault -Recurse -Force
```

复制后，Vault 根目录下会出现 `Projects/`，插件可以立即识别。

## Windows 快速复制示例

```powershell
$target = "C:\path\to\Vault\.obsidian\plugins\obsidian-project-hub"
New-Item -ItemType Directory -Force -Path $target
Copy-Item .\main.js, .\manifest.json, .\styles.css -Destination $target -Force
```

## 发布前检查

1. 执行 `npm.cmd run release`
2. 确认 `docs/releases/<version>.md` 已创建并勾选完成
3. 在一个真实 Vault 中验证以下流程：
   - 打开 Dashboard
   - 快速创建任务
   - 拖拽 Kanban 卡片
   - 查看版本中心
   - 查看 Roadmap
   - 当前项目和 `demo/Projects` 都已同步到 Vault 并可直接使用

## 建议的发布包内容

如果你后续要发到 GitHub Release，压缩包里建议只包含：

- `main.js`
- `manifest.json`
- `styles.css`