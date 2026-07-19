<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { useDebounceFn } from '@vueuse/core'
import AppLayout from '@/components/common/AppLayout.vue'
import TiptapEditor from '@/components/notes/TiptapEditor.vue'
import CodeMirrorMarkdownEditor from '@/components/notes/CodeMirrorMarkdownEditor.vue'
import MarkdownPreview from '@/components/notes/MarkdownPreview.vue'
import TagInput from '@/components/common/TagInput.vue'
import { tiptapToMarkdown } from '@/components/editor/TiptapToMarkdown'
import { useNoteStore } from '@/stores/note.store'
import { useKnowledgeBaseStore } from '@/stores/knowledge_base.store'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()
const kbStore = useKnowledgeBaseStore()
const message = useMessage()
const dialog = useDialog()

const noteId = computed(() => Number(route.params.id))
const note = computed(() => noteStore.currentNote)
const isMigrating = ref(false)
let noteEmbeddingPollTimer: ReturnType<typeof setInterval> | null = null

const isEditing = ref(false)
const hasUnsavedChanges = ref(false)
const pendingTitle = ref('')
const pendingContent = ref('')

const folderOptions = computed(() => [
  { label: '无文件夹', value: null },
  ...noteStore.folders.map(f => ({ label: f.name, value: f.id }))
])

const isMarkdownNote = computed(() => note.value?.content_format === 'markdown')
const isLegacyNote = computed(() => note.value?.content_format === 'tiptap' || !note.value?.content_format)

const noteEmbeddingStatus = computed(() => kbStore.getNoteEmbeddingStatus(noteId.value))
const showNoteEmbeddingStatus = computed(() => {
  const status = noteEmbeddingStatus.value
  return !!note.value?.is_knowledge_base || status.phase !== 'idle' || !!status.startedAt
})
const noteEmbeddingProgress = computed(() => {
  const status = noteEmbeddingStatus.value
  if (status.phase === 'completed') return 100
  if (status.totalChunks <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((status.currentChunk / status.totalChunks) * 100)))
})
const noteEmbeddingProgressStatus = computed(() => {
  if (noteEmbeddingStatus.value.phase === 'failed') return 'error'
  if (noteEmbeddingStatus.value.phase === 'completed') return 'success'
  return undefined
})
const noteEmbeddingPhaseText = computed(() => {
  const labels = {
    idle: '未建立索引',
    preparing: '准备建立索引',
    embedding: '建立索引中',
    completed: '索引已更新',
    failed: '索引失败'
  } as const
  return labels[noteEmbeddingStatus.value.phase]
})
const noteEmbeddingChunkText = computed(() => {
  const status = noteEmbeddingStatus.value
  return status.totalChunks > 0 ? `${status.currentChunk}/${status.totalChunks}` : '-'
})

onMounted(async () => {
  await noteStore.fetchNote(noteId.value)
  await kbStore.loadConfig()
  await kbStore.fetchNoteEmbeddingStatus(noteId.value)
  if (noteStore.folders.length === 0) {
    await noteStore.fetchFolders()
  }
  if (kbStore.getNoteEmbeddingStatus(noteId.value).running) {
    startNoteEmbeddingPolling()
  }
})

onBeforeUnmount(() => {
  noteStore.currentNote = null
  stopNoteEmbeddingPolling()
})

