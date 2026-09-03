<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'

import AnswerMessage from '@/components/AnswerMessage.vue'
import AnswerSettingsMenu from '@/components/AnswerSettingsMenu.vue'
import CitationSourcePanel from '@/components/CitationSourcePanel.vue'
import ConversationOutline from '@/components/ConversationOutline.vue'
import ThinkingTrace from '@/components/ThinkingTrace.vue'
import { getEmployeeDocumentsBySourceId } from '@/repositories/knowledge.repository'
import { ANSWER_FEEDBACK_REASON_MAX_LENGTH, useConversationStore } from '@/stores/conversation'
import { useFavoritesStore } from '@/stores/favorites'
import { useNotebooksStore } from '@/stores/notebooks'
import type { Citation, ConversationMessage, OutlineItem } from '@/types'
import { buildAskKnowledgeSourceGroups, MODEL_ONLY_SOURCE_ID } from '@/utils/knowledgeSources'

interface SourceDocumentOption {
	id: string
	name: string
}

// > 起手問題依知識來源分組；切換來源會換掉整組題目，讓來源選擇的影響立即可見
const SOURCE_STARTERS: Record<string, string[]> = {
	[MODEL_ONLY_SOURCE_ID]: ['這個頁面可以怎麼操作？', '幫我整理這個問題的處理步驟', '有哪些常見風險要注意？'],
	policy: ['加班與補休怎麼計算？', '採購金額到多少需要主管簽核？', '離職交接必須繳回哪些項目？'],
	benefits: ['年度健康檢查補助多少？', '育嬰留職停薪最長可以請多久？', '團體保險的理賠怎麼申請？'],
	'information-security': ['客戶資料可以分享給哪些人？', '如何申請資料存取權限？', '發現異常存取時要怎麼處理？'],
	operations: ['採購請款需要哪些附件？', '標準作業流程由誰維護？', '流程異常時要向誰回報？'],
}

const QUESTION_MAX_LENGTH = 120
const SUMMARY_MAX_LENGTH = 140
const DOCUMENTS_PER_PAGE = 8

const route = useRoute()
const display = useDisplay()
const conversationStore = useConversationStore()
const favoritesStore = useFavoritesStore()
const notebooksStore = useNotebooksStore()
const question = ref('')
const selectedCitation = ref<Citation | null>(null)
const isCitationOpen = ref(false)
const isScopeOpen = ref(false)
const feedbackMessage = ref('')
const messageEnd = ref<HTMLElement>()
const scrollArea = ref<HTMLElement>()
const composerField = ref<HTMLTextAreaElement>()
const scopeTrigger = ref<HTMLButtonElement>()
const documentScopeSection = ref<HTMLElement>()
const activeQuestionId = ref<string | null>(null)
const targetedMessageId = ref<string | null>(null)
const citationTriggerId = ref<string | null>(null)
const documentSearch = ref<string | null>('')
const documentPage = ref(1)
const feedbackTargetId = ref<string | null>(null)
const isFeedbackDialogOpen = ref(false)
const feedbackReason = ref('')
const feedbackReasonError = ref('')
const saveTargetId = ref<string | null>(null)
const isSaveDialogOpen = ref(false)
const selectedNotebookId = ref<string | null>(null)
const saveAnswerError = ref('')
const navigationErrorMessage = ref('')

const COMPOSER_MAX_HEIGHT = 120

const knowledgeSourceGroups = computed(() => buildAskKnowledgeSourceGroups(notebooksStore.notebooks))
const visibleKnowledgeSourceGroups = computed(() => knowledgeSourceGroups.value.filter((group) => group.sources.length > 0))
const knowledgeSources = computed(() => knowledgeSourceGroups.value.flatMap((group) => group.sources))
const selectedKnowledgeSource = computed(() => knowledgeSources.value.find((source) => source.id === conversationStore.selectedKnowledgeSourceId) ?? null)

