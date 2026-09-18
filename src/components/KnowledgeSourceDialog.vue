<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import { getEmployeeDocumentsBySourceId } from '@/repositories/knowledge.repository'
import { useConversationStore } from '@/stores/conversation'
import { useNotebooksStore } from '@/stores/notebooks'
import { buildAskKnowledgeSourceGroups } from '@/utils/knowledgeSources'

/*
 * > 問答頁的知識來源與限定文件對話框
 * @ 選擇結果直接寫進 conversationStore；對話框關閉後發出 closed，讓頁面把焦點還給觸發按鈕。
 * @ 元件隨問答頁常駐掛載，來源文件變動時同步移除已失效的限定文件。
 */

interface SourceDocumentOption {
	id: string
	name: string
}

const DOCUMENTS_PER_PAGE = 8

const isOpen = defineModel<boolean>({ required: true })
const emit = defineEmits<{ closed: [] }>()

const conversationStore = useConversationStore()
const notebooksStore = useNotebooksStore()
const documentScopeSection = ref<HTMLElement>()
const documentSearch = ref<string | null>('')
const documentPage = ref(1)

const knowledgeSourceGroups = computed(() => buildAskKnowledgeSourceGroups(notebooksStore.notebooks))
const visibleKnowledgeSourceGroups = computed(() => knowledgeSourceGroups.value.filter((group) => group.sources.length > 0))
const knowledgeSources = computed(() => knowledgeSourceGroups.value.flatMap((group) => group.sources))
const selectedKnowledgeSource = computed(() => knowledgeSources.value.find((source) => source.id === conversationStore.selectedKnowledgeSourceId) ?? null)

const selectedNotebook = computed(() => notebooksStore.notebooks.find((notebook) => notebook.id === conversationStore.selectedKnowledgeSourceId) ?? null)
const supportsDocumentScope = computed(() => selectedKnowledgeSource.value?.kind === 'knowledge-base' || selectedKnowledgeSource.value?.kind === 'notebook')
const availableSourceDocuments = computed<SourceDocumentOption[]>(() => {
	if (selectedNotebook.value) {
		return selectedNotebook.value.documents
			.filter((document) => document.status === 'ready')
			.map((document) => ({ id: document.id, name: document.name }))
	}
	if (selectedKnowledgeSource.value?.kind !== 'knowledge-base') return []
	return getEmployeeDocumentsBySourceId(selectedKnowledgeSource.value.id)
		.map((document) => ({ id: document.id, name: document.title }))
})
const unavailableDocumentCount = computed(() => {
	if (!selectedNotebook.value) return 0
	return selectedNotebook.value.documents.length - availableSourceDocuments.value.length
})
const documentSearchKeyword = computed(() => documentSearch.value?.trim() ?? '')
const filteredSourceDocuments = computed(() => {
	const keyword = documentSearchKeyword.value.toLocaleLowerCase('zh-TW')
	if (!keyword) return availableSourceDocuments.value
	return availableSourceDocuments.value.filter((document) => document.name.toLocaleLowerCase('zh-TW').includes(keyword))
})
const documentPageCount = computed(() => Math.max(1, Math.ceil(filteredSourceDocuments.value.length / DOCUMENTS_PER_PAGE)))
const paginatedSourceDocuments = computed(() => {
	const start = (documentPage.value - 1) * DOCUMENTS_PER_PAGE
	return filteredSourceDocuments.value.slice(start, start + DOCUMENTS_PER_PAGE)
})
const documentRangeStart = computed(() => filteredSourceDocuments.value.length === 0 ? 0 : (documentPage.value - 1) * DOCUMENTS_PER_PAGE + 1)
const documentRangeEnd = computed(() => Math.min(documentPage.value * DOCUMENTS_PER_PAGE, filteredSourceDocuments.value.length))
const sourceScopeDescription = computed(() => selectedNotebook.value
	? '不選擇文件時，會搜尋整本筆記本。'
	: '不選擇文件時，會搜尋整個知識庫。')

watch(
	() => availableSourceDocuments.value.map((document) => ({ id: document.id, name: document.name })),
	(availableDocuments) => {
		if (!supportsDocumentScope.value || conversationStore.selectedDocuments.length === 0) return
		const availableDocumentMap = new Map(availableDocuments.map((document) => [document.id, document]))
		const selectedDocuments = conversationStore.selectedDocuments
			.map((document) => availableDocumentMap.get(document.id))
			.filter((document): document is { id: string; name: string } => Boolean(document))
		if (
			selectedDocuments.length !== conversationStore.selectedDocuments.length
			|| selectedDocuments.some((document, index) => document.name !== conversationStore.selectedDocuments[index]?.name)
		) {
			conversationStore.setSelectedDocuments({ sourceId: conversationStore.selectedKnowledgeSourceId, documents: selectedDocuments })
		}
	},
	{ deep: true },
)

