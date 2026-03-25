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

打包产物为项目根目录中的：

- `main.js`
- `manifest.json`
- `styles.css`

## 部署到本地 Obsidian Vault

假设 Vault 名称为 `MyVault`，插件目录一般是：

```text
<Vault>/.obsidian/plugins/obsidian-project-hub/
```

将下列文件复制到该目录：

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

1. 运行 `npm.cmd run build`
2. 确认 `manifest.json`、`package.json`、`versions.json` 版本号一致
3. 确认 `README.md`、发布文档和 `demo/` 已更新
4. 在一个真实 Vault 中验证以下流程：
   - 打开 Dashboard
   - 快速创建任务
   - 拖拽 Kanban 卡片
   - 查看版本中心
   - 查看 Roadmap
   - 复制 `demo/Projects` 后可以直接使用

## 建议的发布包内容

如果你后续要发到 GitHub Release，压缩包里建议只包含：

- `main.js`
- `manifest.json`
- `styles.css`