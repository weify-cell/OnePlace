<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { useNoteStore } from '@/stores/note.store'
import { useDebounceFn } from '@vueuse/core'
import AppLayout from '@/components/common/AppLayout.vue'
import TiptapEditor from '@/components/notes/TiptapEditor.vue'
import CodeMirrorMarkdownEditor from '@/components/notes/CodeMirrorMarkdownEditor.vue'
import MarkdownPreview from '@/components/notes/MarkdownPreview.vue'
import TagInput from '@/components/common/TagInput.vue'
import { tiptapToMarkdown } from '@/components/editor/TiptapToMarkdown'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()
const message = useMessage()
const dialog = useDialog()

const noteId = computed(() => Number(route.params.id))
const note = computed(() => noteStore.currentNote)
const showMigrationDialog = ref(false)
const isMigrating = ref(false)

// Preview/Edit mode state
const isEditing = ref(false)
const hasUnsavedChanges = ref(false)
const pendingTitle = ref('')
const pendingContent = ref('')

const folderOptions = computed(() => [
  { label: '无文件夹', value: null },
  ...noteStore.folders.map(f => ({ label: f.name, value: f.id }))
])

const isMarkdownNote = computed(() => {
  return note.value?.content_format === 'markdown'
})

const isLegacyNote = computed(() => {
  return note.value?.content_format === 'tiptap' || !note.value?.content_format
})

onMounted(async () => {
  await noteStore.fetchNote(noteId.value)
  if (noteStore.folders.length === 0) {
    await noteStore.fetchFolders()
  }
})

onBeforeUnmount(() => {
  noteStore.currentNote = null
})

const debouncedSave = useDebounceFn(async (data: { title?: string; content?: string; content_format?: string; tags?: string[] }) => {
  if (!note.value) return
  await noteStore.updateNote(note.value.id, data)
}, 1000)

function onTitleChange(title: string) {
  if (!note.value) return
  if (isEditing.value) {
    pendingTitle.value = title
    hasUnsavedChanges.value = title !== note.value.title || pendingContent.value !== note.value.content
  } else {
    debouncedSave({ title })
  }
}

function onContentChange(content: string) {
  if (!note.value) return
  if (isEditing.value) {
    pendingContent.value = content
    hasUnsavedChanges.value = content !== note.value.content || pendingTitle.value !== note.value.title
  } else {
    debouncedSave({ content, content_format: 'markdown' })
  }
}

// ---- Preview/Edit mode ----
function enterEditMode() {
  if (!note.value) return
  pendingTitle.value = note.value.title
  pendingContent.value = note.value.content
  hasUnsavedChanges.value = false
  isEditing.value = true
}

function handleCancelEdit() {
  if (hasUnsavedChanges.value) {
    dialog.warning({
      title: '放弃更改',
      content: '有未保存的更改，确定要放弃吗？',
      positiveText: '放弃',
      negativeText: '继续编辑',
      onPositiveClick: () => {
        isEditing.value = false
        hasUnsavedChanges.value = false
      }
    })
  } else {
    isEditing.value = false
  }
}

async function handleDoneEdit() {
  if (!note.value) return
  await noteStore.updateNote(note.value.id, {
    title: pendingTitle.value || note.value.title,
    content: pendingContent.value,
    content_format: 'markdown'
  })
  isEditing.value = false
  hasUnsavedChanges.value = false
  message.success('笔记已保存')
}

function onTagsChange(tags: string[]) {
  if (!note.value) return
  debouncedSave({ tags })
}

function onFolderChange(folder_id: number | null) {
  if (!note.value) return
  noteStore.updateNote(note.value.id, { folder_id })
}

