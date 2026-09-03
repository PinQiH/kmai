<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'

import PageHeader from '@/components/PageHeader.vue'
import {
	GRAPH_CLUSTERS,
	GRAPH_NODE_TYPES,
	getKnowledgeGraphBySourceId,
	getNeighbors,
	type GraphNodeType,
	type KnowledgeGraphNode,
} from '@/mocks/graph'
import { getEmployeeDocumentsBySourceId } from '@/repositories/knowledge.repository'
import { clusterPalette } from '@/theme'
import { ForceLayout, type ForceLink } from '@/utils/force-layout'
import { DEFAULT_ASK_SOURCE_ID, getCompanyKnowledgeSourceById } from '@/utils/knowledgeSources'

interface ComponentProps {
	embedded?: boolean
	knowledgeSourceId?: string
}

const props = withDefaults(defineProps<ComponentProps>(), {
	embedded: false,
	knowledgeSourceId: '',
})

const ALL_TYPES = '全部類型'

// @ 與 VSelect 的 items 對齊；宣告成寬鬆的 string 會讓 v-model 的型別推導失敗
type TypeFilter = GraphNodeType | typeof ALL_TYPES

/*
 * > 視覺編碼
 * @ 顏色 = 所屬主題群，半徑 = 關聯數（重要度）。
 * !! 先前用「形狀」編碼類型是失敗的設計：8~13px 下三角形與菱形分辨不出來，
 *    資訊沒傳達到，只讓畫面碎成一地雜點。類型改由無障礙名稱與右側面板用文字表達。
 */
const LABEL_OFFSET_Y = 16

const route = useRoute()
const theme = useTheme()

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

const isDark = computed(() => theme.current.value.dark)

/*
 * !! 用 JS 依主題選色，**不要**改回 CSS 的 `.v-theme--dark .graph-canvas`：
 *    Vuetify 的 VCard 自己就帶 themeClasses，`v-theme--dark` 與 `graph-canvas`
 *    會落在同一個元素上，後代選擇器永遠匹配不到，深色覆寫會靜默失效。
 */
const clusterVars = computed<Record<string, string>>(() => {
	const palette = isDark.value ? clusterPalette.dark : clusterPalette.light
	const vars: Record<string, string> = {}
	palette.forEach((color, index) => {
		vars[`--cluster-${index}`] = color
	})
	return vars
})

const search = ref('')
const selectedType = ref<TypeFilter>(ALL_TYPES)
const selectedId = ref('')
const hoveredId = ref('')
const canvas = ref<HTMLElement | null>(null)
const size = ref({ width: 960, height: 620 })
// @ 力導向每個時間步 +1，作為 SVG 重繪的唯一觸發來源
const tick = ref(0)
const isSettled = ref(false)

const layout = shallowRef<ForceLayout | null>(null)

let frameId = 0
let resizeObserver: ResizeObserver | null = null
let reduceMotion = false
let dragIndex = -1
let dragMoved = false
let dragStartX = 0
let dragStartY = 0

const nodeIndexById = new Map(graphNodes.map((node, index) => [node.id, index]))
const clusterIndexOf = new Map(GRAPH_CLUSTERS.map((cluster, index) => [cluster as string, index]))

// > 邊改以索引表示，力導向不需要再查表
const links: ForceLink[] = graphEdges
	.map((edge) => ({
		source: nodeIndexById.get(edge.from) ?? -1,
		target: nodeIndexById.get(edge.to) ?? -1,
	}))
	.filter((link) => link.source >= 0 && link.target >= 0)

// > 關聯數：決定節點大小
const degreeById = new Map<string, number>(graphNodes.map((node) => [node.id, 0]))
const neighborIds = new Map<string, Set<string>>(graphNodes.map((node) => [node.id, new Set<string>()]))
for (const edge of graphEdges) {
	degreeById.set(edge.from, (degreeById.get(edge.from) ?? 0) + 1)
	degreeById.set(edge.to, (degreeById.get(edge.to) ?? 0) + 1)
	neighborIds.get(edge.from)?.add(edge.to)
	neighborIds.get(edge.to)?.add(edge.from)
}

