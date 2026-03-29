<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isDragging: boolean
}>()

const emit = defineEmits<{
  drop: [files: FileList]
  fileSelect: [file: File]
}>()

const fileInputRef = ref<HTMLInputElement>()

function handleDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files.length) {
    emit('drop', e.dataTransfer.files)
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleClick() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('fileSelect', file)
  }
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ 'is-dragging': isDragging }"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @click="handleClick"
  >
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileChange"
    />
    <div class="drop-zone-content">
      <slot>
        <span class="text-4xl mb-2">📁</span>
        <p class="text-sm font-medium">点击或拖拽图片到此处</p>
        <p class="text-xs text-gray-400 mt-1">支持粘贴剪贴板图片</p>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 24px;
  border: 2px dashed var(--n-border-color);
  border-radius: 12px;
  background: var(--n-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop-zone:hover,
.drop-zone.is-dragging {
  border-color: var(--n-primary-color);
  background: var(--n-primary-color-hover);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--n-text-color-3);
}

.hidden {
  display: none;
}
</style>
