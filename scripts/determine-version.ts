#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface VersionInfo {
  current_version: string;
  base_version: string;
  new_version: string;
  is_prerelease: boolean;
}

interface PackageJson {
  name: string;
  version: string;
}

/**
 * Determine the next version based on release type
 */
async function determineVersion(
  releaseType: "prerelease" | "stable",
): Promise<VersionInfo> {
  try {
    // Read current version from package.json
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson: PackageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8"),
    );
    const currentVersion = packageJson.version;

    console.log(`Current version: ${currentVersion}`);

    if (releaseType === "prerelease") {
      return await handlePrerelease(currentVersion, packageJson.name);
    } else if (releaseType === "stable") {
      return await handleStableRelease(currentVersion, packageJson.name);
    } else {
      throw new Error(
        `Invalid release type: ${releaseType}. Must be 'prerelease' or 'stable'`,
      );
    }
  } catch (error) {
    console.error("❌ Error determining version:", (error as Error).message);
    process.exit(1);
  }
}

/**
 * Handle prerelease version calculation
 */
async function handlePrerelease(
  currentVersion: string,
  packageName: string,
): Promise<VersionInfo> {
  // Extract base version (remove any prerelease suffix)
  const baseVersion = currentVersion.replace(/-.*$/, "");
  console.log(`Base version: ${baseVersion}`);

  try {
    // Check for existing alpha versions on npm
    const npmVersionsCmd = `npm view ${packageName} versions --json`;
    const versionsOutput = execSync(npmVersionsCmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });

    let existingVersions: string[] = [];
    try {
      const parsed = JSON.parse(versionsOutput);
      existingVersions = Array.isArray(parsed)
        ? parsed
        : [parsed].filter(Boolean);
    } catch (parseError) {
      console.log(
        "No existing versions found on npm or error parsing versions",
      );
      console.log("Error parsing versions:", parseError);
      existingVersions = [];
    }

    // Filter for alpha versions of the current base version
    const existingAlphas = existingVersions.filter((v) =>
      v.startsWith(`${baseVersion}-alpha.`),
    );

    let newVersion: string;
    if (existingAlphas.length === 0) {
      newVersion = `${baseVersion}-alpha.1`;
    } else {
      // Sort versions and get the latest alpha
      const sortedAlphas = existingAlphas.sort((a, b) => {
        const aNum = parseInt(a.split("-alpha.")[1]);
        const bNum = parseInt(b.split("-alpha.")[1]);
        return aNum - bNum;
      });

      const latestAlpha = sortedAlphas[sortedAlphas.length - 1];
      const alphaNum = parseInt(latestAlpha.split("-alpha.")[1]);
      const newAlphaNum = alphaNum + 1;
      newVersion = `${baseVersion}-alpha.${newAlphaNum}`;
    }

    console.log(`Next prerelease version: ${newVersion}`);

    return {
      current_version: currentVersion,
      base_version: baseVersion,
      new_version: newVersion,
      is_prerelease: true,
    };
  } catch (error) {
    console.log("Error checking npm versions, assuming no existing versions");
    console.log("Error:", error);
    const newVersion = `${baseVersion}-alpha.1`;

    return {
      current_version: currentVersion,
      base_version: baseVersion,
      new_version: newVersion,
      is_prerelease: true,
    };
  }
}

/**
 * Handle stable release version validation
 */
async function handleStableRelease(
  currentVersion: string,
  packageName: string,
): Promise<VersionInfo> {
  try {
    // Check if version was bumped compared to previous commit
    const previousVersionCmd = "git show HEAD~1:package.json";
    const previousPackageJsonStr = execSync(previousVersionCmd, {
      encoding: "utf8",
    });
    const previousPackageJson: PackageJson = JSON.parse(previousPackageJsonStr);

    if (currentVersion === previousPackageJson.version) {
      throw new Error(
        "No version bump detected in package.json for stable release",
      );
    }

    console.log(
      `Version bumped from ${previousPackageJson.version} to ${currentVersion}`,
    );
  } catch (error) {
    if ((error as Error).message.includes("No version bump detected")) {
      throw error;
    }
    console.log(
      "Could not compare with previous version (possibly first commit)",
    );
  }

  // Check if this version already exists on npm
  try {
    const checkVersionCmd = `npm view ${packageName}@${currentVersion} version`;
    execSync(checkVersionCmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    throw new Error(`Version ${currentVersion} already exists on npm`);
  } catch (error) {
    if ((error as Error).message.includes("already exists on npm")) {
      throw error;
    }
    // Version doesn't exist on npm, which is what we want
    console.log(`Version ${currentVersion} is available on npm`);
  }

  console.log(`Stable release version: ${currentVersion}`);

  return {
    current_version: currentVersion,
    base_version: currentVersion,
    new_version: currentVersion,
    is_prerelease: false,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const releaseType = process.argv[2] as "prerelease" | "stable";

  if (!releaseType || !["prerelease", "stable"].includes(releaseType)) {
    console.error(
      "❌ Usage: npx tsx scripts/determine-version.ts <prerelease|stable>",
    );
    process.exit(1);
  }

  determineVersion(releaseType)
    .then((result) => {
      console.log("✅ Version determination complete");
      console.log("RESULT_JSON:" + JSON.stringify(result));
    })
    .catch((error) => {
      console.error(
        "❌ Failed to determine version:",
        (error as Error).message,
      );
      process.exit(1);
    });
}

export { determineVersion, type VersionInfo };
