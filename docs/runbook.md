# Operations Runbook

## Emergency Procedures

### 1. Traffic Drop (Panic Switch)

When to use: Active attack, major incident, or system compromise suspected.

**Immediate actions:**

```bash
# Option A: WAF block-all (if configured)
aws wafv2 update-web-acl --name ledger-block-all --scope CLOUDFRONT ...

# Option B: API Gateway throttle to near-zero
aws apigatewayv2 update-stage --api-id <API_ID> --stage-name '$default' \
  --default-route-settings '{"ThrottlingBurstLimit": 1, "ThrottlingRateLimit": 0.1}'

# Option C: CloudFront disable (nuclear option)
aws cloudfront update-distribution --id <DIST_ID> --distribution-config '{"Enabled": false, ...}'
```

**Recovery:**
- Reverse the above commands once incident is resolved
- Review CloudWatch logs for attack patterns
- Consider adding specific WAF rules before re-enabling

### 2. Write Freeze

When to use: Data integrity concern, suspected unauthorized modifications.

**Enable read-only mode:**

```bash
aws ssm put-parameter --name "/ledger/prod/LEDGER_READONLY" --value "true" --overwrite
```

The API checks this parameter and rejects write operations.

**Disable read-only mode:**

```bash
aws ssm put-parameter --name "/ledger/prod/LEDGER_READONLY" --value "false" --overwrite
```

### 3. Credential Rotation

When to use: Suspected credential compromise.

**Cognito admin password reset:**

```bash
aws cognito-idp admin-set-user-password --user-pool-id <POOL_ID> \
  --username <EMAIL> --password <NEW_PASS> --permanent
```

**Force MFA re-enrollment:**

```bash
aws cognito-idp admin-set-user-mfa-preference --user-pool-id <POOL_ID> \
  --username <EMAIL> --software-token-mfa-settings '{"Enabled": false}'
```

## Data Recovery

### DynamoDB Point-in-Time Recovery

**Restore table to specific time:**

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name ledger-prod-cards \
  --target-table-name ledger-prod-cards-restored \
  --restore-date-time "2024-12-30T12:00:00Z"
```

**Swap tables (after verification):**

1. Update Lambda environment variables to use restored table
2. Redeploy Lambda or update alias

### S3 Version Recovery

**List versions of an object:**

```bash
aws s3api list-object-versions --bucket ledger-prod-sources \
  --prefix "sources/<sourceId>/"
```

**Restore specific version:**

```bash
aws s3api copy-object --bucket ledger-prod-sources \
  --copy-source "ledger-prod-sources/sources/<key>?versionId=<versionId>" \
  --key "sources/<key>"
```

### Cross-Account Backup Restore

If primary account is compromised:

1. Access backup account with break-glass credentials
2. Restore from Object Lock-protected bucket
3. Deploy to new infrastructure
4. Update DNS to point to new deployment

## Verification Procedures

### Verify Source Integrity

```bash
# Get source metadata
aws dynamodb get-item --table-name ledger-prod-sources \
  --key '{"PK": {"S": "SOURCE#<sourceId>"}, "SK": {"S": "META"}}'

# Download file and compute hash
aws s3 cp s3://ledger-prod-sources/sources/<key> /tmp/file
sha256sum /tmp/file

# Compare with stored hash
```

### Verify KMS Signatures

```python
import boto3
import json
import base64

kms = boto3.client('kms')
s3 = boto3.client('s3')

# Get manifest
manifest = s3.get_object(Bucket='...', Key='...')['Body'].read()

# Get signature from DynamoDB record
signature = base64.b64decode(signature_b64)

# Verify
response = kms.verify(
    KeyId='<key-id>',
    Message=manifest,
    MessageType='RAW',
    Signature=signature,
    SigningAlgorithm='RSASSA_PSS_SHA_256'
)

print(f"Signature valid: {response['SignatureValid']}")
```

## Monitoring Commands

### Check API errors

```bash
aws logs filter-log-events --log-group-name /aws/lambda/ledger-prod-api \
  --filter-pattern "ERROR" --start-time $(date -d '1 hour ago' +%s000)
```

### Check throttling

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Lambda \
  --metric-name Throttles --dimensions Name=FunctionName,Value=ledger-prod-api \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 300 --statistics Sum
```

### Check DynamoDB throttles

```bash
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests --dimensions Name=TableName,Value=ledger-prod-cards \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 300 --statistics Sum
```

## Quarterly Drill Checklist

### Backup Verification

- [ ] Restore random entity + cards from DynamoDB PITR
- [ ] Verify restored data matches production
- [ ] Delete test restoration

### Signature Verification

- [ ] Select 10 random VERIFIED sources
- [ ] Download manifests and verify KMS signatures
- [ ] Recompute SHA-256 and compare
- [ ] Document any discrepancies

### Drop Switch Test

- [ ] Schedule maintenance window
- [ ] Enable traffic drop (in dev first)
- [ ] Verify public site is blocked
- [ ] Disable traffic drop
- [ ] Verify service restored

### Incident Response

- [ ] Review threat model
- [ ] Update runbook if procedures changed
- [ ] Verify emergency contacts are current
- [ ] Test alerting pipeline

---

*Last updated: December 2024*
