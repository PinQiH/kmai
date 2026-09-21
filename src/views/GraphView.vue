<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import KnowledgeGraphCanvas from '@/components/KnowledgeGraphCanvas.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
	GRAPH_NODE_TYPES,
	getKnowledgeGraphBySourceId,
	getNeighbors,
	type KnowledgeGraphNode,
} from '@/mocks/graph'
import { getEmployeeDocumentsBySourceId } from '@/repositories/knowledge.repository'
import { DEFAULT_ASK_SOURCE_ID, getCompanyKnowledgeSourceById } from '@/utils/knowledgeSources'

interface ComponentProps {
	embedded?: boolean
	knowledgeSourceId?: string
}

const props = withDefaults(defineProps<ComponentProps>(), {
	embedded: false,
	knowledgeSourceId: '',
})

const route = useRoute()

const requestedKnowledgeSourceId = props.knowledgeSourceId
	|| (typeof route.query.source === 'string' ? route.query.source : '')
const requestedKnowledgeSource = getCompanyKnowledgeSourceById(requestedKnowledgeSourceId)
const defaultKnowledgeSource = getCompanyKnowledgeSourceById(DEFAULT_ASK_SOURCE_ID)!
const currentKnowledgeSource = requestedKnowledgeSource && requestedKnowledgeSource.id !== 'company'
	? requestedKnowledgeSource
	: defaultKnowledgeSource
const knowledgeSourceId = currentKnowledgeSource.id
const scopedGraph = getKnowledgeGraphBySourceId(knowledgeSourceId)
const graphNodes = scopedGraph.nodes
const graphEdges = scopedGraph.edges
const graphClusters = scopedGraph.clusters
const relatedDocuments = getEmployeeDocumentsBySourceId(knowledgeSourceId)

const selectedId = ref('')
const hoveredId = ref('')
const canvasRef = ref<InstanceType<typeof KnowledgeGraphCanvas> | null>(null)

const canvasEdges = computed(() => graphEdges.map((edge) => ({ from: edge.from, to: edge.to })))

const selectedNode = computed<KnowledgeGraphNode | null>(
	() => graphNodes.find((node) => node.id === selectedId.value) ?? null,
)

const relatedNodes = computed(() => (
	selectedId.value ? getNeighbors(selectedId.value, graphNodes, graphEdges) : []
))

function selectNode(id: string): void {
	selectedId.value = selectedId.value === id ? '' : id
}

// - 關閉詳情後把焦點送回剛才選取的節點，鍵盤操作不會掉回頁首
async function closeDetail(): Promise<void> {
	const selectedNodeId = selectedId.value
	selectedId.value = ''
	await canvasRef.value?.focusNode(selectedNodeId)
}

onMounted(() => {
	// @ 首頁星圖以 ?focus= 帶入主題：可能是節點名稱，也可能是叢集名稱
	const focus = typeof route.query.focus === 'string' ? route.query.focus.trim() : ''
	if (!focus) return

	const byId = graphNodes.find((node) => node.id === focus)
	const byLabel = graphNodes.find((node) => node.label === focus)
	const byCluster = graphNodes.find((node) => node.cluster === focus && node.type === '制度')
	selectedId.value = byId?.id ?? byLabel?.id ?? byCluster?.id ?? ''
})
</script>

<template>
	<div :class="{ 'page-shell': !props.embedded, 'graph-embedded': props.embedded }">
		<PageHeader
			v-if="!props.embedded"
			eyebrow="探索關聯"
			title="知識圖譜"
			:description="`目前顯示「${currentKnowledgeSource.name}」知識庫中，制度、流程、部門與專有名詞之間的關聯。`"
		/>

		<div class="graph-layout" :class="{ 'has-selection': Boolean(selectedNode) }">
			<KnowledgeGraphCanvas
				ref="canvasRef"
				v-model:selected-id="selectedId"
				v-model:hovered-id="hoveredId"
				:nodes="graphNodes"
				:edges="canvasEdges"
				:clusters="graphClusters"
				:node-types="GRAPH_NODE_TYPES"
			/>

			<aside v-if="selectedNode" class="surface-border pa-5 graph-detail" aria-label="節點詳情">
				<div class="detail-heading">
					<div>
						<p class="eyebrow text-primary mb-2">目前節點</p>
						<h2 class="text-h5 font-weight-bold">{{ selectedNode.label }}</h2>
					</div>
					<VBtn
						icon="mdi-close"
						variant="text"
						size="small"
						aria-label="關閉節點詳情"
						@click="closeDetail"
					/>
				</div>
				<div class="d-flex align-center ga-2 mt-3">
					<VChip size="small" variant="tonal">{{ selectedNode.type }}</VChip>
					<VChip size="small" variant="outlined">{{ selectedNode.cluster }}</VChip>
				</div>
				<p class="detail-hint mt-3">與 {{ relatedNodes.length }} 個知識節點直接相關。</p>

				<VDivider class="my-5" />

				<p class="text-caption font-weight-bold mb-2">關聯節點</p>
				<ul class="related-list">
					<li v-for="related in relatedNodes" :key="related.node.id">
						<button
							type="button"
							class="related-item"
							@click="selectNode(related.node.id)"
							@mouseenter="hoveredId = related.node.id"
							@mouseleave="hoveredId = ''"
						>
							<span class="related-label">{{ related.node.label }}</span>
							<span class="related-relation">{{ related.label }}</span>
						</button>
					</li>
				</ul>

				<VDivider class="my-5" />

				<p class="text-caption font-weight-bold mb-2">相關文件</p>
				<VList v-if="relatedDocuments.length" density="compact">
					<VListItem
						v-for="document in relatedDocuments"
						:key="document.id"
						:to="`/documents/${document.id}`"
						:title="document.title"
						:subtitle="document.category"
						prepend-icon="mdi-file-document-outline"
					/>
				</VList>
				<p v-else class="detail-empty">目前沒有可瀏覽的相關文件。</p>
			</aside>
		</div>
	</div>
</template>

<style scoped>
.graph-embedded {
	min-width: 0;
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

.detail-hint {
	font-size: 0.86rem;
	line-height: 1.6;
	color: var(--ink-muted);
}

.detail-empty {
	margin: 0;
	color: var(--ink-muted);
	font-size: 0.84rem;
	line-height: 1.6;
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
</style>
