<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'

import AnswerMessage from '@/components/AnswerMessage.vue'
import ConversationOutline from '@/components/ConversationOutline.vue'
import ThinkingTrace from '@/components/ThinkingTrace.vue'
import { useConversationStore } from '@/stores/conversation'
import { useFavoritesStore } from '@/stores/favorites'
import { useNotebooksStore } from '@/stores/notebooks'
import type { Citation, OutlineItem } from '@/types'

const suggestions = ['公司請假流程是什麼？', '差旅費用怎麼申請？', '最新版的資安規範有哪些重點？']
const companySources = [
	{ id: 'company', name: '全公司知識', defaultWebSearchEnabled: false, description: '使用目前可見的公司知識庫。' },
	{ id: 'policy', name: '公司制度', defaultWebSearchEnabled: false, description: '優先搜尋公司制度與作業規範。' },
	{ id: 'benefits', name: '人事與福利', defaultWebSearchEnabled: true, description: '搜尋內部規章，並預設補充外部法規資訊。' },
]
const QUESTION_MAX_LENGTH = 120
const SUMMARY_MAX_LENGTH = 140

const route = useRoute()
const display = useDisplay()
const conversationStore = useConversationStore()
const favoritesStore = useFavoritesStore()
const notebooksStore = useNotebooksStore()
const question = ref('')
const selectedCitation = ref<Citation | null>(null)
const isCitationOpen = ref(false)
const isScopeOpen = ref(false)
const isSettingsOpen = ref(false)
const feedbackMessage = ref('')
const messageEnd = ref<HTMLElement>()
const scrollArea = ref<HTMLElement>()
const composerField = ref<HTMLTextAreaElement>()
const activeQuestionId = ref<string | null>(null)

const COMPOSER_MAX_HEIGHT = 120

const knowledgeSources = computed(() => [
	...companySources,
	...notebooksStore.notebooks.map((notebook) => ({
		id: notebook.id,
		name: notebook.name,
		defaultWebSearchEnabled: notebook.defaultWebSearchEnabled,
		description: `個人筆記本 · ${notebook.documents.length} 份文件`,
	})),
])


function selectKnowledgeSource(sourceId: string | null): void {
	if (!sourceId) return
	const source = knowledgeSources.value.find((item) => item.id === sourceId)
	if (!source) return
	conversationStore.selectKnowledgeSource(source)
}

function toggleWebSearch(): void {
	conversationStore.setWebSearchEnabled(!conversationStore.isWebSearchEnabled)
}

let outlineObserver: IntersectionObserver | null = null
// @ 目前落在視窗內的問題 id 集合；active 取其中 DOM 順序最上方者
const visibleQuestionIds = new Set<string>()
let orderedQuestionIds: string[] = []

const isEmptyState = computed(() => conversationStore.messages.length === 0 && !conversationStore.isResponding)
const showOutline = computed(() => display.mdAndUp.value && !isEmptyState.value)

function truncateText({ text, max }: { text: string; max: number }): string {
	const normalized = text.replace(/\s+/g, ' ').trim()
	return normalized.length <= max ? normalized : `${normalized.slice(0, max).trimEnd()}…`
}

// - 以每一則使用者問題為節點，並抓取其後第一則回答作為摘要
const outlineItems = computed<OutlineItem[]>(() => {
	const messages = conversationStore.messages
	const items: OutlineItem[] = []

	messages.forEach((message, index) => {
		if (message.role !== 'user') return

		const answer = messages[index + 1]
		const summary = answer && answer.role === 'assistant' ? truncateText({ text: answer.content, max: SUMMARY_MAX_LENGTH }) : ''

		items.push({
			id: message.id,
			seq: items.length + 1,
			text: truncateText({ text: message.content, max: QUESTION_MAX_LENGTH }),
			summary,
		})
	})

	return items
})

function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// - 原生 textarea 的 auto-grow：先歸零再依 scrollHeight 撐高，上限 120px
function resizeComposer(): void {
	const field = composerField.value
	if (!field) return
	field.style.height = 'auto'
	field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
}

watch(question, async () => {
	await nextTick()
	resizeComposer()
})

