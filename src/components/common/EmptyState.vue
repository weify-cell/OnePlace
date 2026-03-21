<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string; actionLabel?: string }>()
defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex-center flex-col py-16 text-center">
    <div class="text-5xl mb-4">{{ icon || '📭' }}</div>
    <h3 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">{{ title }}</h3>
    <p v-if="description" class="text-sm text-gray-500 mb-4">{{ description }}</p>
    <n-button v-if="actionLabel" type="primary" @click="$emit('action')">{{ actionLabel }}</n-button>
  </div>
</template>
