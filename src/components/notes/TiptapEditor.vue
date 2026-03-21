<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import TiptapToolbar from './TiptapToolbar.vue'

const props = defineProps<{ content: string }>()
const emit = defineEmits<{ 'update:content': [content: string] }>()

const lowlight = createLowlight(common)

const editor = useEditor({
  content: props.content ? (() => { try { return JSON.parse(props.content) } catch { return props.content } })() : '',
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    Placeholder.configure({ placeholder: '开始记录...' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight })
  ],
  onUpdate: ({ editor }) => {
    emit('update:content', JSON.stringify(editor.getJSON()))
  }
})

watch(() => props.content, (newContent) => {
  if (!editor.value || !newContent) return
  const current = JSON.stringify(editor.value.getJSON())
  if (current !== newContent) {
    try {
      editor.value.commands.setContent(JSON.parse(newContent), false)
    } catch {
      // ignore
    }
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div class="tiptap-wrapper">
    <TiptapToolbar v-if="editor" :editor="editor" />
    <EditorContent :editor="editor" class="prose prose-sm max-w-none dark:prose-invert" />
  </div>
</template>

<style>
.tiptap .ProseMirror {
  outline: none;
  min-height: 300px;
}
.tiptap .ProseMirror p.is-editor-empty:first-child::before {
  color: #adb5bd;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.tiptap ul[data-type="taskList"] { list-style: none; padding: 0; }
.tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
.tiptap ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 3px; }
</style>