watch(
	() => notebooksStore.notebooks.map((notebook) => `${notebook.id}:${notebook.defaultWebSearchEnabled}`).join('|'),
	() => {
		const selectedNotebook = notebooksStore.notebooks.find((notebook) => notebook.id === conversationStore.selectedKnowledgeSourceId)
		if (!selectedNotebook) return
		conversationStore.syncSelectedSourceDefault({ id: selectedNotebook.id, defaultWebSearchEnabled: selectedNotebook.defaultWebSearchEnabled })
	},
)

// @ 中文輸入法組字期間的 Enter 是選字，不能當送出；必須檢查 isComposing
function handleComposerEnter(event: KeyboardEvent): void {
	if (event.isComposing) return
	event.preventDefault()
	void submitQuestion()
}

async function submitQuestion(value = question.value): Promise<void> {
	if (!value.trim()) return
	question.value = ''
	await conversationStore.askQuestion(value)
	await nextTick()
	messageEnd.value?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

function openCitation(citation: Citation): void {
	selectedCitation.value = citation
	isCitationOpen.value = true
}

function recordFeedback(isHelpful: boolean): void {
	feedbackMessage.value = isHelpful ? '已記錄為有幫助，謝謝你的回饋。' : '已記錄問題，管理者可在回饋工作區查看。'
}

function toggleFavorite(messageId: string, answer: string): void {
	const messageIndex = conversationStore.messages.findIndex((message) => message.id === messageId)
	const questionMessage = [...conversationStore.messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user')
	if (!questionMessage) return
	favoritesStore.toggle({ id: messageId, question: questionMessage.content, answer, date: new Date().toISOString().slice(0, 10) })
	feedbackMessage.value = favoritesStore.isFavorite(messageId) ? '已加入我的收藏。' : '已取消收藏。'
}

function jumpToQuestion(messageId: string): void {
	const target = document.getElementById(`message-${messageId}`)
	if (!target) return
	target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
	activeQuestionId.value = messageId
}

// - 取可見集合中 DOM 順序最上方的問題作為目前位置
function updateActiveQuestion(): void {
	if (visibleQuestionIds.size === 0) return
	const topId = orderedQuestionIds.find((id) => visibleQuestionIds.has(id))
	if (topId) activeQuestionId.value = topId
}

/**
 * 重新建立大綱的 scroll spy 觀察。
 * @ IntersectionObserver 的 callback 只會收到「狀態有變」的 entries，
 *   因此必須自行維護可見集合，不能只看當次傳入的清單。
 */
function observeQuestions(): void {
	outlineObserver?.disconnect()
	visibleQuestionIds.clear()
	orderedQuestionIds = outlineItems.value.map((item) => item.id)

	if (!scrollArea.value || typeof IntersectionObserver === 'undefined') return

	outlineObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).id.replace('message-', '')
				if (entry.isIntersecting) visibleQuestionIds.add(id)
				else visibleQuestionIds.delete(id)
			}
			updateActiveQuestion()
		},
		// @ 下緣往上收 70%，讓問題接近頂端才算目前位置
		{ root: scrollArea.value, rootMargin: '0px 0px -70% 0px', threshold: 0 },
	)

	for (const id of orderedQuestionIds) {
		const element = document.getElementById(`message-${id}`)
		if (element) outlineObserver.observe(element)
	}

	if (!activeQuestionId.value || !orderedQuestionIds.includes(activeQuestionId.value)) {
		activeQuestionId.value = orderedQuestionIds[0] ?? null
	}
}

onMounted(() => {
	const initialQuestion = String(route.query.q ?? '')
	if (initialQuestion) void submitQuestion(initialQuestion)
})

onBeforeUnmount(() => outlineObserver?.disconnect())

watch(outlineItems, async () => {
	await nextTick()
	observeQuestions()
})

// @ 首頁與側邊欄都可能帶著新的 q 進來，需要重新觸發提問
watch(() => route.query.q, (nextQuestion) => {
	const questionText = String(nextQuestion ?? '')
	if (!questionText) return
	conversationStore.startNewConversation()
	void submitQuestion(questionText)
})
</script>

