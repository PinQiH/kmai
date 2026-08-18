<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import {
	GRAPH_CLUSTERS,
	GRAPH_NODE_TYPES,
	getNeighbors,
	graphEdges,
	graphNodes,
	type GraphNodeType,
	type KnowledgeGraphNode,
} from '@/mocks/graph'
import { ForceLayout, type ForceLink } from '@/utils/force-layout'

const ALL_TYPES = '全部類型'

// @ 與 VSelect 的 items 對齊；宣告成寬鬆的 string 會讓 v-model 的型別推導失敗
type TypeFilter = GraphNodeType | typeof ALL_TYPES

/*
 * > 視覺編碼
 * @ 顏色 = 所屬主題群，半徑 = 關聯數（重要度）。
 * !! 先前用「形狀」編碼類型是失敗的設計：8~13px 下三角形與菱形分辨不出來，
 *    資訊沒傳達到，只讓畫面碎成一地雜點。類型改由 hover 標籤與右側面板用文字表達。
 */
const LABEL_DEGREE_THRESHOLD = 3
const LABEL_FONT_SIZE = 12
const LABEL_LINE_HEIGHT = 16

const route = useRoute()

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

// > 關聯數：決定節點大小與是否常駐標籤
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
		radius: 6 + degree * 2,
		// @ 關聯數高者是樞紐，值得常駐標籤；其餘靠 hover 或選取顯示
		isHub: degree >= LABEL_DEGREE_THRESHOLD,
	}
})

const selectedNode = computed<KnowledgeGraphNode | null>(
	() => graphNodes.find((node) => node.id === selectedId.value) ?? null,
)

const relatedNodes = computed(() => (selectedId.value ? getNeighbors(selectedId.value) : []))

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
	const active = selectedId.value
	const neighbors = active ? neighborIds.get(active) : undefined
	const dimmedSet = dimmedIds.value

	return graphNodes.map((node, index) => {
		const point = positions?.[index]
		const style = nodeStyles[index]
		const dimmed = dimmedSet.has(node.id)
		const isSelected = node.id === active
		const isNeighbor = Boolean(neighbors?.has(node.id))
		return {
			node,
			...style,
			x: point?.x ?? 0,
			y: point?.y ?? 0,
			dimmed,
			isSelected,
			// @ 有選取節點時，非關聯者一律退到背景，讓關聯路徑成為唯一焦點
			faded: dimmed || Boolean(active && !isSelected && !isNeighbor),
		}
	})
})

const edgeViews = computed(() => {
	void tick.value
	const positions = layout.value?.nodes
	const active = selectedId.value

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
			// @ 連線用起點所屬群組的顏色，讓叢集的邊界在視覺上更清楚
			clusterIndex: nodeStyles[fromIndex].clusterIndex,
			active: touchesActive,
			faded: Boolean(active) && !touchesActive,
		}
	})
})

/*
 * - 標籤配置：以貪婪演算法避開彼此重疊
 * !! 這是前一版最主要的醜源——32 個中文標籤無條件全顯示，必然撞成一團。
 * @ 收斂期間完全不顯示常駐標籤：節點還在移動時碰撞結果每幀都不同，
 *   標籤會不斷閃現又消失。改成圖先長出來、穩定後標籤才浮現。
 */
