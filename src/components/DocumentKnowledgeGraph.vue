<script setup lang="ts">
import type { CSSProperties } from 'vue'

import type { DocumentKnowledgeContext } from '@/mocks/documentDetails'

interface ComponentProps {
	context: DocumentKnowledgeContext
	documentTitle: string
	knowledgeSourceId: string
}

defineProps<ComponentProps>()

const topicPositions = [
	{ x: 18, y: 22 },
	{ x: 82, y: 22 },
	{ x: 18, y: 78 },
	{ x: 82, y: 78 },
]

// - 將固定的圖譜座標轉成節點定位樣式
function getTopicStyle(index: number): CSSProperties {
	const position = topicPositions[index] ?? topicPositions[0]
	return {
		left: `${position.x}%`,
		top: `${position.y}%`,
	}
}
</script>

<template>
	<section class="knowledge-section surface-border" aria-labelledby="document-knowledge-heading">
		<header class="knowledge-header">
			<div>
				<div class="knowledge-title-row">
					<VIcon icon="mdi-graph-outline" size="22" color="primary" />
					<h2 id="document-knowledge-heading">這份文件的知識關聯</h2>
				</div>
				<p>從文件提到的制度、流程與角色，推導下一份值得閱讀的內容。</p>
			</div>
			<VBtn
				v-if="context.focusNodeId"
				variant="text"
				append-icon="mdi-arrow-top-right"
				:to="{
					path: '/library',
					query: { source: knowledgeSourceId, view: 'graph', focus: context.focusNodeId },
				}"
			>
				開啟完整圖譜
			</VBtn>
		</header>

		<div class="knowledge-layout">
			<figure class="knowledge-figure" aria-describedby="knowledge-graph-description">
				<figcaption id="knowledge-graph-description" class="sr-only">
					{{ documentTitle }} 與 {{ context.topics.map((topic) => topic.label).join('、') }} 的知識關聯圖。
				</figcaption>
				<svg class="knowledge-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					<line v-for="(topic, index) in context.topics" :key="topic.id" x1="50" y1="50" :x2="topicPositions[index]?.x ?? 50" :y2="topicPositions[index]?.y ?? 50" />
				</svg>
				<div class="knowledge-focus-node">
					<span>目前文件 · {{ context.focusLabel }}</span>
					<strong>{{ documentTitle }}</strong>
				</div>
				<div
					v-for="(topic, index) in context.topics"
					:key="topic.id"
					class="knowledge-topic-node"
					:style="getTopicStyle(index)"
				>
					<span>{{ topic.type }} · {{ topic.relation }}</span>
					<strong>{{ topic.label }}</strong>
				</div>
			</figure>

			<div class="related-reading" aria-labelledby="related-reading-heading">
				<div class="related-reading-heading">
					<h3 id="related-reading-heading">接著閱讀</h3>
					<span>{{ context.relatedDocuments.length }} 份相關文件</span>
				</div>
				<RouterLink
					v-for="related in context.relatedDocuments"
					:key="related.document.id"
					class="related-document-link"
					:to="`/documents/${related.document.id}`"
				>
					<div class="related-document-copy">
						<strong>{{ related.document.title }}</strong>
						<p>{{ related.relation }}</p>
						<div class="related-document-topics">
							<span v-for="topic in related.sharedTopics" :key="topic">{{ topic }}</span>
						</div>
					</div>
					<VIcon icon="mdi-arrow-right" size="20" aria-hidden="true" />
				</RouterLink>
				<p v-if="context.relatedDocuments.length === 0" class="related-reading-empty" role="status">
					目前沒有可閱讀的相關文件。
				</p>
			</div>
		</div>
	</section>
</template>

<style scoped>
.knowledge-section {
	overflow: hidden;
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.knowledge-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-lg);
	padding: var(--space-lg) var(--space-xl);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.knowledge-title-row {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
}

.knowledge-title-row h2 {
	font-size: 1.2rem;
	font-weight: 700;
}

.knowledge-header p {
	max-width: 64ch;
	margin-top: var(--space-xs);
	color: var(--ink-muted);
}

.knowledge-layout {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
}

.knowledge-figure {
	position: relative;
	min-height: 390px;
	margin: 0;
	background: color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 52%, rgb(var(--v-theme-surface)));
}

.knowledge-links {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.knowledge-links line {
	stroke: rgb(var(--v-theme-outline));
	stroke-width: 0.35;
	stroke-dasharray: 1.4 1.4;
	vector-effect: non-scaling-stroke;
}

.knowledge-focus-node,
.knowledge-topic-node {
	position: absolute;
	display: flex;
	flex-direction: column;
	gap: var(--space-xs);
	width: min(210px, 42%);
	padding: 14px var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	transform: translate(-50%, -50%);
}

.knowledge-focus-node {
	left: 50%;
	top: 50%;
	z-index: 1;
	border-color: rgb(var(--v-theme-primary));
	background: color-mix(in srgb, rgb(var(--v-theme-primary)) 10%, rgb(var(--v-theme-surface)));
}

.knowledge-focus-node span,
.knowledge-topic-node span {
	color: var(--ink-muted);
	font-size: 0.75rem;
}

.knowledge-focus-node strong,
.knowledge-topic-node strong {
	font-size: 0.92rem;
	line-height: 1.35;
}

.related-reading {
	border-left: 1px solid rgb(var(--v-theme-outline));
}

.related-reading-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-md);
	padding: var(--space-lg);
}

.related-reading-heading h3 {
	font-size: 1rem;
	font-weight: 700;
}

.related-reading-heading span {
	color: var(--ink-muted);
	font-size: 0.8rem;
}

.related-document-link {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-md);
	min-height: 44px;
	padding: var(--space-lg);
	border-top: 1px solid rgb(var(--v-theme-outline));
	color: var(--ink-strong);
	text-decoration: none;
	transition: background-color var(--motion-base) var(--ease-out);
}

.related-document-link:hover {
	background: var(--tint-hover);
}

.related-document-copy {
	min-width: 0;
}

.related-document-copy strong {
	display: block;
	font-size: 0.96rem;
	line-height: 1.45;
}

.related-document-copy p {
	margin-top: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.86rem;
	line-height: 1.55;
}

.related-document-topics {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-xs);
	margin-top: var(--space-sm);
}

.related-document-topics span {
	padding: 3px var(--space-sm);
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.related-reading-empty {
	padding: var(--space-xl) var(--space-lg);
	border-top: 1px solid rgb(var(--v-theme-outline));
	color: var(--ink-muted);
	text-align: center;
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

@media (max-width: 900px) {
	.knowledge-layout {
		grid-template-columns: 1fr;
	}

	.related-reading {
		border-top: 1px solid rgb(var(--v-theme-outline));
		border-left: 0;
	}
}

@media (max-width: 600px) {
	.knowledge-header {
		flex-direction: column;
		padding: var(--space-lg);
	}

	.knowledge-figure {
		display: grid;
		min-height: 0;
		padding: var(--space-lg);
		gap: var(--space-sm);
	}

	.knowledge-links {
		display: none;
	}

	.knowledge-focus-node,
	.knowledge-topic-node {
		position: static;
		width: 100%;
		transform: none;
	}

	.knowledge-topic-node {
		margin-left: var(--space-md);
		width: calc(100% - var(--space-md));
	}
}

@media (prefers-reduced-motion: reduce) {
	.related-document-link {
		transition: none;
	}
}
</style>
