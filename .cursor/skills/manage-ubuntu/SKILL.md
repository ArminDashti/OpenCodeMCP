---
name: manage-ubuntu
description: >-
  General-purpose Ubuntu server operations over SSH: connect, inspect,
  configure, and troubleshoot safely with modern commands and least privilege.
  Use when deploying, inspecting, configuring, or troubleshooting any Ubuntu
  host over SSH (MCP or shell) as a sudo-capable user; host-specific skills
  (for example irancell-ubuntu-t3) layer on top of this skill.
disable-model-invocation: false
metadata:
  version: 1.1.1
  author: "Armin Dashti"
  category: ubuntu
  tags: [ubuntu, ssh, server, devops, linux, systemctl]
  last_updated: "2026-10-09 15:21:35"
  uuid: cadafd3d-f09a-4b92-88ab-1c3542f1044e
---
# Manage Ubuntu

## When to use

- Deploying, inspecting, configuring, or troubleshooting an Ubuntu server
- Remote work over SSH (MCP or shell) as a sudo-capable user
- Exclusions: does not encode one host's IP, ports, VPN stack, or inventory; use a host skill (for example `irancell-ubuntu-t3`) plus `servers/<id>.md` for that
- Related: host skills under this plugin; `servers/<id>.md` for live host facts
- Merges former: `ubuntu-server-by-armin`, `ubuntu-server-maintain`, `ubuntu-server-maintainer`, `maintain-ubuntu-server`

## Objective

1. Connect to the target Ubuntu host with the credentials and connection order the user or host skill specifies
2. Inspect state before changing config, network, firewall, or services
3. Apply small, reversible changes with modern Ubuntu tooling and clean up temps

## Workflow

### Step 1: Resolve target and connect

1. Identify host identity from the user prompt, a host skill, or `servers/<id>.md` (IP/DNS, user, ports, key path). Do not invent connection details.
2. Prefer SSH MCP when that host is configured; otherwise use shell SSH with the given port and identity.
3. Reuse an active session in the same task when possible.

### Step 2: Verify connectivity (read-only)

```bash
hostname && uname -a
uptime && free -h && df -h /
```

### Step 3: Inspect before changing config, network, or services

```bash
# Firewall
sudo ufw status
sudo iptables -S
# Network
ip addr
ip route
# Services / listeners
systemctl is-active ssh
ss -tlnp
```

### Step 4: Operate

- Prefix privileged commands with `sudo`.
- Prefer modern commands: `ip` (not `ifconfig`), `ss` (not `netstat`), `systemctl` (not `service`), `apt` (not `apt-get`).
- Prefer `sudo systemctl reload <unit>` over restart when the unit supports reload.
- Back up before editing: `sudo cp /etc/some/config /etc/some/config.bak`
- Default to low-impact work: read-only inspection, small config edits, targeted package installs.
- Delete temp scripts/archives after the task: `rm -f /tmp/temp_script.sh`

## Safety rules

1. **Always** ask the user before: reboot/shutdown, restarting services, firewall/networking changes, deleting important files, replacing configs, destructive or security-sensitive ops, or anything that could affect uptime or performance.
2. **Always** apply least privilege; validate permissions after changes.
3. **Never** run without approval: `sudo systemctl stop ssh`, `sudo systemctl restart networking`, `sudo iptables -F`, `sudo reboot`, `sudo shutdown now`.
4. **Never** run without approval: full `apt upgrade`, large on-server builds, stress tests, mass file transfers, or production service restarts.
5. **Never** leave helper scripts on the server or in the repo after the task.
6. **Never** expose credentials in logs, commits, or chat when avoidable.
7. **Never** disable firewalls unless explicitly required.

## Examples

**Example 1:** Read-only health

- Input: "Check disk and memory on this Ubuntu box"
- Output: connect per host skill/docs → `df -h /` and `free -h`

**Example 2:** Before editing nginx

- Input: "Change nginx site config"
- Output: inspect listeners/`systemctl is-active nginx` → `sudo cp` backup → edit → `sudo nginx -t` → ask before reload/restart

**Example 3:** Package install

- Input: "Install htop"
- Output: `sudo apt update` only if needed → `sudo apt install -y htop` (not full upgrade)
