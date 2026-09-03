<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentKnowledgeGraph from '@/components/DocumentKnowledgeGraph.vue'
import DocumentSourcePreview from '@/components/DocumentSourcePreview.vue'
import StatePanel from '@/components/StatePanel.vue'
import { documentVersionHistoryById } from '@/mocks/data'
import { getDocumentKnowledgeContext, getDocumentVersionDetail } from '@/mocks/documentDetails'
import { getDocumentById } from '@/repositories/knowledge.repository'
import { useConversationStore } from '@/stores/conversation'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'
import { getDocumentSourceLabel } from '@/utils/documentSources'
import { getCompanyKnowledgeSourceForDocument } from '@/utils/knowledgeSources'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const document = ref<KnowledgeDocument>()
const isLoading = ref(true)
const errorMessage = ref('')
const selectedVersionNumber = ref('')
const attachmentByDocumentId: Record<string, { name: string; size: string }> = {
	'doc-001': { name: '差旅費用明細表.xlsx', size: '32 KB' },
	'doc-002': { name: '到職第一週檢核表.pdf', size: '186 KB' },
	'doc-005': { name: '績效目標設定範例.xlsx', size: '48 KB' },
}
const documentVersions = computed<DocumentVersionEntry[]>(() => {
	const currentDocument = document.value
	if (!currentDocument) return []
	return documentVersionHistoryById[currentDocument.id] ?? [{
		version: currentDocument.version,
		date: currentDocument.updatedAt,
		author: currentDocument.owner,
		summary: currentDocument.summary,
		changes: [],
		isCurrent: true,
	}]
})
const selectedVersion = computed(() => (
	documentVersions.value.find((version) => version.version === selectedVersionNumber.value)
	?? documentVersions.value[0]
))
const selectedVersionDetail = computed(() => {
	const currentDocument = document.value
	const version = selectedVersion.value
	if (!currentDocument || !version) return undefined
	return getDocumentVersionDetail({
		documentId: currentDocument.id,
		version: version.version,
		versionSummary: version.summary,
	})
})
const documentKnowledge = computed(() => getDocumentKnowledgeContext(document.value?.id ?? ''))
const attachment = computed(() => attachmentByDocumentId[document.value?.id ?? ''])

async function loadDocument(): Promise<void> {
	isLoading.value = true
	errorMessage.value = ''
	try {
		document.value = await getDocumentById(String(route.params.id))
		if (!document.value) {
			errorMessage.value = '這份文件可能已被移除，或你沒有查看權限。'
			return
		}
		selectedVersionNumber.value = document.value.version
	} catch {
		errorMessage.value = '目前無法載入文件，請稍後再試。'
	} finally {
		isLoading.value = false
	}
}

onMounted(loadDocument)
watch(() => route.params.id, loadDocument)

