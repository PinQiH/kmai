<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'

const search = ref('')
const selectedType = ref('全部類型')
const selectedNode = ref('差旅管理')
const nodeTypes = ['全部類型', '制度', '流程', '部門', '角色', '專有名詞']
const nodes = [
	{ label: '差旅管理', x: 50, y: 48, size: 84, type: '制度' },
	{ label: '費用報支', x: 24, y: 28, size: 66, type: '流程' },
	{ label: '財務部', x: 76, y: 25, size: 58, type: '部門' },
	{ label: '出差申請', x: 20, y: 72, size: 62, type: '流程' },
	{ label: '住宿標準', x: 74, y: 72, size: 58, type: '專有名詞' },
]

const visibleNodes = computed(() => nodes.filter((node) => {
	const matchesSearch = !search.value.trim() || node.label.includes(search.value.trim())
	const matchesType = selectedType.value === '全部類型' || node.type === selectedType.value
	return matchesSearch && matchesType
}))
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="探索關聯" title="知識圖譜" description="從制度、流程、部門與專有名詞之間的關聯，找到不容易用關鍵字發現的知識。" />
		<div class="graph-toolbar mb-5">
			<VTextField v-model="search" label="搜尋節點" prepend-inner-icon="mdi-magnify" hide-details clearable />
			<VSelect v-model="selectedType" :items="nodeTypes" label="節點類型" hide-details />
		</div>
		<div class="graph-layout">
			<VCard class="graph-canvas surface-border" aria-label="知識圖譜互動示意">
				<svg class="edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					<line x1="50" y1="48" x2="24" y2="28" /><line x1="50" y1="48" x2="76" y2="25" />
					<line x1="50" y1="48" x2="20" y2="72" /><line x1="50" y1="48" x2="74" y2="72" />
				</svg>
				<button
					v-for="node in visibleNodes"
					:key="node.label"
					class="graph-node"
					:class="{ 'is-selected': selectedNode === node.label }"
					:style="{ left: `${node.x}%`, top: `${node.y}%`, width: `${node.size}px`, height: `${node.size}px` }"
					:aria-pressed="selectedNode === node.label"
					@click="selectedNode = node.label"
				>
					<span>{{ node.label }}</span>
				</button>
			</VCard>
			<VCard class="surface-border pa-5">
				<p class="eyebrow text-primary mb-2">目前節點</p>
				<h2 class="text-h5 font-weight-bold">{{ selectedNode }}</h2>
				<p class="text-body-2 text-medium-emphasis mt-2">與 4 個知識節點及 3 份文件直接相關。</p>
				<VDivider class="my-5" />
				<p class="text-caption font-weight-bold mb-2">相關文件</p>
				<VList density="compact">
					<VListItem to="/documents/doc-001" title="員工差旅與費用報支辦法" subtitle="直接來源" prepend-icon="mdi-file-document-outline" />
					<VListItem to="/documents/doc-002" title="新進同仁到職指南" subtitle="共同包含：申請流程" prepend-icon="mdi-file-document-outline" />
				</VList>
			</VCard>
		</div>
	</div>
</template>

<style scoped>
.graph-toolbar {
	display: grid;
	grid-template-columns: minmax(260px, 1fr) 220px;
	gap: 12px;
}

.graph-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 320px;
	gap: 20px;
}

.graph-canvas {
	position: relative;
	min-height: 560px;
	overflow: hidden;
	background-image: radial-gradient(circle, rgba(var(--v-theme-outline), 0.45) 1px, transparent 1px);
	background-size: 24px 24px;
}

.edges {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.edges line {
	stroke: rgb(var(--v-theme-outline));
	stroke-width: 0.35;
}

.graph-node {
	position: absolute;
	display: grid;
	place-items: center;
	transform: translate(-50%, -50%);
	padding: 8px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 50%;
	background: rgb(var(--v-theme-surface));
	color: rgb(var(--v-theme-on-surface));
	cursor: pointer;
	font: inherit;
	font-size: 0.72rem;
	font-weight: 700;
	text-align: center;
}

.graph-node.is-selected {
	border: 3px solid rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-primary));
}

@media (max-width: 900px) {
	.graph-layout,
	.graph-toolbar {
		grid-template-columns: 1fr;
	}

	.graph-canvas {
		min-height: 420px;
	}
}
</style>
