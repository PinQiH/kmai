<script setup lang="ts">
import { computed, ref } from 'vue'

import ThinkingTrace from '@/components/ThinkingTrace.vue'
import { parseAnswerSegments } from '@/stores/conversation'
import type { Citation, ConversationMessage } from '@/types'

interface ComponentProps {
	message: ConversationMessage
	isFavorite?: boolean
}

const props = withDefaults(defineProps<ComponentProps>(), { isFavorite: false })

const emit = defineEmits<{
	openCitation: [citation: Citation]
	feedback: [isHelpful: boolean]
	toggleFavorite: []
}>()

const isTraceOpen = ref(false)
const isCitationListOpen = ref(false)

const segments = computed(() => parseAnswerSegments({ content: props.message.content }))
const elapsedText = computed(() => `${((props.message.trace?.elapsedMs ?? 0) / 1000).toFixed(1)}s`)

// - 依上標編號取出對應引用，編號從 1 起算
function findCitation({ index }: { index: number }): Citation | undefined {
	return props.message.citations?.[index - 1]
}

function handleCitationClick({ index }: { index: number }): void {
	const citation = findCitation({ index })
	if (citation) emit('openCitation', citation)
}
</script>

<template>
	<article class="answer-card">
		<p class="assistant-name">KM 助理</p>

		<!-- > 串流中的狀態列：回答完成前也要看得到系統在做什麼 -->
		<p v-if="message.isStreaming" class="trace-summary is-live">
			<span class="live-dot" aria-hidden="true" />
			<span>正在生成回答並標註引用…</span>
		</p>

		<!-- > 處理摘要：回答完成後收合成一行，展開可回看四階段流程 -->
		<button v-else-if="message.trace" type="button" class="trace-summary" :aria-expanded="isTraceOpen" @click="isTraceOpen = !isTraceOpen">
			<VIcon icon="mdi-check" size="16" color="success" aria-hidden="true" />
			<span>已找到 {{ message.trace.documentCount }} 份文件 · {{ message.trace.citationCount }} 筆引用 · <span class="mono">{{ elapsedText }}</span></span>
			<VIcon :icon="isTraceOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="18" aria-hidden="true" />
		</button>
		<VExpandTransition>
			<ThinkingTrace v-if="isTraceOpen && message.trace" class="mt-3" :stages="message.trace.stages" :retrieved-count="message.trace.retrievedCount" />
		</VExpandTransition>

		<!-- @ 以片段陣列渲染而非 v-html，避免回答內容造成 XSS -->
		<p class="answer-content" :aria-live="message.isStreaming ? 'off' : undefined">
			<template v-for="(segment, index) in segments" :key="index">
				<template v-if="segment.type === 'text'">{{ segment.value }}</template>
				<button
					v-else
					type="button"
					class="citation-ref"
					:disabled="!findCitation({ index: segment.index })"
					:aria-label="`開啟引用 ${segment.index}`"
					@click="handleCitationClick({ index: segment.index })"
				>[{{ segment.index }}]</button>
			</template><span v-if="message.isStreaming" class="stream-caret" aria-hidden="true" />
		</p>

		<template v-if="message.citations?.length && !message.isStreaming">
			<button type="button" class="citation-toggle" :aria-expanded="isCitationListOpen" @click="isCitationListOpen = !isCitationListOpen">
				<span>引用來源（{{ message.citations.length }}）</span>
				<VIcon :icon="isCitationListOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" aria-hidden="true" />
			</button>
			<VExpandTransition>
				<ul v-if="isCitationListOpen" class="citation-list">
					<li v-for="(citation, index) in message.citations" :key="citation.id" class="rise-in" :style="{ '--rise-index': index }">
						<button type="button" class="citation-entry" @click="emit('openCitation', citation)">
							<span class="citation-index mono">[{{ index + 1 }}]</span>
							<span class="citation-body">
								<span class="citation-title">{{ citation.title }}</span>
								<span class="citation-section">{{ citation.section }} · 關聯度 <span class="mono">{{ Math.round(citation.confidence * 100) }}%</span></span>
							</span>
							<VIcon icon="mdi-chevron-right" size="18" aria-hidden="true" />
						</button>
					</li>
				</ul>
			</VExpandTransition>
		</template>

		<template v-if="!message.isStreaming && message.trace">
			<div class="answer-actions">
				<span class="text-caption text-medium-emphasis mr-2">這個回答有幫助嗎？</span>
				<VBtn icon="mdi-thumb-up-outline" size="small" variant="text" aria-label="這個回答有幫助" @click="emit('feedback', true)" />
				<VBtn icon="mdi-thumb-down-outline" size="small" variant="text" aria-label="這個回答沒有幫助" @click="emit('feedback', false)" />
				<VBtn
					:icon="isFavorite ? 'mdi-bookmark' : 'mdi-bookmark-outline'"
					size="small"
					variant="text"
					:aria-label="isFavorite ? '取消收藏這個回答' : '收藏這個回答'"
					:aria-pressed="isFavorite"
					@click="emit('toggleFavorite')"
				/>
			</div>
		</template>
	</article>
