<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

defineProps<{ editor: Editor }>()
</script>

<template>
  <div class="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-gray-700 mb-2 sticky top-0 bg-white dark:bg-gray-800 z-10">
    <n-button
      size="tiny"
      :type="editor.isActive('bold') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleBold().run()"
    >B</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('italic') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleItalic().run()"
    ><em>I</em></n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('strike') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleStrike().run()"
    ><s>S</s></n-button>
    <n-divider vertical />
    <n-button
      size="tiny"
      :type="editor.isActive('heading', { level: 1 }) ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
    >H1</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
    >H2</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
    >H3</n-button>
    <n-divider vertical />
    <n-button
      size="tiny"
      :type="editor.isActive('bulletList') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleBulletList().run()"
    >• 列表</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('orderedList') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleOrderedList().run()"
    >1. 列表</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('taskList') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleTaskList().run()"
    >☑ 待办</n-button>
    <n-divider vertical />
    <n-button
      size="tiny"
      :type="editor.isActive('code') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleCode().run()"
    >` 代码</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('codeBlock') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleCodeBlock().run()"
    >``` 代码块</n-button>
    <n-button
      size="tiny"
      :type="editor.isActive('blockquote') ? 'primary' : 'default'"
      @click="editor.chain().focus().toggleBlockquote().run()"
    >> 引用</n-button>
    <n-divider vertical />
    <n-button size="tiny" @click="editor.chain().focus().undo().run()">↩ 撤销</n-button>
    <n-button size="tiny" @click="editor.chain().focus().redo().run()">↪ 重做</n-button>
  </div>
</template>
