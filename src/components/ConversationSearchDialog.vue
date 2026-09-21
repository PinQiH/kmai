<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { formatHistoryTime, useConversationStore } from '@/stores/conversation'

const isOpen = defineModel<boolean>({ required: true })

const router = useRouter()
const conversationStore = useConversationStore()

const keyword = ref('')
const activeIndex = ref(0)
const searchField = ref<HTMLInputElement>()

const conversationResults = computed(() => conversationStore.searchConversations(keyword.value))

// - 搜尋結果跨資料夾，標示所屬資料夾才知道這筆紀錄被歸在哪裡
const folderNameById = computed(() => Object.fromEntries(conversationStore.folders.map((folder) => [folder.id, folder.name])))

// - 鍵盤上下移動時把選取項捲進可視範圍
async function focusResult(index: number): Promise<void> {
	const resultCount = conversationResults.value.length
	if (resultCount === 0) return
	activeIndex.value = (index + resultCount) % resultCount
	await nextTick()
	document.getElementById(`search-result-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
}

async function openConversation(conversationId: string): Promise<void> {
	isOpen.value = false
	if (router.currentRoute.value.path !== '/ask' || Object.keys(router.currentRoute.value.query).length > 0) await router.push('/ask')
	await conversationStore.openConversation(conversationId)
}

function handleSearchEnter(event: KeyboardEvent): void {
	if (event.isComposing) return
	event.preventDefault()
	const target = conversationResults.value[activeIndex.value]
	if (target) void openConversation(target.id)
}

watch(isOpen, async (opened) => {
	if (!opened) return
	keyword.value = ''
	activeIndex.value = 0
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
					placeholder="搜尋對話標題或內容…"
					aria-label="搜尋對話"
					@keydown.down.prevent="focusResult(activeIndex + 1)"
					@keydown.up.prevent="focusResult(activeIndex - 1)"
					@keydown.enter="handleSearchEnter"
					@keydown.esc.prevent="isOpen = false"
				>
				<kbd class="search-esc">esc</kbd>
			</div>

			<div id="search-results-panel">
				<ul v-if="conversationResults.length" class="result-list">
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
								<span v-if="conversation.folderId" class="result-flag">{{ folderNameById[conversation.folderId] }}</span>
							<span v-if="conversation.isArchived" class="result-flag">已封存</span>
							</span>
							<span class="result-answer">{{ conversation.previewAnswer }}</span>
							<span class="result-meta mono">{{ formatHistoryTime({ isoDate: conversation.updatedAt }) }} · {{ conversation.messageCount }} 則訊息</span>
						</button>
					</li>
				</ul>
				<p v-else-if="keyword" class="result-empty">找不到符合「{{ keyword }}」的對話。</p>
				<p v-else class="result-empty">目前沒有可搜尋的對話。</p>
			</div>

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
