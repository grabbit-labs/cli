#!/usr/bin/env node

import { runCli } from "../src/index.js";

runCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = typeof exitCode === "number" ? exitCode : 0;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`grabbit: ${message}`);
    process.exitCode = 1;
  });
