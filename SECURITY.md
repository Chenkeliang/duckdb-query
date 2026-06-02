# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab → **Report a vulnerability**
   ([Private vulnerability reporting](https://github.com/Chenkeliang/duckdb-query/security/advisories/new)).
2. Describe the issue, affected version/commit, and reproduction steps.

We aim to acknowledge reports within a few days and will keep you updated on the
fix. Please give us a reasonable window to address the issue before any public
disclosure.

## Scope & Notes

DuckQuery is **self-hosted and local-first** — your data and database
credentials stay on your own machine.

- **Credentials**: database passwords and AI provider API keys are encrypted at
  rest (Fernet) and are never returned to the frontend in plaintext (masked as
  `****`).
- **AI safety**: AI-generated SQL is always shown for review and is **never
  executed automatically**.
- When self-hosting, do not expose the backend to untrusted networks without
  putting it behind your own authentication / network controls.

## Supported Versions

Security fixes target the latest `main`. Please make sure you are on a recent
build before reporting.
