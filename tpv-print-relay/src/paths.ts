import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

type ProcessWithPkg = NodeJS.Process & {
  pkg?: unknown;
};

function hasPkgRuntime(processRef: NodeJS.Process): processRef is ProcessWithPkg {
  return "pkg" in processRef;
}

export function isPackaged() {
  return hasPkgRuntime(process);
}

export function getRuntimeBaseDir() {
  return isPackaged() ? dirname(process.execPath) : resolve(__dirname, "..");
}

export function getSnapshotBaseDir() {
  return resolve(__dirname, "..");
}

export function getPanelDir() {
  if (!isPackaged()) {
    return resolve(getRuntimeBaseDir(), "panel");
  }

  const runtimePanelDir = resolve(getRuntimeBaseDir(), "panel");
  if (existsSync(runtimePanelDir)) {
    return runtimePanelDir;
  }

  return resolve(getSnapshotBaseDir(), "panel");
}