const selectedNotebook = computed(() => notebooksStore.notebooks.find((notebook) => notebook.id === conversationStore.selectedKnowledgeSourceId) ?? null)
const supportsDocumentScope = computed(() => selectedKnowledgeSource.value?.kind === 'knowledge-base' || selectedKnowledgeSource.value?.kind === 'notebook')
const availableSourceDocuments = computed<SourceDocumentOption[]>(() => {
	if (selectedNotebook.value) {
		return selectedNotebook.value.documents
			.filter((document) => document.status === 'ready')
			.map((document) => ({ id: document.id, name: document.name }))
	}
	if (selectedKnowledgeSource.value?.kind !== 'knowledge-base') return []
	return getEmployeeDocumentsBySourceId(selectedKnowledgeSource.value.id)
		.map((document) => ({ id: document.id, name: document.title }))
})
const unavailableDocumentCount = computed(() => {
	if (!selectedNotebook.value) return 0
	return selectedNotebook.value.documents.length - availableSourceDocuments.value.length
})
const documentSearchKeyword = computed(() => documentSearch.value?.trim() ?? '')
const filteredSourceDocuments = computed(() => {
	const keyword = documentSearchKeyword.value.toLocaleLowerCase('zh-TW')
	if (!keyword) return availableSourceDocuments.value
	return availableSourceDocuments.value.filter((document) => document.name.toLocaleLowerCase('zh-TW').includes(keyword))
})
const documentPageCount = computed(() => Math.max(1, Math.ceil(filteredSourceDocuments.value.length / DOCUMENTS_PER_PAGE)))
const paginatedSourceDocuments = computed(() => {
	const start = (documentPage.value - 1) * DOCUMENTS_PER_PAGE
	return filteredSourceDocuments.value.slice(start, start + DOCUMENTS_PER_PAGE)
})
const documentRangeStart = computed(() => filteredSourceDocuments.value.length === 0 ? 0 : (documentPage.value - 1) * DOCUMENTS_PER_PAGE + 1)
const documentRangeEnd = computed(() => Math.min(documentPage.value * DOCUMENTS_PER_PAGE, filteredSourceDocuments.value.length))
const sourceScopeDescription = computed(() => selectedNotebook.value
	? '不選擇文件時，會搜尋整本筆記本。'
	: '不選擇文件時，會搜尋整個知識庫。')
const selectedScopeSummary = computed(() => {
	if (conversationStore.selectedDocuments.length === 0) return conversationStore.selectedScope
	if (conversationStore.selectedDocuments.length === 1) {
		return `${conversationStore.selectedScope} · ${conversationStore.selectedDocuments[0].name}`
	}
	return `${conversationStore.selectedScope} · 已選 ${conversationStore.selectedDocuments.length} 份文件`
})
const editableNotebooks = computed(() => notebooksStore.notebooks.filter((notebook) => notebooksStore.canEditContent(notebook.id)))
const savedTargetNotebookIds = computed(() => saveTargetId.value ? notebooksStore.getSavedNotebookIds(saveTargetId.value) : [])
const editableNotebookOptions = computed(() => editableNotebooks.value.map((notebook) => ({
	title: savedTargetNotebookIds.value.includes(notebook.id) ? `${notebook.name}（已儲存）` : notebook.name,
	value: notebook.id,
	disabled: savedTargetNotebookIds.value.includes(notebook.id),
})))
const unsavedEditableNotebookCount = computed(() => editableNotebooks.value.filter((notebook) => !savedTargetNotebookIds.value.includes(notebook.id)).length)
const saveTargetMessage = computed(() => conversationStore.messages.find((message) => message.id === saveTargetId.value && message.role === 'assistant') ?? null)

// - 已選但尚無文件的筆記本：這種來源問了也不會有引用，空狀態要先講清楚
const emptyNotebook = computed(() => (selectedNotebook.value?.documents.length === 0 ? selectedNotebook.value : null))

const starterQuestions = computed<string[]>(() => {
	const preset = SOURCE_STARTERS[conversationStore.selectedKnowledgeSourceId]
	if (preset) return preset

	const notebook = selectedNotebook.value
	if (!notebook) return SOURCE_STARTERS.policy

	const [firstDocument] = notebook.documents
	if (!firstDocument) return []
	return [`${notebook.name}裡有哪些重點？`, `幫我整理${notebook.name}的重要結論`, `${firstDocument.name} 提到什麼？`]
})

watch(
	() => availableSourceDocuments.value.map((document) => ({ id: document.id, name: document.name })),
	(availableDocuments) => {
		if (!supportsDocumentScope.value || conversationStore.selectedDocuments.length === 0) return
		const availableDocumentMap = new Map(availableDocuments.map((document) => [document.id, document]))
		const selectedDocuments = conversationStore.selectedDocuments
			.map((document) => availableDocumentMap.get(document.id))
			.filter((document): document is { id: string; name: string } => Boolean(document))
		if (
			selectedDocuments.length !== conversationStore.selectedDocuments.length
			|| selectedDocuments.some((document, index) => document.name !== conversationStore.selectedDocuments[index]?.name)
		) {
			conversationStore.setSelectedDocuments({ sourceId: conversationStore.selectedKnowledgeSourceId, documents: selectedDocuments })
		}
	},
	{ deep: true },
)

watch([documentSearch, () => conversationStore.selectedKnowledgeSourceId], () => {
	documentPage.value = 1
})

watch(documentPageCount, (pageCount) => {
	if (documentPage.value > pageCount) documentPage.value = pageCount
})

function selectKnowledgeSource(sourceId: string): void {
	const source = knowledgeSources.value.find((item) => item.id === sourceId)
	if (!source) return
	conversationStore.selectKnowledgeSource(source)
	documentSearch.value = ''
	if (source.kind === 'model') {
		isScopeOpen.value = false
		return
	}
	void nextTick(() => documentScopeSection.value?.scrollIntoView?.({ block: 'nearest' }))
}