const labelViews = computed(() => {
	const views = nodeViews.value
	const settled = isSettled.value
	const active = selectedId.value
	const hover = hoveredId.value
	const neighbors = active ? neighborIds.get(active) : undefined

	interface Placed {
		left: number
		right: number
		top: number
		bottom: number
	}

	const placed: Placed[] = []
	const result: { id: string, label: string, x: number, y: number, clusterIndex: number, emphasis: boolean }[] = []

	function tryPlace(view: typeof views[number], emphasis: boolean, force: boolean): void {
		if (view.dimmed) return
		// @ 中文字寬約等於字級，估算足夠精確
		const width = view.node.label.length * LABEL_FONT_SIZE
		const top = view.y + view.radius + 4
		const box: Placed = {
			left: view.x - width / 2,
			right: view.x + width / 2,
			top,
			bottom: top + LABEL_LINE_HEIGHT,
		}

		if (!force) {
			const overlaps = placed.some(
				(other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
			)
			if (overlaps) return
		}

		placed.push(box)
		result.push({
			id: view.node.id,
			label: view.node.label,
			x: view.x,
			y: top + LABEL_FONT_SIZE,
			clusterIndex: view.clusterIndex,
			emphasis,
		})
	}

	// > 必顯示的優先佔位：選取節點、它的鄰居、目前 hover 的節點
	for (const view of views) {
		const mustShow = view.node.id === active || view.node.id === hover
		if (mustShow) tryPlace(view, true, true)
	}
	if (neighbors) {
		for (const view of views) {
			if (neighbors.has(view.node.id)) tryPlace(view, true, false)
		}
	}

	// > 其餘樞紐節點在佈局穩定後才填入剩餘空間
	if (settled && !active) {
		const hubs = views.filter((view) => view.isHub).sort((a, b) => b.degree - a.degree)
		for (const view of hubs) {
			if (view.node.id === hover) continue
			tryPlace(view, false, false)
		}
	}

	return result
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
		const byLabel = graphNodes.find((node) => node.label === focus)
		const byCluster = graphNodes.find((node) => node.cluster === focus && node.type === '制度')
		selectedId.value = byLabel?.id ?? byCluster?.id ?? ''
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
	<div class="page-shell">
		<PageHeader
			eyebrow="探索關聯"
			title="知識圖譜"
			description="從制度、流程、部門與專有名詞之間的關聯，找到不容易用關鍵字發現的知識。"
		/>

		<div class="graph-toolbar mb-5">
			<VTextField v-model="search" label="搜尋節點" prepend-inner-icon="mdi-magnify" hide-details clearable />
			<VSelect v-model="selectedType" :items="[ALL_TYPES, ...GRAPH_NODE_TYPES]" label="節點類型" hide-details />
			<VBtn variant="tonal" prepend-icon="mdi-shuffle-variant" @click="rearrange">重新排列</VBtn>
		</div>

		<div class="graph-layout">
			<VCard class="graph-canvas surface-border">
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
							<circle class="node-dot" :r="view.radius" />
						</g>

						<!-- @ 標籤獨立成一層畫在最上面，才不會被後續節點蓋住 -->
						<g class="labels">
							<text
								v-for="label in labelViews"
								:key="label.id"
								class="node-label"
								:class="[`cluster-${label.clusterIndex}`, { 'is-emphasis': label.emphasis }]"
								:x="label.x"
								:y="label.y"
							>{{ label.label }}</text>
						</g>
					</svg>

					<ul class="graph-legend" aria-label="主題群圖例">
						<li v-for="(cluster, index) in GRAPH_CLUSTERS" :key="cluster" :class="`cluster-${index}`">
							<span class="legend-dot" aria-hidden="true" />{{ cluster }}
						</li>
					</ul>

					<p v-if="!isSettled" class="graph-status" role="status">正在計算關聯佈局…</p>
					<p v-else-if="matchedCount === 0" class="graph-status" role="status">
						沒有節點符合目前的搜尋與類型條件。
					</p>
				</div>
			</VCard>

			<VCard class="surface-border pa-5 graph-detail">
				<template v-if="selectedNode">
					<p class="eyebrow text-primary mb-2">目前節點</p>
					<h2 class="text-h5 font-weight-bold">{{ selectedNode.label }}</h2>
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
					<VList density="compact">
						<VListItem
							to="/documents/doc-001"
							title="員工差旅與費用報支辦法"
							subtitle="直接來源"
							prepend-icon="mdi-file-document-outline"
						/>
						<VListItem
							to="/documents/doc-002"
							title="新進同仁到職指南"
							subtitle="共同包含：申請流程"
							prepend-icon="mdi-file-document-outline"
						/>
					</VList>
				</template>

				<template v-else>
					<p class="eyebrow text-primary mb-2">尚未選取</p>
					<h2 class="text-h6 font-weight-bold">點選任一節點</h2>
					<p class="detail-hint mt-2">
						圓點越大代表關聯越多，顏色代表所屬主題群。
						選取後會標示出它的關聯路徑，其餘節點退到背景。
						節點可以拖曳重新擺放，也可以用 Tab 鍵逐一瀏覽、Enter 選取。
					</p>
				</template>
			</VCard>
		</div>
	</div>
</template>

<style scoped>
/*
 * > 主題群色票
 * @ 五個色相刻意壓低彩度，與暖灰底一致；不是螢光或漸層。
 *   深色主題整組提亮並降彩度，維持與 Night Surface 的對比。
 * @ 這是 DESIGN.md 之外的新增色票（章程原本只有單一 Archive Indigo），
 *   理由：分群是這一頁的核心資訊，只用單色無法表達五個群的邊界。
 */
.graph-canvas {
	--cluster-0: #31649b;
	--cluster-1: #7d4e7a;
	--cluster-2: #96453f;
	--cluster-3: #3f7355;
	--cluster-4: #8a6a2c;
}

/* @ theme class 掛在祖先的 v-application 上；scoped 只會替最後一個選擇器加 data-v，故可直接寫 */
.v-theme--dark .graph-canvas {
	--cluster-0: #8fb6e0;
	--cluster-1: #c99bc6;
	--cluster-2: #e39b94;
	--cluster-3: #8fc9a8;
	--cluster-4: #d8bd7e;
}

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
	grid-template-columns: minmax(240px, 1fr) 200px auto;
	gap: var(--space-sm);
	align-items: center;
}

.graph-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 320px;
	gap: var(--space-lg);
}

.graph-canvas {
	overflow: hidden;
}

.canvas-inner {
	position: relative;
	width: 100%;
	height: 620px;
}

.graph-svg {
	display: block;
	width: 100%;
	height: 100%;
	touch-action: none;
}

/* > 連線：安靜的細線，只有選取節點的關聯路徑會亮起並流動 */
.edges line {
	stroke: var(--node-color);
	stroke-width: 1;
	opacity: 0.32;
	transition: opacity var(--motion-base) var(--ease-standard);
}

.edges line.is-faded {
	opacity: 0.1;
}

.edges line.is-active {
	stroke-width: 1.8;
	opacity: 0.9;
	stroke-dasharray: 5 7;
	animation: edge-flow 1.1s linear infinite;
}

@keyframes edge-flow {
	to {
		stroke-dashoffset: -24;
	}
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

/* @ 擴大命中範圍但不改變視覺尺寸，小節點才點得到 */
.hit-area {
	fill: transparent;
}

.node-dot {
	fill: var(--node-color);
	stroke: rgb(var(--v-theme-surface));
	stroke-width: 2;
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
	stroke: rgb(var(--v-theme-surface));
	stroke-width: 3;
}

/* @ SVG 元素不吃全域的 :focus-visible outline，要自己畫 */
.graph-node:focus-visible {
	outline: none;
}

.graph-node:focus-visible .node-dot {
	stroke: rgb(var(--v-theme-primary));
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
	.graph-toolbar {
		grid-template-columns: 1fr;
	}

	.canvas-inner {
		height: 440px;
	}
}
</style>
