# Docker Chrome Ethernet Egress

Routes local Docker Google Chrome (selenium/standalone-chrome, noVNC) internet egress via Realtek Ethernet (or Hyper-V NVS on same MAC) instead of VPN TAP. Use when Chrome-in-Docker traffic must bypass OpenVPN/Mullvad/WireGuard while host VPN stays up.

## When

- User wants Docker Chrome / `google-chrome` to use Realtek Ethernet, not VPN
- Related: prior Chrome-in-Docker on `:7900` / `:4444`
- Not: disconnect host VPN; not SoftEther/Irancell-T3; not persist-on-boot unless asked

## Defaults

| Key | Value |
|-----|-------|
| Container | `google-chrome` |
| Image | `selenium/standalone-chrome:latest` |
| Ports | `7900` noVNC, `4444` WebDriver |
| Proxy port | `18080` |
| Restart | `no` |
| Proxy script | `../scripts/bind-egress-proxy.py` (skill root `scripts/`) |

## How

Run steps **1→7** in order. Keep host VPN up.

### 1 — Inventory

```powershell
Get-NetAdapter | Where-Object Status -eq 'Up' |
  Select-Object Name, InterfaceDescription, MacAddress, ifIndex
Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object {
    [pscustomobject]@{
      Alias = $_.InterfaceAlias
      IPv4  = ($_.IPv4Address.IPAddress -join ',')
      GW    = ($_.IPv4DefaultGateway.NextHop -join ',')
    }
  }
Get-NetRoute -AddressFamily IPv4 |
  Where-Object { $_.DestinationPrefix -in '0.0.0.0/0','0.0.0.0/1','128.0.0.0/1' } |
  Format-Table DestinationPrefix, NextHop, InterfaceAlias, RouteMetric -AutoSize
docker ps -a --filter name=google-chrome --format '{{.Names}} {{.Status}} {{.Ports}}'
```

VPN hijack = `0.0.0.0/1` + `128.0.0.0/1` on TAP/OpenVPN.

### 2 — Pick BIND_IP

1. Prefer **Realtek** Up NIC with non-APIPA IPv4 + gateway.
2. Else: **vEthernet** sharing Realtek MAC (often `vEthernet (NVS)`) with non-APIPA IPv4 + gateway → use that IPv4 as `BIND_IP`.
3. Stop if no Ethernet path with gateway.

### 3 — Baseline IPs

```powershell
curl.exe --noproxy * --max-time 12 -sS https://api.ipify.org
curl.exe --noproxy * --max-time 12 -sS --interface $BIND_IP https://api.ipify.org
docker exec google-chrome curl -sS --max-time 12 https://api.ipify.org
```

Need: interface IP ≠ container IP (container still on VPN).

### 4 — Start bind proxy

```powershell
# $script = <skill-root>/scripts/bind-egress-proxy.py (absolute path)
Start-Process pythonw.exe -ArgumentList @($script, $BIND_IP, '18080') -WindowStyle Hidden
Start-Sleep 1
Get-NetTCPConnection -State Listen -LocalPort 18080
docker exec google-chrome curl -sS --max-time 15 -x http://host.docker.internal:18080 https://api.ipify.org
```

Proxy path IP must match Ethernet (step 3 interface IP). Reuse existing `:18080` listener if already bound to same `BIND_IP`.

### 5 — Recreate container on proxy

```powershell
docker rm -f google-chrome
docker run -d --name google-chrome --shm-size=2g `
  -p 7900:7900 -p 4444:4444 --restart=no `
  -e SE_VNC_NO_PASSWORD=1 `
  -e http_proxy=http://host.docker.internal:18080 `
  -e https_proxy=http://host.docker.internal:18080 `
  -e HTTP_PROXY=http://host.docker.internal:18080 `
  -e HTTPS_PROXY=http://host.docker.internal:18080 `
  -e no_proxy=localhost,127.0.0.1 `
  -e NO_PROXY=localhost,127.0.0.1 `
  -e SE_BROWSER_ARGS_CHROME=--proxy-server=http://host.docker.internal:18080 `
  selenium/standalone-chrome:latest
```

### 6 — Chrome managed policy (belt)

```powershell
docker exec -u root google-chrome mkdir -p /etc/opt/chrome/policies/managed /etc/chromium/policies/managed
# Write policy JSON via docker cp or printf as root:
# {"ProxyMode":"fixed_servers","ProxyServer":"host.docker.internal:18080","ProxyBypassList":"localhost;127.0.0.1"}
docker restart google-chrome
```

### 7 — Verify

```powershell
docker exec google-chrome curl -sS --max-time 15 https://api.ipify.org
curl.exe --noproxy * --max-time 10 -sS -o NUL -w '%{http_code}' http://127.0.0.1:7900/
```

Pass = container public IP == Ethernet path IP; noVNC `200`. Report before→after IPs.

## Always

1. Discover `BIND_IP` live — do not hardcode LAN addresses across machines.
2. Leave host VPN / SoftEther / Mullvad alone unless user asked to disconnect.
3. Use `restart: no` on the container.
4. Prefer skill script over regenerating the proxy.

## Never

1. Never route SoftEther / Irancell-T3 traffic through this path.
2. Never claim success without matching `api.ipify.org` before/after.
3. Never add boot persistence / compose unless user asked to store it.
4. Never open Windows Settings UI; use PowerShell / Docker CLI only.
