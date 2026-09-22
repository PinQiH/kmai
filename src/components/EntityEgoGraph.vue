<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from 'vuetify'

import { GRAPH_CLUSTERS } from '@/repositories/graph.repository'
import type { GraphEntity } from '@/repositories/graph.repository'
import { clusterPalette } from '@/theme'

// > 實體抽屜內的一階關聯小圖：只畫中心實體與直接相連者，協助判斷重複名稱與雜訊
// @ 刻意不用力導向；節點少且固定環狀排列，每次打開位置一致，也不耗 CPU

interface Relation {
	entity: GraphEntity
	label: string
	direction: 'out' | 'in'
}

interface ComponentProps {
	center: GraphEntity
	relations: Relation[]
}

const props = defineProps<ComponentProps>()
const emit = defineEmits<{ select: [entityId: string] }>()

const MAX_NEIGHBORS = 12
const WIDTH = 400
const HEIGHT = 260
const CX = WIDTH / 2
const CY = HEIGHT / 2

const theme = useTheme()

// @ 主題色依 useTheme 在 script 算好，不依賴 .v-theme--dark 後代選擇器（見專案記憶）
function clusterColor(cluster: string): string {
	const palette = theme.global.current.value.dark ? clusterPalette.dark : clusterPalette.light
	const index = GRAPH_CLUSTERS.indexOf(cluster as typeof GRAPH_CLUSTERS[number])
	return palette[index >= 0 ? index % palette.length : 0]!
}

/** 同一鄰居可能有多條關係，合併成一個節點、關係名稱以頓號串接。 */
const neighbors = computed(() => {
	const byId = new Map<string, { entity: GraphEntity; labels: string[] }>()
	for (const relation of props.relations) {
		const text = relation.direction === 'out' ? relation.label : `被${relation.label}`
		const current = byId.get(relation.entity.id)
		if (current) current.labels.push(text)
		else byId.set(relation.entity.id, { entity: relation.entity, labels: [text] })
	}
	return [...byId.values()]
})

const placed = computed(() => {
	const visible = neighbors.value.slice(0, MAX_NEIGHBORS)
	const count = visible.length
	return visible.map((item, index) => {
		const angle = (index / count) * Math.PI * 2 - Math.PI / 2
		const x = CX + Math.cos(angle) * 150
		const y = CY + Math.sin(angle) * 92
		return { ...item, x, y, labelY: y < CY ? y - 12 : y + 20, color: clusterColor(item.entity.cluster) }
	})
})

const hiddenCount = computed(() => Math.max(0, neighbors.value.length - MAX_NEIGHBORS))
// 鄰居一多，關係文字會互相壓住，只在少量時顯示
const showEdgeLabels = computed(() => placed.value.length <= 6)

function shorten(text: string, max = 7): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
</script>

<template>
	<figure class="ego-graph">
		<svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" :aria-label="`「${center.label}」與 ${neighbors.length} 個直接相連實體的關聯圖`" data-testid="entity-ego-graph">
			<g class="ego-edges" aria-hidden="true">
				<line v-for="node in placed" :key="`edge-${node.entity.id}`" :x1="CX" :y1="CY" :x2="node.x" :y2="node.y" :stroke="node.color" stroke-width="2.5" stroke-opacity="0.85" stroke-linecap="round" />
				<template v-if="showEdgeLabels">
					<text v-for="node in placed" :key="`edge-label-${node.entity.id}`" :x="(CX + node.x) / 2" :y="(CY + node.y) / 2 - 4" text-anchor="middle" class="edge-label">{{ shorten(node.labels.join('、'), 6) }}</text>
				</template>
			</g>

			<g
				v-for="node in placed"
				:key="node.entity.id"
				class="ego-node"
				role="button"
				tabindex="0"
				:aria-label="`${node.entity.label}（${node.entity.type}，${node.labels.join('、')}），開啟這個實體`"
				@click="emit('select', node.entity.id)"
				@keydown.enter.prevent="emit('select', node.entity.id)"
				@keydown.space.prevent="emit('select', node.entity.id)"
			>
				<title>{{ node.entity.label }} · {{ node.labels.join('、') }}</title>
				<circle :cx="node.x" :cy="node.y" r="8" :fill="node.color" />
				<text :x="node.x" :y="node.labelY" text-anchor="middle" class="node-label">{{ shorten(node.entity.label) }}</text>
			</g>

			<g class="ego-center" aria-hidden="true">
				<circle :cx="CX" :cy="CY" r="13" :fill="clusterColor(center.cluster)" />
				<text :x="CX" :y="CY + 30" text-anchor="middle" class="center-label">{{ shorten(center.label, 9) }}</text>
			</g>

			<text v-if="!placed.length" :x="CX" :y="CY - 26" text-anchor="middle" class="empty-label">沒有直接相連的實體</text>
		</svg>
		<figcaption v-if="hiddenCount" class="ego-caption">圖上只顯示 {{ MAX_NEIGHBORS }} 個，另有 {{ hiddenCount }} 個列在下方清單。</figcaption>
	</figure>
</template>

<style scoped>
.ego-graph { margin: 0 0 var(--space-sm); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 2%); }
.ego-graph svg { display: block; width: 100%; height: auto; }
/* @ 線色直接用鄰居的群組色並寫在屬性上；灰階半透明線在淺底上即使 55% 仍被回報不明顯 */
/* 關係文字加底色描邊，壓在線上時仍可讀 */
.edge-label { fill: var(--ink-strong, rgb(var(--v-theme-on-surface))); font-size: 10px; stroke: rgb(var(--v-theme-surface)); stroke-width: 3px; paint-order: stroke; }
.node-label { fill: var(--ink-muted); font-size: 11px; }
.center-label { fill: rgb(var(--v-theme-on-surface)); font-size: 12px; font-weight: 700; }
.empty-label { fill: var(--ink-muted); font-size: 12px; }
.ego-node { cursor: pointer; outline: none; }
.ego-node circle { stroke: rgb(var(--v-theme-surface)); stroke-width: 2; paint-order: stroke; transition: stroke-width 160ms cubic-bezier(0.16, 1, 0.3, 1); }
/* SVG 節點不吃全域 focus-visible outline，改以加粗描邊表示焦點 */
.ego-node:hover circle, .ego-node:focus-visible circle { stroke: rgb(var(--v-theme-primary)); stroke-width: 3; }
.ego-node:hover .node-label, .ego-node:focus-visible .node-label { fill: rgb(var(--v-theme-on-surface)); font-weight: 600; }
.ego-caption { padding: 0 var(--space-sm) var(--space-sm); color: var(--ink-muted); font-size: 0.76rem; }
@media (prefers-reduced-motion: reduce) { .ego-node circle { transition: none; } }
</style>
