<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import type { Note } from '@/types'

const props = defineProps<{ note: Note }>()
const router = useRouter()
const noteStore = useNoteStore()

const folderName = computed(() => {
  if (!props.note.folder_id) return null
  return noteStore.folders.find(f => f.id === props.note.folder_id)?.name ?? null
})
const dialog = useDialog()
const message = useMessage()

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function confirmDelete() {
  dialog.warning({
    title: '删除笔记',
    content: `确定删除「${props.note.title}」？`,
    positiveText: '删除',
    onPositiveClick: async () => {
      await noteStore.deleteNote(props.note.id)
      message.success('已删除')
    }
  })
}
</script>

<template>
  <div
    class="note-card"
    @click="router.push(`/notes/${note.id}`)"
  >
    <!-- Header: title + actions -->
    <div class="note-card__header">
      <h3 class="note-card__title">
        <span v-if="note.is_pinned" class="note-card__pin-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z"/>
          </svg>
        </span>
        {{ note.title || '无标题' }}
      </h3>
      <div class="note-card__actions" @click.stop>
        <button
          class="note-card__action-btn"
          :class="note.is_pinned ? 'note-card__action-btn--active' : ''"
          :title="note.is_pinned ? '取消置顶' : '置顶'"
          @click="noteStore.togglePin(note.id)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
            <line x1="12" y1="17" x2="12" y2="22"/>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>
          </svg>
        </button>
        <button
          class="note-card__action-btn note-card__action-btn--danger"
          title="删除"
          @click="confirmDelete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Preview text -->
    <p class="note-card__preview">
      {{ note.content_text || '（空笔记）' }}
    </p>

    <!-- Footer: folder badge + tags + date -->
    <div class="note-card__footer">
      <div class="note-card__meta">
        <span v-if="folderName" class="note-card__folder">
          <svg class="w-3 h-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {{ folderName }}
        </span>
        <div v-if="note.tags.length" class="note-card__tags">
          <span v-for="tag in note.tags.slice(0, 3)" :key="tag" class="note-card__tag">{{ tag }}</span>
        </div>
      </div>
      <span class="note-card__date">{{ formatDate(note.updated_at) }}</span>
    </div>
  </div>
</template>

<style scoped>
.note-card {
  position: relative;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: box-shadow 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
  transform: translateY(-1px);
}

.dark .note-card {
  background: #1e2433;
  border-color: #2d3748;
}

.dark .note-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
  border-color: #3d4a5e;
}

/* Header */
.note-card__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.note-card__title {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  color: #111827;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.dark .note-card__title {
  color: #f1f5f9;
}

.note-card__pin-icon {
  display: inline-flex;
  align-items: center;
  color: #f59e0b;
  margin-right: 4px;
  vertical-align: middle;
}

/* Actions (hidden by default, show on hover) */
.note-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.note-card:hover .note-card__actions {
  opacity: 1;
}

.note-card__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.note-card__action-btn:hover {
  background: #f3f4f6;
  color: #4b5563;
}

.note-card__action-btn--active {
  color: #f59e0b;
}

.note-card__action-btn--active:hover {
  background: #fef3c7;
  color: #d97706;
}

.note-card__action-btn--danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

.dark .note-card__action-btn:hover {
  background: #2d3748;
  color: #e2e8f0;
}

.dark .note-card__action-btn--active {
  color: #fbbf24;
}

.dark .note-card__action-btn--active:hover {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.dark .note-card__action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

/* Preview */
.note-card__preview {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: #6b7280;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.6em;
}

.dark .note-card__preview {
  color: #94a3b8;
}

/* Footer */
.note-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.note-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.note-card__folder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
}

.dark .note-card__folder {
  color: #94a3b8;
  background: #2d3748;
}

.note-card__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.note-card__tag {
  font-size: 0.6875rem;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
}

.dark .note-card__tag {
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.15);
}

.note-card__date {
  font-size: 0.6875rem;
  color: #9ca3af;
  flex-shrink: 0;
  white-space: nowrap;
}

.dark .note-card__date {
  color: #64748b;
}
</style>
