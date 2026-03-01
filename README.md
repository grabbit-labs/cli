# Grabbit CLI (`@grabbit-labs/cli`)

Grabbit helps you turn repetitive browser tasks into reusable API workflows.

Instead of clicking through the same website flow over and over, you can:

1. Record the browser session as a HAR file
2. Submit it with `grabbit`
3. Re-run the compiled workflow like a native API

This CLI is built for both humans and AI agents (Codex, Cursor, Claude, etc.).

## Install

### Global

```bash
npm install -g @grabbit-labs/cli
```

### Project-local

```bash
npm install @grabbit-labs/cli
npx grabbit --help
```

## Quick Start

### 1) Log in

```bash
grabbit account login --token <your-token> --backend-mode mock
```

> `mock` mode is the default right now and works without a live backend.

### 2) Submit a recorded browser session

```bash
grabbit compile \
  --har ./my-session.har \
  --goal "Get Apple stock price from Yahoo Finance" \
  --matcher output:price \
  --wait
```

This returns a workflow-ready job result, including a `workflow_id` when complete.

### 3) Run the compiled workflow

```bash
grabbit run <workflow-id> --input-json '{"symbol":"AAPL"}'
```

---

## Core Grabbit Commands

### Account

```bash
grabbit account login --token <token> [--api-url <url>] [--backend-mode mock|live] [--validate]
grabbit account status
grabbit account logout
```

### Config

```bash
grabbit config get [key]
grabbit config set <key> <value>
```

### Compile / Save

```bash
grabbit compile --har <file> --goal <text> --matcher <input|output>:<value> [options]
grabbit save <workflowName> --har <file> [options]
grabbit task submit --har <file> [options]   # alias
```

Useful options:

- `--context-file <path>`: load full context JSON
- `--wait`: poll until terminal status
- `--interval <ms>` / `--timeout <ms>`: polling controls
- `--json`: machine-readable output

### Jobs / Workflows / Runs

```bash
grabbit jobs get <jobId>
grabbit jobs poll <jobId>
grabbit task get <jobId>                     # alias
grabbit task poll <jobId>                    # alias
grabbit workflows get <workflowId>

grabbit run <workflowId> --input-json '{"key":"value"}' [--async] [--wait]
grabbit runs get <runId>
grabbit runs poll <runId>
```

---

## Browser Commands (Agent-Browser Compatibility)

`grabbit` forwards non-Grabbit commands to `agent-browser`, so common browser commands work directly:

```bash
grabbit open https://finance.yahoo.com
grabbit snapshot -i
grabbit click @e1
grabbit fill @e2 "AAPL"
```

This preserves the broad command surface from `agent-browser` while adding Grabbit-specific workflow lifecycle commands.

---

## Environment Variables

- `GRABBIT_CONFIG_PATH` - custom config location
- `GRABBIT_API_BASE_URL` - override API base URL
- `GRABBIT_BACKEND_MODE` - `mock` or `live`
- `GRABBIT_TOKEN` - auth token override
- `GRABBIT_MOCK_DB_PATH` - location for mock backend state
- `GRABBIT_AUTH_VALIDATE_PATH` - auth validation endpoint path

---

## Example Prompt for AI Agents

Use a prompt like this with your AI agent:

> "Use Grabbit CLI to get Apple stock price from Yahoo Finance, save the browser workflow as `yahoo-stock-price`, and then run the compiled workflow with symbol `AAPL`."

---

## Notes

- Keep this repo free of sensitive credentials.
- Authentication and backend validation are designed to be easy to swap as production endpoints come online.
- See `skills/grabbit-cli/SKILL.md` for agent-oriented usage guidance.

## Third-Party Acknowledgment

This project depends on `agent-browser` for browser command compatibility.
See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
