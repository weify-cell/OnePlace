<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/types'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ message: Message }>()

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    return md.render(props.message.content)
  }
  return props.message.content
})

const isUser = computed(() => props.message.role === 'user')
</script>

<template>
  <div :class="['flex', isUser ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'max-w-3xl rounded-2xl px-4 py-3',
        isUser
          ? 'bg-primary-500 text-white'
          : message.is_error
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
      ]"
    >
      <div
        v-if="!isUser"
        class="prose prose-sm max-w-none dark:prose-invert"
        v-html="renderedContent"
      />
      <p v-else class="whitespace-pre-wrap text-sm">{{ message.content }}</p>
    </div>
  </div>
</template>
