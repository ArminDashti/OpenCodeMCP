---
name: manage-windows-firewall
description: >-
  Manages Windows 11 Defender Firewall: list profiles/rules, add/remove allow or block rules, and verify without destroying the rule set.
disable-model-invocation: false
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  tags: [firewall, defender, inbound, outbound, netsecurity]
  last_updated: "2026-09-11 18:15:00"
  uuid: 6cda6ed0-bb0a-4ae1-8e7e-bc52cbcea04b
---
# Managing Firewall

## When

- User asks to list, add, change, or remove Windows Firewall rules
- App blocked or needs allow/block by port/program
- Not: replace third-party firewall suites wholesale; not HAProxy on servers

## How

### Modes

| Mode | Goal |
|------|------|
| `list` | Show profiles + matching rules |
| `allow` / `block` | Add named rule |
| `remove` | Delete rule by exact DisplayName |
| `verify` | Confirm rule/profile state |

### Step 1 — List

```powershell
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction
Get-NetFirewallRule -DisplayName '*<hint>*' -ErrorAction SilentlyContinue |
  Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName '*<hint>*' |
  Select-Object DisplayName, Direction, Action, Enabled, Profile
```

### Step 2 — Change (Admin; only if asked)

Use unique `DisplayName` prefix `Armin-` so rules are findable.

```powershell
New-NetFirewallRule -DisplayName 'Armin-<Name>' -Direction Inbound `
  -Action Block -Protocol TCP -LocalPort <port> -Profile Any
# or program:
New-NetFirewallRule -DisplayName 'Armin-<Name>' -Direction Outbound `
  -Action Allow -Program '<full\path.exe>' -Profile Private
Remove-NetFirewallRule -DisplayName 'Armin-<Name>'
```

Enable/disable profile only when user names profile:

```powershell
Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True
```

### Step 3 — Verify

Re-query rule by DisplayName; test connectivity only if user wants.

## Safety

- Never `Remove-NetFirewallRule` without DisplayName filter / wild wipe
- Prefer Block specific port/app over Disable firewall
- Domain profile: warn before loosening inbound Allow
