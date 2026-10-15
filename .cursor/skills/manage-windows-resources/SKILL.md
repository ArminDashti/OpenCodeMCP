---
name: manage-windows-resources
description: >-
  Diagnoses and eases Windows 11 CPU, RAM, disk, and GPU pressure; finds top consumers and applies safe cleanup only when requested.
disable-model-invocation: false
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  tags: [cpu, ram, disk, gpu, performance, cleanup]
  last_updated: "2026-09-11 18:15:00"
  uuid: 660dd977-d795-4499-aeb4-fb06d38870ad
---
# Resource Managing

## When

- User reports slow PC, high CPU/RAM/disk/GPU, or low free space
- Need top consumers before killing or cleanup
- Not: overclock BIOS, wipe other users' files, or disable security services for FPS

## How

### Modes

| Mode | Goal |
|------|------|
| `diagnose` | Rank consumers; change nothing |
| `ease` | Safe cleanup / stop user-approved apps |
| `verify` | Re-measure after ease |

### Step 1 — Diagnose

```powershell
Get-CimInstance Win32_OperatingSystem |
  Select-Object @{N='MemFreeGB';E={[math]::Round($_.FreePhysicalMemory/1MB,1)}},
                @{N='MemTotalGB';E={[math]::Round($_.TotalVisibleMemorySize/1MB,1)}}
Get-Process | Sort-Object WorkingSet64 -Descending |
  Select-Object -First 15 Id, ProcessName, @{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB)}}, CPU
Get-Process | Sort-Object CPU -Descending |
  Select-Object -First 15 Id, ProcessName, CPU
Get-PSDrive -PSProvider FileSystem |
  Select-Object Name, @{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}},
                @{N='UsedGB';E={[math]::Round(($_.Used/1GB),1)}}
Get-Volume | Where-Object DriveLetter | Format-Table DriveLetter, FileSystemLabel, SizeRemaining, Size
```

Optional GPU (Admin / supported): `nvidia-smi` if present.

### Step 2 — Ease (only if asked)

Safe first:

1. Close named user apps (confirm PIDs)
2. Empty Recycle Bin / clear `%TEMP%` user temp (not whole `Windows\Temp` wipe unless asked)
3. `cleanmgr` / Storage Sense guidance; do not auto-delete Downloads
4. Disable heavy startup apps only if user named them:

```powershell
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location
```

### Step 3 — Verify

Re-run free RAM/disk + top-15 process tables; report delta.

## Safety

- Do not kill system-critical processes
- Do not disable pagefile / Defender for "free RAM"
- Disk cleanup: confirm paths before delete