function isDocumentSelected(documentId: string): boolean {
	return conversationStore.selectedDocuments.some((document) => document.id === documentId)
}

function toggleSelectedDocument(document: SourceDocumentOption, isSelected: boolean | null): void {
	if (!supportsDocumentScope.value) return
	const selectedDocuments = isSelected
		? [...conversationStore.selectedDocuments, { id: document.id, name: document.name }]
		: conversationStore.selectedDocuments.filter((selectedDocument) => selectedDocument.id !== document.id)
	conversationStore.setSelectedDocuments({ sourceId: conversationStore.selectedKnowledgeSourceId, documents: selectedDocuments })
}

function focusKnowledgeSourceTrigger(): void {
	scopeTrigger.value?.focus({ preventScroll: true })
}

function toggleWebSearch(): void {
	conversationStore.setWebSearchEnabled(!conversationStore.isWebSearchEnabled)
}

let outlineObserver: IntersectionObserver | null = null
// @ 目前落在視窗內的問題 id 集合；active 取其中 DOM 順序最上方者
const visibleQuestionIds = new Set<string>()
let orderedQuestionIds: string[] = []

const isEmptyState = computed(() => conversationStore.messages.length === 0 && !conversationStore.isResponding)
const isCitationOverlay = computed(() => display.width.value <= 1180)
const showOutline = computed(() => display.mdAndUp.value && !isEmptyState.value && !isCitationOpen.value)

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

function routeQueryText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : ''
}

async function openConversationMessage({ conversationId, messageId }: { conversationId: string; messageId: string }): Promise<void> {
	navigationErrorMessage.value = ''
	targetedMessageId.value = null
	if (!conversationId || !messageId) {
		navigationErrorMessage.value = '收藏連結不完整，無法開啟原始問答。'
		return
	}
	if (conversationStore.isResponding) {
		navigationErrorMessage.value = '目前正在產生回答，請稍候完成後再開啟收藏。'
		return
	}

	conversationStore.openConversation(conversationId)
	const targetMessage = conversationStore.messages.find((message) => message.id === messageId)
	if (conversationStore.activeConversationId !== conversationId || !targetMessage || targetMessage.role !== 'assistant') {
		navigationErrorMessage.value = '原始對話或回答已不存在，無法開啟這筆收藏。'
		return
	}

	targetedMessageId.value = messageId
	await nextTick()
	window.requestAnimationFrame(() => {
		if (targetedMessageId.value !== messageId) return
		const target = document.getElementById(`message-${messageId}`)
		target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
		target?.focus({ preventScroll: true })
	})
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

function focusAnswerSettings(): void {
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => document.getElementById('answer-settings-button')?.focus())
	})
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
	if (isFeedbackDialogOpen.value) setFeedbackDialogOpen(false)
	if (isSaveDialogOpen.value) setSaveDialogOpen(false)
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

function openCitation(citation: Citation, triggerId: string): void {
	selectedCitation.value = citation
	citationTriggerId.value = triggerId
	isCitationOpen.value = true
}

async function closeCitation(): Promise<void> {
	isCitationOpen.value = false
	await nextTick()
	if (!citationTriggerId.value) return
	document.getElementById(citationTriggerId.value)?.focus({ preventScroll: true })
}

