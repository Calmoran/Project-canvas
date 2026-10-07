# Credential-store libraries for Node

Date: 2026-10-07. Researched by the Architect. Registry and GitHub facts were read on this date from the npm registry (`npm view`) and the GitHub API; the native-module checks were run on this PC (Windows 11 x64, Node 24.16.0).

## Why this exists

Canvas keeps a MySQL password and an SSH passphrase per workspace in the operating system's credential store: Windows Credential Manager, the macOS Keychain, or the Linux Secret Service (the desktop "keyring", provided by GNOME Keyring, KWallet or KeePassXC). When no store is available it falls back to a file only the owner can read. That decision is made. This page compares the npm libraries that can do the store part so the owner can pick one. It does not recommend one.

Terms used below:

- **Native module**: a piece of compiled C++ or Rust code that Node loads like a library. It is fast and talks to the OS directly, but it has to be compiled for each OS and processor.
- **Prebuilt binary (prebuild)**: that compiled code, shipped ready-made so the user's machine needs no compiler.
- **N-API (Node-API)**: Node's stable interface for native modules. A module built against it keeps working on newer Node versions without being rebuilt, which is why Node 24 is not a worry for any candidate below.
- **Install script**: a command a package runs when it is installed. Some security setups block these, and pnpm 10 skips them for dependencies unless the project allows them.

## Comparison

| Candidate                    | Version (date)      | Maintained?                   | License | Prebuilt for Win x64 / mac Intel + ARM / Linux x64        | How binaries arrive                                         | Linux runtime needs                      |
| ---------------------------- | ------------------- | ----------------------------- | ------- | --------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `keytar`                     | 7.9.0 (2022-02-17)  | No. Repo archived             | MIT     | Yes                                                       | Install script downloads from GitHub (`prebuild-install`)   | `libsecret-1.so.0`                       |
| `@github/keytar`             | 7.10.6 (2026-02-06) | Yes, lightly (GitHub org)     | MIT     | Yes                                                       | All prebuilds inside the package; install script copies one | `libsecret-1.so.0`                       |
| `keytar-forked`              | 7.10.0 (2025-02-04) | Single release, one person    | MIT     | Yes (GitHub release assets)                               | Install script downloads from GitHub (`prebuild-install`)   | `libsecret-1.so.0`                       |
| `@postman/node-keytar`       | 7.9.3 (2023-03-13)  | No, and see the security note | MIT     | Yes                                                       | Install script (`prebuild-install`)                         | `libsecret-1.so.0`                       |
| `@napi-rs/keyring`           | 2.1.0 (2026-09-13)  | Yes, active                   | MIT     | Yes                                                       | One small package per platform (optional dependencies)      | None beyond libc (talks to D-Bus itself) |
| `cross-keychain`             | 1.1.0 (2025-10-07)  | Small, one person             | MIT     | Not needed (pure JS); can use `@napi-rs/keyring` if found | Child processes, or `@napi-rs/keyring`                      | `secret-tool` program in the CLI mode    |
| `@zowe/secrets-for-zowe-sdk` | 8.39.0 (2026-10-03) | Yes (Zowe project)            | EPL-2.0 | Yes                                                       | Install script checks prebuilds                             | UNVERIFIED                               |
| Own code calling OS tools    | n/a                 | We maintain it                | n/a     | Not needed                                                | Child processes                                             | `secret-tool` program                    |
| Electron `safeStorage`       | n/a                 | Yes                           | MIT     | Electron only                                             | Part of Electron                                            | n/a                                      |

All the candidates that ship native code loaded and answered a read on Node 24.16.0 on Windows x64 here, with no compiler installed: `keytar` 7.9.0, `@github/keytar` 7.10.6 and `@napi-rs/keyring` 2.1.0 (each returned "not found" for a probe entry; nothing was written to Credential Manager). macOS and Linux were not run: UNVERIFIED beyond the package contents.

## Candidates

### `keytar`

The historical standard, written for the Atom editor. Version 7.9.0, released 2022-02-17. The GitHub repo `atom/node-keytar` is archived (read-only), last pushed 2022-12-12, with 77 issues left open. It is not marked deprecated on npm, but nobody can fix it. Stores: Windows Credential Manager, macOS Keychain, Linux Secret Service through libsecret. Its install script uses `prebuild-install` to download a binary from GitHub releases at install time; npm now warns that `prebuild-install` itself is no longer maintained. On Linux the binary needs the `libsecret-1.so.0` library at run time, so it fails to load on machines without it. Windows writes credentials with Enterprise persistence (they roam with a roaming profile).

- https://www.npmjs.com/package/keytar
- https://github.com/atom/node-keytar (archived)
- https://github.com/atom/node-keytar/releases/tag/v7.9.0

### `@github/keytar`

