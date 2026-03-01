---
name: grabbit-cli
description: Use Grabbit CLI when the user wants to convert repeated browser actions into reusable API workflows, then run those workflows with structured inputs. Also use when browser automation is needed alongside workflow compile/poll/run commands.
allowed-tools: Bash(grabbit:*), Bash(npx grabbit:*)
---

# Grabbit CLI

Use Grabbit CLI to convert browser-driven tasks into reusable workflow APIs.

## When to use this skill

- User wants to automate a repetitive website workflow.
- User wants to save a browser session as a reusable API workflow.
- User wants to poll compile/run status and retrieve workflow metadata.
- User asks for browser automation commands (`open`, `click`, `snapshot`, etc.) and task commands in one flow.

## Core flow

1. Authenticate
2. Submit HAR + context for compilation
3. Poll compile job until completed
4. Get workflow metadata
5. Run workflow synchronously or asynchronously

```bash
grabbit account login --token <token> --backend-mode mock
grabbit compile --har ./session.har --goal "Get stock price" --matcher output:price --wait
grabbit workflows get <workflow-id>
grabbit run <workflow-id> --input-json '{"symbol":"AAPL"}'
```

## Command groups

- `account` - login/status/logout
- `compile`, `save`, `task submit` - submit browser sessions for compilation
- `jobs`, `task get|poll` - monitor compile jobs
- `workflows` - fetch compiled workflow metadata
- `run`, `runs` - execute workflows and monitor async runs

For concise command syntax, see [references/commands.md](references/commands.md).

## Browser command compatibility

If the command is not Grabbit-native, `grabbit` forwards it to `agent-browser`.  
This allows direct browser commands in the same tool:

```bash
grabbit open https://example.com
grabbit snapshot -i
grabbit click @e1
```

## Guidance for agent behavior

- Prefer `--json` for machine-readable output.
- Use `--wait` for single-command compile/run flows when appropriate.
- Use `jobs poll` / `runs poll` when the user asks for explicit status monitoring.
- Keep goal/matcher descriptions specific and outcome-focused.
