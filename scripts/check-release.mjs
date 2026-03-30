import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const requiredChecklistItems = [
  "README.md",
  "docs/DEPLOY.md",
  "docs/RELEASE.md",
  "Projects/obsidian-project-hub/**"
];

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const manifestJson = JSON.parse(await fs.readFile(path.join(repoRoot, "manifest.json"), "utf8"));
  const versionsJson = JSON.parse(await fs.readFile(path.join(repoRoot, "versions.json"), "utf8"));
  const version = packageJson.version;

  if (manifestJson.version !== version) {
    throw new Error(`Version mismatch: package.json=${version}, manifest.json=${manifestJson.version}`);
  }

  const supportedVersion = versionsJson[version];
  if (!supportedVersion) {
    throw new Error(`versions.json is missing key ${version}`);
  }

  const releaseNotePath = path.join(repoRoot, "docs", "releases", `${version}.md`);
  const releaseNote = await fs.readFile(releaseNotePath, "utf8");

  for (const item of requiredChecklistItems) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^- \\[x\\] ${escaped}$`, "m");
    if (!pattern.test(releaseNote)) {
      throw new Error(`Release note ${path.relative(repoRoot, releaseNotePath)} is missing checked item: ${item}`);
    }
  }

  for (const section of ["Added", "Changed", "Fixed", "Notes"]) {
    if (!new RegExp(`^### ${section}$`, "m").test(releaseNote)) {
      throw new Error(`Release note ${path.relative(repoRoot, releaseNotePath)} is missing section: ${section}`);
    }
  }

  console.log(`[release-check] Version synchronized: ${version}`);
  console.log(`[release-check] Release note verified: ${path.relative(repoRoot, releaseNotePath)}`);
}

main().catch((error) => {
  console.error(`[release-check] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
