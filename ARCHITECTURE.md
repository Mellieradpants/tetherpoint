# Tetherpoint Architecture

## System Flow

Frontend (UI)
→ Server Function (trusted layer, holds ANALYZE_SECRET)
→ Backend `/analyze` (requires `x-analyze-secret`)
→ Pipeline:
- Structure
- Meaning
- Verification
- Origin

## Execution Rules

- No direct frontend → backend calls
- No secrets in frontend
- Backend rejects requests without valid `x-analyze-secret`
- Meaning executes only through trusted server-function path
- Structure must emit semantically complete nodes before downstream layers run
- Origin may return null / sparse output when no provenance signals exist
- Verification routes assertions to named record systems
- OpenAPI spec is the contract boundary for integration

## Contract Sources of Truth

1. Backend models
2. `backend/openapi.yaml`
3. Generated frontend API types (`src/types/api.generated.ts`)

## Current Status

- Production pipeline verified end-to-end
- Security path locked
- OpenAPI aligned
- CI spec validation present
