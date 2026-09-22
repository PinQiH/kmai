<script setup lang="ts">
import { computed, ref } from 'vue'

import KnowledgeGraphCanvas from '@/components/KnowledgeGraphCanvas.vue'
import type { KnowledgeGraphCanvasNode } from '@/utils/knowledgeGraphCanvas'
import type { NotebookKnowledgeGraphContext } from '@/repositories/graph.repository'

interface ComponentProps {
	context: NotebookKnowledgeGraphContext
	canUpload: boolean
}

/*
 * > 筆記本知識圖譜
 * @ 與知識庫頁的圖譜共用 KnowledgeGraphCanvas，風格、互動與無障礙行為一致；
 *   這裡只負責把筆記本的節點資料轉成畫布格式，並提供自己的詳情面板。
 */

const NOTEBOOK_CLUSTER = '筆記本'
const DOCUMENT_CLUSTER = '文件'
const TOPIC_CLUSTER = '主題'
const CLUSTERS = [NOTEBOOK_CLUSTER, DOCUMENT_CLUSTER, TOPIC_CLUSTER] as const

const props = defineProps<ComponentProps>()

const selectedId = ref('')
const hoveredId = ref('')

const canvasNodes = computed<KnowledgeGraphCanvasNode[]>(() => {
	const notebookNode: KnowledgeGraphCanvasNode = {
		id: props.context.notebookNodeId,
		label: props.context.notebookName,
		type: NOTEBOOK_CLUSTER,
		cluster: NOTEBOOK_CLUSTER,
	}
	const relatedNodes = props.context.nodes.map((node) => ({
		id: node.id,
		label: node.label,
		type: node.kind === 'document' ? DOCUMENT_CLUSTER : TOPIC_CLUSTER,
		cluster: node.kind === 'document' ? DOCUMENT_CLUSTER : TOPIC_CLUSTER,
	}))
	return [notebookNode, ...relatedNodes]
})

const canvasEdges = computed(() => props.context.edges.map((edge) => ({ from: edge.sourceId, to: edge.targetId })))

const nodeById = computed(() => new Map(canvasNodes.value.map((node) => [node.id, node])))

const selectedNode = computed(() => (selectedId.value ? nodeById.value.get(selectedId.value) ?? null : null))

const relatedNodes = computed(() => {
	const current = selectedId.value
	if (!current) return []
	return props.context.edges
		.flatMap((edge) => {
			if (edge.sourceId === current) return [edge.targetId]
			if (edge.targetId === current) return [edge.sourceId]
			return []
		})
		.flatMap((id) => {
			const node = nodeById.value.get(id)
			return node ? [node] : []
		})
})

const graphSummaryText = computed(() => {
	const summary = [
		`${props.context.documentCount} 份可用文件`,
		`${props.context.topicCount} 個主題`,
	]
	if (props.context.processingDocumentCount > 0) summary.push(`${props.context.processingDocumentCount} 份處理中`)
	if (props.context.failedDocumentCount > 0) summary.push(`${props.context.failedDocumentCount} 份失敗`)
	if (props.context.hiddenNodeCount > 0) summary.push(`另有 ${props.context.hiddenNodeCount} 個節點未顯示`)
	return summary.join(' · ')
})

const emptyStateTitle = computed(() => {
	if (props.context.processingDocumentCount > 0) return '文件處理完成後會建立知識圖譜'
	if (props.context.failedDocumentCount > 0) return '目前沒有可建立圖譜的文件'
	if (!props.canUpload) return '這本筆記本還沒有可查看的圖譜'
	return '上傳文件後就會建立知識圖譜'
})

const emptyStateDescription = computed(() => {
	const statusParts: string[] = []
	if (props.context.processingDocumentCount > 0) statusParts.push(`${props.context.processingDocumentCount} 份正在處理`)
	if (props.context.failedDocumentCount > 0) statusParts.push(`${props.context.failedDocumentCount} 份處理失敗`)
	if (statusParts.length > 0) {
		return props.canUpload
			? `${statusParts.join('，')}。可使用的文件會自動出現在圖譜中。`
			: `${statusParts.join('，')}。請聯絡筆記本擁有者確認處理狀態。`
	}
	if (!props.canUpload) return '目前沒有可查看的文件，請聯絡筆記本擁有者。'
	return '圖譜會在這裡呈現筆記本、文件與主題之間的關聯。'
})

function selectNode(id: string): void {
	selectedId.value = selectedId.value === id ? '' : id
}
</script>

