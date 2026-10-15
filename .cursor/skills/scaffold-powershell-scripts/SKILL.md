---
name: scaffold-powershell-scripts
description: >-
  Generates and tests PowerShell scripts to install, update, and remove an app
  on one of three targets: local Docker (hosts entry, CLI PATH, data-preserving
  updates), a remote Ubuntu Docker server over SSH, or a Windows x64 .exe built
  from source. Also routes local Docker Google Chrome (selenium/standalone-chrome,
  noVNC) egress via Realtek Ethernet instead of the host VPN. Use when asked to
  create install/remove/deploy scripts for any of these targets, or when
  Chrome-in-Docker traffic must bypass OpenVPN/Mullvad/WireGuard while host VPN stays up.
disable-model-invocation: false
metadata:
  version: 2.0.0
  author: "Armin Dashti"
  category: devops
  tags: [powershell, docker, ssh, ubuntu, windows-x64, build, exe, automation, chrome, ethernet, vpn, split-tunnel]
  last_updated: "2026-10-09 15:18:53"
  uuid: 61494fac-bed4-42c8-b05e-2a09a44277d5
---
# Scaffold PowerShell Scripts

## When

- User asks for PowerShell install/update/remove scripts for an app.
- User wants Docker Chrome (`google-chrome`) to use Realtek Ethernet instead of the host VPN.
- Merges former: `scaffold-local-docker-scripts`, `create-powershell-local-docker-scripts`, `armin-create-powershell-local-docker-scripts`, `scaffold-server-docker-scripts`, `create-powershell-server-docker-scripts`, `armin-create-powershell-server-docker-scripts`, `scaffold-win-x64-scripts`, `create-powershell-win-x64-scripts`, `armin-create-powershell-win-x64-scripts`, `docker-chrome-ethernet-egress`.

## Pick the target, then read only that guide

| Target | Scripts produced | Guide |
|--------|------------------|-------|
| Local Docker app | `install-on-local-docker.ps1`, `remove-from-local-docker.ps1` | [guides/local-docker.md](guides/local-docker.md) |
| Remote Ubuntu Docker server (SSH) | `install-on-server-docker.ps1`, `remove-from-server-docker.ps1` | [guides/server-docker.md](guides/server-docker.md) |
| Windows x64 `.exe` | `install-win-x64.ps1`, `remove-win-x64.ps1` | [guides/win-x64.md](guides/win-x64.md) |
| Chrome-in-Docker Ethernet egress (runbook, not a script generator) | none; uses [scripts/bind-egress-proxy.py](scripts/bind-egress-proxy.py) | [guides/chrome-ethernet-egress.md](guides/chrome-ethernet-egress.md) |

## Shared rules (script targets)

1. Store generated scripts in `./<Project>/scripts`; create the folder if missing.
2. Use color-coded `Write-Host -ForegroundColor` output with concise, phased status.
3. Testing the generated scripts after creation is mandatory: run install, update, and remove; fix and retest until they pass. Never claim tests passed unless they were actually run.
