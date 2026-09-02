<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

import type { NotebookKnowledgeGraphContext } from '@/mocks/notebookKnowledgeGraph'

interface ComponentProps {
	context: NotebookKnowledgeGraphContext
	canUpload: boolean
}

interface NodePosition {
	x: number
	y: number
}

const props = defineProps<ComponentProps>()

const notebookPosition: NodePosition = { x: 50, y: 50 }
const relatedNodePositions: NodePosition[] = [
	{ x: 17, y: 20 },
	{ x: 50, y: 15 },
	{ x: 83, y: 20 },
	{ x: 17, y: 80 },
	{ x: 50, y: 85 },
	{ x: 83, y: 80 },
]

const nodePositions = computed(() => {
	const positions = new Map<string, NodePosition>([[props.context.notebookNodeId, notebookPosition]])
	props.context.nodes.forEach((node, index) => {
		positions.set(node.id, relatedNodePositions[index] ?? notebookPosition)
	})
	return positions
})

const graphLines = computed(() => props.context.edges.flatMap((edge) => {
	const source = nodePositions.value.get(edge.sourceId)
	const target = nodePositions.value.get(edge.targetId)
	return source && target ? [{ ...edge, source, target }] : []
}))

const graphSummaryText = computed(() => {
	const summary = [
		`${props.context.documentCount} 份可用文件`,
		`${props.context.topicCount} 個主題`,
	]
	if (props.context.processingDocumentCount > 0) summary.push(`${props.context.processingDocumentCount} 份處理中`)
	if (props.context.failedDocumentCount > 0) summary.push(`${props.context.failedDocumentCount} 份失敗`)
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

function getNodeStyle(nodeId: string): CSSProperties {
	const position = nodePositions.value.get(nodeId) ?? notebookPosition
	return {
		left: `${position.x}%`,
		top: `${position.y}%`,
	}
}
</script>

<template>
	<section class="notebook-knowledge-section surface-border" aria-label="這本筆記本的知識圖譜" data-testid="notebook-knowledge-graph">
		<div v-if="context.totalNodeCount === 0" class="notebook-knowledge-empty" role="status" data-testid="notebook-knowledge-empty">
			<VIcon icon="mdi-file-tree-outline" size="34" color="primary" aria-hidden="true" />
			<div>
				<h3>{{ emptyStateTitle }}</h3>
				<p>{{ emptyStateDescription }}</p>
			</div>
		</div>

		<figure v-else class="notebook-knowledge-figure" data-testid="notebook-knowledge-canvas">
			<figcaption class="sr-only">
				{{ context.notebookName }} 包含 {{ context.documentCount }} 份文件與 {{ context.topicCount }} 個主題；目前顯示 {{ context.nodes.length + 1 }} 個節點。
			</figcaption>
			<p class="notebook-knowledge-summary" aria-label="圖譜摘要">{{ graphSummaryText }}</p>
			<svg class="notebook-knowledge-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<line
					v-for="line in graphLines"
					:key="line.id"
					:x1="line.source.x"
					:y1="line.source.y"
					:x2="line.target.x"
					:y2="line.target.y"
				/>
			</svg>
			<div class="notebook-node" :title="context.notebookName">
				<span>筆記本</span>
				<strong>{{ context.notebookName }}</strong>
			</div>
			<ul class="notebook-related-nodes" aria-label="知識圖譜節點">
				<li
					v-for="node in context.nodes"
					:key="node.id"
					class="notebook-related-node"
					:class="`notebook-related-node--${node.kind}`"
					:style="getNodeStyle(node.id)"
					:title="node.label"
				>
					<span>{{ node.kind === 'document' ? '文件' : '主題' }}</span>
					<strong>{{ node.label }}</strong>
				</li>
			</ul>
			<p v-if="context.hiddenNodeCount > 0" class="notebook-hidden-node-note" role="status">
				另有 {{ context.hiddenNodeCount }} 個節點未顯示
			</p>
		</figure>
	</section>
</template>

<style scoped>
.notebook-knowledge-section {
	overflow: hidden;
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.notebook-knowledge-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-lg);
	min-height: 220px;
	padding: var(--space-xl);
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

.notebook-knowledge-figure {
	position: relative;
	min-height: 410px;
	margin: 0;
	background: rgb(var(--v-theme-background));
}

.notebook-knowledge-summary {
	position: absolute;
	left: var(--space-md);
	top: var(--space-md);
	z-index: 2;
	margin: 0;
	padding: 5px var(--space-sm);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	background: rgb(var(--v-theme-surface));
	color: var(--ink-muted);
	font-size: 0.75rem;
}

.notebook-knowledge-links {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.notebook-knowledge-links line {
	stroke: rgb(var(--v-theme-outline));
	stroke-width: 0.4;
	stroke-dasharray: 1.5 1.5;
	vector-effect: non-scaling-stroke;
}

.notebook-node,
.notebook-related-node {
	display: flex;
	flex-direction: column;
	gap: var(--space-xs);
	padding: 14px var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
}

.notebook-node {
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 2;
	width: min(230px, 34%);
	border-color: rgb(var(--v-theme-primary));
	background: color-mix(in srgb, rgb(var(--v-theme-primary)) 10%, rgb(var(--v-theme-surface)));
	transform: translate(-50%, -50%);
}

.notebook-node span,
.notebook-related-node span {
	color: var(--ink-muted);
	font-size: 0.74rem;
}

.notebook-node strong,
.notebook-related-node strong {
	display: -webkit-box;
	overflow: hidden;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	font-size: 0.9rem;
	line-height: 1.35;
}

.notebook-related-nodes {
	margin: 0;
	padding: 0;
	list-style: none;
}

.notebook-related-node {
	position: absolute;
	z-index: 1;
	width: min(190px, 27%);
	transform: translate(-50%, -50%);
}

.notebook-related-node--document {
	border-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 52%, rgb(var(--v-theme-outline)));
}

.notebook-related-node--topic {
	background: color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 54%, rgb(var(--v-theme-surface)));
}

.notebook-hidden-node-note {
	position: absolute;
	right: var(--space-md);
	bottom: var(--space-md);
	margin: 0;
	padding: 5px var(--space-sm);
	border-radius: 999px;
	background: rgb(var(--v-theme-surface));
	color: var(--ink-muted);
	font-size: 0.75rem;
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

@media (max-width: 700px) {
	.notebook-knowledge-empty {
		align-items: stretch;
		flex-direction: column;
		padding: var(--space-lg);
	}

	.notebook-knowledge-empty {
		min-height: 0;
	}

	.notebook-knowledge-figure {
		display: grid;
		min-height: 0;
		gap: var(--space-sm);
		padding: var(--space-lg);
	}

	.notebook-knowledge-summary {
		position: static;
		justify-self: start;
	}

	.notebook-knowledge-links {
		display: none;
	}

	.notebook-node,
	.notebook-related-node {
		position: static;
		width: 100%;
		transform: none;
	}

	.notebook-related-nodes {
		display: grid;
		gap: var(--space-sm);
	}

	.notebook-related-node--topic {
		width: calc(100% - var(--space-md));
		margin-left: var(--space-md);
	}

	.notebook-hidden-node-note {
		position: static;
		justify-self: start;
	}
}
</style>
