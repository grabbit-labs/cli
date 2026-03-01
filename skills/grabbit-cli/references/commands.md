# Grabbit CLI Command Reference (Agent-Focused)

## Authentication

```bash
grabbit account login --token <token> [--api-url <url>] [--backend-mode mock|live] [--validate] [--json]
grabbit account status [--json]
grabbit account logout [--json]
```

## Config

```bash
grabbit config get [key] [--json]
grabbit config set <key> <value> [--json]
```

## Compile / Save / Task Submit

```bash
grabbit compile --har <file> --goal <text> --matcher <input|output>:<value> [options]
grabbit save <workflowName> --har <file> [options]
grabbit task submit --har <file> [options]
```

Common options:

```bash
--matcher <type:value>        # repeatable
--input <name[:example][:required]>      # repeatable
--output <name[:example_value]>          # repeatable
--navigation <action[:url][:value][:selector]>    # repeatable
--context-file <path>         # JSON envelope
--notes <text>
--wait
--interval <ms>
--timeout <ms>
--backend-mode <mode>
--api-url <url>
--json
```

## Jobs / Task Polling

```bash
grabbit jobs get <jobId> [--backend-mode <mode>] [--api-url <url>] [--json]
grabbit jobs poll <jobId> [--interval <ms>] [--timeout <ms>] [--backend-mode <mode>] [--api-url <url>] [--json]

grabbit task get <jobId> [same options]     # alias
grabbit task poll <jobId> [same options]    # alias
```

## Workflows

```bash
grabbit workflows get <workflowId> [--backend-mode <mode>] [--api-url <url>] [--json]
```

## Run / Runs

```bash
grabbit run <workflowId> [--input-json <json> | --input-file <path>] [--async] [--wait] [--interval <ms>] [--timeout <ms>] [--backend-mode <mode>] [--api-url <url>] [--json]
grabbit runs get <runId> [--backend-mode <mode>] [--api-url <url>] [--json]
grabbit runs poll <runId> [--interval <ms>] [--timeout <ms>] [--backend-mode <mode>] [--api-url <url>] [--json]
```

## Browser compatibility passthrough

All non-Grabbit commands are forwarded to `agent-browser`:

```bash
grabbit open <url>
grabbit click <selector>
grabbit snapshot -i
grabbit get text <selector>
grabbit find text "Sign in" click
```