// > 靜態的節點視覺屬性，不隨每幀變動
const nodeStyles = graphNodes.map((node) => {
	const degree = degreeById.get(node.id) ?? 0
	return {
		degree,
		clusterIndex: clusterIndexOf.get(node.cluster) ?? 0,
		radius: Math.min(11, 4 + degree * 1.5),
	}
})

const selectedNode = computed<KnowledgeGraphNode | null>(
	() => graphNodes.find((node) => node.id === selectedId.value) ?? null,
)

const relatedNodes = computed(() => (
	selectedId.value ? getNeighbors(selectedId.value, graphNodes, graphEdges) : []
))

function getClusterClass(cluster: string): string {
	return `cluster-${clusterIndexOf.get(cluster) ?? 0}`
}

// - 篩選只影響顯示強度，不從模擬中移除節點（移除會讓整張圖重新彈開）
function matchesFilter(node: KnowledgeGraphNode): boolean {
	const keyword = search.value.trim()
	const matchesKeyword = !keyword || node.label.includes(keyword) || node.cluster.includes(keyword)
	const matchesType = selectedType.value === ALL_TYPES || node.type === selectedType.value
	return matchesKeyword && matchesType
}

/*
 * > 篩選結果單獨快取
 * @ 這個 computed 不依賴 tick，字串比對只在搜尋條件變動時做一次；
 *   若併進 nodeViews，收斂期間每幀都會重跑 32 次 includes。
 */
const dimmedIds = computed(() => {
	const result = new Set<string>()
	for (const node of graphNodes) {
		if (!matchesFilter(node)) result.add(node.id)
	}
	return result
})

const matchedCount = computed(() => graphNodes.length - dimmedIds.value.size)

// > 繪製用的節點快照，依賴 tick 重算
const nodeViews = computed(() => {
	void tick.value
	const positions = layout.value?.nodes
	const selected = selectedId.value
	const focused = hoveredId.value || selected
	const neighbors = focused ? neighborIds.get(focused) : undefined
	const dimmedSet = dimmedIds.value

	return graphNodes.map((node, index) => {
		const point = positions?.[index]
		const style = nodeStyles[index]
		const dimmed = dimmedSet.has(node.id)
		const isSelected = node.id === selected
		const isNeighbor = Boolean(neighbors?.has(node.id))
		return {
			node,
			...style,
			x: point?.x ?? 0,
			y: point?.y ?? 0,
			dimmed,
			isSelected,
			// @ hover 或選取節點時，非關聯者退到背景，讓關聯路徑成為唯一焦點
			faded: dimmed || Boolean(focused && node.id !== focused && !isNeighbor),
		}
	})
})

const edgeViews = computed(() => {
	void tick.value
	const positions = layout.value?.nodes
	const active = hoveredId.value || selectedId.value
	const activeIndex = active ? nodeIndexById.get(active) : undefined
	const activeClusterIndex = activeIndex === undefined ? 0 : nodeStyles[activeIndex].clusterIndex

	return graphEdges.map((edge, index) => {
		const fromIndex = nodeIndexById.get(edge.from) ?? 0
		const from = positions?.[fromIndex]
		const to = positions?.[nodeIndexById.get(edge.to) ?? 0]
		const touchesActive = Boolean(active) && (edge.from === active || edge.to === active)
		return {
			key: `${edge.from}-${edge.to}-${index}`,
			x1: from?.x ?? 0,
			y1: from?.y ?? 0,
			x2: to?.x ?? 0,
			y2: to?.y ?? 0,
			clusterIndex: activeClusterIndex,
			active: touchesActive,
			faded: Boolean(active) && !touchesActive,
		}
	})
})

/*
 * - 排列穩定後顯示所有節點標籤
 * @ 排列期間只保留互動中的節點標籤，避免重新排列時所有文字一起抖動。
 */
