<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import { api } from '@/api'

interface ToolConfig { id: number; name: string; label: string; description: string; instruction: string; enabled: number }

const message = useMessage()
const dialog = useDialog()
const tools = ref<ToolConfig[]>([])
const loading = ref(false)
const showModal = ref(false)
const editing = ref<ToolConfig | null>(null)
const form = ref({ name: '', label: '', description: '', instruction: '', enabled: 1 })

async function fetchTools() {
  loading.value = true
  try { const { data } = await api.get('/tool-config/list'); tools.value = data } catch { message.error('加载失败') }
  loading.value = false
}
function openCreate() { editing.value = null; form.value = { name: '', label: '', description: '', instruction: '', enabled: 1 }; showModal.value = true }
function editTool(tool: ToolConfig) { editing.value = tool; form.value = { ...tool }; showModal.value = true }
async function saveTool() {
  if (!form.value.name) { message.warning('名称不能为空'); return }
  try {
    if (editing.value) await api.put(`/tool-config/${editing.value.id}`, form.value)
    else await api.post('/tool-config', form.value)
    message.success(editing.value ? '已更新' : '已创建'); showModal.value = false; await fetchTools()
  } catch { message.error('保存失败') }
}
function removeTool(tool: ToolConfig) {
  dialog.warning({ title: '确认删除', content: `确定删除「${tool.name}」？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { try { await api.delete(`/tool-config/${tool.id}`); message.success('已删除'); await fetchTools() } catch { message.error('删除失败') } } })
}
function toggleEnabled(tool: ToolConfig) {
  const next = tool.enabled ? 0 : 1
  api.put(`/tool-config/${tool.id}`, { ...tool, enabled: next }).then(() => { tool.enabled = next }).catch(() => message.error('操作失败'))
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
          <p class="page__sub">管理 Agent 工具 · 共 {{ tools.length }} 个</p>
        </div>
        <n-button class="page__btn" @click="openCreate"><template #icon><span>＋</span></template>新建工具</n-button>
      </div>
      <div class="page__content animate-slideIn" style="animation-delay:50ms">
        <n-spin :show="loading">
          <div v-if="tools.length === 0 && !loading" class="empty">
            <span class="empty__icon">🔧</span>
            <p class="empty__title">还没有工具</p>
            <p class="empty__desc">点击「新建工具」添加，名称匹配内置工具时自动绑定 execute</p>
          </div>
          <div class="grid">
            <div v-for="tool in tools" :key="tool.id" class="card" :class="{ 'card--off': !tool.enabled }">
              <div class="card__top">
                <n-switch :value="!!tool.enabled" size="small" @update:value="toggleEnabled(tool)" />
                <div class="card__actions">
                  <n-button size="tiny" quaternary @click="editTool(tool)">编辑</n-button>
                  <n-button size="tiny" quaternary type="error" @click="removeTool(tool)">删除</n-button>
                </div>
              </div>
              <div v-if="tool.label" class="card__label">{{ tool.label }}</div>
              <div class="card__name">{{ tool.name }}</div>
              <div class="card__desc">{{ tool.description || '暂无描述' }}</div>
              <div v-if="tool.instruction" class="card__instruction">{{ tool.instruction }}</div>
            </div>
          </div>
        </n-spin>
      </div>
      <n-modal v-model:show="showModal" preset="card" :title="editing ? '编辑工具' : '新建工具'" style="width:560px" :mask-closable="false">
        <n-form label-placement="top">
          <n-form-item label="名称" required><n-input v-model:value="form.name" placeholder="匹配内置工具名时自动绑定 execute" /></n-form-item>
          <n-form-item label="标签"><n-input v-model:value="form.label" placeholder="显示标签" /></n-form-item>
          <n-form-item label="描述"><n-input type="textarea" v-model:value="form.description" :rows="3" placeholder="工具描述" /></n-form-item>
          <n-form-item label="指令"><n-input type="textarea" v-model:value="form.instruction" :rows="4" placeholder="自定义指令（可选）" /></n-form-item>
          <n-form-item label="启用"><n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="showModal = false">取消</n-button><n-button type="primary" @click="saveTool">保存</n-button></n-space></template>
      </n-modal>
    </div>
  </AppLayout>
</template>

<style scoped>
.page { height: 100%; display: flex; flex-direction: column; position: relative; background: var(--bg-primary); }
.page__bg { position: absolute; inset: 0; background: var(--bg-content-gradient); pointer-events: none; }
.page__header { display: flex; align-items: center; justify-content: space-between; padding: 32px 28px 0; max-width: 1100px; width: 100%; margin: 0 auto 24px; position: relative; z-index: 1; }
.page__header-text { display: flex; flex-direction: column; gap: 2px; }
.page__title { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin: 0; }
.page__sub { font-size: 0.875rem; color: var(--text-muted); margin: 0; }
.page__btn { background: var(--accent-gradient) !important; border: none !important; box-shadow: 0 4px 14px rgba(245,158,11,.3); font-weight: 600; transition: all .2s ease; }
.page__btn:hover { box-shadow: 0 6px 20px rgba(245,158,11,.4); transform: translateY(-1px); }
.page__content { flex: 1; overflow-y: auto; min-height: 0; padding: 0 28px 32px; max-width: 1100px; width: 100%; margin: 0 auto; position: relative; z-index: 1; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.card { background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px 20px 16px; display: flex; flex-direction: column; gap: 8px; transition: all .15s ease; }
.card:hover { border-color: var(--accent-primary); box-shadow: 0 4px 16px rgba(0,0,0,.08); transform: translateY(-1px); }
.card--off { opacity: .55; }
.card--off:hover { opacity: .75; }
.card__top { display: flex; align-items: center; justify-content: space-between; }
.card__actions { display: flex; gap: 2px; }
.card__label { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.card__name { font-size: 0.75rem; color: var(--accent-primary); background: rgba(245,158,11,.1); padding: 1px 8px; border-radius: 4px; align-self: flex-start; }
.card__desc { font-size: 0.8125rem; color: var(--text-muted); line-height: 1.5; margin: 0; }
.card__instruction { font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.5; padding: 10px 12px; background: var(--bg-secondary); border-radius: 8px; }
.empty { text-align: center; padding: 80px 20px; grid-column: 1 / -1; }
.empty__icon { font-size: 3rem; display: block; margin-bottom: 16px; }
.empty__title { font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin: 0 0 6px; }
.empty__desc { font-size: 0.875rem; color: var(--text-muted); margin: 0; }
@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.animate-slideIn { animation: slideIn .35s ease-out forwards; }
</style>
