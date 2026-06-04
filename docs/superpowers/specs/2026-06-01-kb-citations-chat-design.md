# KB Citations in Chat - Design Spec

## Overview

Display referenced knowledge base documents with relevance scores below each AI reply in KB-enabled conversations.

## Data Layer

### Database
- `messages.kb_citations` TEXT — JSON array of citations
- Format: `[{note_id, title, content, score}]`

### Chat Service (streamChat)
- When `conversation.kb_enabled` and `searchKnowledgeBase` returns results:
  - Build KB context for system prompt (as before)
  - Also store the raw results in `messages.kb_citations` after assistant message is written
  - Update: `db.prepare("UPDATE messages SET kb_citations = ? WHERE id = ?").run(JSON.stringify(kbResults), assistantMessageId)`

## Frontend

### MessageBubble.vue
- Read `message.kb_citations` (parse JSON if string)
- If citations exist, render collapsible section below message content:
  - Header: `"引用文档 (N)"` with expand/collapse toggle
  - Each citation: `[N] 标题 · score分` + truncated content preview
- Tokens display unchanged

## Data Flow
```
searchKnowledgeBase(query, 5)
  → [{note_id, title, content, score}, ...]
  → written to messages.kb_citations
  → MessageBubble reads message.kb_citations
  → renders collapsible citation list
```

## Implementation

1. Add `kb_citations` column to messages table (migration)
2. Update `chat.service.ts` to write citations after assistant message
3. Update `MessageBubble.vue` to render collapsible citations