watch([documentSearch, () => conversationStore.selectedKnowledgeSourceId], () => {
	documentPage.value = 1
})

watch(documentPageCount, (pageCount) => {
	if (documentPage.value > pageCount) documentPage.value = pageCount
})

function selectKnowledgeSource(sourceId: string): void {
	const source = knowledgeSources.value.find((item) => item.id === sourceId)
	if (!source) return
	conversationStore.selectKnowledgeSource(source)
	documentSearch.value = ''
	void nextTick(() => documentScopeSection.value?.scrollIntoView?.({ block: 'nearest' }))
}

function isDocumentSelected(documentId: string): boolean {
	return conversationStore.selectedDocuments.some((document) => document.id === documentId)
}

function toggleSelectedDocument(document: SourceDocumentOption, isSelected: boolean | null): void {
	if (!supportsDocumentScope.value) return
	const selectedDocuments = isSelected
		? [...conversationStore.selectedDocuments, { id: document.id, name: document.name }]
		: conversationStore.selectedDocuments.filter((selectedDocument) => selectedDocument.id !== document.id)
	conversationStore.setSelectedDocuments({ sourceId: conversationStore.selectedKnowledgeSourceId, documents: selectedDocuments })
}
</script>

<template>
	<VDialog
		v-model="isOpen"
		max-width="560"
		:content-props="{ id: 'knowledge-source-dialog', 'aria-labelledby': 'knowledge-source-title' }"
		@after-leave="emit('closed')"
	>
		<VCard class="source-dialog">
			<div class="source-dialog-head">
				<h2 id="knowledge-source-title" class="section-heading">知識來源</h2>
				<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉知識來源" @click="isOpen = false" />
			</div>
			<div class="source-dialog-body">
				<VRadioGroup
					:model-value="conversationStore.selectedKnowledgeSourceId"
					class="source-options"
					aria-labelledby="knowledge-source-title"
					hide-details
				>
					<section
						v-for="group in visibleKnowledgeSourceGroups"
						:key="group.id"
						class="source-group"
						role="group"
						:aria-labelledby="`knowledge-source-group-${group.id}`"
					>
						<h3 :id="`knowledge-source-group-${group.id}`" class="source-group-label">{{ group.label }}</h3>
						<VRadio
							v-for="source in group.sources"
							:key="source.id"
							:label="source.name"
							:value="source.id"
							class="source-option"
							:class="{ 'is-selected': source.id === conversationStore.selectedKnowledgeSourceId }"
							:data-testid="`knowledge-source-${source.id}`"
							@click="selectKnowledgeSource(source.id)"
						/>
					</section>
				</VRadioGroup>

				<section v-if="supportsDocumentScope" ref="documentScopeSection" class="document-scope" aria-labelledby="document-scope-title">
					<div class="document-scope-head">
						<div>
							<h3 id="document-scope-title">限定文件（選填）</h3>
							<p>{{ sourceScopeDescription }}</p>
						</div>
						<span class="document-count">{{ availableSourceDocuments.length }} 份可用</span>
					</div>

					<FilterSearchField
						v-if="availableSourceDocuments.length > 0"
						v-model="documentSearch"
						label="搜尋文件"
						variant="outlined"
						density="compact"
						data-testid="document-scope-search"
					/>

					<p v-if="availableSourceDocuments.length === 0" class="document-scope-empty">
						目前沒有可限定的文件，提問時仍會使用整個來源。
					</p>
					<p v-else-if="filteredSourceDocuments.length === 0" class="document-scope-empty">
						找不到符合「{{ documentSearchKeyword }}」的文件，請調整搜尋文字。
					</p>
					<fieldset v-else class="document-options">
						<legend class="sr-only">選擇要限定的文件</legend>
						<VCheckbox
							v-for="document in paginatedSourceDocuments"
							:key="document.id"
							:model-value="isDocumentSelected(document.id)"
							:label="document.name"
							density="compact"
							hide-details
							class="document-option"
							:data-testid="`document-scope-${document.id}`"
							@update:model-value="toggleSelectedDocument(document, $event)"
						/>
					</fieldset>
					<div v-if="filteredSourceDocuments.length > 0" class="document-pagination">
						<p>顯示 {{ documentRangeStart }}–{{ documentRangeEnd }}，共 {{ filteredSourceDocuments.length }} 份；每頁最多 {{ DOCUMENTS_PER_PAGE }} 份。</p>
						<VPagination
							v-if="documentPageCount > 1"
							v-model="documentPage"
							:length="documentPageCount"
							:total-visible="5"
							density="compact"
							aria-label="文件清單分頁"
							data-testid="document-scope-pagination"
						/>
					</div>
					<p v-if="unavailableDocumentCount > 0" class="document-scope-note">
						另有 {{ unavailableDocumentCount }} 份文件仍在處理或處理失敗，暫時不能用於問答。
					</p>
				</section>
			</div>
			<VCardActions v-if="supportsDocumentScope" class="source-dialog-actions">
				<VBtn
					v-if="conversationStore.selectedDocuments.length > 0"
					variant="text"
					data-testid="clear-document-scope"
					@click="conversationStore.clearSelectedDocuments"
				>
					使用全部文件
				</VBtn>
				<VSpacer />
				<VBtn color="primary" variant="flat" data-testid="confirm-document-scope" @click="isOpen = false">完成</VBtn>
			</VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.source-dialog {
	padding: var(--space-md);
}

