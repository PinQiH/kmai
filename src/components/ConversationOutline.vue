<script setup lang="ts">
import type { OutlineItem } from '@/types'

interface ComponentProps {
	items: OutlineItem[]
	activeId: string | null
}

defineProps<ComponentProps>()

const emit = defineEmits<{ select: [messageId: string] }>()
</script>

<template>
	<nav v-if="items.length" class="outline-rail" aria-label="問題大綱">
		<ul class="rail-list">
			<li v-for="item in items" :key="item.id" class="rail-node">
				<button
					type="button"
					class="rail-item"
					:class="{ 'is-active': item.id === activeId }"
					:aria-label="`跳到第 ${item.seq} 個問題：${item.text}`"
					:aria-current="item.id === activeId ? 'true' : undefined"
					@click="emit('select', item.id)"
				>
					<span class="rail-marker" aria-hidden="true" />
					<span class="rail-tip" role="tooltip">
						<strong class="tip-question">{{ item.text }}</strong>
						<span v-if="item.summary" class="tip-summary">{{ item.summary }}</span>
					</span>
				</button>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
/*
 * > 問題大綱：常駐的細刻度軌，不佔用閱讀寬度。
 * @ 平時只顯示導覽刻度，hover 或鍵盤聚焦時才浮出問題與答案摘要。
 */
.outline-rail {
	/*
	 * @ 不用 sticky：這裡的父層不是捲動容器，sticky 不會生效。
	 *   改為垂直置中並限制高度，題目很多時軌道自己捲，不會撐破版面。
	 */
	align-self: center;
	flex: 0 0 auto;
	width: 40px;
	max-height: 100%;
	padding: var(--space-sm) 0;
	overflow-y: auto;
	scrollbar-width: none;
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
	display: none;
	position: absolute;
	top: 50%;
	right: calc(100% + var(--space-sm));
	z-index: var(--z-tooltip);
	width: 288px;
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
	color: rgb(var(--v-theme-on-surface));
	text-align: left;
	transform: translateY(-50%);
}

.rail-item:hover .rail-tip,
.rail-item:focus-visible .rail-tip {
	display: block;
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
	margin-top: var(--space-xs);
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
