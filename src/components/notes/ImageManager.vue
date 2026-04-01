<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { notesApi } from '@/api/notes.api'
import { uploadApi } from '@/api/upload.api'
import type { NoteImage } from '@/types'

const props = defineProps<{
  noteId: number
}>()

const message = useMessage()
const dialog = useDialog()

const images = ref<NoteImage[]>([])
const loading = ref(false)

async function fetchImages() {
  loading.value = true
  try {
    const res = await notesApi.getNoteImages(props.noteId)
    images.value = res.data.images
  } catch {
    message.error('获取图片列表失败')
  } finally {
    loading.value = false
  }
}

function confirmDelete(image: NoteImage) {
  dialog.warning({
    title: '删除图片',
    content: `确定要删除图片 ${image.filename} 吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => handleDelete(image)
  })
}

async function handleDelete(image: NoteImage) {
  try {
    await uploadApi.deleteImage(image.filename)
    images.value = images.value.filter(i => i.filename !== image.filename)
    message.success('图片已删除')
  } catch {
    message.error('删除失败')
  }
}

onMounted(() => {
  fetchImages()
})

defineExpose({ refresh: fetchImages })
</script>

<template>
  <div class="image-manager">
    <div class="image-manager__header">
      <span class="image-manager__title">图片管理</span>
      <n-button size="tiny" secondary @click="fetchImages">
        刷新
      </n-button>
    </div>

    <div v-if="loading" class="image-manager__loading">
      <n-spin size="small" />
    </div>

    <div v-else-if="images.length === 0" class="image-manager__empty">
      暂无图片
    </div>

    <div v-else class="image-manager__list">
      <div v-for="image in images" :key="image.filename" class="image-item">
        <img :src="image.url" :alt="image.filename" class="image-item__thumb" />
        <div class="image-item__info">
          <span class="image-item__name" :title="image.filename">{{ image.filename }}</span>
          <span v-if="image.used_in_content" class="image-item__status image-item__status--used">已使用</span>
          <span v-else class="image-item__status image-item__status--unused">未使用</span>
        </div>
        <n-button size="tiny" type="error" secondary @click="confirmDelete(image)">
          删除
        </n-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-manager {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.dark .image-manager {
  background: #1f2937;
  border-color: #374151;
}

.image-manager__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.image-manager__title {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.dark .image-manager__title {
  color: #d1d5db;
}

.image-manager__loading,
.image-manager__empty {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 0.875rem;
}

.image-manager__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.dark .image-item {
  background: #111827;
  border-color: #374151;
}

.image-item__thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.image-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.image-item__name {
  font-size: 0.75rem;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dark .image-item__name {
  color: #d1d5db;
}

.image-item__status {
  font-size: 0.625rem;
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
}

.image-item__status--used {
  background: #dcfce7;
  color: #166534;
}

.image-item__status--unused {
  background: #fef3c7;
  color: #92400e;
}

.dark .image-item__status--used {
  background: #14532d;
  color: #bbf7d0;
}

.dark .image-item__status--unused {
  background: #78350f;
  color: #fde68a;
}
</style>
