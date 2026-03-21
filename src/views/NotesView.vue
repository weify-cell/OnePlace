<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import AppLayout from '@/components/common/AppLayout.vue'
import NoteCard from '@/components/notes/NoteCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const router = useRouter()
const noteStore = useNoteStore()

// Folder state
const creatingFolder = ref(false)
const newFolderName = ref('')
const renamingId = ref<number | null>(null)
const renameValue = ref('')

onMounted(async () => {
  await Promise.all([noteStore.fetchNotes(), noteStore.fetchFolders(), noteStore.fetchAllTags()])
})

async function createNote() {
  const note = await noteStore.createNote()
  router.push(`/notes/${note.id}`)
}

function selectFolder(id: number | null) {
  noteStore.selectFolder(id)
}

async function confirmCreateFolder() {
  const name = newFolderName.value.trim()
  if (!name) { creatingFolder.value = false; return }
  await noteStore.createFolder(name)
  newFolderName.value = ''
  creatingFolder.value = false
}

function cancelCreateFolder() {
  newFolderName.value = ''
  creatingFolder.value = false
}

function startRename(id: number, currentName: string) {
  renamingId.value = id
  renameValue.value = currentName
  nextTick(() => document.getElementById(`rename-${id}`)?.focus())
}

async function confirmRename(id: number) {
  const name = renameValue.value.trim()
  if (name) await noteStore.renameFolder(id, name)
  renamingId.value = null
}

async function handleDeleteFolder(id: number, name: string) {
  if (!confirm(`删除文件夹「${name}」？文件夹内笔记不会被删除。`)) return
  await noteStore.deleteFolder(id)
}

const tagOptions = computed(() =>
  noteStore.allTags.map(t => ({ label: t, value: t }))
)

const currentFolderLabel = computed(() => {
  if (noteStore.currentFolderId === null) return '全部笔记'
  return noteStore.folders.find(f => f.id === noteStore.currentFolderId)?.name ?? '笔记'
})

function onTagFilter(tag: string | null) {
  noteStore.filters.tag = tag ?? ''
  noteStore.fetchNotes()
}
</script>

<template>
  <AppLayout>
    <div class="notes-layout">
      <!-- Left: Folder panel -->
      <aside class="folder-panel">
        <div class="folder-panel__header">
          <span class="folder-panel__heading">文件夹</span>
        </div>

        <nav class="folder-panel__nav">
          <!-- All notes -->
          <button
            :class="['folder-item', noteStore.currentFolderId === null && 'folder-item--active']"
            @click="selectFolder(null)"
          >
            <svg class="folder-item__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span class="folder-item__label">全部笔记</span>
            <span class="folder-item__count">{{ noteStore.items.length }}</span>
          </button>

          <!-- Folder items -->
          <div v-for="folder in noteStore.folders" :key="folder.id" class="folder-item-wrapper">
            <!-- Rename input -->
            <div v-if="renamingId === folder.id" class="folder-rename">
              <input
                :id="`rename-${folder.id}`"
                v-model="renameValue"
                class="folder-rename__input"
                @keydown.enter="confirmRename(folder.id)"
                @keydown.escape="renamingId = null"
                @blur="confirmRename(folder.id)"
              />
            </div>

            <!-- Normal display -->
            <button
              v-else
              :class="['folder-item', noteStore.currentFolderId === folder.id && 'folder-item--active']"
              @click="selectFolder(folder.id)"
            >
              <svg class="folder-item__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="folder-item__label">{{ folder.name }}</span>
              <span class="folder-item__ops">
                <span
                  class="folder-item__op-btn"
                  title="重命名"
                  @click.stop="startRename(folder.id, folder.name)"
                >
                  <svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </span>
                <span
                  class="folder-item__op-btn folder-item__op-btn--danger"
                  title="删除"
                  @click.stop="handleDeleteFolder(folder.id, folder.name)"
                >
                  <svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </span>
              </span>
            </button>
          </div>
        </nav>

        <!-- New folder -->
        <div class="folder-panel__footer">
          <div v-if="creatingFolder" class="folder-rename">
            <input
              v-model="newFolderName"
              class="folder-rename__input"
              placeholder="文件夹名称"
              autofocus
              @keydown.enter="confirmCreateFolder"
              @keydown.escape="cancelCreateFolder"
              @blur="confirmCreateFolder"
            />
          </div>
          <button
            v-else
            class="new-folder-btn"
            @click="creatingFolder = true"
          >
            <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新建文件夹
          </button>
        </div>
      </aside>

      <!-- Right: Notes content -->
      <div class="notes-content">
        <div class="notes-content__inner">
          <!-- Page header -->
          <div class="flex-between mb-6">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ currentFolderLabel }}</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">共 {{ noteStore.items.length }} 篇笔记</p>
            </div>
            <n-button type="primary" @click="createNote">+ 新建笔记</n-button>
          </div>

          <!-- Filters -->
          <div class="notes-filters">
            <n-input
              v-model:value="noteStore.filters.search"
              placeholder="搜索笔记..."
              clearable
              class="notes-filters__search"
              @update:value="noteStore.fetchNotes()"
            >
              <template #prefix>
                <svg class="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </template>
            </n-input>
            <n-select
              :value="noteStore.filters.tag || null"
              :options="tagOptions"
              placeholder="按标签筛选"
              clearable
              class="notes-filters__tag"
              @update:value="onTagFilter"
              @clear="onTagFilter(null)"
            />
            <n-checkbox
              :checked="noteStore.filters.is_archived"
              @update:checked="noteStore.filters.is_archived = $event; noteStore.fetchNotes()"
            >
              已归档
            </n-checkbox>
          </div>

          <!-- Note grid -->
          <n-spin :show="noteStore.loading">
            <EmptyState
              v-if="!noteStore.loading && noteStore.items.length === 0"
              title="暂无笔记"
              description="点击右上角「新建笔记」开始"
              action-label="新建笔记"
              @action="createNote"
            />
            <div v-else class="notes-grid">
              <NoteCard v-for="note in noteStore.items" :key="note.id" :note="note" />
            </div>
          </n-spin>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
