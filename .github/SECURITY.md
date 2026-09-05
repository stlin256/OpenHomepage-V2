# Security Policy

## Supported Versions

Only the latest release line is supported with security fixes. The current version is defined in `package.json` and tagged releases.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately via GitHub Security Advisories:

1. Go to the repository's [Security tab](https://github.com/stlin256/OpenHomepage-V2/security).
2. Click **"Report a vulnerability"** and fill in the details.

You should receive an acknowledgment within a few days. If the issue is confirmed, we will coordinate a fix and disclosure timeline with you.

## Scope Notes

- This project generates a static site and ships an **optional local admin server** (`npm run admin`). The admin server is intended for local use only; do not expose it to the public network. Issues arising from deploying the admin server publicly are out of scope.
- Private content lives in `data/` (git-ignored). Never commit real `data/` contents; report any code path that could leak them (e.g. path traversal in import/export, admin APIs) as a vulnerability.
