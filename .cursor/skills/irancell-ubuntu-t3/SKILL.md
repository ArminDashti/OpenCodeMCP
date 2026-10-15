---
name: irancell-ubuntu-t3
description: >-
  Operate the Irancell T3 Ubuntu server (t3-new, 2.144.27.124, user cloud-admin):
  SSH connect order (MCP, then :443 via HAProxy, then :22), Docker inventory,
  HAProxy :443 SNI mux, SoftEther UK/DE, Remnawave/Xray Reality nodes (GB/DE),
  Mullvad egress parents (mullvad-uk, mullvad-de) with Iran split tunnel,
  host strongSwan IKEv2, keep-alive and blast-radius rules. Use for any task on
  t3 / Irancell server / 2.144.27.124. Layers on top of manage-ubuntu.
  Merges former irancell-t3, irancell-t3-ops, maintain-irancell-t3.
metadata:
  author: "Armin Dashti"
  uuid: 9a656ca7-ed53-4993-b012-6bbf1728c572
---
# Irancell Ubuntu T3

## When to use

- Any inspect / change / troubleshoot task on T3 (`t3-new`, `2.144.27.124`, Irancell, Iran)
- Base layer: `manage-ubuntu` (generic Ubuntu workflow + safety); this skill adds T3 facts and constraints




1. All `manage-ubuntu` safety rules apply
2. Connect order: MCP → **443** → **22**
3. Ask before HAProxy reload/restart (drops SoftEther TCP on :443); run that restart over **SSH :22** so the control session survives
5. Mullvad parents are production egress — ask before restart/recreate; never restart them just to fix Iran bypass
6. Do not paste SoftEther admin, Mullvad account, Remnawave, or DB secrets into chat or docs; read live env/volumes when needed

