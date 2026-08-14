<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import { useConversationStore } from '@/stores/conversation'
import { useFavoritesStore } from '@/stores/favorites'
import type { Citation } from '@/types'

const suggestions = ['國內出差住宿費用上限是多少？', '比較差旅辦法 3.1 與 3.2 版差異', '摘要新進同仁前三十天任務']
const scopes = ['自動判斷', '全公司知識', '公司制度', '人事與福利', '指定文件']

const route = useRoute()
const conversationStore = useConversationStore()
const favoritesStore = useFavoritesStore()
const question = ref('')
const selectedCitation = ref<Citation | null>(null)
const isCitationOpen = ref(false)
const isHistoryOpen = ref(false)
const isOutlineOpen = ref(false)
const feedbackMessage = ref('')
const messageEnd = ref<HTMLElement>()

async function submitQuestion(value = question.value): Promise<void> {
	if (!value.trim()) return
	question.value = ''
	await conversationStore.askQuestion(value)
	await nextTick()
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	messageEnd.value?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
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

async function loadHistory(questionText: string): Promise<void> {
	conversationStore.clearConversation()
	isHistoryOpen.value = false
	await submitQuestion(questionText)
}

async function jumpToMessage(messageId: string): Promise<void> {
	isOutlineOpen.value = false
	await nextTick()
	document.getElementById(`message-${messageId}`)?.scrollIntoView({ block: 'center' })
}

onMounted(() => {
	const initialQuestion = String(route.query.q ?? '')
	if (initialQuestion) void submitQuestion(initialQuestion)
})
</script>

<template>
	<div class="page-shell ask-page">
		<PageHeader eyebrow="有來源的回答" title="AI 知識問答" description="回答僅根據你有權限查看的公司知識。重要決策前，請開啟引用確認原文與版本。">
			<template #actions>
				<VBtn variant="text" prepend-icon="mdi-plus" @click="conversationStore.clearConversation">新對話</VBtn>
				<VBtn variant="text" prepend-icon="mdi-format-list-bulleted" @click="isOutlineOpen = true">問題大綱</VBtn>
				<VBtn variant="text" prepend-icon="mdi-history" @click="isHistoryOpen = true">歷史對話</VBtn>
			</template>
		</PageHeader>

		<div class="scope-row mb-5">
			<VSelect v-model="conversationStore.selectedScope" :items="scopes" label="回答範圍" hide-details class="scope-select" />
			<VChip prepend-icon="mdi-shield-check-outline" variant="tonal" color="success">只使用可存取內容</VChip>
		</div>

		<section v-if="conversationStore.messages.length === 0" class="ask-empty text-center py-10" aria-labelledby="ask-empty-title">
			<VIcon icon="mdi-text-search-variant" size="42" color="primary" aria-hidden="true" />
			<h2 id="ask-empty-title" class="text-h5 font-weight-bold mt-4">用工作中的說法直接問</h2>
			<p class="text-medium-emphasis mt-2">不需要整理關鍵字，系統會找出相關文件並標示來源。</p>
			<div class="d-flex flex-wrap justify-center ga-2 mt-6">
				<VBtn v-for="suggestion in suggestions" :key="suggestion" variant="outlined" @click="submitQuestion(suggestion)">{{ suggestion }}</VBtn>
			</div>
		</section>

		<section v-else class="message-list" aria-label="問答內容" aria-live="polite">
			<VAlert v-if="conversationStore.errorMessage" type="error" variant="tonal">{{ conversationStore.errorMessage }}</VAlert>
			<article v-for="message in conversationStore.messages" :id="`message-${message.id}`" :key="message.id" class="message" :class="`message--${message.role}`">
				<p class="eyebrow text-medium-emphasis mb-2">{{ message.role === 'user' ? '你的問題' : 'Kmai 回答' }}</p>
				<p class="message-content">{{ message.content }}</p>
				<div v-if="message.citations?.length" class="mt-5">
					<p class="text-caption font-weight-bold mb-2">回答依據</p>
					<div class="d-flex flex-wrap ga-2">
						<VBtn v-for="(citation, index) in message.citations" :key="citation.id" variant="tonal" size="small" prepend-icon="mdi-file-document-outline" @click="openCitation(citation)">
							{{ index + 1 }}. {{ citation.title }}
						</VBtn>
					</div>
					<div class="d-flex align-center ga-1 mt-4">
						<span class="text-caption text-medium-emphasis mr-2">這個回答有幫助嗎？</span>
						<VBtn icon="mdi-thumb-up-outline" size="small" variant="text" aria-label="這個回答有幫助" @click="recordFeedback(true)" />
						<VBtn icon="mdi-thumb-down-outline" size="small" variant="text" aria-label="這個回答沒有幫助" @click="recordFeedback(false)" />
						<VBtn :icon="favoritesStore.isFavorite(message.id) ? 'mdi-bookmark' : 'mdi-bookmark-outline'" size="small" variant="text" :aria-label="favoritesStore.isFavorite(message.id) ? '取消收藏這個回答' : '收藏這個回答'" :aria-pressed="favoritesStore.isFavorite(message.id)" @click="toggleFavorite(message.id, message.content)" />
					</div>
				</div>
			</article>
			<div v-if="conversationStore.isResponding" class="message message--assistant" role="status">
				<VProgressLinear indeterminate color="primary" class="mb-3" />
				<p class="text-body-2">正在搜尋知識、比對版本並整理回答…</p>
			</div>
			<div ref="messageEnd" />
		</section>
		<VAlert v-if="feedbackMessage" type="success" variant="tonal" closable class="mt-4" @click:close="feedbackMessage = ''">{{ feedbackMessage }}</VAlert>

		<form class="composer mt-7" @submit.prevent="submitQuestion()">
			<VTextarea v-model="question" label="輸入你的問題" placeholder="例如：出差回來多久內要完成核銷？" rows="2" auto-grow hide-details :disabled="conversationStore.isResponding" @keydown.ctrl.enter="submitQuestion()" />
			<div class="composer-actions mt-2">
				<span class="text-caption text-medium-emphasis">Ctrl + Enter 送出</span>
				<VBtn type="submit" color="primary" append-icon="mdi-arrow-up" :loading="conversationStore.isResponding" :disabled="!question.trim()">送出問題</VBtn>
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
					<p class="text-caption text-medium-emphasis mt-1">{{ selectedCitation.section }} · 關聯度 {{ Math.round(selectedCitation.confidence * 100) }}%</p>
					<blockquote class="citation-quote mt-5">{{ selectedCitation.excerpt }}</blockquote>
					<VBtn class="mt-6" color="primary" variant="tonal" :to="`/documents/${selectedCitation.documentId}`">開啟完整文件</VBtn>
				</template>
			</VCard>
		</VDialog>

		<VDialog v-model="isHistoryOpen" max-width="620">
			<VCard><VCardTitle class="pa-6 pb-2">歷史對話</VCardTitle><VCardText class="pa-6 pt-2"><VTextField label="搜尋歷史對話" prepend-inner-icon="mdi-magnify" /><VList><VListItem title="差旅住宿與核銷期限" subtitle="今天 10:42 · 2 個問題" prepend-icon="mdi-message-text-outline" @click="loadHistory('國內出差住宿費用上限是多少？')" /><VListItem title="新進同仁第一週任務" subtitle="昨天 · 3 個問題" prepend-icon="mdi-message-text-outline" @click="loadHistory('新進同仁第一週要完成哪些事情？')" /><VListItem title="客戶資料存取權限" subtitle="8 月 11 日 · 1 個問題" prepend-icon="mdi-archive-outline" @click="loadHistory('如何申請客戶資料存取權限？')" /></VList></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="isHistoryOpen = false">關閉</VBtn></VCardActions></VCard>
		</VDialog>

		<VDialog v-model="isOutlineOpen" max-width="520">
			<VCard><VCardTitle class="pa-6 pb-2">這段對話的問題大綱</VCardTitle><VCardText class="pa-6 pt-2"><VList v-if="conversationStore.messages.some((message) => message.role === 'user')"><VListItem v-for="(message, index) in conversationStore.messages.filter((item) => item.role === 'user')" :key="message.id" :title="`${index + 1}. ${message.content}`" prepend-icon="mdi-help-circle-outline" @click="jumpToMessage(message.id)" /></VList><p v-else class="text-medium-emphasis">送出第一個問題後，這裡會顯示可快速跳轉的大綱。</p></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="isOutlineOpen = false">關閉</VBtn></VCardActions></VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.ask-page {
	max-width: 980px;
}

.scope-row,
.composer-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.scope-select {
	max-width: 260px;
}

.ask-empty {
	border-block: 1px solid rgb(var(--v-theme-outline));
}

.message-list {
	display: grid;
	gap: 16px;
}

.message {
	max-width: 780px;
	padding: 22px;
	border-radius: 14px;
}

.message--user {
	margin-left: auto;
	background: rgb(var(--v-theme-surface-variant));
}

.message--assistant {
	border: 1px solid rgb(var(--v-theme-outline));
	background: rgb(var(--v-theme-surface));
}

.message-content {
	font-size: 1.04rem;
	line-height: 1.75;
}

.composer {
	position: sticky;
	bottom: 16px;
	padding: 14px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 14px;
	background: rgb(var(--v-theme-surface));
}

.citation-quote {
	padding: 16px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 8px;
	background: rgb(var(--v-theme-surface-variant));
	font-size: 1rem;
	line-height: 1.7;
}

@media (max-width: 600px) {
	.scope-row {
		align-items: stretch;
		flex-direction: column;
	}

	.scope-select {
		max-width: none;
	}
}
</style>
