---
name: app-lifecycle-cli
description: >-
  Use when the user wants a global CLI alias to manage an app (status, version, run, stop, port, update, rebuild, optional service). Scaffolds and registers it for PowerShell, cmd, bash, zsh. Docker apps use Compose; native apps install to LocalAppData.
author: "Armin Dashti"
uuid: e24ca07a-2645-4192-b9ba-4e609de8a5ef
---

# App CLI Manager Skill

## Directives
1. **Ask when uncertain**: Pause and ask the user if `<aliasname>`, paths, or app architecture are unclear.
2. **Audit existing**: If commands exist, refactor them to strictly match these behaviors.
3. **Mandatory testing**: Test every created/updated command end-to-end before finishing.

---

## Command Specifications

All commands use the unified prefix `<aliasname> <command>`:

| Command | Behavior |
| :--- | :--- |
| `status` | Show runtime state, PID/container, port, and health. |
| `help` | Display usage, options, and subcommand descriptions. |
| `update` | Pull latest code/release and update dependencies (preserves state). |
| `version` | Print current version, commit hash, and build timestamp. |
| `run` | Run the application interactively with current saved configuration. |
| `run port <number\|random>` | **Temporary**: Run on the given or random port for this run only. Do not persist. |
| `port set <number\|random>` | **Permanent**: Set and persist the port in config files (`.env`, config, etc.). |
| `rebuild` | Fast incremental build. Reflect latest changes **without** removing data or configs. |
| `reinstall` | Fast clean build. Reflect latest changes **after purging** all data and configs. |
| `uninstall` | Completely wipe app binary, aliases, services, configs, and all leftovers. |

### OS-Based Only (Non-Docker)
Add these service management commands only if running on bare-metal/systemd:
- `<aliasname> service status`
- `<aliasname> service start`
- `<aliasname> service stop`
- `<aliasname> service restart`

---

## Execution Workflow

1. **Detect**: Determine if the app is Docker-based or OS-based (systemd/init).
2. **Build CLI**: Create an executable wrapper in `$PATH` (e.g., `/usr/local/bin/<aliasname>`).
   - For `random` ports, dynamically resolve an available port (`1024-65535`).
   - Keep `rebuild` and `reinstall` fast by preserving build/package manager caches.
3. **Verify**: Execute and test:
   - `<aliasname> help` and `<aliasname> version`
   - `<aliasname> port set random` then check `<aliasname> status`
   - Test run execution and verify clean exit
   - Service commands (if OS-based)
