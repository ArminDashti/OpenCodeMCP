---
name: daroupakhsh-srv-ai
description: >-
  Operate Windows host SRV-AI (10.10.16.118) over SSH TCP 443 from 10.20.9.59. Prefer SSH MCP, trusted/official downloads only, warn before risky commands, and expect Iran egress blocks on some sites or IPs.
disable-model-invocation: false
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  tags: [ssh, srv-ai, windows, devops, openssh, iran]
  last_updated: "2026-09-21 14:10:58"
  uuid: 1dba6dea-78e3-4e02-a9ca-4a5d4607a2ab
---
# SRV-AI

## When

- Operating or troubleshooting host **SRV-AI**
- SSH, firewall, services, installs, or downloads on that box
- Any task that names `SRV-AI`, `10.10.16.118`, or this LAN AI Windows server

## How

### 1 — Host identity (name → IP)

| Spec | Value |
|------|-------|
| Hostname | `SRV-AI` |
| LAN IP | `10.10.16.118` |
| OS | Windows (OpenSSH Server) |
| SSH listen | TCP **443** only (port **22** closed) |
| SSH user | `a.dashti` (domain `dpdc\a.dashti`) |
| Allowed SSH client IP | `10.20.9.59` only |
| Auth | Password via `~/.cursor/ssh-mcp-config.json` entry `10.10.16.118` and `~/.ssh/config` Host `10.10.16.118` |
| Notable local service | Ollama also uses TCP 443 — do not alter non-OpenSSH firewall rules unless asked |

### 2 — Connect (strict)

| # | Method | Port | Notes |
|---|--------|------|-------|
| 1 | SSH MCP `user-ssh-mcp` | 443 | Prefer; connection name `10.10.16.118` |
| 2 | Shell SSH | **443** | Fallback |

```bash
ssh -p 443 a.dashti@10.10.16.118
```

Reuse an active session in the same task when possible. Inspect before mutate.

### 3 — Downloads and installs

only use trust and official for downloading — official vendor sites, signed packages, and known trusted mirrors only. Prefer package managers / official installers over random GitHub forks or unsigned binaries.

### 4 — Iran egress

it use iran ip so some site or IPs can be blocked for any reason. If curl/wget/Invoke-WebRequest fails, timeouts, or TLS resets: try an official alternate CDN/mirror, offline copy from this PC, or ask the user — do not scrape random third-party hosts.

### 5 — Risky commands

for risky commands let user know about it before running. Treat as risky and get explicit approval first:

- Firewall create/change/disable (including OpenSSH rules)
- Reboot / shutdown
- Stop/restart OpenSSH (`sshd`) or other production services
- Delete or overwrite important files/configs
- Broad network / ACL / policy changes
- Anything that can lock out SSH from `10.20.9.59`

When warning, name the command/effect and wait for approval.

### 6 — Firewall discipline (SSH)

OpenSSH on this host is scoped: TCP 443 from `10.20.9.59` only. Leave all non-OpenSSH firewall rules (including Ollama on 443) untouched unless the user explicitly asks to change them.

### 7 — Cleanup

Delete temp helper scripts on the server and in the repo after the task. Prefer key auth long-term; do not print passwords in chat/logs/commits when avoidable.

## Always

1. Resolve this host from the identity table above — do not invent IPs, ports, or users.
2. Prefer SSH MCP, then shell SSH on **443**.
3. Warn the user before any risky command (see How §5) and wait for approval.
4. Prefer trusted/official download sources only.
5. Assume Iran egress may block sites/IPs without a clear error — plan a fallback.

## Never

1. Never use SSH port **22** on this host (closed).
2. Never open SSH to IPs other than `10.20.9.59` unless the user explicitly changes that policy.
3. Never download from untrusted / unofficial sources.
4. Never change non-OpenSSH firewall rules while only asked to touch SSH.
5. Never reboot, stop `sshd`, or flush firewall without prior user approval.
6. Never leave one-off remote/local helper scripts behind after the task.

## Example

**Example 1** — Connect and check hostname

- Input: "SSH to SRV-AI and show hostname"
- Output: MCP `10.10.16.118` (or `ssh -p 443 a.dashti@10.10.16.118`) → `hostname` → `SRV-AI`

**Example 2** — Install from official source

- Input: "Install the latest Ollama on SRV-AI"
- Output: download only from the official Ollama site/installer; if Iran IP blocks the URL, report block and ask for mirror/offline copy — no random third-party build

**Example 3** — Risky firewall change

- Input: "Allow SSH from 10.20.9.100 too"
- Output: warn this is risky (widens SSH ACL) → wait for approval → then edit only OpenSSH-related rules

**Example 4** — Download fails (Iran block)

- Input: "curl fails getting an official package on SRV-AI"
- Output: treat as possible Iran egress block → try official alternate CDN/mirror or fetch on PC-Armin and copy — do not switch to untrusted hosts

**Example 5** — Leave Ollama alone

- Input: "Tighten SSH again"
- Output: touch only OpenSSH allow/block rules for `sshd` TCP 443 / `10.20.9.59`; leave `Ollama TCP 443` and other rules unchanged