<template>
	<!--
		@ 這一頁刻意沒有頁面標題：AppBar 已顯示 route.meta.title，
		  再放一個 h1 是重複資訊，也會吃掉約 100px 的對話高度。
		@ 歷史對話已移到全域側邊欄，這裡維持單欄，版面才不易跑掉。
	-->
	<div class="ask-page">
		<div class="ask-body">
			<div ref="scrollArea" class="ask-scroll">
				<div class="ask-content">
					<VAlert v-if="conversationStore.errorMessage" type="error" variant="tonal" density="compact" class="mb-4">{{ conversationStore.errorMessage }}</VAlert>

					<div v-if="isEmptyState" class="ask-empty">
						<div class="empty-badge" aria-hidden="true">
							<VIcon icon="mdi-message-text-outline" size="26" color="primary" />
						</div>
						<h2 class="empty-title">從知識庫裡直接問出答案</h2>
						<p class="empty-description">輸入問題後，系統會整理可見文件、產生引用證據，並同步顯示處理進度。</p>
						<div class="empty-suggestions">
							<button v-for="suggestion in suggestions" :key="suggestion" type="button" class="suggestion-chip" @click="submitQuestion(suggestion)">
								{{ suggestion }}
							</button>
						</div>
					</div>

					<div v-else class="message-list">
						<template v-for="message in conversationStore.messages" :key="message.id">
							<div v-if="message.role === 'user'" :id="`message-${message.id}`" class="user-message">{{ message.content }}</div>
							<AnswerMessage
								v-else
								:message="message"
								:is-favorite="favoritesStore.isFavorite(message.id)"
								@open-citation="openCitation"
								@feedback="recordFeedback"
								@toggle-favorite="toggleFavorite(message.id, message.content)"
							/>
						</template>
						<ThinkingTrace
							v-if="conversationStore.isResponding && !conversationStore.streamingMessage"
							:stages="conversationStore.thinkingStages"
							:retrieved-count="conversationStore.retrievedCount"
						/>
						<div ref="messageEnd" />
					</div>

					<VAlert v-if="feedbackMessage" type="success" variant="tonal" density="compact" closable class="mt-4" @click:close="feedbackMessage = ''">{{ feedbackMessage }}</VAlert>
				</div>
			</div>

			<ConversationOutline v-if="showOutline" :items="outlineItems" :active-id="activeQuestionId" @select="jumpToQuestion" />
		</div>

		<form class="composer" @submit.prevent="submitQuestion()">
			<div class="composer-input">
				<textarea
					ref="composerField"
					v-model="question"
					class="composer-field"
					rows="1"
					placeholder="請輸入問題…"
					aria-label="輸入你的問題"
					:disabled="conversationStore.isResponding"
					@keydown.enter.exact="handleComposerEnter"
				/>
				<button type="submit" class="send-button" aria-label="送出問題" :disabled="!question.trim() || conversationStore.isResponding">
					<VProgressCircular v-if="conversationStore.isResponding" indeterminate size="16" width="2" />
					<VIcon v-else icon="mdi-arrow-up" size="18" />
				</button>
			</div>

			<div class="composer-tools">
				<button type="button" class="tool-chip is-scope" @click="isScopeOpen = true">
					<VIcon icon="mdi-filter-variant" size="13" aria-hidden="true" />{{ conversationStore.selectedScope }}
				</button>
				<button
					type="button"
					class="tool-chip"
					:class="{ 'is-enabled': conversationStore.isWebSearchEnabled }"
					:aria-pressed="conversationStore.isWebSearchEnabled"
					:title="conversationStore.webSearchSettingSource === 'default' ? '使用知識來源的預設值' : '你已覆寫知識來源的預設值'"
					@click="toggleWebSearch"
				>
					<VIcon icon="mdi-web" size="13" aria-hidden="true" />網路搜尋：{{ conversationStore.isWebSearchEnabled ? '開' : '關' }}
					<span class="setting-origin">{{ conversationStore.webSearchSettingSource === 'default' ? '預設' : '已調整' }}</span>
				</button>
				<button type="button" class="tool-chip" @click="isSettingsOpen = true">
					<VIcon icon="mdi-tune-variant" size="13" aria-hidden="true" />回答設定
				</button>
				<span class="composer-hint">Enter 送出 · Shift + Enter 換行</span>
			</div>
		</form>

		<VDialog v-model="isCitationOpen" max-width="560">
			<VCard class="pa-6">
				<div class="d-flex align-center mb-5">
					<h2 class="section-heading">引用內容</h2>
					<VSpacer />
					<VBtn icon="mdi-close" variant="text" aria-label="關閉引用內容" @click="isCitationOpen = false" />
				</div>
				<template v-if="selectedCitation">
					<p class="font-weight-bold">{{ selectedCitation.title }}</p>
					<p class="citation-meta">{{ selectedCitation.section }} · 關聯度 <span class="mono">{{ Math.round(selectedCitation.confidence * 100) }}%</span></p>
					<blockquote class="citation-quote">{{ selectedCitation.excerpt }}</blockquote>
					<VBtn class="mt-6" color="primary" variant="tonal" :to="`/documents/${selectedCitation.documentId}`">開啟完整文件</VBtn>
				</template>
			</VCard>
		</VDialog>

		<VDialog v-model="isScopeOpen" max-width="480">
			<VCard class="pa-6">
				<h2 class="section-heading mb-2">知識來源</h2>
				<p class="dialog-hint mb-4">切換來源會套用該來源的網路搜尋預設值，你仍可在輸入框下方自行調整。</p>
				<VRadioGroup :model-value="conversationStore.selectedKnowledgeSourceId" hide-details @update:model-value="selectKnowledgeSource">
					<VRadio v-for="source in knowledgeSources" :key="source.id" :value="source.id">
						<template #label><div><strong>{{ source.name }}</strong><div class="source-description">{{ source.description }} · 預設{{ source.defaultWebSearchEnabled ? '搜尋網路' : '不搜尋網路' }}</div></div></template>
					</VRadio>
				</VRadioGroup>
				<div class="d-flex justify-end mt-6"><VBtn color="primary" variant="tonal" @click="isScopeOpen = false">完成</VBtn></div>
			</VCard>
		</VDialog>

		<VDialog v-model="isSettingsOpen" max-width="480">
			<VCard class="pa-6">
				<h2 class="section-heading mb-2">回答設定</h2>
				<p class="dialog-hint mb-4">調整回答的詳盡程度與引用數量。</p>
				<!-- TODO(api-integration): 串接回答設定 API 後改為實際生效的參數。 -->
				<VSelect label="回答長度" :items="['精簡', '標準', '詳盡']" model-value="標準" hide-details class="mb-4" />
				<VSelect label="最多引用數" :items="['3', '6', '10']" model-value="6" hide-details />
				<div class="d-flex justify-end mt-6"><VBtn color="primary" variant="tonal" @click="isSettingsOpen = false">完成</VBtn></div>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
