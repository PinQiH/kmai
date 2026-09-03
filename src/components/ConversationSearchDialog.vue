<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { formatHistoryTime, useConversationStore } from '@/stores/conversation'
import { useFavoritesStore, type FavoriteAnswer } from '@/stores/favorites'

type SearchScope = 'conversations' | 'favorites'

const isOpen = defineModel<boolean>({ required: true })

const router = useRouter()
const conversationStore = useConversationStore()
const favoritesStore = useFavoritesStore()

const keyword = ref('')
const activeScope = ref<SearchScope>('conversations')
const activeIndex = ref(0)
const favoriteStatusMessage = ref('')
const favoriteNavigationError = ref('')
const searchField = ref<HTMLInputElement>()

const conversationResults = computed(() => conversationStore.searchConversations(keyword.value))
const favoriteResults = computed(() => {
	const normalizedKeyword = keyword.value.trim().toLowerCase()
	if (!normalizedKeyword) return favoritesStore.items
	return favoritesStore.items.filter((favorite) => `${favorite.question} ${favorite.answer}`.toLowerCase().includes(normalizedKeyword))
})
const resultCount = computed(() => activeScope.value === 'conversations' ? conversationResults.value.length : favoriteResults.value.length)
const searchPlaceholder = computed(() => activeScope.value === 'conversations' ? '搜尋對話標題或內容…' : '搜尋收藏的問題或回答…')
const searchLabel = computed(() => activeScope.value === 'conversations' ? '搜尋對話' : '搜尋收藏')