function findQuestionForAnswer(messageId: string): ConversationMessage | null {
	const messageIndex = conversationStore.messages.findIndex((message) => message.id === messageId)
	if (messageIndex < 0) return null
	return [...conversationStore.messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user') ?? null
}

function focusAnswerAction(action: 'feedback-down' | 'save-notebook', messageId: string | null): void {
	if (!messageId) return
	void nextTick(() => document.getElementById(`${action}-${messageId}`)?.focus({ preventScroll: true }))
}

function recordFeedback(messageId: string, isHelpful: boolean): void {
	const message = conversationStore.messages.find((item) => item.id === messageId && item.role === 'assistant')
	if (!message) return
	const value = isHelpful ? 'helpful' : 'unhelpful'
	if (message.feedback?.value === value) {
		conversationStore.setAnswerFeedback({ messageId, value: null })
		feedbackMessage.value = '已取消這筆回答評價。'
		return
	}
	if (!isHelpful) {
		feedbackTargetId.value = messageId
		feedbackReason.value = ''
		feedbackReasonError.value = ''
		isFeedbackDialogOpen.value = true
		return
	}
	if (conversationStore.setAnswerFeedback({ messageId, value: 'helpful' })) {
		feedbackMessage.value = '已記錄為有幫助，謝謝你的回饋。'
	}
}

function setFeedbackDialogOpen(isOpen: boolean): void {
	const messageId = feedbackTargetId.value
	isFeedbackDialogOpen.value = isOpen
	if (isOpen) return
	feedbackReason.value = ''
	feedbackReasonError.value = ''
	feedbackTargetId.value = null
	focusAnswerAction('feedback-down', messageId)
}

function submitNegativeFeedback(): void {
	const reason = feedbackReason.value.trim()
	feedbackReasonError.value = ''
	if (!reason) {
		feedbackReasonError.value = '請輸入這個回答需要改善的原因。'
		return
	}
	if (reason.length > ANSWER_FEEDBACK_REASON_MAX_LENGTH) {
		feedbackReasonError.value = `倒讚原因最多 ${ANSWER_FEEDBACK_REASON_MAX_LENGTH} 個字。`
		return
	}
	if (!feedbackTargetId.value || !conversationStore.setAnswerFeedback({ messageId: feedbackTargetId.value, value: 'unhelpful', reason })) {
		feedbackReasonError.value = '目前無法記錄倒讚，請關閉後再試一次。'
		return
	}
	feedbackMessage.value = '已記錄倒讚與改善原因，謝謝你的回饋。'
	setFeedbackDialogOpen(false)
}

function openSaveToNotebook(messageId: string): void {
	if (!conversationStore.messages.some((message) => message.id === messageId && message.role === 'assistant')) return
	saveTargetId.value = messageId
	selectedNotebookId.value = null
	saveAnswerError.value = ''
	isSaveDialogOpen.value = true
}

function getSavedNotebookCount(messageId: string): number {
	return notebooksStore.getSavedNotebookIds(messageId).length
}

function setSaveDialogOpen(isOpen: boolean): void {
	const messageId = saveTargetId.value
	isSaveDialogOpen.value = isOpen
	if (isOpen) return
	selectedNotebookId.value = null
	saveAnswerError.value = ''
	saveTargetId.value = null
	focusAnswerAction('save-notebook', messageId)
}

function saveAnswerToNotebook(): void {
	const answer = saveTargetMessage.value
	const questionMessage = answer ? findQuestionForAnswer(answer.id) : null
	if (!answer || !questionMessage || !selectedNotebookId.value) {
		saveAnswerError.value = '請選擇要存入的筆記本。'
		return
	}
	const targetNotebook = notebooksStore.notebooks.find((notebook) => notebook.id === selectedNotebookId.value)
	const result = notebooksStore.saveAnswerToNotebook({
		notebookId: selectedNotebookId.value,
		answerId: answer.id,
		question: questionMessage.content,
		answer: answer.content,
		citations: answer.citations ?? [],
	})
	if (result === 'saved') {
		feedbackMessage.value = `已將回答存入「${targetNotebook?.name ?? '指定筆記本'}」。`
		setSaveDialogOpen(false)
		return
	}
	if (result === 'already-saved') {
		saveAnswerError.value = '這個回答已經存入所選筆記本。'
		return
	}
	saveAnswerError.value = result === 'forbidden'
		? '你沒有編輯這本筆記本的權限，請改選其他筆記本。'
		: '目前無法存入這本筆記本，請重新選擇後再試。'
}

function toggleFavorite(messageId: string, answer: string): void {
	const questionMessage = findQuestionForAnswer(messageId)
	const conversationId = conversationStore.activeConversationId
	if (!questionMessage || !conversationId) return
	favoritesStore.toggle({ id: messageId, conversationId, question: questionMessage.content, answer, date: new Date().toISOString().slice(0, 10) })
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
	const conversationId = routeQueryText(route.query.conversationId)
	const messageId = routeQueryText(route.query.messageId)
	if (conversationId || messageId) {
		void openConversationMessage({ conversationId, messageId })
		return
	}

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
	if (!questionText || routeQueryText(route.query.conversationId) || routeQueryText(route.query.messageId)) return
	targetedMessageId.value = null
	navigationErrorMessage.value = ''
	conversationStore.startNewConversation()
	void submitQuestion(questionText)
})

watch(
	() => [route.query.conversationId, route.query.messageId] as const,
	([conversationIdValue, messageIdValue]) => {
		const conversationId = routeQueryText(conversationIdValue)
		const messageId = routeQueryText(messageIdValue)
		if (!conversationId && !messageId) {
			targetedMessageId.value = null
			return
		}
		void openConversationMessage({ conversationId, messageId })
	},
)
</script>

