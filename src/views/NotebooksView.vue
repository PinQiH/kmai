<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import StatePanel from '@/components/StatePanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useConversationStore } from '@/stores/conversation'
import { useNotebooksStore } from '@/stores/notebooks'
import type { Notebook } from '@/types'

const router = useRouter()
const conversationStore = useConversationStore()
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

async function askNotebook(notebook: Notebook): Promise<void> {
	conversationStore.startNewConversation()
	conversationStore.selectKnowledgeSource({
		id: notebook.id,
		name: notebook.name,
		defaultWebSearchEnabled: notebook.defaultWebSearchEnabled,
	})
	conversationStore.clearSelectedDocuments()
	await router.push('/ask')
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
			<VCard v-for="notebook in notebooksStore.notebooks" :key="notebook.id" class="notebook-card" variant="flat">
				<VCardText class="notebook-card-content">
					<div class="card-icon"><VIcon icon="mdi-notebook-outline" color="primary" /></div>
					<h2><RouterLink :to="`/notebooks/${notebook.id}`" class="card-title-link" :data-testid="`open-notebook-${notebook.id}`">{{ notebook.name }}</RouterLink></h2>
					<p class="card-description">{{ notebook.description || '尚未新增說明。' }}</p>
					<div class="card-meta">
						<span>{{ notebook.documents.length }} 份文件</span>
						<span>{{ notebook.members.length }} 位成員</span>
						<span>{{ notebook.defaultWebSearchEnabled ? '預設搜尋網路' : '僅搜尋內部文件' }}</span>
					</div>
				</VCardText>
				<VCardActions class="notebook-card-actions">
					<VBtn color="primary" variant="text" prepend-icon="mdi-message-question-outline" :data-testid="`ask-notebook-${notebook.id}`" @click.stop="askNotebook(notebook)">詢問</VBtn>
					<span class="card-open-hint" aria-hidden="true">開啟筆記本<VIcon icon="mdi-arrow-right" size="16" /></span>
				</VCardActions>
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
.notebook-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 340px)); gap: var(--space-md); }
.notebook-card { position: relative; border: 1px solid rgb(var(--v-theme-outline)); cursor: pointer; transition: border-color var(--motion-fast), transform var(--motion-fast); }
.notebook-card:hover { border-color: rgba(var(--v-theme-primary), 0.55); transform: translateY(-2px); }
.notebook-card-content { padding-bottom: var(--space-sm); }
.card-icon { display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: 12px; border-radius: var(--radius-md); background: var(--tint-active); }
.notebook-card h2 { color: var(--ink-strong); font-size: 1.05rem; }
.card-title-link { color: inherit; text-decoration: none; }
.card-title-link::after { position: absolute; z-index: 1; content: ''; inset: 0; border-radius: inherit; }
.card-title-link:focus-visible { outline: none; }
.card-title-link:focus-visible::after { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.notebook-card:hover .card-title-link { color: rgb(var(--v-theme-primary)); }
.card-description { display: -webkit-box; min-height: 2.8em; margin-top: var(--space-xs); overflow: hidden; color: var(--ink-muted); font-size: 0.82rem; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.card-meta { display: flex; flex-wrap: wrap; gap: 6px var(--space-sm); margin-top: 12px; color: var(--ink-subtle); font-size: 0.7rem; }
.notebook-card-actions { justify-content: space-between; min-height: 44px; padding: 0 10px 8px; }
.notebook-card-actions :deep(.v-btn) { position: relative; z-index: 2; }
.card-open-hint { display: inline-flex; align-items: center; gap: var(--space-xs); color: var(--ink-muted); font-size: 0.75rem; }
.form-hint { margin-top: var(--space-xs); color: var(--ink-muted); font-size: 0.85rem; }
.dialog-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md); }
@media (max-width: 600px) { .page-shell { padding: var(--space-md); } }
</style>
