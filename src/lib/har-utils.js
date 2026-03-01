import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { CliError } from "./errors.js";

export function resolveHarFile(harPath) {
  if (!harPath) {
    throw new CliError(
      "Missing HAR file. Pass --har <path> to provide the recorded browser session.",
      { code: "MISSING_HAR_FILE" },
    );
  }

  const absolutePath = path.resolve(harPath);

  if (!existsSync(absolutePath)) {
    throw new CliError(`HAR file not found: ${absolutePath}`, { code: "HAR_NOT_FOUND" });
  }

  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    throw new CliError(`HAR path is not a file: ${absolutePath}`, { code: "HAR_NOT_A_FILE" });
  }

  if (stats.size <= 0) {
    throw new CliError(`HAR file is empty: ${absolutePath}`, { code: "HAR_EMPTY" });
  }

  return {
    path: absolutePath,
    size: stats.size,
  };
}