</template>

<style scoped>
/* @ 不使用卡片外觀：本元件已位於主卡片內，再加邊框與底色就是卡中卡 */
.answer-card {
	min-width: 0;
}

.assistant-name {
	color: rgb(var(--v-theme-primary));
	font-size: 0.82rem;
	font-weight: 700;
	letter-spacing: 0.01em;
}

.trace-summary,
.citation-toggle {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
	width: 100%;
	margin-top: var(--space-sm);
	padding: var(--space-sm) var(--space-sm);
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: rgb(var(--v-theme-on-surface));
	cursor: pointer;
	font: inherit;
	font-size: 0.82rem;
	text-align: left;
	transition: background-color var(--motion-base) var(--ease-standard);
}

.trace-summary {
	margin-left: calc(var(--space-sm) * -1);
	color: var(--ink-muted);
}

.trace-summary.is-live {
	cursor: default;
}

.live-dot {
	flex: 0 0 auto;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
	animation: live-pulse 1.2s ease-in-out infinite;
}

@keyframes live-pulse {
	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}

	50% {
		opacity: 0.4;
		transform: scale(0.7);
	}
}

.trace-summary:hover,
.citation-toggle:hover {
	background: var(--tint-hover);
	color: var(--ink-strong);
}

.citation-toggle {
	justify-content: space-between;
	margin-top: var(--space-lg);
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	font-weight: 650;
}

.answer-content {
	margin-top: var(--space-md);
	/* @ 回答是本頁最主要的閱讀內容，維持在 65-75ch 的舒適行長 */
	max-width: 68ch;
	font-size: 1.02rem;
	line-height: 1.85;
	text-wrap: pretty;
}

/* @ 上標引用：以按鈕呈現，維持鍵盤可操作 */
.citation-ref {
	padding: 0 2px;
	border: 0;
	background: none;
	color: rgb(var(--v-theme-primary));
	cursor: pointer;
	font: inherit;
	font-size: 0.72em;
	font-weight: 700;
	vertical-align: super;
}

.citation-ref:hover:not(:disabled) {
	text-decoration: underline;
}

.citation-ref:disabled {
	color: rgb(var(--v-theme-outline));
	cursor: default;
}

.citation-list {
	display: grid;
	gap: var(--space-sm);
	margin: var(--space-sm) 0 0;
	padding: 0;
	list-style: none;
	--rise-step: 40ms;
	--rise-distance: 6px;
}

.citation-entry {
	display: flex;
	align-items: center;
	gap: var(--space-md);
	width: 100%;
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: none;
	color: inherit;
	cursor: pointer;
	font: inherit;
	text-align: left;
	transition: border-color var(--motion-base) var(--ease-standard), background-color var(--motion-base) var(--ease-standard);
}

.citation-entry:hover {
	border-color: rgb(var(--v-theme-primary));
	background: var(--tint-hover);
}

.citation-index {
	flex: 0 0 auto;
	color: rgb(var(--v-theme-primary));
	font-size: 0.8rem;
	font-weight: 700;
}

.citation-body {
	display: grid;
	gap: var(--space-xs);
	flex: 1 1 auto;
	min-width: 0;
}

.citation-title {
	overflow: hidden;
	font-size: 0.9rem;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.citation-section {
	color: var(--ink-muted);
	font-size: 0.75rem;
}

.answer-actions {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	margin-top: var(--space-md);
}
</style>
