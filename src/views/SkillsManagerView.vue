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
  dialog.warning({ title: '确认删除', content: `确定删除「${skill.name}」？（同时删除文件）`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { try { await api.delete(`/skill-config/${skill.id}`); message.success('已删除'); await fetchSkills() } catch { message.error('删除失败') } } })
}
function toggleEnabled(skill: SkillConfig) {
  const next = skill.enabled ? 0 : 1
  api.put(`/skill-config/${skill.id}`, { ...skill, enabled: next })
    .then(() => { skill.enabled = next })
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

      <div class="page__content animate-slideIn" style="animation-delay:50ms">
        <n-spin :show="loading">
          <div v-if="skills.length === 0 && !loading" class="empty">
            <span class="empty__icon">📋</span>
            <p class="empty__title">还没有技能</p>
            <p class="empty__desc">点击「新建技能」添加，文件内容将注入 System Prompt</p>
          </div>
          <div class="grid">
            <div v-for="skill in skills" :key="skill.id" class="card" :class="{ 'card--off': !skill.enabled }">
              <div class="card__top">
                <n-switch :value="!!skill.enabled" size="small" @update:value="toggleEnabled(skill)" />
                <div class="card__actions">
                  <n-button size="tiny" quaternary @click="openEditor(skill)">编辑文件</n-button>
                  <n-button size="tiny" quaternary @click="editSkill(skill)">设置</n-button>
                  <n-button size="tiny" quaternary type="error" @click="removeSkill(skill)">删除</n-button>
                </div>
              </div>
              <div class="card__name">{{ skill.name }}</div>
              <div class="card__file">
                <span class="card__file-icon">📄</span>
                <span class="card__file-path">{{ skill.path }}</span>
              </div>
            </div>
          </div>
        </n-spin>
      </div>

      <n-modal v-model:show="showModal" preset="card" :title="editing ? '编辑技能' : '新建技能'" style="width:500px" :mask-closable="false">
        <n-form label-placement="top">
          <n-form-item label="名称" required><n-input v-model:value="form.name" placeholder="技能名称" /></n-form-item>
          <n-form-item label="文件路径" required><n-input v-model:value="form.path" placeholder="如 guide.md" /></n-form-item>
          <n-form-item label="启用"><n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end"><n-button @click="showModal = false">取消</n-button><n-button type="primary" @click="saveSkill">保存</n-button></n-space>
        </template>
      </n-modal>

      <n-modal v-model:show="showEditor" preset="card" title="编辑技能文件" style="width:780px" :mask-closable="false">
        <n-spin :show="editorLoading">
          <n-input type="textarea" v-model:value="fileContent" :rows="22" placeholder="编写 Markdown 技能文件..." style="font-family:monospace" />
        </n-spin>
        <template #footer>
          <n-space justify="end"><n-button @click="showEditor = false">取消</n-button><n-button type="primary" @click="saveFile">保存文件</n-button></n-space>
        </template>
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

.card {
  background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px 20px 16px;
  display: flex; flex-direction: column; gap: 8px; transition: all .15s ease;
}
.card:hover { border-color: var(--accent-primary); box-shadow: 0 4px 16px rgba(0,0,0,.08); transform: translateY(-1px); }
.card--off { opacity: .55; }
.card--off:hover { opacity: .75; }
.card__top { display: flex; align-items: center; justify-content: space-between; }
.card__actions { display: flex; gap: 2px; }
.card__name { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.card__file { display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; color: var(--text-muted); }
.card__file-icon { font-size: 0.875rem; }
.card__file-path { font-family: monospace; }

.empty { text-align: center; padding: 80px 20px; grid-column: 1 / -1; }
.empty__icon { font-size: 3rem; display: block; margin-bottom: 16px; }
.empty__title { font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin: 0 0 6px; }
.empty__desc { font-size: 0.875rem; color: var(--text-muted); margin: 0; }

@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.animate-slideIn { animation: slideIn .35s ease-out forwards; }
</style>
