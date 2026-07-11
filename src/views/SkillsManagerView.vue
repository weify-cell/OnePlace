<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import { api } from '@/api'

interface SkillConfig { id: number; name: string; path: string; enabled: number }

const message = useMessage()
const dialog = useDialog()
const skills = ref<SkillConfig[]>([])
const loading = ref(false)
const showModal = ref(false)
const showEditor = ref(false)
const editing = ref<SkillConfig | null>(null)
const form = ref({ name: '', path: '', enabled: 1 })
const fileContent = ref('')
const editorLoading = ref(false)

async function fetchSkills() {
  loading.value = true
  try { const { data } = await api.get('/skill-config/list'); skills.value = data }
  catch { message.error('加载失败') }
  loading.value = false
}
function openCreate() { editing.value = null; form.value = { name: '', path: '', enabled: 1 }; showModal.value = true }
function editSkill(skill: SkillConfig) { editing.value = skill; form.value = { ...skill }; showModal.value = true }

async function openEditor(skill: SkillConfig) {
  editorLoading.value = true; showEditor.value = true; editing.value = skill
  try { const { data } = await api.get(`/skill-config/${skill.id}/file`); fileContent.value = data.content || '' }
  catch { fileContent.value = '' }
  editorLoading.value = false
}

async function saveFile() {
  if (!editing.value) return
  try { await api.put(`/skill-config/${editing.value.id}/file`, { content: fileContent.value }); message.success('已保存'); showEditor.value = false }
  catch { message.error('保存失败') }
}

async function saveSkill() {
  if (!form.value.name) { message.warning('名称不能为空'); return }
  try {
    if (editing.value) await api.put(`/skill-config/${editing.value.id}`, form.value)
    else await api.post('/skill-config', form.value)
    message.success(editing.value ? '已更新' : '已创建'); showModal.value = false; await fetchSkills()
  } catch { message.error('保存失败') }
}

function removeSkill(skill: SkillConfig) {
  dialog.warning({
    title: '确认删除', content: `确定删除「${skill.name}」？（同时删除文件）`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.delete(`/skill-config/${skill.id}`); message.success('已删除'); await fetchSkills() }
      catch { message.error('删除失败') }
    },
  })
}

function toggleEnabled(skill: SkillConfig) {
  const next = skill.enabled ? 0 : 1
  api.put(`/skill-config/${skill.id}`, { ...skill, enabled: next })
    .then(() => { skill.enabled = next; message.success(next ? '已启用' : '已禁用') })
    .catch(() => message.error('操作失败'))
}

onMounted(fetchSkills)
</script>

<template>
  <AppLayout>
    <div class="page">
      <div class="page__bg" />

      <div class="page__header animate-slideIn">
        <div class="page__header-text">
          <h1 class="page__title">技能管理</h1>
          <p class="page__sub">管理 Skills 文件 · 共 {{ skills.length }} 个</p>
        </div>
        <n-button class="page__btn" @click="openCreate">
          <template #icon><span>＋</span></template>
          新建技能
        </n-button>
      </div>

      <div class="page__list animate-slideIn" style="animation-delay:50ms">
        <n-spin :show="loading">
          <div v-if="skills.length === 0 && !loading" class="empty">
            <span class="empty__icon">📋</span>
            <p class="empty__title">还没有技能</p>
            <p class="empty__desc">点击「新建技能」添加，文件内容将注入 System Prompt</p>
          </div>
          <div v-for="skill in skills" :key="skill.id" class="card">
            <div class="card__body">
              <div class="card__info">
                <div class="card__name-row">
                  <span class="card__name">{{ skill.name }}</span>
                  <n-tag :type="skill.enabled ? 'success' : 'default'" size="small" :bordered="false">
                    {{ skill.enabled ? '已启用' : '已禁用' }}
                  </n-tag>
                </div>
                <p class="card__meta">
                  <span class="card__meta-label">文件：</span>{{ skill.path }}
                </p>
              </div>
              <div class="card__actions">
                <n-switch :value="!!skill.enabled" size="small" @update:value="toggleEnabled(skill)" />
                <n-button size="tiny" quaternary @click="openEditor(skill)">编辑文件</n-button>
                <n-button size="tiny" quaternary @click="editSkill(skill)">设置</n-button>
                <n-button size="tiny" quaternary type="error" @click="removeSkill(skill)">删除</n-button>
              </div>
            </div>
          </div>
        </n-spin>
      </div>

      <n-modal v-model:show="showModal" preset="card" :title="editing ? '编辑技能' : '新建技能'" style="width:500px" :mask-closable="false">
        <n-form label-placement="top">
          <n-form-item label="名称" required>
            <n-input v-model:value="form.name" placeholder="技能名称" />
          </n-form-item>
          <n-form-item label="文件路径" required>
            <n-input v-model:value="form.path" placeholder="如 guide.md" />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" @click="saveSkill">保存</n-button>
          </n-space>
        </template>
      </n-modal>

      <n-modal v-model:show="showEditor" preset="card" title="编辑技能文件" style="width:780px" :mask-closable="false">
        <n-spin :show="editorLoading">
          <n-input type="textarea" v-model:value="fileContent" :rows="22" placeholder="编写 Markdown 技能文件..." style="font-family:monospace" />
        </n-spin>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showEditor = false">取消</n-button>
            <n-button type="primary" @click="saveFile">保存文件</n-button>
          </n-space>
        </template>
      </n-modal>
    </div>
  </AppLayout>
</template>

<style scoped>
.page { height: 100%; display: flex; flex-direction: column; position: relative; background: var(--bg-primary); }
.page__bg { position: absolute; inset: 0; background: var(--bg-content-gradient); pointer-events: none; }
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

.page__list { flex: 1; overflow-y: auto; min-height: 0; padding: 0 28px 32px; max-width: 900px; width: 100%; margin: 0 auto; position: relative; z-index: 1; }

.card {
  background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 12px;
  margin-bottom: 8px; transition: all .15s ease;
}
.card:hover { border-color: var(--accent-primary); box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.card__body { display: flex; align-items: flex-start; padding: 16px 20px; gap: 16px; }
.card__info { flex: 1; min-width: 0; }
.card__name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.card__name { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
.card__meta { font-size: 0.8125rem; color: var(--text-muted); margin: 0; }
.card__meta-label { font-weight: 600; }
.card__actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; padding-top: 2px; }

.empty { text-align: center; padding: 60px 20px; }
.empty__icon { font-size: 2.5rem; display: block; margin-bottom: 12px; }
.empty__title { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.empty__desc { font-size: 0.875rem; color: var(--text-muted); margin: 0; }

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slideIn { animation: slideIn .35s ease-out forwards; }
</style>