const labelViews = computed(() => {
	const views = nodeViews.value
	const settled = isSettled.value
	const active = selectedId.value
	const hover = hoveredId.value

	return views
		.filter((view) => !view.dimmed)
		.filter((view) => settled || Boolean(active) || view.node.id === hover)
		.map((view) => ({
			id: view.node.id,
			label: view.node.label,
			x: view.x,
			y: view.y + view.radius + LABEL_OFFSET_Y,
			clusterIndex: view.clusterIndex,
			emphasis: view.node.id === active || view.node.id === hover,
			faded: view.faded,
		}))
})

// - 建立佈局；尺寸改變時沿用既有位置只做 resize
function createLayout(): void {
	layout.value = new ForceLayout({
		ids: graphNodes.map((node) => node.id),
		links,
		clusterIndexes: nodeStyles.map((style) => style.clusterIndex),
		options: { width: size.value.width, height: size.value.height },
	})

	if (reduceMotion) {
		// @ 減少動態時不播放展開過程，直接呈現收斂後的結果
		layout.value.settle()
		isSettled.value = true
		tick.value += 1
		return
	}

	startLoop()
}

function startLoop(): void {
	if (frameId !== 0 || reduceMotion) return
	isSettled.value = false
	frameId = requestAnimationFrame(step)
}

function step(): void {
	const simulation = layout.value
	if (!simulation) {
		frameId = 0
		return
	}

	simulation.tick()
	tick.value += 1

	// !! 收斂就停止 rAF。少了這一段，這一頁只要開著就會持續佔用 CPU
	if (simulation.isSettled && dragIndex < 0) {
		frameId = 0
		isSettled.value = true
		return
	}

	frameId = requestAnimationFrame(step)
}

function stopLoop(): void {
	if (frameId === 0) return
	cancelAnimationFrame(frameId)
	frameId = 0
}

function rearrange(): void {
	layout.value?.reheat(0.8)
	startLoop()
}

function selectNode(id: string): void {
	selectedId.value = selectedId.value === id ? '' : id
}

async function closeDetail(): Promise<void> {
	const selectedNodeId = selectedId.value
	selectedId.value = ''
	await nextTick()

	const nodes = canvas.value?.querySelectorAll<SVGGElement>('.graph-node')
	const selectedElement = nodes
		? Array.from(nodes).find((node) => node.dataset.nodeId === selectedNodeId)
		: undefined
	selectedElement?.focus()
}

// - 指標按下：準備拖曳，同時記錄起點以區分點擊與拖曳
function handlePointerDown(event: PointerEvent, index: number): void {
	const target = event.currentTarget as SVGGElement
	target.setPointerCapture?.(event.pointerId)
	dragIndex = index
	dragMoved = false
	dragStartX = event.clientX
	dragStartY = event.clientY

	const point = layout.value?.nodes[index]
	if (point) point.pinned = true
}

function handlePointerMove(event: PointerEvent): void {
	if (dragIndex < 0 || !canvas.value) return
	if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 4) dragMoved = true

	const rect = canvas.value.getBoundingClientRect()
	const point = layout.value?.nodes[dragIndex]
	if (!point) return

	// @ viewBox 與容器尺寸 1:1，可直接用像素座標
	point.x = event.clientX - rect.left
	point.y = event.clientY - rect.top
	// @ 拖曳中即使已收斂也要重繪；靜止模式沒有 rAF，靠這裡推進畫面
	tick.value += 1
	if (!reduceMotion) {
		layout.value?.reheat(0.3)
		startLoop()
	}
}

function handlePointerUp(event: PointerEvent, id: string, index: number): void {
	const target = event.currentTarget as SVGGElement
	target.releasePointerCapture?.(event.pointerId)

	const point = layout.value?.nodes[index]
	if (point) point.pinned = false

	// @ 位移在 4px 內視為點擊，避免拖完手一鬆就切換選取
	if (!dragMoved) selectNode(id)

	dragIndex = -1
	dragMoved = false
	if (!reduceMotion) startLoop()
}

