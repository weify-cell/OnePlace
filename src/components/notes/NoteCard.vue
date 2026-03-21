<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import type { Note } from '@/types'

const props = defineProps<{ note: Note }>()
const router = useRouter()
const noteStore = useNoteStore()
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
    class="card p-4 cursor-pointer hover:shadow-md transition-shadow"
    @click="router.push(`/notes/${note.id}`)"
  >
    <div class="flex-between gap-2 mb-2">
      <h3 class="font-medium text-gray-900 dark:text-white truncate">
        <span v-if="note.is_pinned" class="text-yellow-500 mr-1">📌</span>
        {{ note.title || '无标题' }}
      </h3>
      <div class="flex gap-1 flex-shrink-0" @click.stop>
        <n-button size="tiny" quaternary @click="noteStore.togglePin(note.id)">
          {{ note.is_pinned ? '📌' : '☆' }}
        </n-button>
        <n-button size="tiny" quaternary @click="confirmDelete">✕</n-button>
      </div>
    </div>
    <p class="text-sm text-gray-500 line-clamp-2 mb-2 min-h-10">
      {{ note.content_text || '（空笔记）' }}
    </p>
    <div class="flex-between">
      <div class="flex gap-1 flex-wrap">
        <n-tag v-for="tag in note.tags.slice(0, 3)" :key="tag" size="tiny">{{ tag }}</n-tag>
      </div>
      <span class="text-xs text-gray-400">{{ formatDate(note.updated_at) }}</span>
    </div>
  </div>
</template>
