import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const UNKNOWN_FREEPLAY_SDK_VERSION = "unknown";

const freeplayLibraryVersion: string = (() => {
  try {
    const packageJsonPath = path.join(__dirname, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson.version;
  } catch {
    return UNKNOWN_FREEPLAY_SDK_VERSION;
  }
})();

export const getUserAgent = (): string => {
  const sdkName: string = "Freeplay";
  const sdkVersion: string = freeplayLibraryVersion;
  const language: string = "Node";
  const languageVersion: string = process.versions.node; // Node version as a proxy for TypeScript version
  const osName: string = os.type();
  const osVersion: string = os.release();

  return `${sdkName}/${sdkVersion} (${language}/${languageVersion}; ${osName}/${osVersion})`;
};