<template>
	<!--
		@ 這一頁刻意沒有頁面標題：AppBar 已顯示 route.meta.title，
		  再放一個 h1 是重複資訊，也會吃掉約 100px 的對話高度。
		@ 歷史對話已移到全域側邊欄，這裡維持單欄，版面才不易跑掉。
	-->
	<div class="ask-page" :class="{ 'is-empty': isEmptyState }">
		<div class="ask-workspace">
			<div class="ask-main">
				<div class="ask-body">
					<div ref="scrollArea" class="ask-scroll">
						<div class="ask-scroll-layout" :class="{ 'has-outline': showOutline }">
							<div class="ask-content">
								<VAlert v-if="conversationStore.errorMessage" type="error" variant="tonal" density="compact" class="mb-4">{{ conversationStore.errorMessage }}</VAlert>
								<VAlert v-if="navigationErrorMessage" type="warning" variant="tonal" density="compact" closable class="mb-4" @click:close="navigationErrorMessage = ''">{{ navigationErrorMessage }}</VAlert>

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
											:is-targeted="targetedMessageId === message.id"
											:saved-notebook-count="getSavedNotebookCount(message.id)"
											@open-citation="openCitation"
											@feedback="recordFeedback(message.id, $event)"
											@save-to-notebook="openSaveToNotebook(message.id)"
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

							<ConversationOutline v-if="showOutline" :items="outlineItems" :active-id="activeQuestionId" @select="jumpToQuestion" />
						</div>
					</div>
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
						<button
							id="knowledge-source-trigger"
							ref="scopeTrigger"
							type="button"
							class="tool-chip is-scope"
							aria-haspopup="dialog"
							:aria-expanded="isScopeOpen"
							aria-controls="knowledge-source-dialog"
							:aria-label="`限定回答範圍：${selectedScopeSummary}`"
							:title="selectedScopeSummary"
							@click="isScopeOpen = true"
						>
							<VIcon icon="mdi-filter-variant" size="13" aria-hidden="true" />
							<span class="tool-chip-label">{{ selectedScopeSummary }}</span>
						</button>
						<button
							type="button"
							class="tool-chip"
							:class="{ 'is-enabled': conversationStore.isWebSearchEnabled }"
							:disabled="!conversationStore.canUseWebSearch"
							:aria-pressed="conversationStore.isWebSearchEnabled"
							:title="conversationStore.webSearchSettingSource === 'default' ? '使用知識來源的預設值' : '你已覆寫知識來源的預設值'"
							@click="toggleWebSearch"
						>
							<VIcon icon="mdi-web" size="13" aria-hidden="true" />網路搜尋：{{ conversationStore.canUseWebSearch ? (conversationStore.isWebSearchEnabled ? '開' : '關') : '不可用' }}
							<span v-if="conversationStore.canUseWebSearch" class="setting-origin">{{ conversationStore.webSearchSettingSource === 'default' ? '預設' : '已調整' }}</span>
						</button>
						<AnswerSettingsMenu
							:selected-answer-style-id="conversationStore.selectedAnswerStyleId"
							:selected-answer-model-id="conversationStore.selectedAnswerModelId"
							:is-responding="conversationStore.isResponding"
							@apply="conversationStore.applyAnswerSettings"
							@closed="focusAnswerSettings"
						>
							<template #activator="{ activatorProps, isOpen }">
								<button
									v-bind="activatorProps"
									id="answer-settings-button"
									type="button"
									class="tool-chip settings-tool"
									aria-haspopup="dialog"
									:aria-expanded="isOpen"
									:aria-label="`設定，目前為${conversationStore.answerStyleLabel}，${conversationStore.answerModelLabel}`"
								>
									<VIcon icon="mdi-tune-variant" size="13" aria-hidden="true" />
									<span>設定</span>
									<span class="settings-summary">{{ conversationStore.answerStyleLabel }} · {{ conversationStore.answerModelShortLabel }}</span>
								</button>
							</template>
						</AnswerSettingsMenu>
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
			</div>

			<button v-if="isCitationOpen" type="button" tabindex="-1" class="source-panel-scrim" aria-label="關閉資料來源遮罩" @click="closeCitation" />
			<Transition name="source-panel">
				<CitationSourcePanel
					v-if="isCitationOpen && selectedCitation"
					:citation="selectedCitation"
					:is-modal="isCitationOverlay"
					@close="closeCitation"
				/>
			</Transition>
		</div>

		<VDialog
			:model-value="isFeedbackDialogOpen"
			max-width="520"
			:content-props="{ id: 'answer-feedback-dialog', 'aria-labelledby': 'answer-feedback-title' }"
			@update:model-value="setFeedbackDialogOpen"
		>
			<VCard class="answer-action-dialog">
				<form @submit.prevent="submitNegativeFeedback">
					<VCardTitle id="answer-feedback-title" class="section-heading">這個回答哪裡需要改善？</VCardTitle>
					<VCardText>
						<p class="answer-action-description">你的說明可以幫助後續調整回答品質。送出後才會記錄這次倒讚。</p>
						<VTextarea
							v-model="feedbackReason"
							label="倒讚原因"
							placeholder="例如：引用版本不正確，或回答沒有處理問題重點"
							:maxlength="ANSWER_FEEDBACK_REASON_MAX_LENGTH"
							:counter="ANSWER_FEEDBACK_REASON_MAX_LENGTH"
							:error-messages="feedbackReasonError"
							variant="outlined"
							rows="4"
							autofocus
							data-testid="feedback-reason-input"
						/>
					</VCardText>
					<VCardActions>
						<VSpacer />
						<VBtn variant="text" @click="setFeedbackDialogOpen(false)">取消</VBtn>
						<VBtn type="submit" color="primary" variant="flat" data-testid="submit-negative-feedback">送出倒讚</VBtn>
					</VCardActions>
				</form>
			</VCard>
		</VDialog>

		<VDialog
			:model-value="isSaveDialogOpen"
			max-width="520"
			:content-props="{ id: 'save-answer-dialog', 'aria-labelledby': 'save-answer-title' }"
			@update:model-value="setSaveDialogOpen"
		>
			<VCard class="answer-action-dialog">
				<VCardTitle id="save-answer-title" class="section-heading">將回答存入筆記本</VCardTitle>
				<VCardText>
					<p class="answer-action-description">回答會連同原始問題與引用保存成 Markdown 筆記。</p>
					<p v-if="savedTargetNotebookIds.length > 0" class="saved-notebook-summary">
						<VIcon icon="mdi-check-circle-outline" size="17" aria-hidden="true" />
						已存入 {{ savedTargetNotebookIds.length }} 本，仍可加入其他筆記本
					</p>
					<VAlert v-if="editableNotebooks.length === 0" type="info" variant="tonal" density="compact">
						目前沒有可編輯的筆記本。請先建立筆記本，或請擁有者提供編輯權限。
					</VAlert>
					<VAlert v-else-if="unsavedEditableNotebookCount === 0" type="info" variant="tonal" density="compact">
						這個回答已存入所有可編輯的筆記本。
					</VAlert>
					<VSelect
						v-else
						v-model="selectedNotebookId"
						:items="editableNotebookOptions"
						item-props
						label="選擇筆記本"
						density="compact"
						variant="outlined"
						:menu-props="{ contentClass: 'save-notebook-select-menu' }"
						:error-messages="saveAnswerError"
						data-testid="save-answer-notebook-select"
					/>
				</VCardText>
				<VCardActions>
					<VBtn v-if="editableNotebooks.length === 0" to="/notebooks" variant="text">前往個人筆記本</VBtn>
					<VSpacer />
					<VBtn variant="text" @click="setSaveDialogOpen(false)">取消</VBtn>
					<VBtn
						color="primary"
						variant="flat"
						:disabled="unsavedEditableNotebookCount === 0 || !selectedNotebookId"
						data-testid="confirm-save-answer"
						@click="saveAnswerToNotebook"
					>
						存入筆記本
					</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<VDialog
			v-model="isScopeOpen"
			max-width="560"
			:content-props="{ id: 'knowledge-source-dialog', 'aria-labelledby': 'knowledge-source-title' }"
			@after-leave="focusKnowledgeSourceTrigger"
		>
			<VCard class="source-dialog">
				<div class="source-dialog-head">
					<h2 id="knowledge-source-title" class="section-heading">知識來源</h2>
					<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉知識來源" @click="isScopeOpen = false" />
				</div>
				<div class="source-dialog-body">
					<VRadioGroup
						:model-value="conversationStore.selectedKnowledgeSourceId"
						class="source-options"
						aria-labelledby="knowledge-source-title"
						hide-details
					>
						<section
							v-for="group in visibleKnowledgeSourceGroups"
							:key="group.id"
							class="source-group"
							role="group"
							:aria-labelledby="`knowledge-source-group-${group.id}`"
						>
							<h3 :id="`knowledge-source-group-${group.id}`" class="source-group-label">{{ group.label }}</h3>
							<VRadio
								v-for="source in group.sources"
								:key="source.id"
								:label="source.name"
								:value="source.id"
								class="source-option"
								:class="{ 'is-selected': source.id === conversationStore.selectedKnowledgeSourceId }"
								:data-testid="`knowledge-source-${source.id}`"
								@click="selectKnowledgeSource(source.id)"
							/>
						</section>
					</VRadioGroup>

					<section v-if="supportsDocumentScope" ref="documentScopeSection" class="document-scope" aria-labelledby="document-scope-title">
						<div class="document-scope-head">
							<div>
								<h3 id="document-scope-title">限定文件（選填）</h3>
								<p>{{ sourceScopeDescription }}</p>
							</div>
							<span class="document-count">{{ availableSourceDocuments.length }} 份可用</span>
						</div>

						<VTextField
							v-if="availableSourceDocuments.length > 0"
							v-model="documentSearch"
							label="搜尋文件"
							prepend-inner-icon="mdi-magnify"
							variant="outlined"
							density="compact"
							clearable
							hide-details
							data-testid="document-scope-search"
						/>

						<p v-if="availableSourceDocuments.length === 0" class="document-scope-empty">
							目前沒有可限定的文件，提問時仍會使用整個來源。
						</p>
						<p v-else-if="filteredSourceDocuments.length === 0" class="document-scope-empty">
							找不到符合「{{ documentSearchKeyword }}」的文件，請調整搜尋文字。
						</p>
						<fieldset v-else class="document-options">
							<legend class="sr-only">選擇要限定的文件</legend>
							<VCheckbox
								v-for="document in paginatedSourceDocuments"
								:key="document.id"
								:model-value="isDocumentSelected(document.id)"
								:label="document.name"
								density="compact"
								hide-details
								class="document-option"
								:data-testid="`document-scope-${document.id}`"
								@update:model-value="toggleSelectedDocument(document, $event)"
							/>
						</fieldset>
						<div v-if="filteredSourceDocuments.length > 0" class="document-pagination">
							<p>顯示 {{ documentRangeStart }}–{{ documentRangeEnd }}，共 {{ filteredSourceDocuments.length }} 份；每頁最多 {{ DOCUMENTS_PER_PAGE }} 份。</p>
							<VPagination
								v-if="documentPageCount > 1"
								v-model="documentPage"
								:length="documentPageCount"
								:total-visible="5"
								density="compact"
								aria-label="文件清單分頁"
								data-testid="document-scope-pagination"
							/>
						</div>
						<p v-if="unavailableDocumentCount > 0" class="document-scope-note">
							另有 {{ unavailableDocumentCount }} 份文件仍在處理或處理失敗，暫時不能用於問答。
						</p>
					</section>
				</div>
				<VCardActions v-if="supportsDocumentScope" class="source-dialog-actions">
					<VBtn
						v-if="conversationStore.selectedDocuments.length > 0"
						variant="text"
						data-testid="clear-document-scope"
						@click="conversationStore.clearSelectedDocuments"
					>
						使用全部文件
					</VBtn>
					<VSpacer />
					<VBtn color="primary" variant="flat" data-testid="confirm-document-scope" @click="isScopeOpen = false">完成</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

	</div>
