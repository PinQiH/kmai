<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import StatePanel from '@/components/StatePanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useNotebooksStore } from '@/stores/notebooks'
import type { NotebookCollaboratorRole, NotebookMemberType, NotebookRole } from '@/types'

const route = useRoute()
const notebooksStore = useNotebooksStore()
const notebook = computed(() => notebooksStore.notebooks.find((item) => item.id === String(route.params.id)))
const currentUserRole = computed(() => notebook.value ? notebooksStore.getCurrentUserRole(notebook.value.id) : null)
const canEditContent = computed(() => notebook.value ? notebooksStore.canEditContent(notebook.value.id) : false)
const canManageSharing = computed(() => notebook.value ? notebooksStore.canManageSharing(notebook.value.id) : false)
const fileInput = ref<HTMLInputElement>()
const isShareOpen = ref(false)
const memberName = ref('')
const memberType = ref<NotebookMemberType>('user')
const memberRole = ref<NotebookCollaboratorRole>('viewer')
const memberError = ref('')

const roleLabels: Record<NotebookRole, string> = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' }

function handleFiles(event: Event): void {
	const input = event.target as HTMLInputElement
	if (!notebook.value || !input.files?.length) return
	notebooksStore.addDocuments({ notebookId: notebook.value.id, files: Array.from(input.files) })
	input.value = ''
}

function addMember(): void {
	if (!notebook.value) return
	memberError.value = ''
	const trimmedName = memberName.value.trim()
	if (!trimmedName) {
		memberError.value = `請輸入要分享的${memberType.value === 'user' ? '成員' : '群組'}名稱。`
		return
	}
	if (notebook.value.members.some((member) => member.name === trimmedName && member.type === memberType.value)) {
		memberError.value = '這個分享對象已經在筆記本中。'
		return
	}
	notebooksStore.addMember({ notebookId: notebook.value.id, member: { id: crypto.randomUUID(), name: trimmedName, type: memberType.value, role: memberRole.value } })
	memberName.value = ''
}

function updateMemberRole(memberId: string, role: NotebookCollaboratorRole | null): void {
	if (!notebook.value || !role) return
	notebooksStore.updateMemberRole({ notebookId: notebook.value.id, memberId, role })
}

function removeMember(memberId: string, memberNameToRemove: string): void {
	if (!notebook.value || !window.confirm(`確定要停止與「${memberNameToRemove}」分享這本筆記本嗎？`)) return
	notebooksStore.removeMember({ notebookId: notebook.value.id, memberId })
}

function updateDefaultWebSearch(isEnabled: boolean | null): void {
	if (!notebook.value || isEnabled === null) return
	notebooksStore.updateDefaultWebSearch({ notebookId: notebook.value.id, isEnabled })
}
</script>