/*
 * > 版面：單欄對話 + 右側 40px 大綱軌 + 底部 composer。
 * @ 全部用 flex（不巢狀 grid），高度鏈單純：
 *   ask-page 固定高 → ask-body 吃剩餘 → ask-scroll 自己捲。
 */
.ask-page {
	display: flex;
	flex-direction: column;
	gap: var(--space-md);
	height: calc(100vh - 64px);
	height: calc(100dvh - 64px);
	min-height: 0;
	padding: var(--space-md) clamp(var(--space-md), 2vw, var(--space-lg));
}

.ask-body {
	display: flex;
	gap: var(--space-sm);
	flex: 1 1 auto;
	min-height: 0;
}

.ask-scroll {
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	overflow-y: auto;
	padding-right: var(--space-sm);
}

/* @ 內容置中並限制閱讀寬度，捲軸仍貼在最外緣 */
.ask-content {
	max-width: 860px;
	margin-inline: auto;
}

/* > 空狀態 */
.ask-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--space-xs);
	min-height: 100%;
	padding: var(--space-lg) var(--space-md);
	text-align: center;
}

.empty-badge {
	display: grid;
	place-items: center;
	width: 56px;
	height: 56px;
	margin-bottom: var(--space-sm);
	border-radius: 50%;
	background: var(--tint-active);
}

.empty-title {
	font-size: 1.375rem;
	font-weight: 700;
	letter-spacing: -0.02em;
	text-wrap: balance;
}

.empty-description {
	max-width: 48ch;
	color: var(--ink-muted);
	font-size: 0.9rem;
	line-height: 1.7;
	text-wrap: pretty;
}

.empty-suggestions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: var(--space-sm);
	margin-top: var(--space-md);
}

