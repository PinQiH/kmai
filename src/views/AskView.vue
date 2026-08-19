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

// > 起手問題依知識來源分組；切換來源會換掉整組題目，讓來源選擇的影響立即可見
const SOURCE_STARTERS: Record<string, string[]> = {
	company: ['公司請假流程是什麼？', '差旅費用怎麼申請？', '最新版的資安規範有哪些重點？'],
	policy: ['加班與補休怎麼計算？', '採購金額到多少需要主管簽核？', '離職交接必須繳回哪些項目？'],
	benefits: ['年度健康檢查補助多少？', '育嬰留職停薪最長可以請多久？', '團體保險的理賠怎麼申請？'],
}

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

// - 目前選到的個人筆記本；選到公司來源時為 null
const selectedNotebook = computed(() => notebooksStore.notebooks.find((notebook) => notebook.id === conversationStore.selectedKnowledgeSourceId) ?? null)

// - 已選但尚無文件的筆記本：這種來源問了也不會有引用，空狀態要先講清楚
const emptyNotebook = computed(() => (selectedNotebook.value?.documents.length === 0 ? selectedNotebook.value : null))

const starterQuestions = computed<string[]>(() => {
	const preset = SOURCE_STARTERS[conversationStore.selectedKnowledgeSourceId]
	if (preset) return preset

	const notebook = selectedNotebook.value
	if (!notebook) return SOURCE_STARTERS.company

	const [firstDocument] = notebook.documents
	if (!firstDocument) return []
	return [`${notebook.name}裡有哪些重點？`, `幫我整理${notebook.name}的重要結論`, `${firstDocument.name} 提到什麼？`]
})

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

/**
 * 把游標放進輸入框。
 * @ router 的 afterEach 會在下一個動畫影格把焦點移到 #main-content，
 *   因此這裡也必須排進 rAF，才會排在它之後執行而不被搶走。
 * @ 小螢幕不自動聚焦，避免一進頁面就彈出虛擬鍵盤蓋掉半個畫面。
 */
function focusComposer(): void {
	if (!display.mdAndUp.value) return
	window.requestAnimationFrame(() => composerField.value?.focus())
}

watch(question, async () => {
	await nextTick()
	resizeComposer()
})

// @ 側邊欄的「開新對話」在同一頁清空訊息，不會觸發 mounted，需要另外把焦點帶回輸入框
// @ 回饋訊息屬於上一輪對話，不清掉會殘留在新對話的空狀態下
watch(isEmptyState, (isEmpty) => {
	if (!isEmpty) return
	feedbackMessage.value = ''
	focusComposer()
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
	if (initialQuestion) {
		void submitQuestion(initialQuestion)
		return
	}
	focusComposer()
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
	<div class="ask-page" :class="{ 'is-empty': isEmptyState }">
		<div class="ask-body">
			<div ref="scrollArea" class="ask-scroll">
				<div class="ask-content">
					<VAlert v-if="conversationStore.errorMessage" type="error" variant="tonal" density="compact" class="mb-4">{{ conversationStore.errorMessage }}</VAlert>

					<!-- @ 空狀態刻意左對齊並貼齊輸入框：標題→輸入框→建議題目形成一條可讀的直欄，而非置中的 AI 首屏 -->
					<div v-if="isEmptyState" class="ask-empty">
						<h2 class="empty-title">向「{{ conversationStore.selectedScope }}」提問</h2>
						<p class="empty-description">回答會標註引用來源與適用版本，可以展開原文逐句核對。換一個知識來源，檢索範圍與建議題目也會跟著換。</p>
						<VAlert v-if="emptyNotebook" type="info" variant="tonal" density="compact" class="empty-notice">
							「{{ emptyNotebook.name }}」還沒有文件，現在提問不會有可查證的引用。
							<div class="mt-2">
								<VBtn :to="`/notebooks/${emptyNotebook.id}`" variant="tonal" size="small">開啟筆記本上傳文件</VBtn>
							</div>
						</VAlert>
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

		<!-- @ 建議題目放在輸入框「之後」：DOM 順序＝視覺順序＝Tab 順序，先給輸入再給範例 -->
		<div v-if="isEmptyState && starterQuestions.length > 0" class="ask-starters">
			<span id="starter-label" class="starters-label">可以試著問</span>
			<div class="starters-list" role="group" aria-labelledby="starter-label">
				<button v-for="starter in starterQuestions" :key="starter" type="button" class="suggestion-chip" @click="submitQuestion(starter)">
					{{ starter }}
				</button>
			</div>
		</div>

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

/*
 * > 空狀態版面：把輸入框從畫面底部拉到垂直中央，與說明、建議題目併成同一組。
 * @ 沒有第二個 composer；只切換 .ask-page 的對齊方式，
 *   輸入框仍是同一個 DOM 節點，送出後不會失焦或掉字。
 */
.ask-page.is-empty {
	justify-content: center;
	gap: var(--space-lg);
}

/* @ 空狀態的說明不需要佔滿剩餘高度，但仍允許在矮視窗中壓縮並自行捲動 */
.ask-page.is-empty .ask-body {
	flex: 0 1 auto;
}

/* @ 沒有捲軸時取消預留的捲軸間距，說明文字才會與輸入框左右對齊 */
.ask-page.is-empty .ask-scroll {
	padding-right: 0;
}

/* @ 空狀態下與 composer 同寬（900px），避免兩塊寬度差 40px 造成邊緣不齊 */
.ask-page.is-empty .ask-content {
	max-width: 900px;
}

/* > 空狀態內容 */
.ask-empty {
	display: flex;
	flex-direction: column;
	gap: var(--space-sm);
	animation: empty-appear var(--motion-base) var(--ease-out);
}

@keyframes empty-appear {
	from {
		opacity: 0;
	}

	to {
		opacity: 1;
	}
}

.empty-title {
	font-size: 1.5rem;
	font-weight: 650;
	letter-spacing: -0.02em;
	line-height: 1.3;
	overflow-wrap: anywhere;
	text-wrap: balance;
}

.empty-description {
	max-width: 52ch;
	color: var(--ink-muted);
	font-size: 0.925rem;
	line-height: 1.7;
	text-wrap: pretty;
}

.empty-notice {
	margin-top: var(--space-xs);
	max-width: 52ch;
}

/* > 建議題目：貼在 composer 下方，與 composer 同寬同軸 */
.ask-starters {
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
	gap: var(--space-xs) var(--space-sm);
	flex: 0 0 auto;
	width: min(100%, 900px);
	margin-inline: auto;
	animation: empty-appear var(--motion-base) var(--ease-out);
}

.starters-label {
	color: var(--ink-subtle);
	font-size: 0.78rem;
}

.starters-list {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-sm);
}

/* @ 自訂 chip 而非 VBtn：Vuetify 的 hover overlay 會壓低文字對比 */
.suggestion-chip {
	/* @ 筆記本題目會帶入檔名，長度不可控；必須允許換行並限寬，否則會撐破容器 */
	max-width: 100%;
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	/* @ 用 14px 圓角（與 composer 一致）而非藥丸：這是輸入框的延伸而非篩選 chip，換行時藥丸也會變形 */
	border-radius: var(--radius-lg);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	cursor: pointer;
	font: inherit;
	font-size: 0.85rem;
	overflow-wrap: anywhere;
	text-align: left;
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

	/* @ .ask-page.is-empty 的權重高於上面的 .ask-page，必須在此另外收窄 */
	.ask-page.is-empty {
		gap: var(--space-md);
	}

	.empty-title {
		font-size: 1.3rem;
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
