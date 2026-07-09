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

- **Credentials**: stored credentials are obfuscated at rest and never returned
  to the frontend in plaintext (masked with a sentinel value). Specifics:
  database connection passwords use an XOR stream cipher keyed by a per-machine
  auto-generated `secret.key` (`api/utils/encryption_utils.py`, "v2" format);
  AI provider API keys use Fernet (`api/core/foundation/crypto_utils.py`).
  This is deliberate **local-app obfuscation, not cryptographic protection** —
  the app itself must be able to decrypt these values, so anyone with full
  access to your machine and the key file can too. Treat machine access as the
  real security boundary.
- **AI safety**: AI-generated SQL is always shown for review and is **never
  executed automatically**.
- When self-hosting, do not expose the backend to untrusted networks without
  putting it behind your own authentication / network controls.

## Supported Versions

Security fixes target the latest `main`. Please make sure you are on a recent
build before reporting.