/* @ 自訂 chip 而非 VBtn：Vuetify 的 hover overlay 會壓低文字對比 */
.suggestion-chip {
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	cursor: pointer;
	font: inherit;
	font-size: 0.85rem;
	transition: border-color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.suggestion-chip:hover {
	border-color: rgb(var(--v-theme-primary));
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

/* > 對話串：一輪之內 24px，輪與輪之間 56px */
.message-list {
	display: flex;
	flex-direction: column;
	gap: var(--space-lg);
	padding-bottom: var(--space-sm);
}

.message-list > .user-message:not(:first-child) {
	margin-top: var(--space-xl);
}

.user-message {
	align-self: flex-end;
	max-width: 76%;
	padding: var(--space-sm) var(--space-md);
	border-radius: var(--radius-lg);
	background: rgba(var(--v-theme-primary), 0.14);
	font-size: 0.98rem;
	line-height: 1.65;
	scroll-margin-top: var(--space-sm);
}

/* > Composer：兩列固定約 84px，不與對話區搶高度 */
.composer {
	display: flex;
	flex-direction: column;
	gap: var(--space-xs);
	flex: 0 0 auto;
	width: min(100%, 900px);
	margin-inline: auto;
	padding: var(--space-sm) var(--space-sm) var(--space-xs);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-lg);
	background: rgb(var(--v-theme-surface));
	transition: border-color var(--motion-base) var(--ease-standard);
}

.composer:focus-within {
	border-color: rgba(var(--v-theme-primary), 0.6);
}

.composer-input {
	display: flex;
	align-items: flex-end;
	gap: var(--space-sm);
}

/*
 * @ 用原生 textarea 而非 VTextarea：Vuetify 的 field 有多層 padding 與
 *   min-height，在這個高度預算下很難壓到位，而且 auto-grow 會與 flex 打架。
 */
.composer-field {
	flex: 1 1 auto;
	min-width: 0;
	max-height: 120px;
	padding: var(--space-xs) var(--space-sm);
	border: 0;
	background: none;
	color: var(--ink-strong);
	font: inherit;
	font-size: 0.95rem;
	line-height: 1.6;
	outline: none;
	resize: none;
}

.composer-field::placeholder {
	color: var(--ink-subtle);
}

.composer-field:disabled {
	cursor: not-allowed;
}

.send-button {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 32px;
	height: 32px;
	margin-bottom: 2px;
	border: 0;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-surface));
	cursor: pointer;
	transition: opacity var(--motion-fast) var(--ease-standard);
}

.send-button:disabled {
	background: rgb(var(--v-theme-outline));
	color: var(--ink-subtle);
	cursor: not-allowed;
}

.send-button:not(:disabled):hover {
	opacity: 0.86;
}

.composer-tools {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-xs);
}

.tool-chip {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 2px var(--space-sm);
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	color: var(--ink-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.72rem;
	transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.tool-chip:hover {
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

.tool-chip.is-scope {
	border-color: rgba(var(--v-theme-primary), 0.4);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
	font-weight: 650;
}

.tool-chip.is-enabled {
	border-color: rgba(var(--v-theme-primary), 0.45);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
}

.suggestion-chip:focus-visible,
.tool-chip:focus-visible,
.send-button:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.setting-origin {
	padding-left: var(--space-xs);
	border-left: 1px solid currentColor;
	font-size: 0.6rem;
	opacity: 0.75;
}

.source-description {
	margin-top: 2px;
	color: var(--ink-muted);
	font-size: 0.75rem;
	font-weight: 400;
}

.composer-hint {
	margin-left: auto;
	color: var(--ink-subtle);
	font-size: 0.68rem;
}

.citation-meta {
	margin-top: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.citation-quote {
	margin-top: var(--space-lg);
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
	font-size: 1rem;
	line-height: 1.7;
}

.dialog-hint {
	color: var(--ink-muted);
	font-size: 0.875rem;
	line-height: 1.6;
}

@media (max-width: 960px) {
	.ask-page {
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md) var(--space-md);
	}

	.user-message {
		max-width: 88%;
	}

	.composer-hint {
		display: none;
	}

	/* @ 觸控裝置最小命中區 */
	.send-button {
		width: 40px;
		height: 40px;
	}

	.suggestion-chip {
		min-height: 44px;
	}
}
</style>
