export const ENDPOINTS = {
  compile: "/v1/compile",
  validateAuth: "/v1/auth/validate",
  job(jobId) {
    return `/v1/jobs/${encodeURIComponent(jobId)}`;
  },
  workflow(workflowId) {
    return `/v1/workflows/${encodeURIComponent(workflowId)}`;
  },
  run(workflowId) {
    return `/v1/run/${encodeURIComponent(workflowId)}`;
  },
  runStatus(runId) {
    return `/v1/runs/${encodeURIComponent(runId)}`;
  },
};

export function toAbsoluteUrl(baseUrl, endpointPath) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const withoutLeadingSlash = endpointPath.startsWith("/")
    ? endpointPath.slice(1)
    : endpointPath;
  return new URL(withoutLeadingSlash, normalizedBase).toString();
}
