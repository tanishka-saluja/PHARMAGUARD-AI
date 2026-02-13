# Awareness Feed API

Purpose: allow authorized government operators to publish public safety alerts instantly for app users.

## Run server

```bash
npm run awareness:server
```

Reads/writes:
- `awareness-feed/feed.json`

Environment variables:
- `AWARENESS_FEED_PORT` (default: `8787`)
- `AWARENESS_ADMIN_KEY` (required for POST writes)
- `AWARENESS_FEED_FILE` (optional custom file path)

## Endpoints

### `GET /health`
Returns service status and server time.

### `GET /api/awareness`
Returns:

```json
{
  "updatedAt": "2026-02-13T00:00:00.000Z",
  "posts": []
}
```

### `POST /api/awareness`
Requires header:

```text
x-admin-key: <AWARENESS_ADMIN_KEY>
```

Body supports:
- `mode`: `append` (default) or `replace`
- `post`: single object
- `posts`: array of objects

Post schema:

```json
{
  "id": "optional-id",
  "title": "Alert title",
  "summary": "Short summary",
  "details": ["detail line 1", "detail line 2"],
  "action": "Clear citizen action",
  "emergency": true,
  "tags": ["urgent", "recall"],
  "publishedAt": "2026-02-13T10:00:00.000Z"
}
```

## Mobile integration

Set in `.env`:

```bash
EXPO_PUBLIC_AWARENESS_FEED_URL=http://localhost:8787/api/awareness
```

App behavior:
1. Tries server feed first.
2. Falls back to cached feed if offline.
3. Falls back to built-in local posts if no cache exists.
