# RFD Rocket.Chat App

A Rocket.Chat App that integrates with [rfd-tool](https://github.com/geekgonecrazy/rfd-tool) to automatically create and manage discussions for Architecture Decision Records (ADRs) / Requests for Discussion (RFDs).

## Overview

This app receives webhook events from rfd-tool when RFDs are created or updated, and:

1. **Creates discussions** in a configured channel for new RFDs
2. **Manages discussion metadata** (status, links) as RFDs evolve
3. **Notifies participants** when RFD content changes
4. **Returns discussion links** to rfd-tool for cross-referencing

## Features

### New RFD Created (`rfd.created`)

When a new RFD is created:

- Creates a new Discussion in the configured parent channel
- Discussion name: `ADR-{id}: {title}`
- Discussion description: Shows current state/status
- Discussion announcement: Link to the rendered ADR
- Adds RFD author(s) to the discussion (matched by email from parent channel members)
- Returns the discussion URL in the webhook response

### RFD Updated (`rfd.updated`)

When an RFD is updated:

- **State change**: Updates the discussion description with new state
- **Content change**: Posts a message to the discussion notifying participants with a link to view changes
- **Title change**: Updates the discussion name
- **Author change**: Adds new authors to the discussion

## Configuration

The app has the following settings:

| Setting | Description |
|---------|-------------|
| Parent Channel | The channel where ADR discussions will be created |
| Webhook Secret | Shared secret for validating incoming webhooks (HMAC-SHA256) |

## Webhook Endpoint

The app exposes an endpoint at:

```
POST /api/apps/public/{app-id}/webhook
```

### Request Headers

- `Content-Type: application/json`
- `X-RFD-Signature: sha256={hmac}` - HMAC-SHA256 signature of the body

### Request Body (rfd.created)

```json
{
  "event": "rfd.created",
  "timestamp": "2026-02-18T22:12:27Z",
  "rfd": {
    "id": "0042",
    "title": "Implement caching layer",
    "authors": ["alice@example.com", "bob@example.com"],
    "state": "ideation",
    "tags": ["performance", "infrastructure"],
    "content": "<p>...</p>",
    "contentMD": "# Overview\n..."
  },
  "link": "https://adrs.example.com/rfd/0042"
}
```

### Request Body (rfd.updated)

```json
{
  "event": "rfd.updated",
  "timestamp": "2026-02-18T22:15:00Z",
  "rfd": { ... },
  "link": "https://adrs.example.com/rfd/0042",
  "changes": {
    "title": { "old": "...", "new": "..." },
    "state": { "old": "ideation", "new": "discussion" },
    "content": true
  }
}
```

### Response (rfd.created)

```json
{
  "success": true,
  "discussion": {
    "id": "abc123",
    "url": "https://chat.example.com/group/abc123"
  }
}
```

The `discussion.url` contains the room ID, which:
1. Can be clicked to navigate directly to the discussion
2. Is used by rfd-tool to update the RFD's `discussion` field
3. Is committed to the git repository in the RFD frontmatter
4. Is parsed by this app on update webhooks to find the discussion room

## Architecture

```
┌─────────────┐     webhook      ┌──────────────────┐
│  rfd-tool   │ ───────────────► │  RC App Webhook  │
│             │                  │    Endpoint      │
│             │ ◄─────────────── │                  │
│             │  discussion URL  └────────┬─────────┘
└──────┬──────┘                           │
       │                                  │
       │ commit                           │ create/update
       ▼                                  ▼
┌─────────────┐                  ┌──────────────────┐
│  Git Repo   │                  │  Rocket.Chat     │
│  (ADRs)     │                  │  Discussion      │
└─────────────┘                  └──────────────────┘
```

## RFD State to Discussion Status Mapping

| RFD State | Discussion Description |
|-----------|----------------------|
| prediscussion | 🔒 Pre-Discussion - Not yet open for feedback |
| ideation | 💡 Ideation - Early idea, feedback welcome |
| discussion | 💬 Discussion - Actively seeking input |
| published | 📋 Published - Accepted, open for comments |
| committed | ✅ Committed - Implemented |
| abandoned | ❌ Abandoned - No longer being pursued |

## Development

### Prerequisites

- Node.js 18+
- Rocket.Chat Apps CLI: `npm install -g @rocket.chat/apps-cli`

### Setup

```bash
npm install
```

### Deploy to Rocket.Chat

```bash
# Deploy to local instance
rc-apps deploy --url http://localhost:3000 --username admin --password admin

# Or package for upload
rc-apps package
```

### Testing

```bash
# Send test webhook
curl -X POST http://localhost:3000/api/apps/public/{app-id}/webhook \
  -H "Content-Type: application/json" \
  -H "X-RFD-Signature: sha256=..." \
  -d '{"event": "rfd.created", ...}'
```

## Integration with rfd-tool

Configure rfd-tool's `config.yaml`:

```yaml
webhook:
  url: https://chat.example.com/api/apps/public/{app-id}/webhook
  secret: your-shared-secret
```

The app will:
1. Validate the webhook signature
2. Process the event
3. Return the discussion URL (for created events)
4. rfd-tool will update the RFD's discussion field and commit to git
