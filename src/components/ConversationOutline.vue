<script setup lang="ts">
import { computed, ref } from 'vue'

import type { OutlineItem } from '@/types'

interface ComponentProps {
	items: OutlineItem[]
	activeId: string | null
}

const props = defineProps<ComponentProps>()

const emit = defineEmits<{ select: [messageId: string] }>()
const previewItemId = ref<string | null>(null)
const previewTop = ref(0)
const previewRight = ref(0)

const previewItem = computed(() => props.items.find((item) => item.id === previewItemId.value) ?? null)

function showPreview({ itemId, event }: { itemId: string; event: MouseEvent | FocusEvent }): void {
	if (!(event.currentTarget instanceof HTMLElement)) return
	const rect = event.currentTarget.getBoundingClientRect()
	previewItemId.value = itemId
	previewTop.value = rect.top + rect.height / 2
	previewRight.value = window.innerWidth - rect.left + 8
}

function hidePreview(itemId: string): void {
	if (previewItemId.value === itemId) previewItemId.value = null
}
</script>

<template>
	<nav v-if="items.length" class="outline-rail" aria-label="問題大綱">
		<ul class="rail-list">
			<li v-for="item in items" :key="item.id" class="rail-node">
				<button
					type="button"
					class="rail-item"
					:class="{ 'is-active': item.id === activeId }"
					:aria-label="`跳到第 ${item.seq} 個問題：${item.text}${item.summary ? `，回答摘要：${item.summary}` : ''}`"
					:aria-current="item.id === activeId ? 'true' : undefined"
					@mouseenter="showPreview({ itemId: item.id, event: $event })"
					@mouseleave="hidePreview(item.id)"
					@focus="showPreview({ itemId: item.id, event: $event })"
					@blur="hidePreview(item.id)"
					@click="emit('select', item.id)"
				>
					<span class="rail-marker" aria-hidden="true" />
				</button>
			</li>
		</ul>
	</nav>

	<Teleport to="body">
		<span
			v-if="previewItem"
			class="rail-tip"
			role="tooltip"
			:style="{ top: `${previewTop}px`, right: `${previewRight}px` }"
		>
			<span class="tip-section">
				<span class="tip-label">問題</span>
				<strong class="tip-question">{{ previewItem.text }}</strong>
			</span>
			<span v-if="previewItem.summary" class="tip-section">
				<span class="tip-label">回答</span>
				<span class="tip-summary">{{ previewItem.summary }}</span>
			</span>
		</span>
	</Teleport>
</template>

<style scoped>
/*
 * > 問題大綱：常駐的細刻度軌，不佔用閱讀寬度。
 * @ 平時只顯示導覽刻度，hover 或鍵盤聚焦時才浮出問題與答案摘要。
 */
.outline-rail {
	/* @ 軌道位於捲動容器內，固定在可視區中央，捲軸因此能保持在最外側。 */
	position: sticky;
	z-index: var(--z-tooltip);
	top: 50%;
	align-self: start;
	flex: 0 0 auto;
	width: 40px;
	max-height: min(60vh, calc(100dvh - 196px));
	padding: var(--space-sm) 0;
	overflow-y: auto;
	scrollbar-width: none;
	transform: translateY(-50%);
}

.outline-rail::-webkit-scrollbar {
	display: none;
}

.rail-list {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 1px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.rail-node {
	position: relative;
	width: 100%;
}

.rail-item {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	width: 100%;
	height: 18px;
	padding: 0 var(--space-xs);
	border: 0;
	background: none;
	cursor: pointer;
}

.rail-marker {
	display: block;
	width: 18px;
	height: 1px;
	border-radius: 999px;
	background: rgb(var(--v-theme-on-surface));
	opacity: 0.42;
	transform-origin: right center;
	transition: width var(--motion-fast) var(--ease-standard), height var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard);
}

.rail-item:hover .rail-marker,
.rail-item:focus-visible .rail-marker {
	width: 26px;
	opacity: 0.9;
}

.rail-item.is-active .rail-marker {
	width: 30px;
	height: 2px;
	background: rgb(var(--v-theme-primary));
	opacity: 1;
}

.rail-item:focus-visible {
	border-radius: var(--radius-sm);
	outline: 3px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

/* > 浮出的預覽：實心表面 + 邊框，文字維持全不透明以確保對比 */
.rail-tip {
	position: fixed;
	z-index: var(--z-tooltip);
	width: 288px;
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
	color: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	text-align: left;
	transform: translateY(-50%);
}

.tip-section {
	display: grid;
	gap: 2px;
}

.tip-section + .tip-section {
	margin-top: var(--space-sm);
}

.tip-label {
	color: var(--ink-subtle);
	font-size: 0.66rem;
	font-weight: 700;
	letter-spacing: 0.06em;
}

.tip-question,
.tip-summary {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
}

.tip-question {
	font-size: 0.82rem;
	font-weight: 650;
	line-height: 1.5;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.tip-summary {
	color: var(--ink-muted);
	font-size: 0.78rem;
	line-height: 1.55;
	-webkit-line-clamp: 3;
	line-clamp: 3;
}

@media (prefers-reduced-motion: reduce) {
	.rail-marker {
		transition: none;
	}
}
</style>
