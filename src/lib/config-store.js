import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_CONFIG = Object.freeze({
  apiBaseUrl: "https://api.grabbit.local",
  backendMode: "mock",
  authValidationPath: "/v1/auth/validate",
});

function normalizeBackendMode(mode) {
  if (!mode) {
    return DEFAULT_CONFIG.backendMode;
  }

  const lowered = String(mode).toLowerCase();
  return lowered === "live" ? "live" : "mock";
}

export function getConfigPath(env = process.env) {
  if (env.GRABBIT_CONFIG_PATH) {
    return path.resolve(env.GRABBIT_CONFIG_PATH);
  }

  return path.join(homedir(), ".grabbit", "config.json");
}

export function getDefaultMockDbPath(env = process.env) {
  if (env.GRABBIT_MOCK_DB_PATH) {
    return path.resolve(env.GRABBIT_MOCK_DB_PATH);
  }

  return path.join(homedir(), ".grabbit", "mock-db.json");
}

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

export function loadStoredConfig({ env = process.env } = {}) {
  const configPath = getConfigPath(env);
  if (!existsSync(configPath)) {
    return {};
  }

  return safeReadJson(configPath);
}

export function getRuntimeConfig({ env = process.env } = {}) {
  const stored = loadStoredConfig({ env });

  const runtime = {
    ...DEFAULT_CONFIG,
    ...stored,
  };

  if (env.GRABBIT_API_BASE_URL) {
    runtime.apiBaseUrl = env.GRABBIT_API_BASE_URL;
  }

  if (env.GRABBIT_BACKEND_MODE) {
    runtime.backendMode = env.GRABBIT_BACKEND_MODE;
  }

  if (env.GRABBIT_TOKEN) {
    runtime.token = env.GRABBIT_TOKEN;
  }

  if (env.GRABBIT_AUTH_VALIDATE_PATH) {
    runtime.authValidationPath = env.GRABBIT_AUTH_VALIDATE_PATH;
  }

  runtime.backendMode = normalizeBackendMode(runtime.backendMode);
  runtime.mockDbPath = runtime.mockDbPath ?? getDefaultMockDbPath(env);

  return runtime;
}

export function saveConfig(updates, { env = process.env } = {}) {
  const configPath = getConfigPath(env);
  const stored = loadStoredConfig({ env });
  const merged = { ...stored, ...updates };

  if ("backendMode" in merged) {
    merged.backendMode = normalizeBackendMode(merged.backendMode);
  }

  ensureParentDir(configPath);
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return merged;
}

export function clearConfigKeys(keys, { env = process.env } = {}) {
  const configPath = getConfigPath(env);
  const stored = loadStoredConfig({ env });

  for (const key of keys) {
    delete stored[key];
  }

  ensureParentDir(configPath);
  writeFileSync(configPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return stored;
}
