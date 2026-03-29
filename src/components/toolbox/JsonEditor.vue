<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import loader from '@monaco-editor/loader'

interface Props {
  modelValue: string
  language?: string
  readonly?: boolean
  theme?: 'vs' | 'vs-dark'
}

const props = withDefaults(defineProps<Props>(), {
  language: 'json',
  readonly: false,
  theme: 'vs'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLElement>()
let editor: any = null
let monacoInstance: any = null

onMounted(async () => {
  if (!containerRef.value) return

  monacoInstance = await loader.init()

  editor = monacoInstance.editor.create(containerRef.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    readOnly: props.readonly,
    automaticLayout: true,
    minimap: { enabled: false },
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'always',
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    matchBrackets: 'always',
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    formatOnPaste: true,
    formatOnType: true
  })

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue())
  })
})

onUnmounted(() => {
  if (editor) {
    editor.dispose()
    editor = null
  }
})

watch(() => props.modelValue, (newValue) => {
  if (editor && editor.getValue() !== newValue) {
    editor.setValue(newValue)
  }
})

watch(() => props.theme, (newTheme) => {
  if (monacoInstance) {
    monacoInstance.editor.setTheme(newTheme)
  }
})

// 暴露方法给父组件
defineExpose({
  format: () => {
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run()
    }
  },
  setValue: (value: string) => {
    if (editor) {
      editor.setValue(value)
    }
  },
  getValue: () => {
    return editor?.getValue() || ''
  }
})
</script>

<template>
  <div ref="containerRef" class="json-editor" />
</template>

<style scoped>
.json-editor {
  width: 100%;
  height: 100%;
  min-height: 300px;
  border-radius: 8px;
  overflow: hidden;
}
</style>
