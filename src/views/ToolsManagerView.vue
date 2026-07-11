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

const columns = [
  { title: '名称', key: 'name', width: 140 },
  { title: '标签', key: 'label', width: 100 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  {
    title: '启用', key: 'enabled', width: 80,
    render: (row: ToolConfig) => row.enabled
      ? h('span', { class: 'text-[#18a058]' }, '已启用')
      : h('span', { class: 'text-[var(--text-muted)]' }, '已禁用'),
  },
  {
    title: '操作', key: 'actions', width: 120,
    render: (row: ToolConfig) =>
      h('div', { style: { display: 'flex', gap: '8px' } }, [
        h('n-button', { size: 'tiny', quaternary: true, onClick: () => editTool(row) }, { default: () => '编辑' }),
        h('n-button', { size: 'tiny', quaternary: true, type: 'error', onClick: () => removeTool(row) }, { default: () => '删除' }),
      ]),
  },
]

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
    showModal.value = false
    await fetchTools()
  } catch { message.error('保存失败') }
}

function removeTool(tool: ToolConfig) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除「${tool.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.delete(`/tool-config/${tool.id}`); message.success('已删除'); await fetchTools() }
      catch { message.error('删除失败') }
    },
  })
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
          <p class="page__sub">管理 Agent 可用的工具，匹配内置工具名自动绑定 execute</p>
        </div>
        <n-button class="page__btn" @click="openCreate">
          <template #icon><span>＋</span></template>
          新建工具
        </n-button>
      </div>

      <div class="page__table animate-slideIn" style="animation-delay:50ms">
        <n-spin :show="loading">
          <n-data-table :columns="columns" :data="tools" :bordered="false" :single-line="false" size="small" />
        </n-spin>
      </div>

      <n-modal v-model:show="showModal" preset="card" :title="editing ? '编辑工具' : '新建工具'" style="width:560px" :mask-closable="false">
        <n-form label-placement="top">
          <n-form-item label="名称" required>
            <n-input v-model:value="form.name" placeholder="工具名称，匹配内置工具名自动绑定 execute" />
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
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg-primary);
}
.page__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-content-gradient);
  pointer-events: none;
}
.page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32px 28px 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto 20px;
  position: relative;
  z-index: 1;
}
.page__header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.page__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}
.page__sub {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0;
}
.page__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245,158,11,.3);
  font-weight: 600;
  transition: all .2s ease;
}
.page__btn:hover {
  box-shadow: 0 6px 20px rgba(245,158,11,.4);
  transform: translateY(-1px);
}
.page__table {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 28px 32px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slideIn {
  animation: slideIn .35s ease-out forwards;
}

:deep(.n-data-table) {
  --n-td-padding: 12px 16px;
}
:deep(.n-data-table-th) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted) !important;
  background: transparent !important;
  border-bottom: 1px solid var(--border-subtle) !important;
}
:deep(.n-data-table-td) {
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border-subtle) !important;
}
:deep(.n-data-table-tr:hover) {
  background: var(--hover-bg) !important;
}
</style>
