# Security Policy

## Supported version

Security fixes are applied to the current production code and the latest state of the default branch. Historical branches, forks, local modifications, and archived deployments are not supported.

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected vulnerability.

Email **shaw@popcon.dev** with the subject:

```text
Security report: popular-consulting
```

Include enough information to reproduce and assess the issue safely:

- A concise description of the vulnerability
- The affected URL, component, or file
- Reproduction steps or a minimal proof of concept
- Expected and observed behavior
- Likely impact
- Browser, device, and operating system where relevant
- Any mitigation you have already identified

Do not include real user data, credentials, private keys, or unnecessary destructive payloads.

## Safe research expectations

When investigating:

- Use the minimum access and data required to demonstrate the issue.
- Do not attempt denial of service, social engineering, credential attacks, persistence, or lateral movement.
- Do not access, modify, download, or retain data that does not belong to you.
- Stop testing when you have enough evidence to explain the vulnerability.
- Allow the issue to be assessed and remediated before public disclosure.

This repository does not currently operate a paid bug bounty program.

## Secret exposure

When a secret or credential is discovered in Git history, a public build, an issue, or an artifact:

1. Do not reuse or test the credential beyond what is necessary to identify the exposure.
2. Report the exact location privately.
3. Treat removal from the current branch as insufficient because Git history and caches may retain it.
4. Rotate or revoke the credential before considering the incident resolved.
5. Review logs and dependent systems for unauthorized use.

## Public portfolio boundaries

Architecture and case-study content must not disclose:

- Client secrets or proprietary source code
- Internal hostnames, network paths, account identifiers, or deployment credentials
- Customer, employee, applicant, or reference personal information
- Authentication or payment details that materially increase attack surface
- Screenshots containing tokens, private records, administrative interfaces, or production configuration

See [the publication and evidence policy](docs/content/publication-policy.md) for the complete review process.