function downloadDocument(): void {
	const currentDocument = document.value
	const version = selectedVersion.value
	const detail = selectedVersionDetail.value
	if (!currentDocument || !version || !detail) return
	const content = detail.sections.map((section) => `${section.heading}\n${section.body}`).join('\n\n')
	const blob = new Blob([`${currentDocument.title}\n第 ${version.version} 版\n\n${content}`], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = window.document.createElement('a')
	link.href = url
	link.download = `${currentDocument.title}-v${version.version}.txt`
	link.click()
	URL.revokeObjectURL(url)
}

async function askDocument(): Promise<void> {
	const currentDocument = document.value
	if (!currentDocument) return
	const source = getCompanyKnowledgeSourceForDocument(currentDocument)
	if (!source) return
	conversationStore.startNewConversation()
	conversationStore.selectKnowledgeSource(source)
	conversationStore.setSelectedDocuments({
		sourceId: source.id,
		documents: [{ id: currentDocument.id, name: currentDocument.title }],
	})
	await router.push('/ask')
}
</script>

<template>
	<div class="page-shell document-page">
		<VSkeletonLoader v-if="isLoading" type="heading, paragraph, article" />
		<StatePanel v-else-if="errorMessage" icon="mdi-file-alert-outline" title="無法開啟文件" :description="errorMessage" action-label="回到知識庫" @action="router.push('/library')" />
		<template v-else-if="document">
			<VBreadcrumbs :items="[{ title: '知識庫', to: '/library' }, { title: document.title }]" class="px-0 document-breadcrumbs" />
			<header class="document-header">
				<div class="document-heading-group">
					<div class="document-classification">
						<VChip color="primary" variant="tonal" size="small">{{ document.category }}</VChip>
						<span>{{ document.department }}</span>
						<span aria-hidden="true">·</span>
						<span>{{ document.owner }} 維護</span>
					</div>
					<h1 class="page-heading">{{ document.title }}</h1>
					<div class="document-tags" aria-label="文件標籤">
						<span v-for="tag in document.tags" :key="tag">{{ tag }}</span>
					</div>
				</div>
				<div class="document-actions">
					<VBtn variant="outlined" prepend-icon="mdi-download" @click="downloadDocument">下載此版本</VBtn>
					<VBtn color="primary" prepend-icon="mdi-message-text-outline" data-testid="ask-document" @click="askDocument">詢問這份文件</VBtn>
				</div>
			</header>

			<div class="document-trust-strip surface-border" role="status">
				<VIcon :icon="selectedVersion?.isCurrent ? 'mdi-shield-check-outline' : 'mdi-history'" color="primary" size="22" />
				<p v-if="selectedVersion?.isCurrent">
					<strong>目前有效版本</strong>
					<span>最後更新於 {{ selectedVersion.date }}，重要操作前仍請確認適用範圍。</span>
				</p>
				<p v-else>
					<strong>你正在閱讀歷史版本</strong>
					<span>第 {{ selectedVersion?.version }} 版發布於 {{ selectedVersion?.date }}，不一定適用於目前作業。</span>
				</p>
				<VBtn v-if="!selectedVersion?.isCurrent" variant="text" @click="selectedVersionNumber = document.version">回到目前版本</VBtn>
			</div>

			<nav class="version-switcher" aria-label="選擇文件版本">
				<button
					v-for="version in documentVersions"
					:key="version.version"
					type="button"
					class="version-option"
					:class="{ 'is-active': version.version === selectedVersion?.version }"
					:aria-current="version.version === selectedVersion?.version ? 'true' : undefined"
					:aria-label="`閱讀第 ${version.version} 版，發布於 ${version.date}${version.isCurrent ? '，目前版本' : ''}`"
					@click="selectedVersionNumber = version.version"
				>
					<span class="version-option-label">
						<strong>第 {{ version.version }} 版</strong>
						<small v-if="version.isCurrent">目前版本</small>
					</span>
					<time :datetime="version.date">{{ version.date }}</time>
				</button>
			</nav>
			<p class="sr-only" aria-live="polite">目前顯示第 {{ selectedVersion?.version }} 版文件內容。</p>

			<div v-if="selectedVersion && selectedVersionDetail" class="document-workspace">
				<section class="reader-panel surface-border" aria-labelledby="document-reader-heading">
					<header class="reader-header">
						<div>
							<p class="reader-version">第 {{ selectedVersion.version }} 版全文</p>
							<h2 id="document-reader-heading">{{ document.title }}</h2>
						</div>
						<div class="reader-meta">
							<time :datetime="selectedVersion.date">{{ selectedVersion.date }}</time>
							<span aria-hidden="true">·</span>
							<span>{{ selectedVersion.author }}</span>
						</div>
					</header>
					<div v-if="selectedVersion.changes.length" class="version-changes">
						<strong>本版更新</strong>
						<ul>
							<li v-for="change in selectedVersion.changes" :key="change">{{ change }}</li>
						</ul>
					</div>
					<DocumentSourcePreview
						class="knowledge-source-preview"
						:source="document.source"
						:title="document.title"
						:sections="selectedVersionDetail.sections"
						:show-header="false"
						:show-source-content="Boolean(selectedVersion.isCurrent)"
					/>
				</section>

				<aside class="insight-rail" aria-label="文件閱讀輔助">
					<section class="ai-summary-panel surface-border" aria-labelledby="ai-summary-heading">
						<header>
							<div class="ai-summary-title">
								<VIcon icon="mdi-auto-fix" color="primary" size="20" />
								<h2 id="ai-summary-heading">AI 摘要</h2>
							</div>
							<span>依第 {{ selectedVersion.version }} 版全文產生</span>
						</header>
						<p class="ai-summary-copy">{{ selectedVersionDetail.aiSummary }}</p>
						<div class="ai-key-points">
							<h3>快速掌握</h3>
							<ul>
								<li v-for="point in selectedVersionDetail.keyPoints" :key="point">{{ point }}</li>
							</ul>
						</div>
						<p class="ai-summary-note">摘要用於快速理解，正式作業仍以左側原文為準。</p>
					</section>

					<section class="document-info-panel surface-border" aria-labelledby="document-info-heading">
						<h2 id="document-info-heading">文件資訊</h2>
						<dl>
							<div><dt>資料來源</dt><dd>{{ getDocumentSourceLabel(document.source.type) }}</dd></div>
							<div><dt>適用範圍</dt><dd>{{ document.visibility }}</dd></div>
							<div><dt>發布狀態</dt><dd>{{ document.status }}</dd></div>
							<div><dt>維護單位</dt><dd>{{ document.department }}</dd></div>
						</dl>
						<div class="attachment-row">
							<VIcon :icon="attachment ? 'mdi-paperclip' : 'mdi-paperclip-off'" size="20" />
							<div>
								<strong>{{ attachment?.name ?? '此文件沒有附件' }}</strong>
								<span v-if="attachment">{{ attachment.size }} · 最新版本附件</span>
							</div>
							<VBtn v-if="attachment" icon="mdi-download" size="small" variant="text" :aria-label="`下載附件 ${attachment.name}`" @click="downloadDocument" />
						</div>
					</section>
				</aside>
			</div>

			<DocumentKnowledgeGraph
				:context="documentKnowledge"
				:document-title="document.title"
				:knowledge-source-id="document.knowledgeSourceId"
			/>
		</template>
	</div>
</template>

<style scoped>
.document-page {
	max-width: 1240px;
}

.document-breadcrumbs {
	margin-bottom: var(--space-sm);
}

.document-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-xl);
	margin-bottom: var(--space-xl);
}