watch(() => noteEmbeddingStatus.value.running, (running) => {
  if (running) {
    startNoteEmbeddingPolling()
  } else {
    stopNoteEmbeddingPolling()
  }
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
    return
  }

  isEditing.value = false
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

function onFolderChange(folderId: number | null) {
  if (!note.value) return
  noteStore.updateNote(note.value.id, { folder_id: folderId })
}

function startNoteEmbeddingPolling() {
  if (noteEmbeddingPollTimer) return
  noteEmbeddingPollTimer = setInterval(() => {
    kbStore.fetchNoteEmbeddingStatus(noteId.value).catch(console.error)
  }, 1200)
}

function stopNoteEmbeddingPolling() {
  if (!noteEmbeddingPollTimer) return
  clearInterval(noteEmbeddingPollTimer)
  noteEmbeddingPollTimer = null
}

function handleEditLegacyNote() {
  if (!note.value) return

  dialog.warning({
    title: '迁移笔记格式',
    content: '这篇笔记还是旧的 Tiptap 格式，首次编辑会自动转换为 Markdown，是否继续？',
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
      <div class="note-toolbar">
        <button class="note-toolbar__back" @click="router.push('/notes')">
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回笔记
        </button>
        <div class="note-toolbar__right">
          <template v-if="!isEditing">
            <span :class="['note-save-status', noteStore.saving && 'note-save-status--saving']">
              <svg v-if="noteStore.saving" class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <svg v-else class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ noteStore.saving ? '保存中...' : '已自动保存' }}
            </span>
            <span
              v-if="showNoteEmbeddingStatus"
              :class="[
                'note-index-status',
                noteEmbeddingStatus.running && 'note-index-status--running',
                noteEmbeddingStatus.phase === 'failed' && 'note-index-status--error'
              ]"
            >
              <svg v-if="noteEmbeddingStatus.running" class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <svg v-else-if="noteEmbeddingStatus.phase === 'completed'" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <svg v-else-if="noteEmbeddingStatus.phase === 'failed'" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <svg v-else class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              {{ noteEmbeddingPhaseText }}
              <span v-if="noteEmbeddingStatus.running || noteEmbeddingStatus.phase === 'completed'">{{ noteEmbeddingProgress }}%</span>
            </span>
            <n-button size="small" type="primary" class="note-toolbar__btn" @click="enterEditMode">
              编辑
            </n-button>
            <n-button
              size="small"
              :type="note.is_pinned ? 'warning' : 'default'"
              secondary
              class="note-toolbar__btn"
              @click="noteStore.togglePin(note.id)"
            >
              <template #icon>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
                </svg>
              </template>
              {{ note.is_pinned ? '取消置顶' : '置顶' }}
            </n-button>
            <div class="note-toolbar__kb">
              <span class="note-toolbar__kb-label">知识库</span>
              <n-switch size="small" :value="note.is_knowledge_base" @update:value="(v) => noteStore.updateNote(note.id, { is_knowledge_base: v })" />
            </div>
          </template>
          <template v-else>
            <n-button size="small" type="primary" class="note-toolbar__btn" @click="handleDoneEdit">
              完成编辑
            </n-button>
            <n-button size="small" @click="handleCancelEdit">
              取消编辑
            </n-button>
          </template>
        </div>
      </div>

      <div class="note-editor-area">
        <div class="note-editor-inner">
          <div v-if="showNoteEmbeddingStatus" class="note-index-progress">
            <div class="note-index-progress__header">
              <div class="note-index-progress__title">
                <span>{{ noteEmbeddingPhaseText }}</span>
                <span v-if="noteEmbeddingStatus.noteTitle">{{ noteEmbeddingStatus.noteTitle }}</span>
              </div>
              <div class="note-index-progress__meta">
                <span>Chunk {{ noteEmbeddingChunkText }}</span>
                <span>{{ noteEmbeddingProgress }}%</span>
              </div>
            </div>
            <n-progress
              type="line"
              :percentage="noteEmbeddingProgress"
              :status="noteEmbeddingProgressStatus"
              :show-indicator="false"
            />
            <div v-if="noteEmbeddingStatus.lastError" class="note-index-progress__error">
              {{ noteEmbeddingStatus.lastError }}
            </div>
          </div>

          <input
            :value="isEditing ? pendingTitle : note.title"
            class="note-title-input"
            :class="!isEditing && 'note-title-input--clickable'"
            placeholder="无标题"
            :readonly="!isEditing"
            @input="onTitleChange(($event.target as HTMLInputElement).value)"
            @click="!isEditing && !isLegacyNote && enterEditMode()"
          />

          <div class="note-meta">
            <div class="note-meta__row">
              <span class="note-meta__label">
                <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                标签
              </span>
              <TagInput :tags="note.tags" @update:tags="onTagsChange" />
            </div>
          </div>

          <div class="note-editor-divider" />

          <div v-if="isLegacyNote && !isMarkdownNote" class="legacy-note-notice">
            <div class="legacy-note-notice__content">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div>
                <p class="legacy-note-notice__title">这篇笔记还是旧格式</p>
                <p class="legacy-note-notice__desc">点击“编辑笔记”后会自动转换为 Markdown 格式</p>
              </div>
            </div>
            <n-button type="primary" :loading="isMigrating" class="legacy-note-notice__btn" @click="handleEditLegacyNote">
              编辑笔记
            </n-button>
          </div>

          <div v-else-if="isLegacyNote" class="note-editor-legacy">
            <TiptapEditor :content="note.content" @update:content="() => {}" />
          </div>

          <div v-else-if="!isEditing" class="note-editor-preview">
            <MarkdownPreview :content="note.content" />
          </div>

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
.note-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.note-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.note-toolbar__back {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.note-toolbar__back:hover {
  background: var(--bg-secondary);
  color: var(--accent-primary);
}

.note-toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.note-toolbar__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
  font-weight: 600;
}

.note-toolbar__btn:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
}

.note-toolbar__kb {
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-toolbar__kb-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.note-save-status,
.note-index-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  transition: color 0.2s ease;
}

.note-save-status {
  color: var(--success);
}

.note-save-status--saving {
  color: var(--text-muted);
}

.note-index-status {
  color: var(--text-secondary);
}

.note-index-status--running {
  color: var(--accent-primary);
}

.note-index-status--error {
  color: #dc2626;
}

.note-editor-area {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
}

.note-editor-inner {
  max-width: 100%;
  margin: 0 auto;
  padding: 24px 40px 60px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.note-index-progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.note-index-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.note-index-progress__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.note-index-progress__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.note-index-progress__error {
  font-size: 0.75rem;
  color: #dc2626;
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
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.note-editor-legacy {
  min-height: 400px;
}

.legacy-note-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.legacy-note-notice__content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.legacy-note-notice__content svg {
  color: var(--accent-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.legacy-note-notice__title {
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
  font-size: 0.875rem;
}

.legacy-note-notice__desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

.legacy-note-notice__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
  font-weight: 600;
  flex-shrink: 0;
}

.note-title-input {
  width: 100%;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.3;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  margin-bottom: 20px;
  caret-color: var(--accent-primary);
  letter-spacing: -0.02em;
}

.note-title-input::placeholder {
  color: var(--text-muted);
}

.note-title-input--clickable {
  cursor: pointer;
}

.note-title-input--clickable:hover {
  color: var(--accent-primary);
}

.note-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
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
  font-weight: 600;
  color: var(--text-muted);
  width: 56px;
  flex-shrink: 0;
}

.note-editor-divider {
  height: 1px;
  background: var(--border-subtle);
  margin-bottom: 24px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@media (max-width: 900px) {
  .note-toolbar {
    padding: 10px 16px;
  }

  .note-editor-inner {
    padding: 20px 16px 40px;
  }

  .note-index-progress__header,
  .legacy-note-notice,
  .note-meta__row {
    flex-direction: column;
    align-items: flex-start;
  }

  .note-index-progress__meta,
  .note-toolbar__right {
    justify-content: flex-start;
  }
}
</style>
