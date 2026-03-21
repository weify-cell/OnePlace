<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import AppLayout from '@/components/common/AppLayout.vue'
import NoteCard from '@/components/notes/NoteCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const router = useRouter()
const noteStore = useNoteStore()

onMounted(() => noteStore.fetchNotes())

async function createNote() {
  const note = await noteStore.createNote()
  router.push(`/notes/${note.id}`)
}
</script>

<template>
  <AppLayout>
    <div class="p-6 max-w-5xl mx-auto">
      <div class="flex-between mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">笔记</h1>
        <n-button type="primary" @click="createNote">+ 新建笔记</n-button>
      </div>

      <!-- Search -->
      <div class="mb-4 flex gap-3">
        <n-input
          v-model:value="noteStore.filters.search"
          placeholder="搜索笔记..."
          clearable
          class="max-w-sm"
          @update:value="noteStore.fetchNotes()"
        />
        <n-checkbox
          :checked="noteStore.filters.is_archived"
          @update:checked="noteStore.filters.is_archived = $event; noteStore.fetchNotes()"
        >
          已归档
        </n-checkbox>
      </div>

      <n-spin :show="noteStore.loading">
        <EmptyState
          v-if="!noteStore.loading && noteStore.items.length === 0"
          title="暂无笔记"
          description="点击右上角「新建笔记」开始"
          action-label="新建笔记"
          @action="createNote"
        />
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NoteCard v-for="note in noteStore.items" :key="note.id" :note="note" />
        </div>
      </n-spin>
    </div>
  </AppLayout>
</template>
