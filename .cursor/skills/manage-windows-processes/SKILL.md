---
name: manage-windows-processes
description: >-
  Triages Windows 11 processes for suspicious behavior: path, signer,
  network, parent chain, persistence; report only unless user asks to kill.
author: "Armin Dashti"
uuid: 5f4d4131-6d84-489b-838c-59f9c3caadad
---

# Manage Windows Processes

## When

- User asks which process looks malicious, weird CPU/net, or unknown
- High CPU/disk/net with no clear owner
- Not: offensive malware authoring; not blind `Stop-Process -Force` on system PIDs

## How

### Modes

| Mode | Goal |
|------|------|
| `triage` | Score suspects; change nothing |
| `deep` | Add persistence + hash checks |
| `contain` | Kill/quarantine only if user approved |

### Step 1 — Snapshot

```powershell
Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Id, ProcessName, CPU, WorkingSet64, Path
Get-CimInstance Win32_Process |
  Select-Object ProcessId, Name, ExecutablePath, CommandLine, ParentProcessId |
  Sort-Object ProcessId
Get-NetTCPConnection -State Established,Listen -ErrorAction SilentlyContinue |
  Select-Object OwningProcess, RemoteAddress, RemotePort, State
```

### Step 2 — Score (any strong hit → suspect)

| Signal | Why |
|--------|-----|
| Path under `%TEMP%`, Downloads, Users\Public | Unusual run location |
| Unsigned / invalid Authenticode | Weak trust |
| Random name + high net | Beacon-like |
| Parent is Office/browser + drops `.exe` | Living-off-user |
| Persistence (Run key / task / service) | Survives reboot |

```powershell
Get-AuthenticodeSignature '<path>'
Get-FileHash '<path>' -Algorithm SHA256
Get-CimInstance Win32_Service | Where-Object PathName -like '*<name>*'
Get-ScheduledTask | Where-Object TaskName -like '*<hint>*'
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Run
```

### Step 3 — Report

Table: PID | Name | Path | Signer | Net | Score (`benign` / `watch` / `suspect`) | Evidence.

### Step 4 — Contain (only if asked)

Prefer: disconnect net for that PID → end user process → disable task/Run key. Never kill `csrss`, `wininit`, `lsass`, `services`, `System`.

## Safety

- Default = triage report
- Confirm before kill or file delete
- Prefer isolate + evidence over wipe
