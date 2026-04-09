<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

const collapsed = ref(false)
</script>

<template>
  <div class="app-layout">
    <AppSidebar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
    <main class="app-layout__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: flex;
  overflow: hidden;
  background: var(--bg-primary);
}

.app-layout__main {
  flex: 1;
  overflow: auto;
  min-width: 0;
}
</style>
