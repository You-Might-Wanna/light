# Accountability Ledger

A public, evidence-first platform for documenting corporate and government misconduct using verified public sources.

## Architecture

- **Frontend**: React + Vite + TypeScript (static SPA on S3 + CloudFront)
- **Backend**: Node.js Lambda + API Gateway HTTP API
- **Database**: DynamoDB (on-demand billing)
- **Storage**: S3 (versioned, private sources bucket)
- **Auth**: Cognito (admin-only, TOTP MFA required)
- **IaC**: AWS CDK (TypeScript)
- **CI/CD**: GitHub Actions

## Project Structure

```
repo/
├── frontend/          # React SPA
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
│   └── package.json
├── backend/           # Lambda handlers
│   ├── src/
│   │   ├── handlers/
│   │   ├── lib/
│   │   └── models/
│   └── package.json
├── shared/            # Shared types and enums
│   └── src/
├── infra/
│   └── cdk/          # CDK infrastructure
├── docs/              # Documentation
│   ├── editorial-policy.md
│   ├── corrections-policy.md
│   ├── threat-model.md
│   └── runbook.md
└── .github/workflows/ # CI/CD pipelines
```

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

### Local Development

```bash
# Install dependencies
npm install

# Build shared types
npm run build -w @ledger/shared

# Start frontend dev server
npm run dev -w @ledger/frontend

# Build backend
npm run build -w @ledger/backend
```

### Deploy to AWS

```bash
# Bootstrap CDK (first time only)
cd infra/cdk
npx cdk bootstrap

# Deploy dev stack
npx cdk deploy LedgerDevStack

# Deploy production (via tag)
git tag v1.0.0
git push origin v1.0.0
```

## Environment Variables

### Backend (Lambda)

Set via CDK or SSM Parameter Store:

- `ENTITIES_TABLE` - DynamoDB entities table name
- `CARDS_TABLE` - DynamoDB cards table name
- `SOURCES_TABLE` - DynamoDB sources table name
- `AUDIT_TABLE` - DynamoDB audit table name
- `SOURCES_BUCKET` - S3 bucket for source documents
- `KMS_SIGNING_KEY_ID` - KMS key for signing manifests
- `LEDGER_READONLY` - Set to "true" to enable read-only mode

### Frontend

- `VITE_API_URL` - API Gateway URL (defaults to `/api` for proxy)

## API Endpoints

### Public (no auth)

- `GET /health` - Health check
- `GET /entities` - List entities
- `GET /entities/{id}` - Get entity
- `GET /entities/{id}/cards` - Get entity's cards
- `GET /entities/{id}/summary` - Get entity fact pack summary
- `GET /entities/{id}/relationships` - Get entity relationships
- `GET /entities/{id}/ownership-tree` - Get ownership structure graph
- `GET /cards` - List published cards
- `GET /cards/{id}` - Get card with entities
- `GET /sources/{id}` - Get source metadata
- `GET /sources/{id}/download` - Get presigned download URL
- `GET /sources/{id}/verification` - Get verification manifest
- `GET /relationships/{id}` - Get relationship details

### Admin (JWT required)

- `POST /admin/entities` - Create entity
- `PUT /admin/entities/{id}` - Update entity
- `POST /admin/sources` - Create source metadata
- `POST /admin/sources/{id}/upload-url` - Get presigned upload URL
- `POST /admin/sources/{id}/finalize` - Verify and sign source
- `POST /admin/cards` - Create card
- `PUT /admin/cards/{id}` - Update card
- `POST /admin/cards/{id}/submit` - Submit for review
- `POST /admin/cards/{id}/publish` - Publish card
- `POST /admin/cards/{id}/dispute` - Mark as disputed
- `POST /admin/cards/{id}/correct` - Mark as corrected
- `POST /admin/cards/{id}/retract` - Retract card
- `GET /admin/audit` - List audit logs
- `POST /admin/relationships` - Create relationship
- `PUT /admin/relationships/{id}` - Update relationship
- `POST /admin/relationships/{id}/publish` - Publish relationship
- `POST /admin/relationships/{id}/retract` - Retract relationship
- `POST /admin/entities/{id}/aliases` - Add entity alias

## Features

### Entity Summaries (Fact Packs)

The platform generates deterministic fact pack summaries for each entity:
- Groups published claims by type (enforcement actions, settlements, penalties, etc.)
- Calculates total monetary impact
- Generates template-driven narrative summaries
- Supports filtering by claim type and date range

### Claim Metadata

Evidence cards support rich metadata for enhanced claims:
- **Claim Stance**: Who is making the claim (agency, court, company, etc.)
- **Claim Type**: Category of claim (enforcement, settlement, penalty, etc.)
- **Monetary Amount**: Financial impact with currency and type
- **Affected Count**: Number of individuals, accounts, or facilities affected
- **Source References**: Page numbers, sections, and quotes from sources

### Entity Relationships

Track corporate ownership and relationships:
- Relationship types: OWNS, CONTROLS, SUBSIDIARY_OF, ACQUIRED, and more
- Ownership percentage tracking
- Ownership tree visualization
- All relationships require verified sources

## Security Features

- **Source Integrity**: SHA-256 hashing + KMS signing
- **Immutable Backups**: S3 Object Lock in backup account
- **No Hard Deletes**: RETRACTED/ARCHIVED states only
- **MFA Required**: TOTP for all admin accounts
- **Audit Logging**: All admin actions logged
- **Rate Limiting**: WAF + API Gateway throttling

## Documentation

- [Editorial Policy](docs/editorial-policy.md)
- [Corrections Policy](docs/corrections-policy.md)
- [Threat Model](docs/threat-model.md)
- [Operations Runbook](docs/runbook.md)

## License

Proprietary. All rights reserved.