function handleEditLegacyNote() {
  if (!note.value) return

  dialog.warning({
    title: '迁移笔记格式',
    content: '此笔记为旧格式（Tiptap），首次编辑将自动转换为 Markdown 格式。是否继续？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      isMigrating.value = true
      try {
        const markdownContent = tiptapToMarkdown(note.value!.content)
        await noteStore.updateNote(note.value!.id, {
          content: markdownContent,
          content_format: 'markdown'
        })
        await noteStore.fetchNote(noteId.value)
        message.success('笔记已转换为 Markdown 格式')
      } catch {
        message.error('迁移失败')
      } finally {
        isMigrating.value = false
      }
    }
  })
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
          <template v-if="!isEditing">
            <span :class="['note-save-status', noteStore.saving && 'note-save-status--saving']">
              <svg v-if="noteStore.saving" class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {{ noteStore.saving ? '保存中...' : '已自动保存' }}
            </span>
            <n-button size="small" type="primary" @click="enterEditMode">编辑</n-button>
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
          </template>
          <template v-else>
            <n-button size="small" type="primary" @click="handleDoneEdit">完成编辑</n-button>
            <n-button size="small" @click="handleCancelEdit">取消编辑</n-button>
          </template>
        </div>
      </div>

      <!-- Editor area -->
      <div class="note-editor-area">
        <div class="note-editor-inner">
          <!-- Title -->
          <input
            :value="isEditing ? pendingTitle : note.title"
            class="note-title-input"
            :class="!isEditing && 'note-title-input--clickable'"
            placeholder="无标题"
            :readonly="!isEditing"
            @input="onTitleChange(($event.target as HTMLInputElement).value)"
            @click="!isEditing && !isLegacyNote && enterEditMode()"
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

          <!-- Legacy Tiptap Note (read-only with migration) -->
          <div v-if="isLegacyNote && !isMarkdownNote" class="legacy-note-notice">
            <div class="legacy-note-notice__content">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <div>
                <p class="legacy-note-notice__title">此笔记为旧格式</p>
                <p class="legacy-note-notice__desc">点击「编辑笔记」后将自动转换为 Markdown 格式</p>
              </div>
            </div>
            <n-button type="primary" :loading="isMigrating" @click="handleEditLegacyNote">
              编辑笔记
            </n-button>
          </div>

          <!-- Tiptap Editor for legacy notes (read-only display) -->
          <div v-else-if="isLegacyNote" class="note-editor-legacy">
            <TiptapEditor
              :content="note.content"
              @update:content="() => {}"
            />
          </div>

          <!-- Markdown Note: Preview Mode (read-only) -->
          <div v-else-if="!isEditing" class="note-editor-preview">
            <MarkdownPreview :content="note.content" />
          </div>

          <!-- Markdown Note: Edit Mode (CodeMirror + Preview split) -->
          <div v-else class="note-editor-markdown">
            <CodeMirrorMarkdownEditor
              :content="isEditing ? pendingContent : note.content"
              :note-id="note.id"
              @update:content="onContentChange"
            />
          </div>
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
  max-width: 100%;
  margin: 0 auto;
  padding: 36px 40px 60px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.note-editor-markdown {
  height: calc(100vh - 280px);
  min-height: 400px;
}

.note-editor-preview {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  flex: 1;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.dark .note-editor-preview {
  background: #111827;
  border-color: #374151;
}

.note-editor-legacy {
  min-height: 400px;
}

/* Legacy notice */
.legacy-note-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  margin-bottom: 24px;
}

.dark .legacy-note-notice {
  background: #78350f;
  border-color: #b45309;
}

.legacy-note-notice__content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.legacy-note-notice__content svg {
  color: #d97706;
  flex-shrink: 0;
  margin-top: 2px;
}

.dark .legacy-note-notice__content svg {
  color: #fbbf24;
}

.legacy-note-notice__title {
  font-weight: 600;
  color: #92400e;
  margin: 0 0 4px;
}

.dark .legacy-note-notice__title {
  color: #fde68a;
}

.legacy-note-notice__desc {
  font-size: 0.875rem;
  color: #a16207;
  margin: 0;
}

.dark .legacy-note-notice__desc {
  color: #fcd34d;
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

.note-title-input--clickable {
  cursor: pointer;
}

.note-title-input--clickable:hover {
  color: #6366f1;
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