</template>

<style scoped>
/*
 * > 版面：主要問答工作區 + 可按需展開的資料來源欄。
 * @ ask-workspace 控制左右欄，ask-main 內維持對話、大綱與 composer 的高度鏈。
 */
.ask-page {
	height: calc(100vh - 64px);
	height: calc(100dvh - 64px);
	min-height: 0;
	padding: var(--space-md) clamp(var(--space-md), 2vw, var(--space-lg));
}

.ask-workspace {
	display: flex;
	gap: var(--space-md);
	height: 100%;
	min-height: 0;
}

.ask-main {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: var(--space-md);
	min-width: 0;
	min-height: 0;
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
	scrollbar-color: rgba(var(--v-theme-on-surface), 0.34) transparent;
	scrollbar-gutter: stable;
	scrollbar-width: thin;
}

.ask-scroll::-webkit-scrollbar {
	width: 8px;
}

.ask-scroll::-webkit-scrollbar-track {
	background: transparent;
}

.ask-scroll::-webkit-scrollbar-thumb {
	border: 2px solid transparent;
	border-radius: 999px;
	background: rgba(var(--v-theme-on-surface), 0.28);
	background-clip: padding-box;
}

.ask-scroll:hover::-webkit-scrollbar-thumb {
	background: rgba(var(--v-theme-on-surface), 0.44);
	background-clip: padding-box;
}

