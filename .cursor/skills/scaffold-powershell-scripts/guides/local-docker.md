# Local Docker scripts

Generates PowerShell install/remove scripts for a local Docker app: safe (data-preserving) updates, host+container networking, CLI PATH registration, colored output, and full teardown.

## Inputs (ask if missing)

- Stack name (Project name), Container name(s), Build context (Dockerfile/compose path)
- Local address (e.g., `example.local`)
- CLI flag + container-internal path (if applicable)
- Optional custom network name

## Auto-derived (never ask)

- Image: `<container>-image`, Volume: `<container>-volume`
- Port: auto-select free port (avoid reserved); persist in state file so updates reuse it
- Network: Docker default unless custom specified

## install-on-local-docker.ps1

- **Detect**: State file exists?
  - **Fresh**: Derive names, pick port, build image, create network, run containers, save state.
  - **Exists**: Stop/remove containers & images only. Rebuild image, recreate containers. **Reuse volumes** (never prune/replace/touch DB data), keep same port/names.
- **Network/Hosts**: Publish port for host access (`<local-address>:port`). Idempotently add `127.0.0.1 <local-address>` to hosts.
- **CLI**: If flagged, copy/link CLI to local bin dir; idempotently add dir to User PATH.
- **Idempotency**: Safe to re-run. Never duplicate hosts/PATH/networks/volumes. Never re-pick port.
- **Output**: Colored (Cyan=step, Yellow=info, Green=ok, Red=err). Concise phased status. Suppress raw logs.

## remove-from-local-docker.ps1

- Read state/naming convention to target resources.
- Stop/remove stack containers, images, named volumes (full wipe), and custom network.
- Remove hosts entry for `<local-address>` and specific CLI PATH entry.
- Require confirmation unless `-Force`.
- Same colored, concise output.

## Cross-cutting

- Reachable via container names and host (`<local-address>:port`). Self-contained, re-runnable, zero manual cleanup.

## Mandatory testing (agent must always run after creation)

1. **Install** → verify containers running, host+container reachability, hosts entry, PATH.
2. **Update** → write marker to volume, re-run install → verify rebuild, same port/volume reused, marker retained.
3. **Remove** → verify containers, images, volumes, network, hosts entry, PATH gone.

Report pass/fail per step; fix and retest before considering the task complete.
