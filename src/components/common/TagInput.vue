<script setup lang="ts">
const props = defineProps<{ tags: string[]; placeholder?: string }>()
const emit = defineEmits<{ 'update:tags': [tags: string[]] }>()

const inputValue = ref('')

function addTag() {
  const tag = inputValue.value.trim()
  if (tag && !props.tags.includes(tag)) {
    emit('update:tags', [...props.tags, tag])
  }
  inputValue.value = ''
}

function removeTag(tag: string) {
  emit('update:tags', props.tags.filter(t => t !== tag))
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  }
  if (e.key === 'Backspace' && !inputValue.value && props.tags.length) {
    removeTag(props.tags[props.tags.length - 1])
  }
}
</script>

<template>
  <div
    class="flex flex-wrap gap-1.5 p-2 border border-gray-300 dark:border-gray-600 rounded-md min-h-10 cursor-text"
    @click="($el as HTMLElement).querySelector('input')?.focus()"
  >
    <n-tag
      v-for="tag in tags"
      :key="tag"
      size="small"
      closable
      @close="removeTag(tag)"
    >{{ tag }}</n-tag>
    <input
      v-model="inputValue"
      class="flex-1 min-w-24 outline-none text-sm bg-transparent dark:text-gray-200"
      :placeholder="tags.length ? '' : (placeholder || '输入标签，回车确认')"
      @keydown="handleKeydown"
      @blur="addTag"
    />
  </div>
</template>
