import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const localConfigPath = process.env.OBSIDIAN_DEPLOY_CONFIG
  ? path.resolve(process.env.OBSIDIAN_DEPLOY_CONFIG)
  : path.join(repoRoot, "obsidian-project-hub.deploy.local.json");

async function main() {
  const config = await readConfig(localConfigPath);
  const vaultPath = path.resolve(config.vaultPath);
  const pluginId = config.pluginId || "obsidian-project-hub";
  const pluginTargetPath = path.join(vaultPath, ".obsidian", "plugins", pluginId);
  const vaultProjectsPath = path.join(vaultPath, "Projects");

  await ensureArtifacts(["main.js", "manifest.json", "styles.css"]);
  await fs.mkdir(pluginTargetPath, { recursive: true });

  for (const fileName of ["main.js", "manifest.json", "styles.css"]) {
    await fs.copyFile(path.join(repoRoot, fileName), path.join(pluginTargetPath, fileName));
  }

  console.log(`[deploy] Plugin copied to ${pluginTargetPath}`);

  if (config.copyManagedProjects !== false) {
    await copyProjectsFolder(path.join(repoRoot, "Projects"), vaultProjectsPath, "managed project");
  }

  if (config.copyDemoProjects !== false) {
    await copyProjectsFolder(path.join(repoRoot, "demo", "Projects"), vaultProjectsPath, "demo project");
  }

  console.log(`[deploy] Vault sync complete: ${vaultPath}`);
}

async function readConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.vaultPath || typeof parsed.vaultPath !== "string") {
      throw new Error("Missing required string field: vaultPath");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to load deploy config at ${configPath}. Copy obsidian-project-hub.deploy.example.json to obsidian-project-hub.deploy.local.json and fill in your Vault path. Details: ${message}`
    );
  }
}

async function ensureArtifacts(fileNames) {
  for (const fileName of fileNames) {
    const fullPath = path.join(repoRoot, fileName);
    try {
      await fs.access(fullPath);
    } catch {
      throw new Error(`Build artifact not found: ${fullPath}. Run npm.cmd run build first.`);
    }
  }
}

async function copyProjectsFolder(sourceRoot, targetRoot, label) {
  try {
    const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
    await fs.mkdir(targetRoot, { recursive: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceRoot, entry.name);
      const targetPath = path.join(targetRoot, entry.name);
      await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
      console.log(`[deploy] ${label} synced: ${targetPath}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
