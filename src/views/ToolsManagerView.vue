<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import { api } from '@/api'

interface ToolConfig {
  id: number
  name: string
  label: string
  description: string
  instruction: string
  enabled: number
}

const message = useMessage()
const dialog = useDialog()
const tools = ref<ToolConfig[]>([])
const loading = ref(false)
const showModal = ref(false)
const editing = ref<ToolConfig | null>(null)
const form = ref({ name: '', label: '', description: '', instruction: '', enabled: 1 })

async function fetchTools() {
  loading.value = true
  try { const { data } = await api.get('/tool-config/list'); tools.value = data }
  catch { message.error('加载失败') }
  loading.value = false
}

function openCreate() {
  editing.value = null
  form.value = { name: '', label: '', description: '', instruction: '', enabled: 1 }
  showModal.value = true
}

function editTool(tool: ToolConfig) {
  editing.value = tool
  form.value = { ...tool }
  showModal.value = true
}

async function saveTool() {
  if (!form.value.name) { message.warning('名称不能为空'); return }
  try {
    if (editing.value) await api.put(`/tool-config/${editing.value.id}`, form.value)
    else await api.post('/tool-config', form.value)
    message.success(editing.value ? '已更新' : '已创建')
    showModal.value = false; await fetchTools()
  } catch { message.error('保存失败') }
}

function removeTool(tool: ToolConfig) {
  dialog.warning({
    title: '确认删除', content: `确定删除「${tool.name}」？`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.delete(`/tool-config/${tool.id}`); message.success('已删除'); await fetchTools() }
      catch { message.error('删除失败') }
    },
  })
}

function toggleEnabled(tool: ToolConfig) {
  const next = tool.enabled ? 0 : 1
  api.put(`/tool-config/${tool.id}`, { ...tool, enabled: next })
    .then(() => { tool.enabled = next; message.success(next ? '已启用' : '已禁用') })
    .catch(() => message.error('操作失败'))
}

onMounted(fetchTools)
</script>

<template>
  <AppLayout>
    <div class="page">
      <div class="page__bg" />

      <div class="page__header animate-slideIn">
        <div class="page__header-text">
          <h1 class="page__title">工具管理</h1>
          <p class="page__sub">管理 Agent 可用的工具 · 共 {{ tools.length }} 个</p>
        </div>
        <n-button class="page__btn" @click="openCreate">
          <template #icon><span>＋</span></template>
          新建工具
        </n-button>
      </div>

      <div class="page__list animate-slideIn" style="animation-delay:50ms">
        <n-spin :show="loading">
          <div v-if="tools.length === 0 && !loading" class="empty">
            <span class="empty__icon">🔧</span>
            <p class="empty__title">还没有工具</p>
            <p class="empty__desc">点击「新建工具」添加，名称匹配内置工具时自动绑定 execute</p>
          </div>
          <div v-for="tool in tools" :key="tool.id" class="card">
            <div class="card__body">
              <div class="card__info">
                <div class="card__name-row">
                  <span class="card__name">{{ tool.name }}</span>
                  <span v-if="tool.label" class="card__label">{{ tool.label }}</span>
                  <n-tag :type="tool.enabled ? 'success' : 'default'" size="small" :bordered="false">
                    {{ tool.enabled ? '已启用' : '已禁用' }}
                  </n-tag>
                </div>
                <p class="card__desc">{{ tool.description || '暂无描述' }}</p>
                <p v-if="tool.instruction" class="card__instruction">
                  <span class="card__instruction-label">指令：</span>{{ tool.instruction }}
                </p>
              </div>
              <div class="card__actions">
                <n-switch :value="!!tool.enabled" size="small" @update:value="toggleEnabled(tool)" />
                <n-button size="tiny" quaternary @click="editTool(tool)">编辑</n-button>
                <n-button size="tiny" quaternary type="error" @click="removeTool(tool)">删除</n-button>
              </div>
            </div>
          </div>
        </n-spin>
      </div>

      <n-modal v-model:show="showModal" preset="card" :title="editing ? '编辑工具' : '新建工具'" style="width:560px" :mask-closable="false">
        <n-form label-placement="top">
          <n-form-item label="名称" required>
            <n-input v-model:value="form.name" placeholder="匹配内置工具名时自动绑定 execute" />
          </n-form-item>
          <n-form-item label="标签">
            <n-input v-model:value="form.label" placeholder="显示标签" />
          </n-form-item>
          <n-form-item label="描述">
            <n-input type="textarea" v-model:value="form.description" :rows="3" placeholder="工具描述" />
          </n-form-item>
          <n-form-item label="指令">
            <n-input type="textarea" v-model:value="form.instruction" :rows="4" placeholder="自定义指令（可选）" />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" @click="saveTool">保存</n-button>
          </n-space>
        </template>
      </n-modal>
    </div>
  </AppLayout>
</template>

<style scoped>
.page {
  height: 100%; display: flex; flex-direction: column;
  position: relative; background: var(--bg-primary);
}
.page__bg {
  position: absolute; inset: 0;
  background: var(--bg-content-gradient); pointer-events: none;
}
.page__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 32px 28px 0; max-width: 900px; width: 100%;
  margin: 0 auto 24px; position: relative; z-index: 1;
}
.page__header-text { display: flex; flex-direction: column; gap: 2px; }
.page__title { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin: 0; }
.page__sub { font-size: 0.875rem; color: var(--text-muted); margin: 0; }
.page__btn {
  background: var(--accent-gradient) !important; border: none !important;
  box-shadow: 0 4px 14px rgba(245,158,11,.3); font-weight: 600; transition: all .2s ease;
}
.page__btn:hover { box-shadow: 0 6px 20px rgba(245,158,11,.4); transform: translateY(-1px); }

.page__list {
  flex: 1; overflow-y: auto; min-height: 0;
  padding: 0 28px 32px; max-width: 900px; width: 100%;
  margin: 0 auto; position: relative; z-index: 1;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  margin-bottom: 8px;
  transition: all .15s ease;
}
.card:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 12px rgba(0,0,0,.06);
}
.card__body {
  display: flex; align-items: flex-start;
  padding: 16px 20px; gap: 16px;
}
.card__info { flex: 1; min-width: 0; }
.card__name-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;
}
.card__name { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
.card__label { font-size: 0.75rem; color: var(--accent-primary); background: rgba(245,158,11,.1); padding: 1px 8px; border-radius: 4px; }
.card__desc { font-size: 0.8125rem; color: var(--text-muted); margin: 0; line-height: 1.5; }
.card__instruction { font-size: 0.8125rem; color: var(--text-secondary); margin: 6px 0 0; line-height: 1.5;
  padding: 8px 12px; background: var(--bg-secondary); border-radius: 6px;
}
.card__instruction-label { font-weight: 600; color: var(--text-muted); }
.card__actions {
  display: flex; align-items: center; gap: 4px; flex-shrink: 0; padding-top: 2px;
}

.empty {
  text-align: center; padding: 60px 20px;
}
.empty__icon { font-size: 2.5rem; display: block; margin-bottom: 12px; }
.empty__title { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.empty__desc { font-size: 0.875rem; color: var(--text-muted); margin: 0; }

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slideIn { animation: slideIn .35s ease-out forwards; }
</style>
