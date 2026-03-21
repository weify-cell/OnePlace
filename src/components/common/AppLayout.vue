<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

const collapsed = ref(false)
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-900">
    <AppSidebar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
    <main class="flex-1 overflow-auto">
      <slot />
    </main>
  </div>
</template>