// - 鍵盤上下移動時把選取項捲進可視範圍
async function focusResult(index: number): Promise<void> {
	if (resultCount.value === 0) return
	activeIndex.value = (index + resultCount.value) % resultCount.value
	await nextTick()
	document.getElementById(`search-result-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
}

async function openConversation(conversationId: string): Promise<void> {
	isOpen.value = false
	if (router.currentRoute.value.path !== '/ask' || Object.keys(router.currentRoute.value.query).length > 0) await router.push('/ask')
	await conversationStore.openConversation(conversationId)
}

async function openFavorite(favorite: FavoriteAnswer): Promise<void> {
	if (conversationStore.isResponding) {
		favoriteNavigationError.value = '目前正在產生回答，請稍候完成後再開啟收藏。'
		return
	}

	const savedMessages = conversationStore.conversationMessagesById[favorite.conversationId]
	const savedAnswer = savedMessages?.find((message) => message.id === favorite.id)
	if (!savedAnswer || savedAnswer.role !== 'assistant') {
		favoriteNavigationError.value = '原始對話或回答已不存在，無法開啟這筆收藏。'
		return
	}

	favoriteNavigationError.value = ''
	isOpen.value = false
	await router.push({ path: '/ask', query: { conversationId: favorite.conversationId, messageId: favorite.id } })
}

function confirmSelection(): void {
	if (activeScope.value === 'conversations') {
		const target = conversationResults.value[activeIndex.value]
		if (target) void openConversation(target.id)
		return
	}

	const target = favoriteResults.value[activeIndex.value]
	if (target) void openFavorite(target)
}

function handleSearchEnter(event: KeyboardEvent): void {
	if (event.isComposing) return
	event.preventDefault()
	confirmSelection()
}

function selectScope(scope: SearchScope): void {
	activeScope.value = scope
	activeIndex.value = 0
	favoriteNavigationError.value = ''
}

async function removeFavorite({ id, question, index }: { id: string; question: string; index: number }): Promise<void> {
	favoritesStore.remove(id)
	activeIndex.value = Math.max(0, Math.min(index, favoriteResults.value.length - 1))
	favoriteStatusMessage.value = ''
	await nextTick()
	const nextFavorite = favoriteResults.value[activeIndex.value]
	if (nextFavorite) document.getElementById(`favorite-remove-${nextFavorite.id}`)?.focus()
	else searchField.value?.focus()
	favoriteStatusMessage.value = `已取消收藏「${question}」。`
}

watch(isOpen, async (opened) => {
	if (!opened) return
	keyword.value = ''
	activeScope.value = 'conversations'
	activeIndex.value = 0
	favoriteStatusMessage.value = ''
	favoriteNavigationError.value = ''
	await nextTick()
	searchField.value?.focus()
})

watch(keyword, () => {
	activeIndex.value = 0
})
</script>

<template>
	<VDialog v-model="isOpen" max-width="620" scrim="rgba(0, 0, 0, 0.5)">
		<div class="search-panel" role="dialog" aria-label="搜尋對話">
			<div class="search-head">
				<VIcon icon="mdi-magnify" size="18" aria-hidden="true" />
				<input
					ref="searchField"
					v-model="keyword"
					type="text"
					class="search-field"
					:placeholder="searchPlaceholder"
					:aria-label="searchLabel"
					@keydown.down.prevent="focusResult(activeIndex + 1)"
					@keydown.up.prevent="focusResult(activeIndex - 1)"
					@keydown.enter="handleSearchEnter"
					@keydown.esc.prevent="isOpen = false"
				>
				<kbd class="search-esc">esc</kbd>
			</div>

			<div class="search-tabs" role="group" aria-label="搜尋範圍">
				<button
					type="button"
					class="search-tab"
					:class="{ 'is-active': activeScope === 'conversations' }"
					:aria-pressed="activeScope === 'conversations'"
					data-testid="search-conversations-tab"
					@click="selectScope('conversations')"
				>
					對話 <span class="tab-count">{{ conversationStore.conversations.length }}</span>
				</button>
				<button
					type="button"
					class="search-tab"
					:class="{ 'is-active': activeScope === 'favorites' }"
					:aria-pressed="activeScope === 'favorites'"
					data-testid="search-favorites-tab"
					@click="selectScope('favorites')"
				>
					已收藏 <span class="tab-count">{{ favoritesStore.items.length }}</span>
				</button>
			</div>
			<p v-if="favoriteNavigationError" class="result-error" role="alert">{{ favoriteNavigationError }}</p>

			<div id="search-results-panel">
				<ul v-if="activeScope === 'conversations' && conversationResults.length" class="result-list">
					<li v-for="(conversation, index) in conversationResults" :id="`search-result-${index}`" :key="conversation.id">
						<button
							type="button"
							class="result-item"
							:class="{ 'is-active': index === activeIndex }"
							@mouseenter="activeIndex = index"
							@click="openConversation(conversation.id)"
						>
							<span class="result-head">
								<VIcon v-if="conversation.isPinned" icon="mdi-pin" size="12" aria-hidden="true" />
								<span class="result-title">{{ conversation.title }}</span>
								<span v-if="conversation.isArchived" class="result-flag">已封存</span>
							</span>
							<span class="result-answer">{{ conversation.previewAnswer }}</span>
							<span class="result-meta mono">{{ formatHistoryTime({ isoDate: conversation.updatedAt }) }} · {{ conversation.messageCount }} 則訊息</span>
						</button>
					</li>
				</ul>
				<ul v-else-if="activeScope === 'favorites' && favoriteResults.length" class="result-list">
					<li v-for="(favorite, index) in favoriteResults" :id="`search-result-${index}`" :key="favorite.id" class="favorite-result">
						<button
							type="button"
							class="result-item"
							:class="{ 'is-active': index === activeIndex }"
							:aria-labelledby="`favorite-title-${favorite.id}`"
							:aria-describedby="`favorite-answer-${favorite.id} favorite-date-${favorite.id}`"
							@mouseenter="activeIndex = index"
							@click="openFavorite(favorite)"
						>
							<span class="result-head">
								<VIcon icon="mdi-bookmark" size="13" aria-hidden="true" />
								<span :id="`favorite-title-${favorite.id}`" class="result-title">{{ favorite.question }}</span>
							</span>
							<span :id="`favorite-answer-${favorite.id}`" class="result-answer">{{ favorite.answer }}</span>
							<time :id="`favorite-date-${favorite.id}`" class="result-meta mono" :datetime="favorite.date">收藏於 {{ favorite.date }}</time>
						</button>
						<button
							:id="`favorite-remove-${favorite.id}`"
							type="button"
							class="favorite-remove"
							:aria-label="`取消收藏「${favorite.question}」`"
							@click="removeFavorite({ id: favorite.id, question: favorite.question, index })"
						>
							<VIcon icon="mdi-bookmark-remove-outline" size="18" aria-hidden="true" />
						</button>
					</li>
				</ul>
				<p v-else-if="keyword" class="result-empty">找不到符合「{{ keyword }}」的{{ activeScope === 'conversations' ? '對話' : '收藏' }}。</p>
				<p v-else-if="activeScope === 'favorites'" class="result-empty">目前還沒有收藏。可在 AI 回答下方按下收藏按鈕。</p>
				<p v-else class="result-empty">目前沒有可搜尋的對話。</p>
			</div>
			<p class="sr-only" aria-live="polite">{{ favoriteStatusMessage }}</p>

			<div class="search-foot">
				<span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span>
				<span><kbd>⏎</kbd> 開啟</span>
				<span><kbd>esc</kbd> 關閉</span>
			</div>
		</div>
	</VDialog>
</template>

<style scoped>
.search-panel {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-xl);
	background: rgb(var(--v-theme-surface));
}

.search-head {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
	flex: 0 0 auto;
	padding: var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	color: var(--ink-subtle);
}

.search-field {
	flex: 1 1 auto;
	min-width: 0;
	border: 0;
	background: none;
	color: var(--ink-strong);
	font: inherit;
	font-size: 1rem;
	outline: none;
}

.search-field::placeholder {
	color: var(--ink-subtle);
}

.search-esc {
	flex: 0 0 auto;
	padding: 1px 6px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	color: var(--ink-subtle);
	font-family: var(--font-mono);
	font-size: 0.68rem;
}

.search-tabs {
	display: flex;
	gap: var(--space-xs);
	padding: var(--space-sm) var(--space-md) 0;
}

.search-tab {
	display: inline-flex;
	align-items: center;
	gap: var(--space-xs);
	padding: 6px var(--space-sm);
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--ink-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.8rem;
	font-weight: 650;
}

.search-tab:hover {
	background: var(--tint-hover);
}

.search-tab.is-active {
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
}

.tab-count {
	min-width: 20px;
	padding: 0 5px;
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-subtle);
	font-size: 0.68rem;
	font-weight: 600;
	line-height: 20px;
	text-align: center;
}

.result-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
	max-height: 52vh;
	margin: 0;
	padding: var(--space-sm);
	overflow-y: auto;
	list-style: none;
}

.result-item {
	display: grid;
	gap: 3px;
	width: 100%;
	padding: var(--space-sm) var(--space-md);
	border: 0;
	border-radius: var(--radius-md);
	background: none;
	color: inherit;
	cursor: pointer;
	font: inherit;
	text-align: left;
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.result-item.is-active {
	background: var(--tint-hover);
}

.favorite-result {
	display: flex;
	align-items: center;
}

.favorite-result .result-item {
	min-width: 0;
}

.favorite-remove {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 36px;
	height: 36px;
	margin-right: var(--space-sm);
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--ink-subtle);
	cursor: pointer;
}

.favorite-remove:hover,
.favorite-remove:focus-visible {
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

.result-head {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	min-width: 0;
	color: rgb(var(--v-theme-primary));
}

.result-title {
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.9rem;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.result-flag {
	flex: 0 0 auto;
	padding: 0 6px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	color: var(--ink-subtle);
	font-size: 0.65rem;
}

.result-answer {
	overflow: hidden;
	color: var(--ink-muted);
	font-size: 0.8rem;
	line-height: 1.55;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.result-meta {
	color: var(--ink-subtle);
	font-size: 0.68rem;
}

.result-empty {
	padding: var(--space-xl) var(--space-md);
	color: var(--ink-muted);
	font-size: 0.85rem;
	text-align: center;
}

.result-error {
	margin: var(--space-sm) var(--space-md) 0;
	padding: var(--space-sm) var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-warning), 0.12);
	color: var(--ink-strong);
	font-size: 0.8rem;
	line-height: 1.5;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.search-foot {
	display: flex;
	gap: var(--space-md);
	flex: 0 0 auto;
	padding: var(--space-sm) var(--space-md);
	border-top: 1px solid rgb(var(--v-theme-outline));
	color: var(--ink-subtle);
	font-size: 0.7rem;
}

.search-foot kbd {
	margin-right: 3px;
	padding: 1px 5px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	font-family: var(--font-mono);
	font-size: 0.66rem;
}
</style>
