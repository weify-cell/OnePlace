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
    class="tag-input"
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
      class="tag-input__field"
      :placeholder="tags.length ? '' : (placeholder || '输入标签，回车确认')"
      @keydown="handleKeydown"
      @blur="addTag"
    />
  </div>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  min-height: 38px;
  cursor: text;
  background: var(--bg-primary);
  transition: border-color 0.15s ease;
}

.tag-input:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1);
}

.tag-input__field {
  flex: 1;
  min-width: 80px;
  outline: none;
  border: none;
  background: transparent;
  font-size: 0.875rem;
  color: var(--text-primary);
  padding: 2px 0;
}

.tag-input__field::placeholder {
  color: var(--text-muted);
}
</style>
