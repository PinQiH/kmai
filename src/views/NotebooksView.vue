<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import StatePanel from '@/components/StatePanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useNotebooksStore } from '@/stores/notebooks'

const router = useRouter()
const notebooksStore = useNotebooksStore()
const isCreateOpen = ref(false)
const name = ref('')
const description = ref('')
const nameError = ref('')

async function createNotebook(): Promise<void> {
	nameError.value = ''
	if (!name.value.trim()) {
		nameError.value = '請輸入筆記本名稱，方便之後辨識內容。'
		return
	}
	const notebookId = notebooksStore.createNotebook({ name: name.value, description: description.value })
	if (!notebookId) return
	isCreateOpen.value = false
	name.value = ''
	description.value = ''
	await router.push(`/notebooks/${notebookId}`)
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="個人知識空間" title="個人筆記本" description="整理自己的文件，並與指定成員或群組協作。">
			<template #actions>
				<VBtn color="primary" prepend-icon="mdi-notebook-plus-outline" @click="isCreateOpen = true">建立筆記本</VBtn>
			</template>
		</PageHeader>

		<StatePanel
			v-if="notebooksStore.notebooks.length === 0"
			icon="mdi-notebook-outline"
			title="還沒有個人筆記本"
			description="建立第一本筆記本，開始上傳並整理自己的文件。"
			action-label="建立筆記本"
			@action="isCreateOpen = true"
		/>
		<div v-else class="notebook-grid">
			<VCard v-for="notebook in notebooksStore.notebooks" :key="notebook.id" :to="`/notebooks/${notebook.id}`" class="notebook-card" variant="flat">
				<VCardText>
					<div class="card-icon"><VIcon icon="mdi-notebook-outline" color="primary" /></div>
					<h2>{{ notebook.name }}</h2>
					<p>{{ notebook.description || '尚未新增說明。' }}</p>
					<div class="card-meta">
						<span>{{ notebook.documents.length }} 份文件</span>
						<span>{{ notebook.members.length }} 位成員</span>
						<span>{{ notebook.defaultWebSearchEnabled ? '預設搜尋網路' : '僅搜尋內部文件' }}</span>
					</div>
				</VCardText>
			</VCard>
		</div>

		<VDialog v-model="isCreateOpen" max-width="520">
			<VCard class="pa-6">
				<h2 class="section-heading">建立個人筆記本</h2>
				<p class="form-hint">建立後預設只有你能存取，稍後可以再邀請成員。</p>
				<VTextField v-model="name" label="筆記本名稱" :error-messages="nameError" maxlength="60" class="mt-5" @blur="nameError = name.trim() ? '' : nameError" />
				<VTextarea v-model="description" label="用途說明（選填）" rows="3" maxlength="160" counter />
				<div class="dialog-actions">
					<VBtn variant="text" @click="isCreateOpen = false">取消</VBtn>
					<VBtn color="primary" @click="createNotebook">建立</VBtn>
				</div>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.page-shell { width: min(100%, var(--content-max-width)); margin: 0 auto; padding: var(--space-xl); }
.notebook-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: var(--space-md); }
.notebook-card { border: 1px solid rgb(var(--v-theme-outline)); transition: border-color var(--motion-fast), transform var(--motion-fast); }
.notebook-card:hover { border-color: rgba(var(--v-theme-primary), 0.55); transform: translateY(-2px); }
.card-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: var(--space-md); border-radius: var(--radius-md); background: var(--tint-active); }
.notebook-card h2 { color: var(--ink-strong); font-size: 1.05rem; }
.notebook-card p { min-height: 3em; margin-top: var(--space-xs); color: var(--ink-muted); font-size: 0.85rem; }
.card-meta { display: flex; flex-wrap: wrap; gap: var(--space-sm); margin-top: var(--space-lg); color: var(--ink-subtle); font-size: 0.72rem; }
.form-hint { margin-top: var(--space-xs); color: var(--ink-muted); font-size: 0.85rem; }
.dialog-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md); }
@media (max-width: 600px) { .page-shell { padding: var(--space-md); } }
</style>
