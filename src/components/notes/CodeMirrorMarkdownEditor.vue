<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import { uploadApi } from '@/api/upload.api'
import MarkdownPreview from './MarkdownPreview.vue'
import ImageManager from './ImageManager.vue'

const props = defineProps<{
  content: string
  noteId?: number
}>()

const emit = defineEmits<{
  'update:content': [content: string]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const editorView = shallowRef<EditorView | null>(null)
const showPreview = ref(true)
const showImageManager = ref(false)
const previewHtml = ref('')
const imageManagerRef = ref<InstanceType<typeof ImageManager> | null>(null)

// Update preview HTML
function updatePreview(content: string) {
  try {
    previewHtml.value = marked.parse(content) as string
  } catch {
    previewHtml.value = ''
  }
}

// Handle image paste
async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) await uploadAndInsertImage(file)
      return
    }
  }
}

// Handle image drop
async function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files) return

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      e.preventDefault()
      await uploadAndInsertImage(file)
      return
    }
  }
}

// Upload image and insert markdown
async function uploadAndInsertImage(file: File) {
  try {
    const res = await uploadApi.uploadImage(file)
    const url = res.data.url
    const markdown = `![${file.name}](${url})`

    const view = editorView.value
    if (!view) return

    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length }
    })
  } catch (err) {
    console.error('Upload failed:', err)
  }
}

// Bold: Ctrl+B
// Italic: Ctrl+I
// Insert image: Ctrl+Shift+I
const customKeymap = keymap.of([
  {
    key: 'Ctrl-b',
    run: (view) => {
      wrapSelection('**', '**')
      return true
    }
  },
  {
    key: 'Ctrl-i',
    run: (view) => {
      wrapSelection('*', '*')
      return true
    }
  },
  {
    key: 'Ctrl-Shift-i',
    run: (view) => {
      const url = prompt('输入图片 URL:')
      if (url) {
        const markdown = `![](${url})`
        insertAtCursor(markdown)
      }
      return true
    }
  },
  {
    key: 'Ctrl-Shift-k',
    run: (view) => {
      wrapSelection('`', '`')
      return true
    }
  }
])

function wrapSelection(before: string, after: string) {
  const view = editorView.value
  if (!view) return

  const { from, to } = view.state.selection.main
  const selectedText = view.state.sliceDoc(from, to)

  if (selectedText) {
    view.dispatch({
      changes: { from, to, insert: `${before}${selectedText}${after}` },
      selection: { anchor: from + before.length, head: to + before.length }
    })
  } else {
    view.dispatch({
      changes: { from, to, insert: `${before}文本${after}` },
      selection: { anchor: from + before.length, head: to + before.length + before.length - 2 }
    })
  }
}

function insertAtCursor(text: string) {
  const view = editorView.value
  if (!view) return

  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length }
  })
}

function createEditorState() {
  return EditorState.create({
    doc: props.content,
    extensions: [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      customKeymap,
      history(),
      markdown(),
      placeholder('开始记录...'),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString()
          emit('update:content', content)
          updatePreview(content)
        }
      }),
      EditorView.lineWrapping
    ]
  })
}

onMounted(() => {
  if (!editorRef.value) return

  editorView.value = new EditorView({
    state: createEditorState(),
    parent: editorRef.value
  })

  updatePreview(props.content)
})

onBeforeUnmount(() => {
  editorView.value?.destroy()
})

function openImageManager() {
  showImageManager.value = true
  imageManagerRef.value?.refresh()
}
</script>

<template>
  <div class="cm-editor-wrapper">
    <!-- Editor toolbar -->
    <div class="cm-toolbar">
      <div class="cm-toolbar__left">
        <button class="cm-toolbar__btn" title="加粗 (Ctrl+B)" @click="wrapSelection('**', '**')">
          <strong>B</strong>
        </button>
        <button class="cm-toolbar__btn" title="斜体 (Ctrl+I)" @click="wrapSelection('*', '*')">
          <em>I</em>
        </button>
        <button class="cm-toolbar__btn" title="行内代码 (Ctrl+Shift+K)" @click="wrapSelection('`', '`')">
          <code>&lt;/&gt;</code>
        </button>
        <span class="cm-toolbar__divider" />
        <button class="cm-toolbar__btn" title="插入图片 (Ctrl+Shift+I)" @click="openImageManager">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
      </div>
      <div class="cm-toolbar__right">
        <button
          :class="['cm-toolbar__btn', showPreview && 'cm-toolbar__btn--active']"
          title="切换预览"
          @click="showPreview = !showPreview"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Split view -->
    <div :class="['cm-split-view', showPreview && 'cm-split-view--preview']">
      <!-- Editor pane -->
      <div
        ref="editorRef"
        class="cm-editor-pane"
        @paste="handlePaste"
        @drop.prevent="handleDrop"
        @dragover.prevent
      />

      <!-- Preview pane -->
      <div v-if="showPreview" class="cm-preview-pane">
        <MarkdownPreview :content="props.content" />
      </div>
    </div>

    <!-- Image manager modal -->
    <n-modal v-model:show="showImageManager" preset="card" title="图片管理" style="max-width: 600px;">
      <ImageManager ref="imageManagerRef" :note-id="noteId ?? 0" />
    </n-modal>
  </div>
</template>

<style scoped>
.cm-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.dark .cm-editor-wrapper {
  border-color: #374151;
  background: #111827;
}

.cm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.dark .cm-toolbar {
  background: #1f2937;
  border-bottom-color: #374151;
}

.cm-toolbar__left,
.cm-toolbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cm-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #6b7280;
  font-size: 0.875rem;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.cm-toolbar__btn:hover {
  background: #e5e7eb;
  color: #111827;
}

.dark .cm-toolbar__btn {
  color: #9ca3af;
}

.dark .cm-toolbar__btn:hover {
  background: #374151;
  color: #f1f5f9;
}

.cm-toolbar__btn--active {
  background: #e5e7eb;
  color: #6366f1;
}

.dark .cm-toolbar__btn--active {
  background: #374151;
  color: #818cf8;
}

.cm-toolbar__divider {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  margin: 0 4px;
}

.dark .cm-toolbar__divider {
  background: #374151;
}

.cm-split-view {
  display: flex;
  flex: 1;
  min-height: 0;
}

.cm-split-view--preview .cm-editor-pane {
  width: 50%;
  border-right: 1px solid #e5e7eb;
}

.dark .cm-split-view--preview .cm-editor-pane {
  border-right-color: #374151;
}

.cm-editor-pane {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.cm-preview-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: #fafafa;
}

.dark .cm-preview-pane {
  background: #0f172a;
}

/* CodeMirror styles */
:deep(.cm-editor) {
  height: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9375rem;
}

:deep(.cm-editor.cm-focused) {
  outline: none;
}

:deep(.cm-scroller) {
  overflow: auto;
  padding: 16px;
}

:deep(.cm-content) {
  caret-color: #6366f1;
}

:deep(.cm-line) {
  padding: 0 4px;
}

:deep(.cm-placeholder) {
  color: #9ca3af;
}

:deep(.cm-activeLine) {
  background: rgba(99, 102, 241, 0.05);
}

:deep(.cm-gutters) {
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  color: #9ca3af;
}

.dark .cm-gutters {
  background: #1f2937;
  border-right-color: #374151;
}

.dark .cm-activeLine {
  background: rgba(99, 102, 241, 0.1);
}
</style>
