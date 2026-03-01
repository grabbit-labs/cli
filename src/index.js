import { executeCli } from "./cli/router.js";

export async function runCli(argv, dependencies = {}) {
  return executeCli(argv, dependencies);
}