A fork of `keytar` published by the GitHub organization. Package created 2026-02-03; latest 7.10.6 on 2026-02-06. The repo `github/node-keytar` is not archived, has 7 open issues, and was last pushed 2026-09-10 (dependency bumps; no npm release since February). Same API and stores as `keytar`. All 13 prebuilt binaries ship inside the package (1.5 MB unpacked), including `win32-x64`, `darwin-x64`, `darwin-arm64` and `linux-x64`; an install script copies the right one into place, and if that fails it tries to compile with node-gyp, which needs a compiler. Its Linux binary also needs `libsecret-1.so.0`. Why GitHub publishes it, and how long they intend to, is not stated: UNVERIFIED. Whether it loads if pnpm skips the install script is UNVERIFIED (the script is what puts the binary where the loader looks).

- https://www.npmjs.com/package/@github/keytar
- https://github.com/github/node-keytar

### `keytar-forked` and `@postman/node-keytar`

`keytar-forked` 7.10.0 (2025-02-04) is a one-release fork by a former keytar maintainer (repo `shiftkey/node-keytar`, last pushed the same day). Same design as `keytar`, including the deprecated `prebuild-install` download.

`@postman/node-keytar`: its `latest` tag points at 7.9.3 from 2023-03-13. Versions 7.9.4, 7.9.5 and 7.9.6 (all 2025-11-24) were published by the "Shai-Hulud 2.0" npm worm and contain credential-stealing malware (OSV advisory MAL-2025-190754). Not a candidate.

- https://www.npmjs.com/package/keytar-forked
- https://www.npmjs.com/package/@postman/node-keytar
- https://osv.dev/vulnerability/MAL-2025-190754

### `@napi-rs/keyring`

A Node binding, written with napi-rs (a Rust toolkit for Node modules), for the Rust `keyring` library (repo `open-source-cooperative/keyring-rs`, formerly `hwchen/keyring-rs`, active, last pushed 2026-10-03). Version 2.1.0 on 2026-09-13; 2.0.0 on 2026-08-31; 1.3.0 on 2026-04-30. Maintained by Brooooooklyn (the author of napi-rs) with one other npm maintainer; repo last pushed 2026-10-02, 4 open issues. It offers a sync `Entry` and an async `AsyncEntry`, plus a keytar-compatible API.

Binaries arrive as optional dependencies: npm installs only the one package matching the machine (for example `@napi-rs/keyring-win32-x64-msvc`, 1.9 MB unpacked), with no install script. Targets include Windows x64 and ARM64, macOS x64 and ARM64, Linux x64 and ARM64 (glibc and musl). The Linux x64 binary links only against libc and friends; it does not need libsecret or libdbus installed, which this research checked by reading the binary's library list.

Pitfalls:

- On Linux it tries the Secret Service first and, if none is running, **silently falls back to the kernel keyring (keyutils)**, which lives in memory and is lost at reboot. Since 2.1.0 a caller can require a store: `new Entry(service, account, { linux: { store: 'secret-service' } })` throws instead of falling back. Canvas would want that, so it can use its own file fallback.
- Version 2.0.0 changed errors: a locked or unreachable store now throws instead of looking like "not stored". That is the behaviour Canvas wants, but it is recent.
- Windows passwords are stored as UTF-16 and refused above 2,560 bytes (about 1,280 characters); credentials use Enterprise persistence by default. Both are far above what a database password or passphrase needs.

- https://www.npmjs.com/package/@napi-rs/keyring
- https://github.com/Brooooooklyn/keyring-node and its releases
- https://github.com/open-source-cooperative/windows-native-keyring-store (`src/utils.rs`, the 2,560-byte check)

### `cross-keychain`

A TypeScript library and CLI by one person (magarcia). Version 1.1.0 on 2025-10-07, 8 open issues; the repo has unreleased breaking changes from April 2026. If `@napi-rs/keyring` (an optional dependency) is installed, it uses it; otherwise it falls back to calling OS tools: PowerShell with an embedded `CredWrite` call on Windows, `security` on macOS, `secret-tool` on Linux. It also has an encrypted-file backend, with the key stored in a separate `0600` file next to it.

Pitfalls, read from its v1.1.0 source: in the PowerShell mode the password is put, base64-encoded, inside the `-Command` argument, and on macOS it is passed as `security add-generic-password -w <password>`. Command-line arguments can be read by other programs running as the same user, as the project's own README notes. Its backend choice can be changed by the environment variable `TS_KEYRING_BACKEND` and a shared config file in a generic `keyring` folder, so something outside Canvas can redirect where Canvas's secrets go. It pulls in CLI dependencies (`meow`, `@inquirer/prompts`) that a library user does not need.

- https://www.npmjs.com/package/cross-keychain
- https://github.com/magarcia/cross-keychain (`src/backends/windows.ts`, `src/backends/macos.ts`, `src/runtime.ts` at tag v1.1.0)

### `@zowe/secrets-for-zowe-sdk`

The Zowe project's keytar replacement, written in Rust, actively released (8.39.0 on 2026-10-03). Its license is EPL-2.0, which is not compatible with the GPL family unless the code is released with a "Secondary License" notice. Whether Zowe does that is UNVERIFIED, so it is a license risk for AGPL-3.0 Canvas, and it is aimed at Zowe rather than general use. Listed for completeness only.

- https://www.npmjs.com/package/@zowe/secrets-for-zowe-sdk

### Calling OS tools ourselves (pure JS)

