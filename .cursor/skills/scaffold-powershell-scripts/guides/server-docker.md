# Remote Ubuntu Docker server scripts

Generates `install-on-server-docker.ps1` and `remove-from-server-docker.ps1` to deploy, update, and tear down Dockerized applications on a remote Ubuntu server via SSH.

## Inputs

- **Project name**: Used to determine the local folder structure (e.g., `<Project>`)
- **Stack name**
- **Container name(s)**
- **Build context**: Local Dockerfile or `docker-compose.yml` directory
- **ServerHost**: Remote Ubuntu server IP or hostname
- **SshUser**: Remote user on Ubuntu (must have `docker` or `sudo` group permissions)
- **SshAuth**: Path to SSH private key (`SshKeyPath`) or secure password prompt
- **SshPort**: Remote SSH port (default: 22)
- **ServerAddress**: Public/LAN address for app access (IP or domain)
- **CLI flag + container path**: Optional CLI command mapping into container
- **Network name**: Optional custom Docker network name

## Auto-derived values

- **Image**: `<container-name>-image`
- **Volume**: `<container-name>-volume`
- **Port**: Auto-detected free port on the Ubuntu server (avoid reserved ranges); persisted in state file
- **Remote build dir**: `/tmp/<stack>-build`
- **State file**: Local `.<stack>-server.state.json` (stores target host, assigned port, images, volumes, networks)

## 1. install-on-server-docker.ps1

### Prerequisites & checks

- Verify local `ssh` and `scp` are present.
- Confirm local build context exists.
- Validate SSH connectivity to Ubuntu server.
- Verify `docker` and Docker Compose (`docker compose`) are operational on the Ubuntu host.

### Deployment flow

- **State Check**:
  - **Fresh Install**: Auto-select free port on the Ubuntu host, create `/tmp/<stack>-build`, sync context via `scp`, build/pull images, create Docker network, and run containers. Save configuration to local state file.
  - **Update**: Read existing port and settings from state file. Stop/remove existing stack containers on Ubuntu via SSH. Sync updated context, rebuild, and recreate containers reusing existing Ubuntu volumes without data loss.
- **Port & Firewall**:
  - Test TCP reachability to `<ServerAddress>:<Port>` after container starts.
  - If unreachable, output diagnostic advice for Ubuntu's firewall (`sudo ufw status / allow <port>/tcp`).
- **CLI Wrapper (Optional)**:
  - If CLI mapping is requested, generate a local wrapper executing `ssh <User>@<ServerHost> docker exec -it <container> <path>` and add it to the user's PATH idempotently.
- **Output**:
  - Structured, staged output with color coding: Cyan (phase headers), Yellow (progress), Green (success), Red (errors).

## 2. remove-from-server-docker.ps1

- Read `.<stack>-server.state.json` to resolve remote resources.
- Prompt for confirmation unless `-Force` is passed.
- Execute remote cleanup on Ubuntu host via SSH:
  - Stop and remove stack containers.
  - Remove stack images.
  - Remove named persistent volumes (full teardown).
  - Remove custom network and `/tmp/<stack>-build` directory.
- Remove local CLI wrapper and its PATH entry.
- Delete local `.<stack>-server.state.json` upon successful teardown.

## Verification & testing cycle

1. **Fresh Install**: Run install script; verify containers are running on Ubuntu (`ssh ... docker ps`) and port is accessible remotely.
2. **Data-Safe Update**: Write a test file to the mounted volume via `ssh ... docker exec`, rerun install script, and verify container recreates while retaining test data.
3. **Teardown**: Run remove script; verify remote Ubuntu containers, volumes, networks, and build artifacts are completely removed, and local state is cleared.
