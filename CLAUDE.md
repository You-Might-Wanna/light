# Accountability Ledger - Project Guidelines
See top level CLAUDE.md at C:\Users\tyler\CLAUDE.md
See repo level settings at C:\Users\tyler\Projects\light\.claude\settings.local.json
## Guiding Principles

These principles MUST hold for all work on this codebase:

1. **Evidence-first:** Nothing gets published without verifiable sources.
2. **No auto-publish:** Automation may create drafts/inbox items only.
3. **Backend never trusts frontend:** All authorization enforced server-side.
4. **Deterministic-first:** Prefer non-LLM parsing; LLM is optional and must be grounded with citations/IDs.

## Project Structure

```
light/
├── backend/          # Lambda handlers, services, DynamoDB
├── frontend/         # React SPA (Vite + TypeScript)
├── shared/           # Shared types and enums
└── infra/            # CDK infrastructure
```

## Code Patterns

### Frontend Error Display
Use the toast notification system for user feedback:
```typescript
import { useToast } from '../components/Toast';

const { showError, showSuccess } = useToast();
showError(err);  // Handles ApiRequestError, Error, string
showSuccess('Operation completed');
```

### API Requests
All API requests automatically include `X-Request-Id` for correlation:
```typescript
import { api } from '../lib/api';
// Throws ApiRequestError with requestId on failure
```

### Intake Promote Flow
When promoting intake items, use `generateDefaultSummary()` to pre-populate the card summary from RSS metadata.

## Authorization Tests

Authorization test coverage exists in:
- `backend/src/handlers/api.authz.test.ts` - Admin endpoint auth (401/403)
- `backend/src/lib/services/sources.authz.test.ts` - Source download restrictions

## Release Process

- Use `npm run release:patch` for bug fixes and minor features
- Use `npm run release:minor` for completed phases/major features
- All releases trigger GitHub Actions deployment to production
- TODO.md is in .gitignore - stays local only

## Commands

```bash
npm run typecheck      # TypeScript validation
npm run lint           # ESLint
npm run test           # Vitest (backend)
npm run build          # Build all workspaces
npm run release:patch  # Bump patch version and deploy
```