/* ---- Layout ---- */
.notes-layout {
  display: flex;
  height: 100%;
}

/* ---- Folder Panel ---- */
.folder-panel {
  width: 176px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border-right: 1px solid #e5e7eb;
}

.dark .folder-panel {
  background: #111827;
  border-right-color: #1f2937;
}

.folder-panel__header {
  padding: 14px 14px 10px;
  border-bottom: 1px solid #e5e7eb;
}

.dark .folder-panel__header {
  border-bottom-color: #1f2937;
}

.folder-panel__heading {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #9ca3af;
}

.dark .folder-panel__heading {
  color: #4b5563;
}

.folder-panel__nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-panel__footer {
  padding: 8px;
  border-top: 1px solid #e5e7eb;
}

.dark .folder-panel__footer {
  border-top-color: #1f2937;
}

/* ---- Folder Item ---- */
.folder-item-wrapper {
  position: relative;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  text-align: left;
  font-size: 0.8125rem;
  padding: 6px 8px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.folder-item:hover {
  background: #f0f0f0;
  color: #111827;
}

.folder-item--active {
  background: #eef2ff;
  color: #4338ca;
  font-weight: 500;
}

.folder-item--active:hover {
  background: #e0e7ff;
}

.dark .folder-item {
  color: #9ca3af;
}

.dark .folder-item:hover {
  background: #1f2937;
  color: #e2e8f0;
}

.dark .folder-item--active {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.dark .folder-item--active:hover {
  background: rgba(99, 102, 241, 0.22);
}

.folder-item__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}

.folder-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-item__count {
  font-size: 0.6875rem;
  color: #9ca3af;
  background: #e5e7eb;
  border-radius: 10px;
  padding: 0 6px;
  line-height: 1.6;
  flex-shrink: 0;
}

.dark .folder-item__count {
  background: #2d3748;
  color: #64748b;
}

/* Operations (show on hover) */
.folder-item__ops {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.folder-item-wrapper:hover .folder-item__ops,
.folder-item:hover .folder-item__ops {
  opacity: 1;
}

.folder-item__op-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: #9ca3af;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.folder-item__op-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.folder-item__op-btn--danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

.dark .folder-item__op-btn:hover {
  background: #374151;
  color: #e2e8f0;
}

.dark .folder-item__op-btn--danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

/* ---- Rename input ---- */
.folder-rename {
  padding: 3px 4px;
}

.folder-rename__input {
  width: 100%;
  font-size: 0.8125rem;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1.5px solid #6366f1;
  outline: none;
  background: white;
  color: #111827;
}

.dark .folder-rename__input {
  background: #1f2937;
  color: #e2e8f0;
  border-color: #6366f1;
}

/* ---- New folder button ---- */
.new-folder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 0.75rem;
  color: #9ca3af;
  padding: 6px 8px;
  border-radius: 7px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.new-folder-btn:hover {
  background: #f0f0f0;
  color: #6366f1;
}

.dark .new-folder-btn:hover {
  background: #1f2937;
  color: #a5b4fc;
}

/* ---- Notes content area ---- */
.notes-content {
  flex: 1;
  overflow-y: auto;
}

.notes-content__inner {
  padding: 24px 28px;
  max-width: 1100px;
}

/* ---- Filters ---- */
.notes-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.notes-filters__search {
  max-width: 280px;
}

.notes-filters__tag {
  min-width: 130px;
  max-width: 200px;
}

/* ---- Notes grid ---- */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
</style>