function measure(): void {
	const element = canvas.value
	if (!element) return
	const width = element.clientWidth
	const height = element.clientHeight
	if (width <= 0 || height <= 0) return
	if (width === size.value.width && height === size.value.height) return

	size.value = { width, height }
	layout.value?.resize({ width, height })

	if (reduceMotion) {
		layout.value?.settle()
		tick.value += 1
		return
	}
	startLoop()
}

onMounted(() => {
	reduceMotion = typeof window.matchMedia === 'function'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches

	const element = canvas.value
	if (element) {
		size.value = {
			width: element.clientWidth || 960,
			height: element.clientHeight || 620,
		}
	}

	createLayout()

	// @ 首頁星圖以 ?focus= 帶入主題：可能是節點名稱，也可能是叢集名稱
	const focus = typeof route.query.focus === 'string' ? route.query.focus.trim() : ''
	if (focus) {
		const byId = graphNodes.find((node) => node.id === focus)
		const byLabel = graphNodes.find((node) => node.label === focus)
		const byCluster = graphNodes.find((node) => node.cluster === focus && node.type === '制度')
		selectedId.value = byId?.id ?? byLabel?.id ?? byCluster?.id ?? ''
	}

	if (element) {
		resizeObserver = new ResizeObserver(measure)
		resizeObserver.observe(element)
	}
})

onBeforeUnmount(() => {
	stopLoop()
	resizeObserver?.disconnect()
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

		<!-- @ 色票以 inline 自訂屬性下放，才不會受 Vuetify theme class 的掛載位置影響 -->
		<div
			class="graph-layout"
			:class="{ 'is-dark': isDark, 'has-selection': Boolean(selectedNode) }"
			:style="clusterVars"
		>
			<section class="graph-workspace surface-border" aria-label="知識圖譜工作區">
				<div class="graph-toolbar">
					<VTextField
						v-model="search"
						label="搜尋節點"
						prepend-inner-icon="mdi-magnify"
						density="compact"
						variant="outlined"
						hide-details
						clearable
					/>
					<VSelect
						v-model="selectedType"
						:items="[ALL_TYPES, ...GRAPH_NODE_TYPES]"
						label="節點類型"
						density="compact"
						variant="outlined"
						hide-details
					/>
					<VBtn
						class="graph-rearrange-action"
						icon="mdi-shuffle-variant"
						variant="text"
						size="small"
						aria-label="重新排列圖譜"
						title="重新排列圖譜"
						@click="rearrange"
					/>
				</div>

				<div ref="canvas" class="canvas-inner">
					<!-- @ 不要用 role="presentation"：內部節點是可聚焦的按鈕，需要保留語意樹 -->
					<svg :viewBox="`0 0 ${size.width} ${size.height}`" class="graph-svg" aria-label="知識圖譜關聯圖">
						<g class="edges">
							<line
								v-for="edge in edgeViews"
								:key="edge.key"
								:class="[`cluster-${edge.clusterIndex}`, { 'is-active': edge.active, 'is-faded': edge.faded }]"
								:x1="edge.x1"
								:y1="edge.y1"
								:x2="edge.x2"
								:y2="edge.y2"
							/>
						</g>

						<g
							v-for="(view, index) in nodeViews"
							:key="view.node.id"
							class="graph-node"
							:class="[
								`cluster-${view.clusterIndex}`,
								{ 'is-selected': view.isSelected, 'is-faded': view.faded, 'is-dimmed': view.dimmed },
							]"
							:transform="`translate(${view.x} ${view.y})`"
							:data-node-id="view.node.id"
							:tabindex="view.dimmed ? -1 : 0"
							role="button"
							:aria-pressed="view.isSelected"
							:aria-label="`${view.node.label}，${view.node.type}，屬於${view.node.cluster}，${view.degree} 個關聯`"
							@pointerdown="handlePointerDown($event, index)"
							@pointermove="handlePointerMove"
							@pointerup="handlePointerUp($event, view.node.id, index)"
							@pointerenter="hoveredId = view.node.id"
							@pointerleave="hoveredId = ''"
							@focus="hoveredId = view.node.id"
							@blur="hoveredId = ''"
							@keydown.enter.prevent="selectNode(view.node.id)"
							@keydown.space.prevent="selectNode(view.node.id)"
						>
							<circle class="hit-area" :r="view.radius + 10" />
							<circle v-if="view.isSelected" class="node-halo" :r="view.radius + 8" />
							<!-- @ 焦點環畫在節點外圈，顏色與節點無關，見下方樣式說明 -->
							<circle class="node-focus-ring" :r="view.radius + 4" />
							<circle class="node-dot" :r="view.radius" />
						</g>

						<!-- @ 標籤獨立成一層畫在最上面，才不會被後續節點蓋住 -->
						<g class="labels">
							<text
								v-for="label in labelViews"
								:key="label.id"
								class="node-label"
								:class="[
									`cluster-${label.clusterIndex}`,
									{ 'is-emphasis': label.emphasis, 'is-faded': label.faded },
								]"
								:x="label.x"
								:y="label.y"
							>{{ label.label }}</text>
						</g>
					</svg>

					<ul class="graph-legend" aria-label="主題群圖例">
						<li v-for="cluster in graphClusters" :key="cluster" :class="getClusterClass(cluster)">
							<span class="legend-dot" aria-hidden="true" />{{ cluster }}
						</li>
					</ul>

					<p class="graph-instruction">拖曳調整位置，點選節點查看詳情</p>

					<p v-if="!isSettled" class="graph-status" role="status">正在計算關聯佈局…</p>
					<p v-else-if="matchedCount === 0" class="graph-status" role="status">
						沒有節點符合目前的搜尋與類型條件。
					</p>
				</div>
			</section>

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
/*
 * @ --cluster-0 ~ 4 由 script 依主題以 inline style 下放到 .graph-layout。
 *   這是 DESIGN.md 之外的新增色票（章程原本只有單一 Archive Indigo），
 *   理由：分群是這一頁的核心資訊，只用單色無法表達五個群的邊界。
 */
