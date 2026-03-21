<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import { useDebounceFn } from '@vueuse/core'
import AppLayout from '@/components/common/AppLayout.vue'
import TiptapEditor from '@/components/notes/TiptapEditor.vue'
import TagInput from '@/components/common/TagInput.vue'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()

const noteId = computed(() => Number(route.params.id))
const note = computed(() => noteStore.currentNote)

const folderOptions = computed(() => [
  { label: '无文件夹', value: null },
  ...noteStore.folders.map(f => ({ label: f.name, value: f.id }))
])

onMounted(async () => {
  await noteStore.fetchNote(noteId.value)
  if (noteStore.folders.length === 0) {
    await noteStore.fetchFolders()
  }
})

onBeforeUnmount(() => {
  noteStore.currentNote = null
})

const debouncedSave = useDebounceFn(async (data: { title?: string; content?: string; tags?: string[] }) => {
  if (!note.value) return
  await noteStore.updateNote(note.value.id, data)
}, 1000)

function onTitleChange(title: string) {
  if (!note.value) return
  debouncedSave({ title })
}

function onContentChange(content: string) {
  if (!note.value) return
  debouncedSave({ content })
}

function onTagsChange(tags: string[]) {
  if (!note.value) return
  debouncedSave({ tags })
}

function onFolderChange(folder_id: number | null) {
  if (!note.value) return
  noteStore.updateNote(note.value.id, { folder_id })
}
</script>

<template>
  <AppLayout>
    <div v-if="note" class="note-detail">
      <!-- Toolbar -->
      <div class="note-toolbar">
        <button class="note-toolbar__back" @click="router.push('/notes')">
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回笔记
        </button>
        <div class="note-toolbar__right">
          <span :class="['note-save-status', noteStore.saving && 'note-save-status--saving']">
            <svg v-if="noteStore.saving" class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {{ noteStore.saving ? '保存中...' : '已自动保存' }}
          </span>
          <n-button
            size="small"
            :type="note.is_pinned ? 'warning' : 'default'"
            secondary
            @click="noteStore.togglePin(note.id)"
          >
            <template #icon>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                <line x1="12" y1="17" x2="12" y2="22"/>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>
              </svg>
            </template>
            {{ note.is_pinned ? '取消置顶' : '置顶' }}
          </n-button>
        </div>
      </div>

      <!-- Editor area -->
      <div class="note-editor-area">
        <div class="note-editor-inner">
          <!-- Title -->
          <input
            :value="note.title"
            class="note-title-input"
            placeholder="无标题"
            @input="onTitleChange(($event.target as HTMLInputElement).value)"
          />

          <!-- Meta: folder + tags -->
          <div class="note-meta">
            <div class="note-meta__row">
              <span class="note-meta__label">
                <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                文件夹
              </span>
              <n-select
                :value="note.folder_id ?? null"
                :options="folderOptions"
                size="small"
                placeholder="无文件夹"
                clearable
                style="min-width: 150px; max-width: 240px;"
                @update:value="onFolderChange"
              />
            </div>
            <div class="note-meta__row">
              <span class="note-meta__label">
                <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                标签
              </span>
              <TagInput :tags="note.tags" @update:tags="onTagsChange" />
            </div>
          </div>

          <!-- Divider -->
          <div class="note-editor-divider" />

          <!-- Editor -->
          <TiptapEditor
            :content="note.content"
            @update:content="onContentChange"
          />
        </div>
      </div>
    </div>
    <div v-else class="flex-center h-full">
      <n-spin size="large" />
    </div>
  </AppLayout>
</template>

<style scoped>
/* ---- Layout ---- */
.note-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ---- Toolbar ---- */
.note-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
}

.dark .note-toolbar {
  background: #111827;
  border-bottom-color: #1f2937;
}

.note-toolbar__back {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8125rem;
  color: #6b7280;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.note-toolbar__back:hover {
  background: #f3f4f6;
  color: #111827;
}

.dark .note-toolbar__back {
  color: #9ca3af;
}

.dark .note-toolbar__back:hover {
  background: #1f2937;
  color: #e2e8f0;
}

.note-toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Save status indicator */
.note-save-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: #22c55e;
  transition: color 0.2s ease;
}

.note-save-status--saving {
  color: #9ca3af;
}

.dark .note-save-status {
  color: #4ade80;
}

.dark .note-save-status--saving {
  color: #6b7280;
}

/* ---- Editor area ---- */
.note-editor-area {
  flex: 1;
  overflow-y: auto;
  background: #fafafa;
}

.dark .note-editor-area {
  background: #0f172a;
}

.note-editor-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 36px 40px 60px;
}

/* ---- Title input ---- */
.note-title-input {
  width: 100%;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.3;
  border: none;
  outline: none;
  background: transparent;
  color: #111827;
  margin-bottom: 24px;
  caret-color: #6366f1;
}

.note-title-input::placeholder {
  color: #d1d5db;
}

.dark .note-title-input {
  color: #f1f5f9;
}

.dark .note-title-input::placeholder {
  color: #374151;
}

/* ---- Meta section ---- */
.note-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.note-meta__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.note-meta__label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #9ca3af;
  width: 56px;
  flex-shrink: 0;
}

.dark .note-meta__label {
  color: #4b5563;
}

/* ---- Divider ---- */
.note-editor-divider {
  height: 1px;
  background: #e5e7eb;
  margin-bottom: 24px;
}

.dark .note-editor-divider {
  background: #1f2937;
}

/* Spinner animation */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
