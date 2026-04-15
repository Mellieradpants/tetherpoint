# Tetherpoint

Source-anchored parsing stack. API-first.

## Locked Layer Order

| # | Layer        | Purpose                                      | AI |
|---|--------------|----------------------------------------------|----|
| 1 | Input        | Intake only. No inference.                   | No |
| 2 | Structure    | Deterministic parse and normalize.           | No |
| 3 | Selection    | Deterministic node eligibility.              | No |
| 4 | Meaning      | AI interpretation (only AI layer).           | Yes|
| 5 | Origin       | Provenance / source tracing only.            | No |
| 6 | Verification | Verification-path routing only.              | No |
| 7 | Output       | Presentation only. No transformation.        | No |

This order is locked. Layers are not merged, collapsed, or reordered.

## Hard Constraints

- No inference in Input, Structure, or Selection
- Meaning is the only AI layer
- Selection passes eligible unchanged nodes forward
- Origin traces provenance only — no credibility judgment
- Verification routes to record systems — no true/false decisions
- Output presents upstream results — no transformation
- Fail > guess
- Absence is not permission to invent

## Endpoints

| Method | Path      | Description                                |
|--------|-----------|--------------------------------------------|
| POST   | /analyze  | Run the 7-layer pipeline on a document     |
| GET    | /health   | Liveness check                             |
| GET    | /docs     | Interactive OpenAPI documentation (Swagger)|
| GET    | /redoc    | ReDoc documentation                        |

## API Contract

See `openapi.yaml` for the full OpenAPI 3.1 specification.

### Request

```json
{
  "content": "raw document text",
  "content_type": "xml | html | json | text",
  "options": {
    "run_meaning": true,
    "run_origin": true,
    "run_verification": true
  }
}
```

### Response

```json
{
  "input": { ... },
  "structure": { ... },
  "selection": { ... },
  "meaning": { ... },
  "origin": { ... },
  "verification": { ... },
  "output": { ... },
  "errors": [ ... ]
}
```

Each layer produces its own distinct section. No layers are merged.

## Run Backend

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Linux/macOS
# venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

### Environment Variables

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY if you want the Meaning layer to execute.
# Without it, Meaning returns status="skipped" — all other layers still run.
```

### Start

```bash
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs

### Docker

```bash
cd backend
docker build -t tetherpoint .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... tetherpoint
```

## Sample curl

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "content": "The SEC must enforce compliance by March 2025. Congress enacted Public Law 118-1.",
    "content_type": "text",
    "options": {
      "run_meaning": false,
      "run_origin": true,
      "run_verification": true
    }
  }'
```

## Run Tests

```bash
cd backend
python -m pytest app/tests/ -v
```

## What Meaning Requires

The Meaning layer (Layer 4) is the only layer that uses AI. It requires:

- An OpenAI-compatible API key set as `OPENAI_API_KEY` environment variable
- Network access to `https://api.openai.com/v1/chat/completions`

If the key is not set, Meaning returns `{"status": "skipped", "message": "Meaning not executed: no OPENAI_API_KEY configured"}`. No fake output is produced. All other layers continue to execute normally.

## What Each Layer Does

1. **Input** — Accepts raw content (xml/html/json/text). Validates well-formedness. Preserves raw input. Records size and parse status. No interpretation.

2. **Structure** — Deterministic parsing via 10 subsystems: SSE (statement extraction), LNS (whitespace normalization), CFS (constraint filtering), 5W1H (explicit who/what/when/where/why/how), AAC (actor/action/condition), TPS (temporal parsing), SJM (jurisdiction mapping), MPS (mechanism parsing), RDS (risk decomposition), ISC (node assembly). Each node carries source anchors for traceability.

3. **Selection** — Deterministic eligibility check. Nodes must have source text, not be CFS-blocked, and contain at least one structured signal. Nodes pass through unchanged. No rewriting, no summarizing.

4. **Meaning** — The only AI layer. Evaluates each selected node against 6 analytical lenses: modality shift, scope change, actor power shift, action domain shift, threshold/standard shift, obligation removal. Does not alter original node text.

5. **Origin** — Extracts provenance signals from the source document. For HTML: canonical URL, author, publish time, JSON-LD publisher, OG tags, Twitter cards. For JSON/XML: top-level metadata fields. Distribution metadata is explicitly separated from origin identity.

6. **Verification** — Routes assertions to candidate record systems. Detects assertion types (legal, court, government, scientific, statistical, corporate, infrastructure, historical) and maps them to record systems (Congress.gov, PubMed, SEC EDGAR, FERC, etc.). This is routing logic, not truth logic.

7. **Output** — Assembles final response from all upstream layers. No transformation. Presentation only.

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, endpoints
    schemas/
      models.py          # All Pydantic models (matches openapi.yaml)
    input/
      handler.py         # Layer 1: Input
    structure/
      handler.py         # Layer 2: Structure
    selection/
      handler.py         # Layer 3: Selection
    meaning/
      handler.py         # Layer 4: Meaning (AI)
    origin/
      handler.py         # Layer 5: Origin
    verification/
      handler.py         # Layer 6: Verification
    output/
      handler.py         # Layer 7: Output
    pipeline/
      runner.py          # Orchestrates layers in locked order
    tests/
      test_pipeline.py   # Backend tests
  openapi.yaml           # OpenAPI 3.1 spec (source of truth)
  requirements.txt
  Dockerfile
  .env.example
  README.md
```
