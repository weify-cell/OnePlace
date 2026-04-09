<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/note.store'
import AppLayout from '@/components/common/AppLayout.vue'
import NoteCard from '@/components/notes/NoteCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const router = useRouter()
const noteStore = useNoteStore()

// View mode toggle (card | list)
const viewMode = ref(localStorage.getItem('notes_view_mode') as 'card' | 'list' || 'card')

function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'list' : 'card'
  localStorage.setItem('notes_view_mode', viewMode.value)
}

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

function formatTime(isoString: string) {
  const d = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins} 分钟前`
  if (diffHours < 24) return `${diffHours} 小时前`
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <AppLayout>
    <div class="notes-page">
      <!-- Background -->
      <div class="notes-page__bg" />

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
            <div class="notes-header animate-slideIn">
              <div class="notes-header__text">
                <h1 class="notes-header__title">{{ currentFolderLabel }}</h1>
                <p class="notes-header__sub">共 {{ noteStore.items.length }} 篇笔记</p>
              </div>
              <div class="notes-header__actions">
                <!-- View mode toggle -->
                <div class="view-toggle">
                  <button
                    :class="['view-toggle__btn', viewMode === 'card' && 'view-toggle__btn--active']"
                    title="卡片视图"
                    @click="toggleViewMode()"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                  </button>
                  <button
                    :class="['view-toggle__btn', viewMode === 'list' && 'view-toggle__btn--active']"
                    title="列表视图"
                    @click="toggleViewMode()"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </button>
                </div>
                <n-button type="primary" class="notes-header__btn" @click="createNote">
                  + 新建笔记
                </n-button>
              </div>
            </div>

            <!-- Filters -->
            <div class="notes-filters animate-slideIn" style="animation-delay: 50ms">
              <n-input
                v-model:value="noteStore.filters.search"
                placeholder="搜索笔记..."
                clearable
                class="notes-filters__search"
                @update:value="noteStore.fetchNotes()"
              >
                <template #prefix>
                  <span class="notes-filters__search-icon">🔍</span>
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

            <!-- Note grid / list -->
            <n-spin :show="noteStore.loading" class="animate-slideIn" style="animation-delay: 100ms">
              <EmptyState
                v-if="!noteStore.loading && noteStore.items.length === 0"
                title="暂无笔记"
                description="点击右上角「新建笔记」开始"
                icon="📝"
                action-label="新建笔记"
                @action="createNote"
              />
              <!-- Card view -->
              <div v-else-if="viewMode === 'card'" class="notes-grid">
                <NoteCard
                  v-for="(note, index) in noteStore.items"
                  :key="note.id"
                  :note="note"
                  :style="{ animationDelay: `${index * 30}ms` }"
                />
              </div>
              <!-- List view -->
              <div v-else class="notes-list">
                <div
                  v-for="(note, index) in noteStore.items"
                  :key="note.id"
                  class="note-list-item animate-fadeIn"
                  :style="{ animationDelay: `${index * 20}ms` }"
                  @click="router.push(`/notes/${note.id}`)"
                >
                  <span class="note-list-item__title">{{ note.title || '无标题' }}</span>
                  <span class="note-list-item__time">{{ formatTime(note.updated_at) }}</span>
                </div>
              </div>
            </n-spin>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
/* ---- Page wrapper ---- */
.notes-page {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.notes-page__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-content-gradient);
  pointer-events: none;
}

/* ---- Layout ---- */
.notes-layout {
  display: flex;
  height: 100%;
  position: relative;
  z-index: 1;
}

/* ---- Folder Panel ---- */
.folder-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
  height: 100%;
}

.folder-panel__header {
  flex-shrink: 0;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.folder-panel__heading {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.folder-panel__nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.folder-panel__footer {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--border-subtle);
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
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.folder-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.folder-item--active {
  background: var(--bg-card);
  color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
  background: var(--bg-card);
  border-radius: var(--radius-full);
  padding: 1px 7px;
  line-height: 1.6;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s ease;
}

.folder-item__op-btn:hover {
  background: var(--bg-secondary);
  color: var(--accent-primary);
}

.folder-item__op-btn--danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

/* ---- Rename input ---- */
.folder-rename {
  padding: 3px 4px;
}

.folder-rename__input {
  width: 100%;
  font-size: 0.8125rem;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--accent-primary);
  outline: none;
  background: var(--bg-card);
  color: var(--text-primary);
}

/* ---- New folder button ---- */
.new-folder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-folder-btn:hover {
  background: var(--bg-card);
  color: var(--accent-primary);
}

/* ---- Notes content area ---- */
.notes-content {
  flex: 1;
  overflow-y: auto;
}

.notes-content__inner {
  padding: 28px;
  max-width: 1100px;
}

/* ---- Header ---- */
.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.notes-header__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notes-header__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.notes-header__sub {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.notes-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.notes-header__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.notes-header__btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
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
  min-width: 180px;
}

.notes-filters__search-icon {
  font-size: 0.875rem;
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

/* ---- View toggle ---- */
.view-toggle {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 1px;
  box-shadow: var(--shadow-sm);
}

.view-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s ease;
}

.view-toggle__btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.view-toggle__btn--active {
  background: var(--accent-gradient);
  color: white;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

/* ---- Notes list view ---- */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.note-list-item:hover {
  box-shadow: var(--shadow-md);
  border-color: rgba(251, 191, 36, 0.35);
}

.note-list-item__title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.note-list-item__time {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 12px;
}

/* ---- Animations ---- */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slideIn {
  animation: slideIn 0.35s ease-out forwards;
  opacity: 0;
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
  opacity: 0;
}
</style>
