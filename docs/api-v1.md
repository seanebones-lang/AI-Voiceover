# Public API v1 Draft

## Authentication

- API keys are scoped to organization/workspace.
- Keys are returned once at creation and persisted as hashes in `api_keys`.
- Use `Authorization: Bearer <api_key>`.

## Endpoints

### `POST /api/v1/voices`

Creates a scoped API key payload for voice operations.

Request body:

```json
{
  "label": "Production Integrator",
  "scopes": ["voices:read", "voices:write"]
}
```

Response:

```json
{
  "id": "uuid",
  "key": "avk_...",
  "keyPrefix": "avk_abc...",
  "scopes": ["voices:read", "voices:write"]
}
```
