<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import DocumentSourcePreview from '@/components/DocumentSourcePreview.vue'
import NotebookKnowledgeGraph from '@/components/NotebookKnowledgeGraph.vue'
import StatePanel from '@/components/StatePanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import { buildNotebookKnowledgeGraph } from '@/mocks/notebookKnowledgeGraph'
import { useConversationStore } from '@/stores/conversation'
import { useNotebooksStore } from '@/stores/notebooks'
import type { AddNotebookSourceResult } from '@/stores/notebooks'
import type { NotebookCollaboratorRole, NotebookDocument, NotebookMemberType, NotebookRole, TextDocumentFormat } from '@/types'
import { getDocumentSourceIcon, getDocumentSourceLabel } from '@/utils/documentSources'
import { COMPANY_KNOWLEDGE_SOURCES, DEFAULT_ASK_SOURCE_ID } from '@/utils/knowledgeSources'

interface MemberRemovalTarget {
	id: string
	name: string
}

type NotebookContentTab = 'graph' | 'documents'

const route = useRoute()
const router = useRouter()
const display = useDisplay()
const conversationStore = useConversationStore()
const notebooksStore = useNotebooksStore()
const notebook = computed(() => notebooksStore.notebooks.find((item) => item.id === String(route.params.id)))
const currentUserRole = computed(() => notebook.value ? notebooksStore.getCurrentUserRole(notebook.value.id) : null)
const canEditContent = computed(() => notebook.value ? notebooksStore.canEditContent(notebook.value.id) : false)
const canManageSharing = computed(() => notebook.value ? notebooksStore.canManageSharing(notebook.value.id) : false)
const notebookKnowledgeGraph = computed(() => notebook.value ? buildNotebookKnowledgeGraph(notebook.value) : null)
const isMobileDocumentList = computed(() => display.width.value <= 760)
const fileInput = ref<HTMLInputElement>()
const fileSourceError = ref('')
const isShareOpen = ref(false)
const memberName = ref('')
const memberType = ref<NotebookMemberType>('user')
const memberRole = ref<NotebookCollaboratorRole>('viewer')
const memberError = ref('')
const memberRemovalTarget = ref<MemberRemovalTarget | null>(null)
const memberRemovalTriggerId = ref<string | null>(null)
const activeContentTab = ref<NotebookContentTab>('graph')
const isEditOpen = ref(false)
const editName = ref('')
const editDescription = ref('')
const editNameError = ref('')
const editDescriptionError = ref('')
const isDeleteOpen = ref(false)
const deleteError = ref('')
const selectedDocument = ref<NotebookDocument | null>(null)
const isTextSourceOpen = ref(false)
const textSourceTitle = ref('')
const textSourceFormat = ref<TextDocumentFormat>('markdown')
const textSourceContent = ref('')
const textSourceTitleError = ref('')
const textSourceContentError = ref('')
const isUrlSourceOpen = ref(false)
const urlSourceTitle = ref('')
const urlSourceValue = ref('')
const urlSourceError = ref('')

const roleLabels: Record<NotebookRole, string> = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' }
const documentStatusPresentation: Record<NotebookDocument['status'], { label: string; color: 'success' | 'warning' | 'error' }> = {
	ready: { label: '可使用', color: 'success' },
	processing: { label: '處理中', color: 'warning' },
	failed: { label: '處理失敗', color: 'error' },
}

async function handleFiles(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement
	if (!notebook.value || !input.files?.length) return
	fileSourceError.value = ''
	const result = await notebooksStore.addDocuments({ notebookId: notebook.value.id, files: Array.from(input.files) })
	if (result !== 'added') fileSourceError.value = getAddSourceError(result, '請選擇可上傳的檔案。')
	input.value = ''
}

function openFilePicker(): void {
	fileSourceError.value = ''
	fileInput.value?.click()
}

function getAddSourceError(result: AddNotebookSourceResult, invalidMessage: string): string {
	switch (result) {
		case 'forbidden':
			return '你的編輯權限已變更，請重新整理後再試。'
		case 'not-found':
			return '找不到這本筆記本，可能已被刪除。'
		case 'invalid':
			return invalidMessage
		case 'added':
			return ''
	}
}