.answer-action-dialog {
	padding: var(--space-sm);
}

.answer-action-description {
	max-width: 65ch;
	margin: 0 0 var(--space-md);
	color: var(--ink-muted);
	font-size: 0.9rem;
	line-height: 1.6;
}

.saved-notebook-summary {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	margin: calc(var(--space-sm) * -1) 0 var(--space-md);
	color: rgb(var(--v-theme-primary));
	font-size: 0.78rem;
	font-weight: 600;
}

:global(.save-notebook-select-menu .v-list) {
	padding: var(--space-xs);
}

:global(.save-notebook-select-menu .v-list-item) {
	min-height: 36px;
	padding-inline: var(--space-sm);
	border-radius: var(--radius-sm);
}

:global(.save-notebook-select-menu .v-list-item-title) {
	font-size: 0.82rem;
	line-height: 1.35;
}

.source-dialog-body {
	max-height: min(68vh, 620px);
	overflow-y: auto;
	overscroll-behavior: contain;
}

.source-dialog-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-md);
}

.source-options {
	display: grid;
	gap: var(--space-sm);
	margin-top: var(--space-sm);
}

.source-group {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.source-group + .source-group {
	padding-top: var(--space-sm);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.source-group-label {
	margin: 0;
	padding-inline: var(--space-sm);
	color: var(--ink-subtle);
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.06em;
}

.source-option {
	min-height: 44px;
	padding-inline: var(--space-sm);
	border-radius: var(--radius-sm);
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.source-option:hover {
	background: var(--tint-hover);
}

.source-option.is-selected {
	background: var(--tint-active);
}

.source-option :deep(.v-label) {
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.9rem;
	font-weight: 500;
	opacity: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.document-scope {
	display: grid;
	gap: var(--space-sm);
	margin-top: var(--space-md);
	padding-top: var(--space-md);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.document-scope-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-sm);
}

.document-scope-head h3,
.document-scope-head p,
.document-scope-empty,
.document-scope-note {
	margin: 0;
}

.document-scope-head h3 {
	color: var(--ink-strong);
	font-size: 0.95rem;
	font-weight: 700;
}

.document-scope-head p,
.document-scope-note {
	color: var(--ink-subtle);
	font-size: 0.78rem;
	line-height: 1.5;
}

.document-count {
	flex: 0 0 auto;
	padding: 2px var(--space-sm);
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.72rem;
	font-weight: 650;
}

.document-options {
	display: grid;
	max-height: 210px;
	margin: 0;
	padding: var(--space-xs);
	overflow-y: auto;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.document-option {
	min-height: 40px;
	padding-inline: var(--space-xs);
	border-radius: var(--radius-sm);
}

.document-option:hover {
	background: var(--tint-hover);
}

.document-option :deep(.v-label) {
	overflow-wrap: anywhere;
	color: var(--ink-strong);
	font-size: 0.84rem;
	opacity: 1;
}

.document-pagination {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
}

.document-pagination p {
	margin: 0;
	color: var(--ink-subtle);
	font-size: 0.75rem;
}

.document-pagination :deep(.v-pagination__list) {
	justify-content: flex-end;
	margin: 0;
}

.document-scope-empty {
	padding: var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.5;
}

.source-dialog-actions {
	padding: var(--space-md) 0 0;
}

@media (max-width: 600px) {
	.source-dialog-body {
		max-height: 66vh;
	}

	.document-scope-head {
		align-items: stretch;
		flex-direction: column;
	}

	.document-count {
		align-self: flex-start;
	}

	.document-pagination {
		align-items: flex-start;
		flex-direction: column;
	}
}
</style>