.document-heading-group {
	min-width: 0;
}

.document-classification,
.document-tags {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
}

.document-classification {
	margin-bottom: var(--space-md);
	color: var(--ink-muted);
	font-size: 0.84rem;
}

.document-tags {
	margin-top: var(--space-md);
}

.document-tags span {
	padding: 4px 10px;
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.document-actions {
	display: flex;
	flex-wrap: wrap;
	flex: 0 0 auto;
	gap: var(--space-sm);
}

.document-trust-strip {
	display: flex;
	align-items: center;
	gap: var(--space-md);
	min-height: 60px;
	padding: 10px var(--space-md);
	border-radius: var(--radius-sm);
	background: color-mix(in srgb, rgb(var(--v-theme-primary)) 7%, rgb(var(--v-theme-surface)));
}

.document-trust-strip p {
	display: flex;
	flex: 1 1 auto;
	flex-wrap: wrap;
	gap: var(--space-xs) var(--space-sm);
	margin: 0;
	font-size: 0.88rem;
}

.document-trust-strip span {
	color: var(--ink-muted);
}

.version-switcher {
	display: flex;
	gap: var(--space-sm);
	margin-block: var(--space-lg);
	overflow-x: auto;
	scrollbar-width: thin;
}

.version-option {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-lg);
	min-width: 190px;
	min-height: 56px;
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	cursor: pointer;
	font: inherit;
	text-align: left;
	transition: background-color var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out);
}

.version-option:hover {
	background: var(--tint-hover);
}

