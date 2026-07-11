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
  { title: '名称', key: 'name', width: 150 },
  { title: '标签', key: 'label', width: 120 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true }, width: 250 },
  { title: '指令', key: 'instruction', ellipsis: { tooltip: true }, width: 200 },
  { title: '启用', key: 'enabled', width: 70, render: (row: ToolConfig) => row.enabled ? '✅' : '❌' },
  {
    title: '操作', key: 'actions', width: 120,
    render: (row: ToolConfig) => h('div', { style: 'display:flex;gap:8px' }, [
      h('n-button', { size: 'small', onClick: () => editTool(row) }, { default: () => '编辑' }),
      h('n-button', { size: 'small', type: 'error', onClick: () => removeTool(row) }, { default: () => '删除' }),
    ]),
  },
]


async function fetchTools() {
  loading.value = true
  const { data } = await api.get('/tool-config/list')
  tools.value = data
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
  if (editing.value) {
    await api.put(`/tool-config/${editing.value.id}`, form.value)
    message.success('更新成功')
  } else {
    await api.post('/api/tool-config', form.value)
    message.success('创建成功')
  }
  showModal.value = false
  await fetchTools()
}

function removeTool(tool: ToolConfig) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除工具「${tool.name}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.delete(`/tool-config/${tool.id}`)
      message.success('已删除')
      await fetchTools()
    },
  })
}

onMounted(fetchTools)
</script>

<template>
  <AppLayout>
    <div class="page">
      <div class="page-header">
        <h1>工具管理</h1>
        <n-button type="primary" @click="openCreate">新建工具</n-button>
      </div>
      <n-spin :show="loading">
        <n-data-table :columns="columns" :data="tools" :bordered="false" :single-line="false" />
      </n-spin>

      <n-modal v-model:show="showModal" :title="editing ? '编辑工具' : '新建工具'">
        <n-form label-placement="top">
          <n-form-item label="名称">
            <n-input v-model:value="form.name" placeholder="工具名称" />
          </n-form-item>
          <n-form-item label="标签">
            <n-input v-model:value="form.label" placeholder="显示标签" />
          </n-form-item>
          <n-form-item label="描述">
            <n-input type="textarea" v-model:value="form.description" :rows="3" placeholder="工具描述" />
          </n-form-item>
          <n-form-item label="指令">
            <n-input type="textarea" v-model:value="form.instruction" :rows="4" placeholder="自定义指令" />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-form>
        <template #action>
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
.page { padding: 32px 28px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h1 { font-size: 1.5rem; font-weight: 700; }
</style>