.ask-scroll-layout {
	min-height: 100%;
}

.ask-scroll-layout.has-outline {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 40px;
	gap: var(--space-sm);
}

/* @ 內容置中並限制閱讀寬度，捲軸仍貼在最外緣 */
.ask-content {
	width: 100%;
	max-width: 860px;
	margin-inline: auto;
}

/*
 * > 空狀態版面：把輸入框從畫面底部拉到垂直中央，與說明、建議題目併成同一組。
 * @ 沒有第二個 composer；只切換 .ask-page 的對齊方式，
 *   輸入框仍是同一個 DOM 節點，送出後不會失焦或掉字。
 */
.ask-page.is-empty .ask-main {
	justify-content: center;
	gap: var(--space-lg);
}

/* @ 空狀態的說明不需要佔滿剩餘高度，但仍允許在矮視窗中壓縮並自行捲動 */
.ask-page.is-empty .ask-body {
	flex: 0 1 auto;
}

.source-panel-enter-active,
.source-panel-leave-active {
	transition: opacity var(--motion-base) var(--ease-standard), transform var(--motion-base) var(--ease-out);
}

.source-panel-enter-from,
.source-panel-leave-to {
	opacity: 0;
	transform: translateX(16px);
}

.source-panel-scrim {
	display: none;
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
	max-width: min(360px, 58vw);
	border-color: rgba(var(--v-theme-primary), 0.4);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
	font-weight: 650;
}

.tool-chip-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tool-chip.is-enabled {
	border-color: rgba(var(--v-theme-primary), 0.45);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
}

.settings-tool {
	max-width: min(240px, 44vw);
}

