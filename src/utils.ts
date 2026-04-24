import * as os from "os";
import { FREEPLAY_SDK_VERSION } from "./version.js";

export const getUserAgent = (): string => {
  const sdkName: string = "Freeplay";
  const sdkVersion: string = FREEPLAY_SDK_VERSION;
  const language: string = "Node";
  const languageVersion: string = process.versions.node; // Node version as a proxy for TypeScript version
  const osName: string = os.type();
  const osVersion: string = os.release();

  return `${sdkName}/${sdkVersion} (${language}/${languageVersion}; ${osName}/${osVersion})`;
};