function openDocumentPreview(document: NotebookDocument): void {
	if (document.status !== 'ready') return
	selectedDocument.value = document
}

function closeDocumentPreview(): void {
	const documentId = selectedDocument.value?.id
	selectedDocument.value = null
	if (!documentId) return
	void nextTick(() => document.getElementById(`open-document-${documentId}`)?.focus({ preventScroll: true }))
}

function setDocumentPreviewOpen(isOpen: boolean): void {
	if (!isOpen) closeDocumentPreview()
}

function focusAddContentTrigger(): void {
	void nextTick(() => document.getElementById('add-notebook-content')?.focus({ preventScroll: true }))
}

function openTextSourceDialog(): void {
	textSourceTitle.value = ''
	textSourceFormat.value = 'markdown'
	textSourceContent.value = ''
	textSourceTitleError.value = ''
	textSourceContentError.value = ''
	isTextSourceOpen.value = true
}

function setTextSourceOpen(isOpen: boolean): void {
	isTextSourceOpen.value = isOpen
	if (isOpen) return
	textSourceTitleError.value = ''
	textSourceContentError.value = ''
	focusAddContentTrigger()
}

function addTextSource(): void {
	if (!notebook.value) return
	textSourceTitleError.value = textSourceTitle.value.trim() ? '' : '請輸入標題。'
	textSourceContentError.value = textSourceContent.value.trim() ? '' : '請輸入內容。'
	if (textSourceTitleError.value || textSourceContentError.value) return
	const result = notebooksStore.addTextDocument({
		notebookId: notebook.value.id,
		title: textSourceTitle.value,
		content: textSourceContent.value,
		format: textSourceFormat.value,
	})
	if (result !== 'added') {
		textSourceContentError.value = getAddSourceError(result, '文字內容格式不正確，請檢查後再試。')
		return
	}
	isTextSourceOpen.value = false
	focusAddContentTrigger()
}

function openUrlSourceDialog(): void {
	urlSourceTitle.value = ''
	urlSourceValue.value = ''
	urlSourceError.value = ''
	isUrlSourceOpen.value = true
}

function setUrlSourceOpen(isOpen: boolean): void {
	isUrlSourceOpen.value = isOpen
	if (isOpen) return
	urlSourceError.value = ''
	focusAddContentTrigger()
}

