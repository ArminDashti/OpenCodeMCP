# Windows x64 scripts

Generates and tests Windows x64 PowerShell scripts to build, install, update, and remove an app `.exe` across languages and frameworks.

Inspect manifests, source, and toolchain to identify language/framework, valid Windows x64 build command, `.exe` name, and whether the app runs as a Windows Service or standard process. Adapt existing tools; support any stack. Never invent commands or add dependencies. If the toolchain cannot produce a Windows x64 `.exe`, report the limitation; do not generate misleading scripts.

Generate exactly two token-efficient PowerShell scripts:

- `./<PROJECT Name>/scripts/install-win-x64.ps1`
- `./<PROJECT Name>/scripts/remove-win-x64.ps1`

Export only the Windows x64 `.exe` to `./release` (project root): configure the build to emit there or copy the fresh executable. Keep intermediates elsewhere; create no installers, archives, or non-Windows executables. Prefer a single-file executable when supported. If runtime sidecars are required, explain and do not claim standalone operation.

Do not create a test script. Test only in a disposable, isolated environment; never stop, replace, or remove the user's real app.

## Rules for both scripts

- Require Administrator; check before any file/app mutation. On failure, explain how to rerun elevated. Never self-elevate or request credentials.
- Use informative `Write-Host -ForegroundColor` output: Green success, Yellow information, Red errors. Handle failures safely with actionable messages.
- Accept no port, directory, host, or hosts-file options. Touch only the app `.exe`; preserve settings, databases, unrelated files, and system config.

## install-win-x64.ps1 (install and update)

- Rebuild from current source on every run using the detected existing toolchain; emit the Windows x64 `.exe` to `./release`.
- Verify build success and fresh `.exe` before touching installation. On build failure/missing output, leave installed app running and unchanged.
- Before replacement, identify process vs. Windows Service and stop it. Never replace a running executable; if stop fails, fail safely. Install the fresh `.exe`, then restart/re-enable the app/service as applicable.
- Install/update only the executable. Do not modify settings, databases, PATH, ports, hostnames, or Windows `hosts` file.

## remove-win-x64.ps1 (remove)

- Stop/close app or service before removal; if it cannot stop, delete nothing.
- Remove only the installed app `.exe`; preserve settings, databases, unrelated files, PATH, and system configuration.

## Required post-creation testing

Testing both generated scripts is mandatory on every run; never skip it. Execute them against a disposable app/build in isolation, fix every issue found, and repeat the affected tests until they pass. Do not report completion when testing could not be performed: report the blocker and leave the task explicitly incomplete.

Verify:

1. **Install:** fresh Windows x64 `.exe` goes to `./release` and installs.
2. **Update:** distinguishable fresh build replaces old only after the running test process/service stops; app/service restarts or is re-enabled.
3. **Remove:** app/process/service stops; only installed `.exe` is removed; test settings and unrelated files remain.
4. Non-elevated run fails before mutation. Build/stop/install/restart/removal failures report useful errors and preserve app/data safety.
