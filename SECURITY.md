# Security Policy

Thanks for taking the time to look. This project takes security seriously, and reports — large or small — are welcome.

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` | Yes       |

This is an early-stage project. Once a `0.2.x` line exists, the previous minor will receive security fixes for 90 days after the new minor ships.

## Reporting a vulnerability

Email **msitarzewski@gmail.com** with:

- A clear description of the issue and the impact you believe it has
- Steps to reproduce, or a proof-of-concept if you have one
- The version / commit you tested against
- Your name or handle if you'd like credit (optional)

Please do **not** open a public GitHub issue for security reports. Once a fix is shipped, the original report can be cross-linked from the public changelog.

## Response time

This is a side project, so responses are best-effort:

- **Acknowledgement:** within 7 days of receipt
- **Initial assessment:** within 14 days
- **Fix or mitigation plan:** within 30 days for high/critical findings

If a report sits unanswered past these windows, a polite follow-up is welcome.

## Scope

**In scope:**

- Remote code execution in the app or any of its IPC commands
- Privilege escalation
- Data exfiltration from the local machine
- Cross-site scripting (XSS) in the webview
- SSRF or other outbound-request abuse originating from the app
- Path traversal, arbitrary file read/write through any Tauri command
- Cache poisoning of the icon or trending cache
- Bypass of the URL-scheme allowlist on the homepage opener

**Out of scope:**

- Vulnerabilities in `brew` itself — report those to [Homebrew](https://github.com/Homebrew/brew/security/policy)
- Vulnerabilities in third-party tap content, formulae, or casks installed via this app
- Vulnerabilities in macOS, WebKit, or other system components
- Attacks that require an already-compromised local account (same-UID processes can do anything the user can)
- Social-engineering attacks
- Missing security headers on `formulae.brew.sh` (not our service)
- Issues that require physical access to an unlocked machine

## Disclosure policy

Coordinated disclosure, 90-day default. If a fix takes longer than 90 days, the reporter and the maintainer agree on an extended timeline in writing before the embargo expires. If no fix is plausible within 90 days, the reporter is free to publish after that window closes.

A current security audit lives at [`memory-bank/security.md`](./memory-bank/security.md) and may answer your question before you write the email.

## Hall of fame

Reporters who have found and responsibly disclosed security issues:

<!-- First reporter goes here. Add as: Name (handle) — short description, fix in commit/PR link -->

*(empty — be the first)*