function addUrlSource(): void {
	if (!notebook.value) return
	const result = notebooksStore.addUrlDocument({
		notebookId: notebook.value.id,
		title: urlSourceTitle.value,
		url: urlSourceValue.value,
	})
	if (result !== 'added') {
		urlSourceError.value = getAddSourceError(result, '請輸入有效的 HTTP 或 HTTPS 網址。')
		return
	}
	isUrlSourceOpen.value = false
	focusAddContentTrigger()
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

function setShareDialogOpen(isOpen: boolean): void {
	if (!isOpen && memberRemovalTarget.value) {
		cancelMemberRemoval()
		return
	}
	isShareOpen.value = isOpen
	if (!isOpen) memberRemovalTriggerId.value = null
}

function requestMemberRemoval(memberId: string, memberNameToRemove: string): void {
	if (!notebook.value || !canManageSharing.value) return
	memberRemovalTriggerId.value = memberId
	memberRemovalTarget.value = { id: memberId, name: memberNameToRemove }
	void nextTick(() => document.querySelector<HTMLButtonElement>('[data-testid="keep-sharing-button"]')?.focus())
}

function cancelMemberRemoval(): void {
	const triggerId = memberRemovalTriggerId.value
	memberRemovalTarget.value = null
	memberRemovalTriggerId.value = null
	void nextTick(() => {
		if (triggerId) document.getElementById(`stop-sharing-${triggerId}`)?.focus()
	})
}

function confirmMemberRemoval(): void {
	if (!notebook.value || !memberRemovalTarget.value) return
	notebooksStore.removeMember({ notebookId: notebook.value.id, memberId: memberRemovalTarget.value.id })
	memberRemovalTarget.value = null
	memberRemovalTriggerId.value = null
	void nextTick(() => document.querySelector<HTMLButtonElement>('[data-testid="close-sharing-dialog"]')?.focus())
}

function updateDefaultWebSearch(isEnabled: boolean | null): void {
	if (!notebook.value || isEnabled === null) return
	notebooksStore.updateDefaultWebSearch({ notebookId: notebook.value.id, isEnabled })
}

function askNotebook(): void {
	if (!notebook.value) return
	conversationStore.startNewConversation()
	conversationStore.selectKnowledgeSource({
		id: notebook.value.id,
		name: notebook.value.name,
		defaultWebSearchEnabled: notebook.value.defaultWebSearchEnabled,
	})
	conversationStore.clearSelectedDocuments()
	void router.push('/ask')
}

function openEditDialog(): void {
	if (!notebook.value || !canManageSharing.value) return
	editName.value = notebook.value.name
	editDescription.value = notebook.value.description
	editNameError.value = ''
	editDescriptionError.value = ''
	isEditOpen.value = true
}

function focusNotebookActionsTrigger(): void {
	void nextTick(() => document.getElementById('notebook-actions-menu')?.focus())
}

function setEditDialogOpen(isOpen: boolean): void {
	isEditOpen.value = isOpen
	if (isOpen) return
	editNameError.value = ''
	editDescriptionError.value = ''
	focusNotebookActionsTrigger()
}

function closeEditDialog(): void {
	setEditDialogOpen(false)
}

function confirmNotebookEdit(): void {
	if (!notebook.value) return
	editNameError.value = ''
	editDescriptionError.value = ''
	const trimmedName = editName.value.trim()
	const trimmedDescription = editDescription.value.trim()
	if (!trimmedName) {
		editNameError.value = '請輸入筆記本名稱。'
		return
	}
	if (trimmedName.length > 60) {
		editNameError.value = '筆記本名稱最多 60 個字。'
		return
	}
	if (trimmedDescription.length > 160) {
		editDescriptionError.value = '筆記本描述最多 160 個字。'
		return
	}
	const notebookId = notebook.value.id
	if (!notebooksStore.updateNotebookDetails({ notebookId, name: trimmedName, description: trimmedDescription })) {
		editNameError.value = '目前無法更新這本筆記本。'
		return
	}
	conversationStore.syncSelectedSourceName({ id: notebookId, name: trimmedName })
	closeEditDialog()
}

function handleEditEnter(event: KeyboardEvent): void {
	if (event.isComposing) return
	event.preventDefault()
	confirmNotebookEdit()
}

function openDeleteDialog(): void {
	if (!notebook.value || !canManageSharing.value) return
	deleteError.value = ''
	isDeleteOpen.value = true
}

function setDeleteDialogOpen(isOpen: boolean): void {
	isDeleteOpen.value = isOpen
	if (isOpen) return
	deleteError.value = ''
	focusNotebookActionsTrigger()
}

function closeDeleteDialog(): void {
	setDeleteDialogOpen(false)
}

async function confirmNotebookDeletion(): Promise<void> {
	if (!notebook.value) return
	const notebookId = notebook.value.id
	if (!notebooksStore.deleteNotebook(notebookId)) {
		deleteError.value = '目前無法刪除這本筆記本。'
		return
	}
	if (conversationStore.selectedKnowledgeSourceId === notebookId) {
		const fallbackSource = COMPANY_KNOWLEDGE_SOURCES.find((source) => source.id === DEFAULT_ASK_SOURCE_ID)
		conversationStore.startNewConversation()
		if (fallbackSource) conversationStore.selectKnowledgeSource(fallbackSource)
	}
	isDeleteOpen.value = false
	await router.push('/notebooks')
}
</script>

<template>
	<div v-if="notebook" class="page-shell">
		<div class="breadcrumb"><RouterLink to="/notebooks">個人筆記本</RouterLink><VIcon icon="mdi-chevron-right" size="14" />{{ notebook.name }}</div>
		<PageHeader :title="notebook.name" :description="notebook.description || '尚未新增說明。'">
			<template #actions>
				<div class="heading-actions">
					<VBtn color="primary" prepend-icon="mdi-message-question-outline" data-testid="ask-notebook" @click="askNotebook">詢問這本筆記本</VBtn>
					<VMenu v-if="canEditContent" location="bottom end">
						<template #activator="{ props: menuProps }">
							<VBtn id="add-notebook-content" v-bind="menuProps" color="primary" variant="tonal" prepend-icon="mdi-plus" append-icon="mdi-chevron-down" data-testid="add-notebook-content">新增內容</VBtn>
						</template>
						<VList class="source-type-menu" density="compact" min-width="184" aria-label="選擇筆記本內容來源">
							<VListItem slim prepend-icon="mdi-file-upload-outline" title="上傳檔案" data-testid="upload-notebook-documents" @click="openFilePicker" />
							<VListItem slim prepend-icon="mdi-text-box-plus-outline" title="輸入文字" data-testid="add-notebook-text" @click="openTextSourceDialog" />
							<VListItem slim prepend-icon="mdi-link-plus" title="貼上網址" data-testid="add-notebook-url" @click="openUrlSourceDialog" />
						</VList>
					</VMenu>
					<VBtn v-if="canManageSharing" variant="outlined" prepend-icon="mdi-account-multiple-plus-outline" data-testid="open-sharing-dialog" @click="setShareDialogOpen(true)">分享</VBtn>
					<VMenu v-if="canManageSharing" location="bottom end">
						<template #activator="{ props: menuProps }">
							<VBtn id="notebook-actions-menu" v-bind="menuProps" variant="outlined" append-icon="mdi-chevron-down" data-testid="notebook-actions-menu">更多操作</VBtn>
						</template>
						<VList density="compact" min-width="180">
							<VListItem prepend-icon="mdi-pencil-outline" title="編輯筆記本" data-testid="edit-notebook-action" @click="openEditDialog" />
							<VListItem class="delete-menu-item" prepend-icon="mdi-delete-outline" title="刪除筆記本" data-testid="delete-notebook-action" @click="openDeleteDialog" />
						</VList>
					</VMenu>
				</div>
			</template>
		</PageHeader>
		<input ref="fileInput" class="visually-hidden" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md" @change="handleFiles">
		<VAlert v-if="fileSourceError" class="mb-5" type="error" variant="tonal" density="compact">{{ fileSourceError }}</VAlert>

		<div class="setting-strip">
			<div><strong>問答預設</strong><span>{{ notebook.defaultWebSearchEnabled ? '同時搜尋網路' : '只使用筆記本文件' }}</span></div>
			<VSwitch :model-value="notebook.defaultWebSearchEnabled" :disabled="!canManageSharing" color="primary" hide-details inset label="預設允許網路搜尋" @update:model-value="updateDefaultWebSearch" />
		</div>
		<VAlert v-if="currentUserRole === 'viewer'" type="info" variant="tonal" density="compact" class="mb-5">你目前是檢視者，可以查看文件並用於問答，但不能上傳或調整分享設定。</VAlert>

		<div class="notebook-content-tabs">
			<VTabs v-model="activeContentTab" color="primary" density="comfortable" aria-label="筆記本內容檢視">
				<VTab id="notebook-tab-graph" value="graph" prepend-icon="mdi-graph-outline" aria-controls="notebook-panel-graph" data-testid="notebook-tab-graph">知識圖譜</VTab>
				<VTab id="notebook-tab-documents" value="documents" prepend-icon="mdi-file-document-multiple-outline" aria-controls="notebook-panel-documents" data-testid="notebook-tab-documents">文件（{{ notebook.documents.length }}）</VTab>
			</VTabs>
		</div>

		<div v-if="activeContentTab === 'graph'" id="notebook-panel-graph" class="notebook-content-panel" role="tabpanel" aria-labelledby="notebook-tab-graph" tabindex="0" data-testid="notebook-graph-panel">
			<NotebookKnowledgeGraph v-if="notebookKnowledgeGraph" :context="notebookKnowledgeGraph" :can-upload="canEditContent" />
		</div>
		<div v-else id="notebook-panel-documents" class="notebook-content-panel" role="tabpanel" aria-labelledby="notebook-tab-documents" tabindex="0" data-testid="notebook-documents-panel">
			<StatePanel
				v-if="notebook.documents.length === 0"
				icon="mdi-file-upload-outline"
				title="筆記本裡還沒有文件"
				:description="canEditContent ? '請使用頁面上方的上傳文件按鈕，加入 PDF、Word、文字或 Markdown 文件。' : '目前沒有可查看的文件，請聯絡筆記本擁有者。'"
			/>
			<template v-else>
				<div v-if="!isMobileDocumentList" class="document-table-scroll surface-border" data-testid="desktop-document-list">
					<VTable class="document-table">
						<thead>
							<tr><th scope="col">文件</th><th scope="col">大小</th><th scope="col">上傳日期</th><th scope="col">狀態</th></tr>
						</thead>
						<tbody>
							<tr v-for="document in notebook.documents" :key="document.id">
								<td>
									<button
										v-if="document.status === 'ready'"
										:id="`open-document-${document.id}`"
										type="button"
										class="document-preview-trigger"
										:data-testid="`open-document-${document.id}`"
										@click="openDocumentPreview(document)"
									>
										<VIcon :icon="getDocumentSourceIcon(document.source.type)" size="18" aria-hidden="true" />
										<span class="document-preview-name">{{ document.name }}</span>
										<span class="document-source-label">{{ getDocumentSourceLabel(document.source.type) }}</span>
									</button>
									<span v-else class="document-static"><VIcon :icon="getDocumentSourceIcon(document.source.type)" size="18" aria-hidden="true" />{{ document.name }}</span>
								</td>
								<td>{{ document.size }}</td>
								<td>{{ document.uploadedAt }}</td>
								<td><VChip size="x-small" :color="documentStatusPresentation[document.status].color" variant="tonal" :data-testid="`document-status-${document.id}`">{{ documentStatusPresentation[document.status].label }}</VChip></td>
							</tr>
						</tbody>
					</VTable>
				</div>
				<ul v-else class="mobile-document-list surface-border" aria-label="筆記本文件" data-testid="mobile-document-list">
					<li v-for="document in notebook.documents" :key="document.id">
						<div class="mobile-document-copy">
							<button
								v-if="document.status === 'ready'"
								:id="`open-document-${document.id}`"
								type="button"
								class="document-preview-trigger"
								:data-testid="`open-document-${document.id}`"
								@click="openDocumentPreview(document)"
							>
								<VIcon :icon="getDocumentSourceIcon(document.source.type)" size="18" aria-hidden="true" />
								<span class="document-preview-name">{{ document.name }}</span>
								<span class="document-source-label">{{ getDocumentSourceLabel(document.source.type) }}</span>
							</button>
							<strong v-else><VIcon :icon="getDocumentSourceIcon(document.source.type)" size="18" aria-hidden="true" />{{ document.name }}</strong>
							<span>{{ document.size }} · {{ document.uploadedAt }}</span>
						</div>
						<VChip size="x-small" :color="documentStatusPresentation[document.status].color" variant="tonal">{{ documentStatusPresentation[document.status].label }}</VChip>
					</li>
				</ul>
			</template>
		</div>

		<VDialog
			:model-value="isShareOpen"
			:max-width="memberRemovalTarget ? 460 : 640"
			:aria-labelledby="memberRemovalTarget ? 'stop-sharing-dialog-title' : 'share-dialog-title'"
			@update:model-value="setShareDialogOpen"
		>
			<VCard v-if="memberRemovalTarget" class="confirm-dialog-card">
				<div class="confirm-dialog-icon" aria-hidden="true">
					<VIcon icon="mdi-account-remove-outline" size="24" />
				</div>
				<VCardTitle id="stop-sharing-dialog-title" class="confirm-dialog-title">停止分享這本筆記本？</VCardTitle>
				<VCardText class="confirm-dialog-copy">
					<p>停止與「{{ memberRemovalTarget.name }}」分享後，對方將無法再查看或使用「{{ notebook.name }}」的內容。</p>
					<p class="confirm-dialog-note">這不會刪除筆記本，也不會影響其他成員的權限。</p>
				</VCardText>
				<div class="confirm-dialog-actions">
					<VBtn autofocus variant="text" data-testid="keep-sharing-button" @click="cancelMemberRemoval">保留分享</VBtn>
					<VBtn color="error" variant="flat" data-testid="confirm-stop-sharing-button" @click="confirmMemberRemoval">停止分享</VBtn>
				</div>
			</VCard>
			<VCard v-else class="pa-6">
				<h2 id="share-dialog-title" class="section-heading">分享「{{ notebook.name }}」</h2>
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
							<VBtn :id="`stop-sharing-${member.id}`" icon="mdi-account-remove-outline" variant="text" :aria-label="`停止與 ${member.name} 分享`" :data-testid="`stop-sharing-${member.id}`" @click="requestMemberRemoval(member.id, member.name)" />
						</template>
					</VListItem>
				</VList>
				<div class="dialog-actions"><VBtn color="primary" variant="tonal" data-testid="close-sharing-dialog" @click="setShareDialogOpen(false)">完成</VBtn></div>
			</VCard>
		</VDialog>

		<VDialog :model-value="isEditOpen" max-width="520" aria-labelledby="edit-notebook-dialog-title" @update:model-value="setEditDialogOpen">
			<VCard class="management-dialog-card">
				<VCardTitle id="edit-notebook-dialog-title" class="management-dialog-title">編輯筆記本</VCardTitle>
				<VCardText class="management-dialog-copy">
					<p>名稱會顯示在筆記本清單與問答知識來源中，描述則用來說明這本筆記本的用途。</p>
					<VTextField
						v-model="editName"
						autofocus
						class="mt-4"
						label="筆記本名稱"
						maxlength="60"
						counter
						:error-messages="editNameError"
						data-testid="edit-notebook-name-input"
						@keydown.enter="handleEditEnter"
					/>
					<VTextarea
						v-model="editDescription"
						label="筆記本描述（選填）"
						rows="3"
						maxlength="160"
						counter
						:error-messages="editDescriptionError"
						data-testid="edit-notebook-description-input"
					/>
				</VCardText>
				<div class="confirm-dialog-actions">
					<VBtn variant="text" @click="closeEditDialog">取消</VBtn>
					<VBtn color="primary" variant="flat" data-testid="confirm-edit-notebook" @click="confirmNotebookEdit">儲存變更</VBtn>
				</div>
			</VCard>
		</VDialog>

		<VDialog :model-value="isDeleteOpen" max-width="460" aria-labelledby="delete-notebook-dialog-title" @update:model-value="setDeleteDialogOpen">
			<VCard class="confirm-dialog-card">
				<div class="confirm-dialog-icon" aria-hidden="true">
					<VIcon icon="mdi-notebook-remove-outline" size="24" />
				</div>
				<VCardTitle id="delete-notebook-dialog-title" class="confirm-dialog-title">刪除「{{ notebook.name }}」？</VCardTitle>
				<VCardText class="confirm-dialog-copy">
					<p>刪除後，這本筆記本與其中 {{ notebook.documents.length }} 份文件將從你的筆記本清單移除。</p>
					<p class="confirm-dialog-note">此操作無法在目前頁面復原。</p>
					<VAlert v-if="deleteError" class="mt-4" type="error" variant="tonal" density="compact">{{ deleteError }}</VAlert>
				</VCardText>
				<div class="confirm-dialog-actions">
					<VBtn autofocus variant="text" @click="closeDeleteDialog">保留筆記本</VBtn>
					<VBtn color="error" variant="flat" data-testid="confirm-delete-notebook" @click="confirmNotebookDeletion">刪除筆記本</VBtn>
				</div>
			</VCard>
		</VDialog>

		<VDialog :model-value="isTextSourceOpen" max-width="680" aria-labelledby="add-text-source-title" @update:model-value="setTextSourceOpen">
			<VCard class="source-form-dialog">
				<VCardTitle id="add-text-source-title" class="source-form-title">輸入文字</VCardTitle>
				<VCardText class="source-form-content">
					<p>直接建立一份文字筆記，可選擇純文字或 Markdown 格式。</p>
					<div class="source-form-fields">
						<VTextField v-model="textSourceTitle" autofocus label="標題" maxlength="80" counter :error-messages="textSourceTitleError" data-testid="text-source-title" />
						<VSelect v-model="textSourceFormat" label="格式" :items="[{ title: 'Markdown', value: 'markdown' }, { title: '純文字', value: 'plain-text' }]" data-testid="text-source-format" />
						<VTextarea v-model="textSourceContent" label="內容" rows="10" maxlength="50000" counter :error-messages="textSourceContentError" data-testid="text-source-content" />
					</div>
				</VCardText>
				<VCardActions><VSpacer /><VBtn variant="text" @click="setTextSourceOpen(false)">取消</VBtn><VBtn color="primary" variant="flat" data-testid="confirm-add-text-source" @click="addTextSource">新增文字</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<VDialog :model-value="isUrlSourceOpen" max-width="600" aria-labelledby="add-url-source-title" @update:model-value="setUrlSourceOpen">
			<VCard class="source-form-dialog">
				<VCardTitle id="add-url-source-title" class="source-form-title">貼上網址</VCardTitle>
				<VCardText class="source-form-content">
					<p>儲存 HTTP 或 HTTPS 網址與靜態內容快照；展示模式不會即時抓取網站。</p>
					<div class="source-form-fields url-source-fields">
						<VTextField v-model="urlSourceValue" autofocus label="網址" type="url" placeholder="https://example.com/article" maxlength="2048" :error-messages="urlSourceError" data-testid="url-source-value" />
						<VTextField v-model="urlSourceTitle" label="標題（選填）" maxlength="80" counter data-testid="url-source-title" />
					</div>
				</VCardText>
				<VCardActions><VSpacer /><VBtn variant="text" @click="setUrlSourceOpen(false)">取消</VBtn><VBtn color="primary" variant="flat" data-testid="confirm-add-url-source" @click="addUrlSource">新增網址</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<VDialog
			:model-value="Boolean(selectedDocument)"
			max-width="920"
			aria-labelledby="document-preview-dialog-title"
			@update:model-value="setDocumentPreviewOpen"
		>
			<VCard v-if="selectedDocument" class="document-preview-dialog">
				<VCardTitle id="document-preview-dialog-title" class="document-preview-title">{{ selectedDocument.name }}</VCardTitle>
				<VCardText class="document-preview-content">
					<DocumentSourcePreview :source="selectedDocument.source" :title="selectedDocument.name" />
				</VCardText>
				<VCardActions><VSpacer /><VBtn color="primary" variant="tonal" data-testid="close-document-preview" @click="closeDocumentPreview">關閉</VBtn></VCardActions>
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
.source-type-menu { padding: var(--space-xs); }
.source-type-menu :deep(.v-list-item) { min-height: 36px; padding-inline: var(--space-sm); border-radius: var(--radius-sm); }
.source-type-menu :deep(.v-list-item__prepend > .v-icon) { margin-inline-end: var(--space-sm); font-size: 18px; }
.source-type-menu :deep(.v-list-item-title) { font-size: 0.82rem; font-weight: 600; }
.delete-menu-item { color: rgb(var(--v-theme-error)); }
.management-dialog-card { padding: var(--space-lg); }
.management-dialog-title { padding: 0; font-size: 1.25rem; font-weight: 650; }
.management-dialog-copy { padding: var(--space-sm) 0 0; color: var(--ink-muted); }
.management-dialog-copy p { margin: 0; }
.confirm-dialog-card { padding: var(--space-lg); }
.confirm-dialog-icon { display: grid; width: 48px; height: 48px; margin-bottom: var(--space-md); place-items: center; border-radius: 50%; color: rgb(var(--v-theme-error)); background: rgba(var(--v-theme-error), 0.12); }
.confirm-dialog-title { overflow: visible; padding: 0; font-size: 1.25rem; font-weight: 650; line-height: 1.3; text-overflow: clip; text-wrap: balance; white-space: normal; }
.confirm-dialog-copy { padding: var(--space-sm) 0 0; color: var(--ink-strong); }
.confirm-dialog-copy p { margin: 0; }
.confirm-dialog-note { margin-top: var(--space-sm) !important; color: var(--ink-muted); font-size: 0.875rem; }
.confirm-dialog-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); padding-top: var(--space-lg); }
.setting-strip { display: flex; align-items: center; justify-content: space-between; gap: var(--space-lg); margin-bottom: var(--space-lg); padding: var(--space-md) var(--space-lg); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); }
.setting-strip div { display: grid; gap: 2px; }.setting-strip span { color: var(--ink-muted); font-size: 0.78rem; }
.notebook-content-tabs { margin-top: var(--space-xl); border-bottom: 1px solid rgb(var(--v-theme-outline)); }
.notebook-content-panel { padding-top: var(--space-lg); }
.document-table-scroll { max-height: min(56vh, 560px); overflow: auto; border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.document-table { min-width: 640px; }
.document-table-scroll :deep(thead) { position: sticky; top: 0; z-index: 1; background: rgb(var(--v-theme-surface)); }
.document-preview-trigger { display: inline-flex; align-items: center; gap: var(--space-sm); max-width: 100%; padding: var(--space-xs); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink-strong); cursor: pointer; font: inherit; text-align: left; }
.document-preview-trigger:hover { background: var(--tint-hover); }
.document-preview-trigger:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.document-preview-trigger :deep(.v-icon) { color: var(--ink-muted); }
.document-preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-preview-trigger .document-source-label { flex: 0 0 auto; padding: 2px var(--space-xs); border-radius: 999px; background: var(--tint-active); color: rgb(var(--v-theme-primary)); font-size: 0.7rem; font-weight: 700; }
.document-static { display: inline-flex; align-items: center; gap: var(--space-sm); color: var(--ink-muted); }
.mobile-document-list { margin: 0; padding: 0; overflow: hidden; border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); list-style: none; }
.mobile-document-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-md); }
.mobile-document-list li + li { border-top: 1px solid rgb(var(--v-theme-outline)); }
.mobile-document-copy { display: grid; min-width: 0; gap: var(--space-xs); }
.mobile-document-copy strong { display: flex; align-items: flex-start; gap: var(--space-sm); overflow-wrap: anywhere; font-size: 0.9rem; line-height: 1.4; }
.mobile-document-copy span { color: var(--ink-muted); font-size: 0.78rem; }
.source-form-dialog,.document-preview-dialog { padding: var(--space-lg); }
.source-form-title,.document-preview-title { overflow: visible; padding: 0; font-size: 1.2rem; font-weight: 650; line-height: 1.4; text-overflow: clip; text-wrap: balance; white-space: normal; }
.source-form-content { padding: var(--space-sm) 0 var(--space-md); color: var(--ink-muted); }
.source-form-content p { margin: 0; }
.source-form-fields { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 0 var(--space-md); margin-top: var(--space-lg); }
.source-form-fields :deep(.v-textarea) { grid-column: 1 / -1; }
.url-source-fields { grid-template-columns: 1fr; }
.document-preview-content { max-height: min(72vh, 760px); padding: var(--space-md) 0; overflow-y: auto; }
.invite-form { display: grid; grid-template-columns: 140px minmax(0, 1fr) 130px auto; align-items: start; gap: var(--space-sm); margin-top: var(--space-lg); }
.member-list { margin: var(--space-sm) 0 var(--space-lg); border-top: 1px solid rgb(var(--v-theme-outline)); }.role-select { width: 120px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 760px) { .page-shell { padding: var(--space-md); }.setting-strip { align-items: stretch; flex-direction: column; }.invite-form { grid-template-columns: 1fr; }.heading-actions { flex-wrap: wrap; justify-content: flex-start; }.notebook-content-tabs :deep(.v-slide-group__content) { justify-content: stretch; }.notebook-content-tabs :deep(.v-tab) { flex: 1 1 0; min-width: 0; } }
@media (max-width: 480px) { .confirm-dialog-actions { align-items: stretch; flex-direction: column; }.confirm-dialog-actions :deep(.v-btn) { width: 100%; }.source-form-fields { grid-template-columns: 1fr; }.source-form-fields :deep(.v-input) { grid-column: 1; } }
</style>