.version-option.is-active {
	border-color: rgb(var(--v-theme-primary));
	background: var(--tint-active);
}

.version-option-label {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.version-option-label strong {
	font-size: 0.9rem;
}

.version-option-label small,
.version-option time {
	color: var(--ink-muted);
	font-size: 0.74rem;
}

.document-workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 320px;
	align-items: start;
	gap: var(--space-lg);
	margin-bottom: var(--space-2xl);
}

.reader-panel,
.ai-summary-panel,
.document-info-panel {
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.reader-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-lg);
	padding: var(--space-xl);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.reader-version {
	margin-bottom: var(--space-xs);
	color: rgb(var(--v-theme-primary));
	font-size: 0.8rem;
	font-weight: 700;
}

.reader-header h2 {
	font-size: 1.35rem;
	font-weight: 700;
	line-height: 1.35;
}

.reader-meta {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.version-changes {
	display: grid;
	grid-template-columns: 88px minmax(0, 1fr);
	gap: var(--space-md);
	padding: var(--space-md) var(--space-xl);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	background: color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 50%, rgb(var(--v-theme-surface)));
	font-size: 0.86rem;
}

.version-changes ul {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-xs) var(--space-lg);
	margin: 0;
	padding-left: 1.1rem;
	color: var(--ink-muted);
}

.knowledge-source-preview {
	border: 0;
	border-radius: 0;
}

.insight-rail {
	position: sticky;
	top: var(--space-lg);
	display: grid;
	gap: var(--space-md);
}

.ai-summary-panel,
.document-info-panel {
	padding: var(--space-lg);
}

.ai-summary-panel header {
	padding-bottom: var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.ai-summary-title {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
}

.ai-summary-title h2,
.document-info-panel h2 {
	font-size: 1rem;
	font-weight: 700;
}

.ai-summary-panel header > span {
	display: block;
	margin-top: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.76rem;
}

.ai-summary-copy {
	margin-block: var(--space-md);
	font-size: 0.92rem;
	line-height: 1.7;
	text-wrap: pretty;
}

.ai-key-points {
	padding: var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.ai-key-points h3 {
	margin-bottom: var(--space-sm);
	font-size: 0.82rem;
	font-weight: 700;
}

.ai-key-points ul {
	display: grid;
	gap: var(--space-sm);
	margin: 0;
	padding-left: 1.1rem;
	color: var(--ink-muted);
	font-size: 0.84rem;
	line-height: 1.5;
}

.ai-summary-note {
	margin-top: var(--space-md);
	color: var(--ink-muted);
	font-size: 0.75rem;
	line-height: 1.5;
}

.document-info-panel dl {
	display: grid;
	gap: 10px;
	margin-block: var(--space-md);
}

.document-info-panel dl > div {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-md);
	font-size: 0.84rem;
}

.document-info-panel dt {
	color: var(--ink-muted);
}

.document-info-panel dd {
	margin: 0;
	font-weight: 600;
	text-align: right;
}

.attachment-row {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	padding-top: var(--space-md);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.attachment-row div {
	display: flex;
	min-width: 0;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 2px;
}

.attachment-row strong {
	overflow-wrap: anywhere;
	font-size: 0.82rem;
}

.attachment-row span {
	color: var(--ink-muted);
	font-size: 0.74rem;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 960px) {
	.document-workspace {
		grid-template-columns: 1fr;
	}

	.insight-rail {
		position: static;
		grid-template-columns: minmax(0, 1fr) minmax(260px, 0.7fr);
	}
}

@media (max-width: 700px) {
	.document-header {
		flex-direction: column;
	}

	.document-actions {
		width: 100%;
	}

	.document-actions :deep(.v-btn) {
		flex: 1 1 auto;
	}

	.document-trust-strip {
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.version-option {
		min-width: 168px;
	}

	.reader-header,
	.version-changes {
		grid-template-columns: 1fr;
		flex-direction: column;
		padding-inline: var(--space-lg);
	}

	.insight-rail {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	.version-option {
		transition: none;
	}
}
</style>
