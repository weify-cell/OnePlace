<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useNoteStore } from '@/stores/note.store'
import { uploadApi } from '@/api/upload.api'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const router = useRouter()
const message = useMessage()
const noteStore = useNoteStore()

const selectedFile = ref<File | null>(null)
const selectedFolderId = ref<number | null>(null)
const uploading = ref(false)
const dragOver = ref(false)

const folderOptions = computed(() => [
  { label: '无文件夹', value: null },
  ...noteStore.folders.map(f => ({ label: f.name, value: f.id }))
])

const fileSize = computed(() => {
  if (!selectedFile.value) return ''
  const bytes = selectedFile.value.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
})

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFileSelect(file)
}

function handleFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFileSelect(file)
}

function handleFileSelect(file: File) {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (ext !== '.txt' && ext !== '.md') {
    message.error('仅支持 .txt 和 .md 文件')
    return
  }
  selectedFile.value = file
}

function clearFile() {
  selectedFile.value = null
}

async function handleConfirm() {
  if (!selectedFile.value || uploading.value) return

  uploading.value = true
  try {
    const res = await uploadApi.uploadNoteFile(selectedFile.value, selectedFolderId.value)
    message.success('笔记创建成功')
    emit('update:show', false)
    // Reset state
    selectedFile.value = null
    selectedFolderId.value = null
    // Navigate to new note
    router.push(`/notes/${res.data.id}`)
  } catch {
    message.error('上传失败，请重试')
  } finally {
    uploading.value = false
  }
}

function handleCancel() {
  emit('update:show', false)
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="上传笔记"
    style="max-width: 480px;"
    :mask-closable="!uploading"
    @update:show="emit('update:show', $event)"
  >
    <div class="upload-modal-body">
      <!-- Upload zone -->
      <div
        :class="['upload-zone', dragOver && 'upload-zone--dragover', selectedFile && 'upload-zone--has-file']"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="($refs.fileInput as HTMLInputElement).click()"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.md"
          style="display: none;"
          @change="handleFileInput"
        />

        <template v-if="!selectedFile">
          <svg class="upload-zone__icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="upload-zone__text">拖拽文件到此处，或点击选择</p>
          <p class="upload-zone__hint">支持 .txt 和 .md 文件</p>
        </template>

        <template v-else>
          <svg class="upload-zone__icon upload-zone__icon--file" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div class="upload-zone__file-info">
            <span class="upload-zone__filename">{{ selectedFile.name }}</span>
            <span class="upload-zone__filesize">{{ fileSize }}</span>
          </div>
          <button class="upload-zone__change-btn" @click.stop="($refs.fileInput as HTMLInputElement).click()">
            更换文件
          </button>
        </template>
      </div>

      <!-- Folder selector -->
      <div class="upload-modal-field">
        <label class="upload-modal-label">保存到文件夹</label>
        <n-select
          v-model:value="selectedFolderId"
          :options="folderOptions"
          placeholder="无文件夹"
          clearable
          style="width: 100%;"
        />
      </div>
    </div>

    <template #footer>
      <div class="upload-modal-footer">
        <n-button :disabled="uploading" @click="handleCancel">取消</n-button>
        <n-button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile || uploading"
          @click="handleConfirm"
        >
          {{ uploading ? '上传中...' : '确认创建' }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.upload-modal-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  border: 2px dashed var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  min-height: 140px;
}

.upload-zone:hover,
.upload-zone--dragover {
  border-color: var(--accent-primary);
  background: rgba(245, 158, 11, 0.05);
}

.upload-zone--has-file {
  padding: 20px 24px;
  cursor: default;
}

.upload-zone__icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.upload-zone__icon--file {
  color: var(--accent-primary);
}

.upload-zone__text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.upload-zone__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.upload-zone__file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.upload-zone__filename {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-zone__filesize {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.upload-zone__change-btn {
  font-size: 0.8125rem;
  color: var(--accent-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.upload-zone__change-btn:hover {
  background: rgba(245, 158, 11, 0.1);
}

.upload-modal-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-modal-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.upload-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