.cluster-0 {
	--node-color: var(--cluster-0);
}

.cluster-1 {
	--node-color: var(--cluster-1);
}

.cluster-2 {
	--node-color: var(--cluster-2);
}

.cluster-3 {
	--node-color: var(--cluster-3);
}

.cluster-4 {
	--node-color: var(--cluster-4);
}

.graph-toolbar {
	display: grid;
	grid-template-columns: minmax(220px, 360px) 180px 36px;
	gap: var(--space-sm);
	align-items: center;
	padding: var(--space-sm) var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	background: rgb(var(--v-theme-background));
}

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

.graph-workspace {
	overflow: hidden;
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-background));
}

.canvas-inner {
	position: relative;
	width: 100%;
	height: clamp(480px, 64vh, 620px);
}

.graph-svg {
	display: block;
	width: 100%;
	height: 100%;
	touch-action: none;
}

/* > 連線：預設保持中性，只有 hover 或選取節點的關聯才使用所屬群組色 */
.edges line {
	stroke: rgb(var(--v-theme-on-surface));
	stroke-width: 1;
	opacity: 0.2;
	transition:
		stroke var(--motion-fast) var(--ease-standard),
		opacity var(--motion-fast) var(--ease-standard),
		stroke-width var(--motion-fast) var(--ease-standard);
}

/* @ 深色底上細線的視覺重量比淺色底輕，同樣的 opacity 會看不見 */
.is-dark .edges line {
	stroke-width: 1.2;
	opacity: 0.24;
}

.edges line.is-faded {
	opacity: 0.1;
}

.is-dark .edges line.is-faded {
	opacity: 0.14;
}

.edges line.is-active {
	stroke: var(--node-color);
	stroke-width: 1.6;
	opacity: 0.88;
}

.graph-node {
	cursor: grab;
	transition: opacity var(--motion-base) var(--ease-standard);
}

.graph-node:active {
	cursor: grabbing;
}

.graph-node.is-faded {
	opacity: 0.22;
}

.graph-node.is-dimmed {
	opacity: 0.08;
	pointer-events: none;
}

