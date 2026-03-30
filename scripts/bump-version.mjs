import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function main() {
  const nextVersion = process.argv[2];
  const minAppVersionArg = process.argv[3];

  if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
    throw new Error("Usage: npm run version:bump -- <x.y.z> [minAppVersion]");
  }

  const packageJsonPath = path.join(repoRoot, "package.json");
  const manifestJsonPath = path.join(repoRoot, "manifest.json");
  const versionsJsonPath = path.join(repoRoot, "versions.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const manifestJson = JSON.parse(await fs.readFile(manifestJsonPath, "utf8"));
  const versionsJson = JSON.parse(await fs.readFile(versionsJsonPath, "utf8"));

  const currentVersion = packageJson.version;
  if (currentVersion === nextVersion) {
    throw new Error(`Version is already ${nextVersion}`);
  }

  const minAppVersion = minAppVersionArg || manifestJson.minAppVersion || versionsJson[currentVersion];
  if (!minAppVersion || !/^\d+\.\d+\.\d+$/.test(minAppVersion)) {
    throw new Error(`Invalid minAppVersion: ${minAppVersion}`);
  }

  packageJson.version = nextVersion;
  manifestJson.version = nextVersion;
  versionsJson[nextVersion] = minAppVersion;

  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await fs.writeFile(manifestJsonPath, `${JSON.stringify(manifestJson, null, 2)}\n`, "utf8");
  await fs.writeFile(versionsJsonPath, `${JSON.stringify(sortVersions(versionsJson), null, 2)}\n`, "utf8");

  const releasePath = path.join(repoRoot, "docs", "releases", `${nextVersion}.md`);
  try {
    await fs.access(releasePath);
    throw new Error(`Release note already exists: ${path.relative(repoRoot, releasePath)}`);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(releasePath), { recursive: true });
  await fs.writeFile(releasePath, buildReleaseTemplate(nextVersion), "utf8");

  console.log(`[version-bump] package.json -> ${nextVersion}`);
  console.log(`[version-bump] manifest.json -> ${nextVersion}`);
  console.log(`[version-bump] versions.json -> ${nextVersion}: ${minAppVersion}`);
  console.log(`[version-bump] Created ${path.relative(repoRoot, releasePath)}`);
}

function sortVersions(versions) {
  return Object.fromEntries(
    Object.entries(versions).sort(([left], [right]) => compareSemver(left, right))
  );
}

function compareSemver(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function buildReleaseTemplate(version) {
  return [
    `## ${version}`,
    "",
    "### Checklist",
    "",
    "- [ ] README.md",
    "- [ ] docs/DEPLOY.md",
    "- [ ] docs/RELEASE.md",
    "- [ ] Projects/obsidian-project-hub/**",
    "",
    "### Added",
    "",
    "- 待补充",
    "",
    "### Changed",
    "",
    "- 待补充",
    "",
    "### Fixed",
    "",
    "- 待补充",
    "",
    "### Notes",
    "",
    "- 待补充",
    ""
  ].join("\n");
}

main().catch((error) => {
  console.error(`[version-bump] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