.settings-summary {
	overflow: hidden;
	color: var(--ink-subtle);
	font-size: 0.64rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.settings-summary::before {
	margin-right: 3px;
	content: '·';
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

.source-dialog {
	padding: var(--space-md);
}

.answer-action-dialog {
	padding: var(--space-sm);
}

.answer-action-description {
	max-width: 65ch;
	margin: 0 0 var(--space-md);
	color: var(--ink-muted);
	font-size: 0.9rem;
	line-height: 1.6;
}

.saved-notebook-summary {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	margin: calc(var(--space-sm) * -1) 0 var(--space-md);
	color: rgb(var(--v-theme-primary));
	font-size: 0.78rem;
	font-weight: 600;
}

:global(.save-notebook-select-menu .v-list) {
	padding: var(--space-xs);
}

:global(.save-notebook-select-menu .v-list-item) {
	min-height: 36px;
	padding-inline: var(--space-sm);
	border-radius: var(--radius-sm);
}

:global(.save-notebook-select-menu .v-list-item-title) {
	font-size: 0.82rem;
	line-height: 1.35;
}

.source-dialog-body {
	max-height: min(68vh, 620px);
	overflow-y: auto;
	overscroll-behavior: contain;
}

.source-dialog-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-md);
}

.source-options {
	display: grid;
	gap: var(--space-sm);
	margin-top: var(--space-sm);
}

.source-group {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.source-group + .source-group {
	padding-top: var(--space-sm);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.source-group-label {
	margin: 0;
	padding-inline: var(--space-sm);
	color: var(--ink-subtle);
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.06em;
}

.source-option {
	min-height: 44px;
	padding-inline: var(--space-sm);
	border-radius: var(--radius-sm);
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.source-option:hover {
	background: var(--tint-hover);
}

.source-option.is-selected {
	background: var(--tint-active);
}

.source-option :deep(.v-label) {
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.9rem;
	font-weight: 500;
	opacity: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.document-scope {
	display: grid;
	gap: var(--space-sm);
	margin-top: var(--space-md);
	padding-top: var(--space-md);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.document-scope-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-sm);
}

.document-scope-head h3,
.document-scope-head p,
.document-scope-empty,
.document-scope-note {
	margin: 0;
}

.document-scope-head h3 {
	color: var(--ink-strong);
	font-size: 0.95rem;
	font-weight: 700;
}

.document-scope-head p,
.document-scope-note {
	color: var(--ink-subtle);
	font-size: 0.78rem;
	line-height: 1.5;
}

.document-count {
	flex: 0 0 auto;
	padding: 2px var(--space-sm);
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.72rem;
	font-weight: 650;
}

.document-options {
	display: grid;
	max-height: 210px;
	margin: 0;
	padding: var(--space-xs);
	overflow-y: auto;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.document-option {
	min-height: 40px;
	padding-inline: var(--space-xs);
	border-radius: var(--radius-sm);
}

.document-option:hover {
	background: var(--tint-hover);
}

.document-option :deep(.v-label) {
	overflow-wrap: anywhere;
	color: var(--ink-strong);
	font-size: 0.84rem;
	opacity: 1;
}

.document-pagination {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
}

.document-pagination p {
	margin: 0;
	color: var(--ink-subtle);
	font-size: 0.75rem;
}

.document-pagination :deep(.v-pagination__list) {
	justify-content: flex-end;
	margin: 0;
}

.document-scope-empty {
	padding: var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.5;
}

.source-dialog-actions {
	padding: var(--space-md) 0 0;
}

.composer-hint {
	margin-left: auto;
	color: var(--ink-subtle);
	font-size: 0.68rem;
}

@media (max-width: 1180px) {
	.source-panel-scrim {
		position: fixed;
		z-index: var(--z-sticky);
		display: block;
		inset: 64px 0 0;
		border: 0;
		background: rgba(0, 0, 0, 0.28);
		cursor: default;
	}

	.ask-workspace :deep(.source-panel) {
		position: fixed;
		z-index: var(--z-drawer);
		top: 76px;
		right: 12px;
		bottom: 12px;
		width: min(400px, calc(100vw - 24px));
		height: auto;
	}
}

@media (max-width: 960px) {
	.ask-page {
		padding: var(--space-sm) var(--space-md) var(--space-md);
	}

	/* @ .ask-page.is-empty .ask-main 的權重較高，必須在此另外收窄 */
	.ask-page.is-empty .ask-main {
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

@media (max-width: 600px) {
	.tool-chip.is-scope {
		max-width: min(100%, 74vw);
	}

	.source-dialog-body {
		max-height: 66vh;
	}

	.document-scope-head {
		align-items: stretch;
		flex-direction: column;
	}

	.document-count {
		align-self: flex-start;
	}

	.document-pagination {
		align-items: flex-start;
		flex-direction: column;
	}

	.settings-summary {
		display: none;
	}

	.ask-workspace :deep(.source-panel) {
		top: 64px;
		right: 0;
		bottom: 0;
		width: 100vw;
		border: 0;
		border-radius: 0;
	}
}
</style>