Canvas could skip native modules and run the OS's own tools as child processes:

- **Windows**: `cmdkey /generic:<target> /user:<u> /pass:<p>` can store and delete, but **cannot read a password back** ("Passwords are not displayed after they're stored"). Reading needs PowerShell calling the Win32 `CredRead` function (the approach `cross-keychain` takes), or a PowerShell module that may not be installed. The secret would have to reach PowerShell through standard input rather than the command line to stay out of process lists.
- **macOS**: `security add-generic-password` / `find-generic-password -w`. Passing the password with `-w` puts it on the command line. Items created through `security` are trusted to the `security` tool, so any program run by the same user that calls it may read them without a prompt: UNVERIFIED.
- **Linux**: `secret-tool store/lookup/clear` (from the `libsecret-tools` package, not always installed). `store` reads the secret from standard input, which is safe.

Pros: no native code at all, nothing to download. Cons: Canvas owns three platform implementations and their tests; each call starts a process (PowerShell is slow to start); error messages are text to parse; and the Windows and macOS paths need care to keep secrets out of command lines.

- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmdkey
- https://manpages.debian.org/testing/libsecret-tools/secret-tool.1.en.html

### Electron `safeStorage`

Electron's built-in encryption helper (DPAPI on Windows, Keychain on macOS, KWallet or GNOME Keyring on Linux), available only in an Electron app's main process. Canvas is not an Electron app in release 1, so it does not apply.

- https://www.electronjs.org/docs/latest/api/safe-storage

### Pitfalls common to every store

- **Linux without a Secret Service**: servers, WSL, containers, SSH sessions and some minimal desktops have no D-Bus session or no keyring daemon. Every library then fails (or, with `@napi-rs/keyring`, falls back to keyutils unless pinned). Canvas's file fallback covers this case.
- **Locked keyring**: GNOME Keyring may show an unlock dialog, or fail when there is no screen to show it on.
- **Keychain prompts on macOS**: the Keychain ties an item to the program that created it, here the `node` executable. After Node is upgraded or reinstalled, macOS may ask "node wants to use your confidential information" once: UNVERIFIED.
- **Windows size limits**: a secret may be at most 2,560 bytes; target names up to 32,767 characters (Microsoft's `CREDENTIAL` documentation). Not a concern for passwords.

Source: https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala

## The owner-only file fallback

When no store works, Canvas writes the secret to a file only the current user can read, and tells the user so. Encrypting it with a key kept beside it adds little, because whoever can read one file can read the other.

- **macOS and Linux (POSIX)**: permissions `0600` (owner read and write, nobody else) on the file and `0700` on its folder. From Node: create with `fs.writeFile(path, data, { mode: 0o600, flag: 'wx' })` (the mode only applies when the file is created, and the umask can only remove bits, so `0600` stays `0600`), call `fs.chmod(path, 0o600)` for a file that already existed, and check `(stat.mode & 0o077) === 0` before reading, refusing a file others can read (as OpenSSH does with keys). Write to a temporary file in the same folder and rename it over the old one so a crash never leaves half a file.
- **Windows**: Node's `mode` does nothing here; its documentation says only the write permission can be changed and owner, group and others are not distinguished. Owner-only on Windows means an ACL (access-control list) on the file. A file under `%LOCALAPPDATA%` inherits the profile folder's ACL, which normally gives the user, SYSTEM and Administrators full control: UNVERIFIED for every Windows edition. To narrow it, run `icacls <file> /inheritance:r /grant:r *<user SID>:F` through `execFile` (no shell), taking the SID from `whoami /user` so non-English account names cannot break it. Administrators can always take ownership of any file, so this protects against other ordinary users, not against an administrator.

Sources: https://github.com/nodejs/node/blob/v24.x/doc/api/fs.md (`fs.chmod` caveats; `mode` "Not supported on Windows"), https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls

## Viable choices

The owner picks. Each of these meets the hard requirements (AGPL-compatible license, no compiler, Windows, macOS and Linux stores).

1. **`@napi-rs/keyring`**. Actively maintained, no install script, installs only the binary for the user's machine, and no libsecret needed on Linux. Trade-offs: one main maintainer; a breaking release a month ago; Canvas must pin Linux to `secret-service` to avoid the silent, non-persistent keyutils fallback.
2. **`@github/keytar`**. The long-proven keytar code and API under the GitHub organization, with every binary inside the package. Trade-offs: no release since February 2026 and no stated support plan; an install script that pnpm or locked-down machines may skip; Linux needs `libsecret` installed or the module will not load.
3. **Own child-process code calling the OS tools**. No native code or third-party package to trust. Trade-offs: Canvas writes and tests three platform implementations; reading on Windows needs PowerShell and careful handling to keep secrets off the command line; slower per call. (`cross-keychain` is a ready-made version of this, but it is a one-person project that leaks secrets into command lines and can be redirected by environment settings.)

Not viable: `keytar` (archived), `keytar-forked` (single release), `@postman/node-keytar` (malware in its version history), `@zowe/secrets-for-zowe-sdk` (license risk), Electron `safeStorage` (Electron only).