<template>
	<section class="notebook-knowledge-section" aria-label="這本筆記本的知識圖譜" data-testid="notebook-knowledge-graph">
		<div
			v-if="context.totalNodeCount === 0"
			class="notebook-knowledge-empty surface-border"
			role="status"
			data-testid="notebook-knowledge-empty"
		>
			<VIcon icon="mdi-file-tree-outline" size="34" color="primary" aria-hidden="true" />
			<div>
				<h3>{{ emptyStateTitle }}</h3>
				<p>{{ emptyStateDescription }}</p>
			</div>
		</div>

		<template v-else>
			<p class="notebook-knowledge-summary" aria-label="圖譜摘要">{{ graphSummaryText }}</p>
			<div class="graph-layout" :class="{ 'has-selection': Boolean(selectedNode) }" data-testid="notebook-knowledge-canvas">
				<KnowledgeGraphCanvas
					v-model:selected-id="selectedId"
					v-model:hovered-id="hoveredId"
					:nodes="canvasNodes"
					:edges="canvasEdges"
					:clusters="CLUSTERS"
					:node-types="CLUSTERS"
					canvas-label="筆記本知識圖譜關聯圖"
					search-label="搜尋節點"
				/>

				<aside v-if="selectedNode" class="surface-border pa-5 graph-detail" aria-label="節點詳情">
					<div class="detail-heading">
						<div>
							<p class="eyebrow text-primary mb-2">目前節點</p>
							<h3 class="text-h6 font-weight-bold" :title="selectedNode.label">{{ selectedNode.label }}</h3>
						</div>
						<VBtn
							icon="mdi-close"
							variant="text"
							size="small"
							aria-label="關閉節點詳情"
							@click="selectedId = ''"
						/>
					</div>
					<div class="d-flex align-center ga-2 mt-3">
						<VChip size="small" variant="tonal">{{ selectedNode.type }}</VChip>
					</div>
					<p class="detail-hint mt-3">與 {{ relatedNodes.length }} 個節點直接相關。</p>

					<VDivider class="my-5" />

					<p class="text-caption font-weight-bold mb-2">關聯節點</p>
					<ul class="related-list">
						<li v-for="related in relatedNodes" :key="related.id">
							<button
								type="button"
								class="related-item"
								@click="selectNode(related.id)"
								@mouseenter="hoveredId = related.id"
								@mouseleave="hoveredId = ''"
							>
								<span class="related-label">{{ related.label }}</span>
								<span class="related-relation">{{ related.type }}</span>
							</button>
						</li>
					</ul>
				</aside>
			</div>
		</template>
	</section>
</template>

<style scoped>
.notebook-knowledge-section {
	display: grid;
	gap: var(--space-sm);
}

.notebook-knowledge-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-lg);
	min-height: 220px;
	padding: var(--space-xl);
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-background));
}

.notebook-knowledge-empty h3 {
	font-size: 1rem;
	font-weight: 700;
}

.notebook-knowledge-empty p {
	margin-top: var(--space-xs);
	color: var(--ink-muted);
}

.notebook-knowledge-summary {
	margin: 0;
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.graph-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: var(--space-lg);
}

.graph-layout.has-selection {
	grid-template-columns: minmax(0, 1fr) 300px;
}

.graph-detail {
	align-self: start;
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.detail-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-sm);
}

/* @ 檔名可能很長，詳情標題最多兩行，完整名稱留在 title */
.detail-heading h3 {
	display: -webkit-box;
	overflow: hidden;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.detail-hint {
	font-size: 0.86rem;
	line-height: 1.6;
	color: var(--ink-muted);
}

.related-list {
	display: grid;
	gap: 2px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.related-item {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-sm);
	width: 100%;
	padding: 6px 8px;
	border-radius: var(--radius-sm);
	background: none;
	border: none;
	cursor: pointer;
	font: inherit;
	text-align: left;
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.related-item:hover {
	background: var(--tint-hover);
}

.related-label {
	overflow-wrap: anywhere;
	font-size: 0.88rem;
	color: rgb(var(--v-theme-on-surface));
}

.related-relation {
	flex-shrink: 0;
	font-size: 0.72rem;
	color: var(--ink-subtle);
}

@media (max-width: 900px) {
	.graph-layout,
	.graph-layout.has-selection {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 700px) {
	.notebook-knowledge-empty {
		align-items: stretch;
		flex-direction: column;
		min-height: 0;
		padding: var(--space-lg);
	}
}
</style>
