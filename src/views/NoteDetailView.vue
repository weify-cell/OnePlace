<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, watch } from 'vue'
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

onMounted(async () => {
  await noteStore.fetchNote(noteId.value)
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
  noteStore.updateNote(note.value.id, { tags })
}
</script>

<template>
  <AppLayout>
    <div v-if="note" class="h-full flex flex-col">
      <!-- Toolbar -->
      <div class="flex-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button class="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1" @click="router.push('/notes')">
          ← 返回笔记
        </button>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">
            {{ noteStore.saving ? '保存中...' : '已自动保存' }}
          </span>
          <n-button size="small" @click="noteStore.togglePin(note.id)">
            {{ note.is_pinned ? '取消置顶' : '置顶' }}
          </n-button>
        </div>
      </div>

      <!-- Editor area -->
      <div class="flex-1 overflow-auto">
        <div class="max-w-3xl mx-auto px-8 py-6">
          <!-- Title -->
          <input
            :value="note.title"
            class="w-full text-3xl font-bold border-none outline-none bg-transparent text-gray-900 dark:text-white mb-4 placeholder-gray-300"
            placeholder="无标题"
            @input="onTitleChange(($event.target as HTMLInputElement).value)"
          />

          <!-- Tags -->
          <div class="mb-4">
            <TagInput :tags="note.tags" @update:tags="onTagsChange" />
          </div>

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
