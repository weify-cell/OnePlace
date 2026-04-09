<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/common/AppLayout.vue'
import ToolCard from '@/components/toolbox/ToolCard.vue'
import ToolSearchDialog from '@/components/toolbox/ToolSearchDialog.vue'
import { TOOLS, CATEGORIES, type ToolConfig } from '@/components/toolbox/tools.config'

const router = useRouter()
const showSearch = ref(false)

const PINS = ['json', 'timestamp', 'text-diff', 'image-base64']

const pinnedTools = computed(() => {
  return PINS.map(id => TOOLS.find(t => t.id === id)).filter(Boolean) as ToolConfig[]
})

const expandedCategories = ref<string[]>([])

function toggleCategory(categoryId: string) {
  const index = expandedCategories.value.indexOf(categoryId)
  if (index >= 0) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryId)
  }
}

function getToolsByCategory(categoryId: string): ToolConfig[] {
  return TOOLS.filter(tool => tool.category === categoryId)
}

function navigateToTool(tool: ToolConfig) {
  if (tool.status === 'available' && tool.routePath) {
    router.push(tool.routePath)
  }
}
</script>

<template>
  <AppLayout>
    <div class="toolbox-page">
      <!-- Background -->
      <div class="toolbox-page__bg" />

      <div class="toolbox-content">
        <!-- Header -->
        <div class="toolbox-header animate-slideIn">
          <div class="toolbox-header__text">
            <h1 class="toolbox-header__title">🧰 百宝箱</h1>
            <p class="toolbox-header__sub">实用工具集合</p>
          </div>
          <n-button quaternary circle size="large" class="toolbox-header__search" @click="showSearch = true">
            <template #icon>
              <span class="text-lg">🔍</span>
            </template>
          </n-button>
        </div>

        <!-- Quick access -->
        <section class="toolbox-section animate-slideIn" style="animation-delay: 50ms">
          <h2 class="toolbox-section__title">快捷入口</h2>
          <div class="pinned-grid">
            <ToolCard
              v-for="(tool, index) in pinnedTools"
              :key="tool.id"
              :name="tool.name"
              :description="tool.description"
              :icon="tool.icon"
              :status="tool.status"
              class="animate-fadeIn"
              :style="{ animationDelay: `${index * 50}ms` }"
              @click="navigateToTool(tool)"
            />
          </div>
        </section>

        <!-- All tools -->
        <section class="toolbox-section animate-slideIn" style="animation-delay: 100ms">
          <h2 class="toolbox-section__title">所有工具</h2>
          <div class="category-list">
            <div
              v-for="category in CATEGORIES"
              :key="category.id"
              class="category-card"
            >
              <!-- Category Header -->
              <div
                class="category-card__header"
                @click="toggleCategory(category.id)"
              >
                <div class="category-card__title">
                  <span class="category-card__icon">{{ category.icon }}</span>
                  <span class="category-card__name">{{ category.name }}</span>
                  <n-tag size="small" type="default" class="category-card__count">
                    {{ getToolsByCategory(category.id).length }}
                  </n-tag>
                </div>
                <svg
                  :class="['category-card__arrow', expandedCategories.includes(category.id) && 'category-card__arrow--open']"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <!-- Category Tools -->
              <div
                class="category-card__content"
                :class="expandedCategories.includes(category.id) ? 'category-card__content--open' : ''"
              >
                <div class="tools-grid">
                  <ToolCard
                    v-for="tool in getToolsByCategory(category.id)"
                    :key="tool.id"
                    :name="tool.name"
                    :description="tool.description"
                    :icon="tool.icon"
                    :status="tool.status"
                    @click="navigateToTool(tool)"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Search dialog -->
      <ToolSearchDialog v-model:visible="showSearch" />
    </div>
  </AppLayout>
</template>

<style scoped>
.toolbox-page {
  min-height: 100%;
  position: relative;
}

.toolbox-page__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-content-gradient);
  pointer-events: none;
}

.toolbox-content {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 28px;
}

/* Header */
.toolbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.toolbox-header__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toolbox-header__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.toolbox-header__sub {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.toolbox-header__search {
  width: 44px;
  height: 44px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.toolbox-header__search:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent-primary);
}

/* Sections */
.toolbox-section {
  margin-bottom: 32px;
}

.toolbox-section__title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 14px;
}

/* Pinned grid */
.pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

/* Category list */
.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease;
}

.category-card:hover {
  box-shadow: var(--shadow-md);
}

.category-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.category-card__header:hover {
  background: var(--bg-secondary);
}

.category-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-card__icon {
  font-size: 1.125rem;
}

.category-card__name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.category-card__count {
  background: var(--bg-secondary) !important;
}

.category-card__arrow {
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.category-card__arrow--open {
  transform: rotate(180deg);
}

/* Category content (collapse/expand) */
.category-card__content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease-out;
}

.category-card__content--open {
  max-height: 800px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  padding: 0 14px 14px;
}

/* Animations */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slideIn {
  animation: slideIn 0.35s ease-out forwards;
  opacity: 0;
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
  opacity: 0;
}
</style>