/* @ 退到背景的節點在深色底上掉得比淺色底快，補一點回來才不會整片消失 */
.is-dark .graph-node.is-faded {
	opacity: 0.3;
}

.is-dark .graph-node.is-dimmed {
	opacity: 0.14;
}

/* @ 擴大命中範圍但不改變視覺尺寸，小節點才點得到 */
.hit-area {
	fill: transparent;
}

.node-dot {
	fill: var(--node-color);
	stroke: rgb(var(--v-theme-background));
	stroke-width: 1.5;
}

.graph-node:hover .node-dot {
	stroke: var(--node-color);
}

.node-halo {
	fill: none;
	stroke: var(--node-color);
	stroke-width: 1.5;
	opacity: 0.45;
}

.graph-node.is-selected .node-dot {
	stroke: rgb(var(--v-theme-background));
	stroke-width: 3;
}

/* @ SVG 元素不吃全域的 :focus-visible outline，要自己畫 */
.graph-node:focus-visible {
	outline: none;
}

/*
 * !! 焦點環不可以用 primary 畫。
 *    primary #315C91 對第一群的節點色 #31649b 對比只有 1.12:1（ΔE 3.5），
 *    等於鍵盤焦點在那一群節點上完全看不見；凌群紅主題在磚紅那一群也是同樣狀況。
 *    改成雙環且顏色與節點無關：內圈畫布底色把環與節點隔開，
 *    外圈 on-surface 對畫布背景高對比。不論之後換什麼強調色或群組色都成立。
 */
.node-focus-ring {
	fill: none;
	stroke: none;
}

.graph-node:focus-visible .node-focus-ring {
	stroke: rgb(var(--v-theme-on-surface));
	stroke-width: 2;
}

.graph-node:focus-visible .node-dot {
	stroke: rgb(var(--v-theme-background));
	stroke-width: 3;
}

.labels {
	pointer-events: none;
}

/*
 * @ 標籤文字用中性墨色而非群組色：群組色為了在白底上當填色而壓低明度，
 *   拿來當 12px 文字會掉到 AA 以下。顏色資訊由圓點負責。
 */
.node-label {
	fill: var(--ink-muted);
	font-size: 12px;
	text-anchor: middle;
	user-select: none;
	animation: label-appear var(--motion-base) var(--ease-out) backwards;
}

.node-label.is-emphasis {
	fill: rgb(var(--v-theme-on-surface));
	font-weight: 700;
}

.node-label.is-faded {
	opacity: 0.22;
}

.is-dark .node-label.is-faded {
	opacity: 0.3;
}

@keyframes label-appear {
	from {
		opacity: 0;
	}

	to {
		opacity: 1;
	}
}

.graph-legend {
	position: absolute;
	left: var(--space-md);
	bottom: var(--space-md);
	display: flex;
	flex-wrap: wrap;
	gap: 2px var(--space-md);
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 0.72rem;
	color: var(--ink-subtle);
}

.graph-instruction {
	position: absolute;
	right: var(--space-md);
	bottom: var(--space-md);
	margin: 0;
	font-size: 0.72rem;
	color: var(--ink-subtle);
}

.graph-legend li {
	display: flex;
	align-items: center;
	gap: 6px;
}

.legend-dot {
	width: 9px;
	height: 9px;
	border-radius: 50%;
	background: var(--node-color);
}

.graph-status {
	position: absolute;
	top: var(--space-md);
	left: 50%;
	transform: translateX(-50%);
	margin: 0;
	font-size: 0.76rem;
	color: var(--ink-subtle);
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

	.graph-toolbar {
		grid-template-columns: minmax(0, 1fr) 160px 36px;
	}

	.canvas-inner {
		height: 440px;
	}
}

@media (max-width: 640px) {
	.graph-toolbar {
		grid-template-columns: minmax(0, 1fr) 36px;
	}

	.graph-toolbar :deep(.v-select) {
		grid-column: 1 / -1;
		grid-row: 2;
	}

	.graph-rearrange-action {
		grid-column: 2;
		grid-row: 1;
	}

	.graph-instruction {
		display: none;
	}
}
</style>
