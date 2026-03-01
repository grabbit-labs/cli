import { clearConfigKeys, getRuntimeConfig, saveConfig } from "./config-store.js";
import { maskToken } from "./output.js";

export function storeLogin({ token, apiBaseUrl, backendMode }, { env = process.env } = {}) {
  const updates = {
    token,
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(backendMode ? { backendMode } : {}),
  };

  return saveConfig(updates, { env });
}

export function getLoginStatus({ env = process.env } = {}) {
  const config = getRuntimeConfig({ env });
  const token = config.token ?? "";

  return {
    loggedIn: Boolean(token),
    apiBaseUrl: config.apiBaseUrl,
    backendMode: config.backendMode,
    tokenPreview: token ? maskToken(token) : null,
    configPath: env.GRABBIT_CONFIG_PATH ?? null,
  };
}

export function logout({ env = process.env } = {}) {
  clearConfigKeys(["token"], { env });
  return getLoginStatus({ env });
}
