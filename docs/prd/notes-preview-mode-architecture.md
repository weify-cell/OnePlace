# Architecture Decision Record: Notes Preview Mode (v1.9)

## Module
- Version: v1.9
- Module: notes-preview-mode

## Overview
Add preview/edit dual mode to note detail page, plus card/list toggle for note list. Purely frontend changes; no backend modifications required.

---

## 1. Note Detail Page: Preview/Edit Mode

### Current State (v1.8)
`NoteDetailView.vue` directly mounts either `TiptapEditor` or `CodeMirrorMarkdownEditor` with no mode distinction. Toolbar is static.

### Target State (v1.9)
Two distinct modes controlled by a local `isEditing` ref.

| Mode | Trigger | Toolbar | Content Area |
|------|---------|---------|--------------|
| Preview (default) | Page load, after save/cancel | Edit + Return-to-list | MarkdownPreview |
| Edit | Click Edit button or title | Done + Cancel + Return-to-list | CodeMirrorMarkdownEditor (split view) |

### Component Changes

#### New State in NoteDetailView
```ts
const isEditing = ref(false)
const hasUnsavedChanges = ref(false)
const pendingContent = ref('') // holds tentative content during editing
```

#### Toolbar Button Groups

**Preview mode toolbar:**
- Edit button (primary)
- Return-to-list button

**Edit mode toolbar:**
- Done Editing button (primary) → saves and returns to preview
- Cancel Editing button (default) → confirms if `hasUnsavedChanges` then returns to preview
- Return-to-list button

#### Mode Flow
```
Page Load
    │
    ▼
[Preview Mode]
    │
    ├─ Click "Edit" ─────────────────────────────┐
    │                                             │
    ▼                                             │
[Edit Mode]                                       │
    │                                             │
    ├─ Click "Done Editing" ──────────────────────┤
    │   → saveNote() → isEditing = false          │
    │                                             │
    ├─ Click "Cancel Editing"                    │
    │   → if hasUnsavedChanges: confirmDialog()  │
    │   → isEditing = false                      │
    │                                             │
    └─ Click title (in edit mode)                │
        → no action (already editing)            │
    │                                             │
    └──────────────────────┘
```

#### Dirty State Tracking
- `hasUnsavedChanges` becomes `true` when `onContentChange` fires with content different from `note.content`
- Reset to `false` after successful save (Done Editing)
- Reset to `false` after cancel confirmation

#### Confirmation Dialog
```ts
function handleCancelEdit() {
  if (hasUnsavedChanges.value) {
    dialog.warning({
      title: '放弃更改',
      content: '有未保存的更改，确定要放弃吗？',
      positiveText: '放弃',
      negativeText: '继续编辑',
      onPositiveClick: () => { isEditing.value = false }
    })
  } else {
    isEditing.value = false
  }
}
```

#### Title Click Behavior
- In preview mode: clicking the title enters edit mode
- In edit mode: title is an editable input (already the case), no mode change

#### Legacy Note Handling
- `isLegacyNote` still triggers the migration notice/mode
- Migration flow remains unchanged

### Affected Files
| File | Change |
|------|--------|
| `src/views/NoteDetailView.vue` | Add mode state, toolbar logic, dirty tracking |
| `src/components/notes/MarkdownPreview.vue` | Already exists, used in preview mode |
| `src/components/notes/CodeMirrorMarkdownEditor.vue` | Already exists, used in edit mode |

---

## 2. Note List: Card/List Toggle

### Current State (v1.8)
`NotesView.vue` renders only the card grid (`notes-grid`).

### Target State (v1.9)
Both card grid and list views available, preference persisted to `localStorage`.

### State Management
```ts
// In NotesView
const viewMode = ref(localStorage.getItem('notes_view_mode') ?? 'card')

function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'list' : 'card'
  localStorage.setItem('notes_view_mode', viewMode.value)
}
```

### List View Style
```css
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notes-list .note-card {
  flex-direction: row;
  align-items: center;
}
```

### Toggle Control
Add a toggle button group in the page header area (next to the title or in filters area):
- Two buttons: card icon / list icon
- Active state highlighted

### Affected Files
| File | Change |
|------|--------|
| `src/views/NotesView.vue` | Add viewMode ref, toggle button, list style |

---

## 3. No Backend Changes

This iteration does not introduce:
- New API endpoints
- Database schema changes
- Authentication changes

---

## 4. File Change Summary

| File | Owner Agent | Notes |
|------|-------------|-------|
| `src/views/NoteDetailView.vue` | frontend | Mode state, toolbar, dirty tracking |
| `src/views/NotesView.vue` | frontend | View toggle, list style |
| `docs/prd/notes-preview-mode-architecture.md` | architect (this doc) | — |

### Documents Frontend Must Read
- `docs/prd/notes-preview-mode-architecture.md` (this file)

### Documents Backend Must Read
- None (no backend changes)

---

## 5. Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `isEditing` as local `ref` not store state | Edit mode is view-level, no cross-component need |
| 2 | `hasUnsavedChanges` tracks content diff | More reliable than comparing on every keystroke |
| 3 | View preference in `localStorage` | Aligns with frontend-only token storage pattern |
| 4 | Cancel confirmation only on dirty state | Avoids unnecessary dialogs |
| 5 | CodeMirror always shows split view in edit mode | `showPreview` prop removed since edit mode always shows preview pane |
