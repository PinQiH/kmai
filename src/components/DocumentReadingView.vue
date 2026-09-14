<script setup lang="ts">
import { computed } from 'vue'

import DocumentKnowledgeGraph from '@/components/DocumentKnowledgeGraph.vue'
import DocumentVersionContent from '@/components/DocumentVersionContent.vue'
import DocumentVersionSelector from '@/components/DocumentVersionSelector.vue'
import { getDocumentKnowledgeContext, getDocumentVersionDetail } from '@/mocks/documentDetails'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'
import { getDocumentSourceLabel } from '@/utils/documentSources'

interface ComponentProps {
	/** 目前選取的版本號。 */
	modelValue: string
	document: KnowledgeDocument
	versions: DocumentVersionEntry[]
	/** 是否顯示文件標題與分類（後台抽屜自帶標題時關閉）。 */
	showHeading?: boolean
	/** 是否顯示知識圖譜。 */
	showGraph?: boolean
}

const props = withDefaults(defineProps<ComponentProps>(), { showHeading: true, showGraph: true })

const knowledgeContext = computed(() => getDocumentKnowledgeContext(props.document.id))
const emit = defineEmits<{ 'update:modelValue': [version: string] }>()

const selectedVersion = computed(() => (
	props.versions.find((version) => version.version === props.modelValue)
	?? props.versions[0]
))

const versionDetail = computed(() => {
	const version = selectedVersion.value
	if (!version) return undefined
	return getDocumentVersionDetail({
		documentId: props.document.id,
		version: version.version,
		versionSummary: version.summary,
	})
})
</script>

<template>
	<div class="reading-view">
		<header v-if="showHeading" class="document-header">
			<div class="document-heading-group">
				<div class="document-classification">
					<VChip color="primary" variant="tonal" size="small">{{ document.category }}</VChip>
					<span>{{ document.department }}</span>
					<span aria-hidden="true">·</span>
					<span>{{ document.owner }} 維護</span>
				</div>
				<h1 class="page-heading">{{ document.title }}</h1>
				<div v-if="document.tags.length" class="document-tags" aria-label="文件標籤">
					<span v-for="tag in document.tags" :key="tag">{{ tag }}</span>
				</div>
			</div>
			<div class="document-actions"><slot name="actions" /></div>
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
			<VBtn v-if="!selectedVersion?.isCurrent" variant="text" @click="emit('update:modelValue', document.version)">回到目前版本</VBtn>
		</div>

		<DocumentVersionSelector :model-value="modelValue" :versions="versions" @update:model-value="emit('update:modelValue', $event)" />
		<p class="sr-only" aria-live="polite">目前顯示第 {{ selectedVersion?.version }} 版文件內容。</p>

		<div v-if="selectedVersion && versionDetail" class="document-workspace">
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
				<DocumentVersionContent class="reader-body" :document="document" :version="selectedVersion" />
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
					<p class="ai-summary-copy">{{ versionDetail.aiSummary }}</p>
					<div class="ai-key-points">
						<h3>快速掌握</h3>
						<ul>
							<li v-for="point in versionDetail.keyPoints" :key="point">{{ point }}</li>
						</ul>
					</div>
					<p class="ai-summary-note">摘要用於快速理解，正式作業仍以原文為準。</p>
				</section>

				<section class="document-info-panel surface-border" aria-labelledby="document-info-heading">
					<h2 id="document-info-heading">文件資訊</h2>
					<dl>
						<div><dt>資料來源</dt><dd>{{ getDocumentSourceLabel(document.source.type) }}</dd></div>
						<div><dt>適用範圍</dt><dd>{{ document.visibility }}</dd></div>
						<div><dt>發布狀態</dt><dd>{{ document.status }}</dd></div>
						<div><dt>維護單位</dt><dd>{{ document.department }}</dd></div>
					</dl>
				</section>
			</aside>
		</div>

		<DocumentKnowledgeGraph
			v-if="showGraph"
			class="reading-graph"
			:context="knowledgeContext"
			:document-title="document.title"
			:knowledge-source-id="document.knowledgeSourceId"
		/>
	</div>
</template>

<style scoped>
/* @ 後台抽屜的寬度與視窗寬度無關，改用容器查詢才能在兩處都正確堆疊。 */
.reading-view {
	container-type: inline-size;
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

.document-workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 320px;
	align-items: start;
	gap: var(--space-lg);
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

.reader-body {
	padding: var(--space-xl);
}

.insight-rail {
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
	margin-block: var(--space-md) 0;
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

.reading-graph {
	margin-top: var(--space-xl);
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

@container (max-width: 960px) {
	.document-workspace {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 700px) {
	.document-header {
		flex-direction: column;
	}

	.document-actions {
		width: 100%;
	}

	.document-trust-strip {
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.reader-header,
	.version-changes {
		grid-template-columns: 1fr;
		flex-direction: column;
		padding-inline: var(--space-lg);
	}

	.reader-body {
		padding: var(--space-lg);
	}
}
</style>