<template>
	<div v-if="notebook" class="page-shell">
		<div class="breadcrumb"><RouterLink to="/notebooks">個人筆記本</RouterLink><VIcon icon="mdi-chevron-right" size="14" />{{ notebook.name }}</div>
		<PageHeader :title="notebook.name" :description="notebook.description || '尚未新增說明。'">
			<template #actions>
				<div class="heading-actions">
					<VBtn v-if="canManageSharing" variant="outlined" prepend-icon="mdi-account-multiple-plus-outline" @click="isShareOpen = true">分享</VBtn>
					<VBtn v-if="canEditContent" color="primary" prepend-icon="mdi-upload" @click="fileInput?.click()">上傳文件</VBtn>
				</div>
			</template>
		</PageHeader>
		<input ref="fileInput" class="visually-hidden" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md" @change="handleFiles">

		<div class="setting-strip">
			<div><strong>問答預設</strong><span>{{ notebook.defaultWebSearchEnabled ? '同時搜尋網路' : '只使用筆記本文件' }}</span></div>
			<VSwitch :model-value="notebook.defaultWebSearchEnabled" :disabled="!canManageSharing" color="primary" hide-details inset label="預設允許網路搜尋" @update:model-value="updateDefaultWebSearch" />
		</div>
		<VAlert v-if="currentUserRole === 'viewer'" type="info" variant="tonal" density="compact" class="mb-5">你目前是檢視者，可以查看文件並用於問答，但不能上傳或調整分享設定。</VAlert>

		<StatePanel v-if="notebook.documents.length === 0" icon="mdi-file-upload-outline" title="筆記本裡還沒有文件" :description="canEditContent ? '上傳 PDF、Word、文字或 Markdown 文件，之後即可用這本筆記本問答。' : '目前沒有可查看的文件，請聯絡筆記本擁有者。'" :action-label="canEditContent ? '上傳第一份文件' : undefined" @action="fileInput?.click()" />
		<VTable v-else class="document-table">
			<thead><tr><th>文件</th><th>大小</th><th>上傳日期</th><th>狀態</th></tr></thead>
			<tbody><tr v-for="document in notebook.documents" :key="document.id"><td><VIcon icon="mdi-file-document-outline" size="18" class="mr-2" />{{ document.name }}</td><td>{{ document.size }}</td><td>{{ document.uploadedAt }}</td><td><VChip size="x-small" color="success" variant="tonal">可使用</VChip></td></tr></tbody>
		</VTable>

		<VDialog v-model="isShareOpen" max-width="640">
			<VCard class="pa-6">
				<h2 class="section-heading">分享「{{ notebook.name }}」</h2>
				<p class="dialog-hint">只有受邀的公司成員或群組能查看內容。</p>
				<div class="invite-form">
					<VSelect v-model="memberType" label="分享對象" :items="[{ title: '公司成員', value: 'user' }, { title: '公司群組', value: 'group' }]" />
					<VTextField v-model="memberName" :label="memberType === 'user' ? '成員名稱' : '群組名稱'" :error-messages="memberError" />
					<VSelect v-model="memberRole" label="權限" :items="[{ title: '檢視者', value: 'viewer' }, { title: '編輯者', value: 'editor' }]" />
					<VBtn color="primary" @click="addMember">加入</VBtn>
				</div>
				<VList lines="two" class="member-list">
					<VListItem v-for="member in notebook.members" :key="member.id" :title="member.name" :subtitle="`${member.type === 'group' ? '群組' : '成員'} · ${roleLabels[member.role]}`">
						<template v-if="member.role !== 'owner'" #append>
							<VSelect :model-value="member.role" density="compact" hide-details class="role-select" :items="[{ title: '檢視者', value: 'viewer' }, { title: '編輯者', value: 'editor' }]" @update:model-value="updateMemberRole(member.id, $event)" />
							<VBtn icon="mdi-account-remove-outline" variant="text" :aria-label="`停止與 ${member.name} 分享`" @click="removeMember(member.id, member.name)" />
						</template>
					</VListItem>
				</VList>
				<div class="dialog-actions"><VBtn color="primary" variant="tonal" @click="isShareOpen = false">完成</VBtn></div>
			</VCard>
		</VDialog>
	</div>
	<StatePanel v-else class="ma-8" icon="mdi-notebook-remove-outline" title="找不到這本筆記本" description="筆記本可能已被移除，或你沒有查看權限。" action-label="返回個人筆記本" @action="$router.push('/notebooks')" />
</template>

<style scoped>
.page-shell { width: min(100%, var(--content-max-width)); margin: 0 auto; padding: var(--space-xl); }
.breadcrumb { display: flex; align-items: center; gap: var(--space-xs); margin-bottom: var(--space-md); color: var(--ink-muted); font-size: 0.78rem; }
.breadcrumb a { color: rgb(var(--v-theme-primary)); text-decoration: none; }
.dialog-hint { color: var(--ink-muted); }
.heading-actions,.dialog-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
.setting-strip { display: flex; align-items: center; justify-content: space-between; gap: var(--space-lg); margin-bottom: var(--space-lg); padding: var(--space-md) var(--space-lg); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); }
.setting-strip div { display: grid; gap: 2px; }.setting-strip span { color: var(--ink-muted); font-size: 0.78rem; }
.document-table { border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); }
.invite-form { display: grid; grid-template-columns: 140px minmax(0, 1fr) 130px auto; align-items: start; gap: var(--space-sm); margin-top: var(--space-lg); }
.member-list { margin: var(--space-sm) 0 var(--space-lg); border-top: 1px solid rgb(var(--v-theme-outline)); }.role-select { width: 120px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 760px) { .page-shell { padding: var(--space-md); }.setting-strip { align-items: stretch; flex-direction: column; }.invite-form { grid-template-columns: 1fr; }.heading-actions { flex-wrap: wrap; justify-content: flex-start; } }
</style>
