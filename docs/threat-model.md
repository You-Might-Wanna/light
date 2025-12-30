# Threat Model

## Overview

The Accountability Ledger presents a high-value target for adversaries seeking to:

1. **Suppress** documented misconduct
2. **Discredit** the platform's integrity
3. **Manipulate** evidence or records
4. **Disrupt** platform availability
5. **Identify** administrators or sources

## Threat Actors

### Resourced Adversaries

Organizations with legal, financial, or technical resources:

- Corporations documented in evidence cards
- Government agencies subject to accountability
- Well-funded interest groups

**Capabilities**: Legal action, DDOS attacks, targeted harassment, infrastructure attacks, social engineering

### Opportunistic Attackers

Generic threat actors seeking any vulnerable target:

- Script kiddies
- Credential stuffers
- Automated scanners

**Capabilities**: Known exploits, credential stuffing, basic DDOS

### Insider Threats

Authorized users acting maliciously:

- Compromised admin accounts
- Rogue administrators

**Capabilities**: Direct data manipulation, credential theft, backdoor insertion

## Attack Vectors

### Infrastructure Attacks

| Attack | Mitigation |
|--------|------------|
| DDOS | CloudFront, WAF rate limiting, traffic drop switch |
| AWS account compromise | MFA, least privilege IAM, CloudTrail monitoring |
| DNS hijacking | DNSSEC, certificate pinning |
| Supply chain | Pinned dependencies, signed commits, CODEOWNERS |

### Data Integrity Attacks

| Attack | Mitigation |
|--------|------------|
| Source tampering | SHA-256 hashing, KMS signing, immutable backups |
| Database manipulation | DynamoDB PITR, cross-account backups, audit logs |
| Record deletion | No hard deletes, Object Lock in backup account |
| Version history alteration | Append-only audit log, cryptographic chaining |

### Application Attacks

| Attack | Mitigation |
|--------|------------|
| XSS | React escaping, CSP headers |
| Injection | Input validation (Zod), parameterized queries |
| CSRF | SameSite cookies, token validation |
| Auth bypass | Cognito JWT validation, API Gateway authorizer |

### Social Engineering

| Attack | Mitigation |
|--------|------------|
| Phishing | TOTP MFA required, no SMS |
| Pretexting | Admin verification procedures |
| Insider recruitment | Background checks, audit logging |

## Security Controls

### Authentication & Authorization

- Cognito with required TOTP MFA
- JWT tokens with 1-hour expiry
- No public user registration
- Admin-only write access

### Data Protection

- Encryption at rest (S3, DynamoDB)
- Encryption in transit (TLS)
- KMS-signed verification manifests
- Presigned URLs for source access

### Availability

- CloudFront edge caching
- Multi-AZ DynamoDB
- Read-only mode capability
- Traffic drop switch (WAF)

### Integrity

- Source document hashing
- Cryptographic signing
- Immutable backups (Object Lock)
- Complete audit trail

### Monitoring

- CloudWatch alarms
- CloudTrail logging
- WAF logging
- Access pattern analysis

## Incident Response

### Detection

- Real-time CloudWatch alarms
- Security Hub findings
- GuardDuty alerts (if enabled)
- Manual review triggers

### Response Procedures

1. **Triage**: Assess scope and impact
2. **Contain**: Activate relevant controls (drop switch, read-only)
3. **Investigate**: Review logs, identify root cause
4. **Remediate**: Apply fixes, rotate credentials
5. **Recover**: Restore from backups if needed
6. **Document**: Update threat model, improve controls

### Emergency Controls

- **Traffic Drop**: WAF block-all rule
- **Write Freeze**: SSM parameter `LEDGER_READONLY=true`
- **Account Lockdown**: Emergency IAM deny policy
- **Evidence Preservation**: Cross-account backups remain accessible

## Assumptions

- AWS infrastructure is secure at the provider level
- KMS key material is protected by AWS HSMs
- CloudFront/WAF provide adequate DDOS protection
- Admins are trusted and vetted

## Limitations

- Cannot prevent legal attacks (subpoenas, lawsuits)
- Cannot guarantee source authenticity at time of creation
- Cannot protect against zero-day AWS vulnerabilities
- Limited protection against nation-state adversaries

## Review Schedule

This threat model should be reviewed:

- Quarterly (minimum)
- After any security incident
- Before major feature releases
- When new threat intelligence emerges

---

*Last updated: December 2024*
