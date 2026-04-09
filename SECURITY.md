# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in `@garuhq/node`, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following channels:

1. **GitHub Security Advisories** (preferred): Go to the [Security tab](https://github.com/Garu-Pagamentos/garu-node/security/advisories/new) of this repository and create a new private security advisory.

2. **Email**: Send a detailed report to **security@garu.com.br**.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix and disclosure**: We aim to release a patch within 14 days of confirmation, coordinating disclosure with the reporter.

## Scope

This policy covers the `@garuhq/node` npm package source code. Issues in the Garu backend API itself should be reported directly to Garu at security@garu.com.br.

## Security Best Practices for SDK Users

- **Never expose your API key** in client-side code or version control.
- **Always verify webhooks** using `Garu.webhooks.verify()` before processing events.
- **Use environment variables** for API keys (`GARU_API_KEY`), never hardcode them.
- **Keep the SDK updated** to receive security patches.
- **Run in a server-side environment** only — this SDK is not intended for browsers.
