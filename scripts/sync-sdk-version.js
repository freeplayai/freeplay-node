import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, "../package.json");
const versionModulePath = path.resolve(__dirname, "../src/version.ts");

const { version } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const versionModuleContents = `// This file is generated from package.json by scripts/sync-sdk-version.js.\nexport const FREEPLAY_SDK_VERSION = "${version}";\n`;

fs.writeFileSync(versionModulePath, versionModuleContents);
console.log(`Synced Freeplay SDK version to ${version}`);
