<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

import { formatHistoryTime, useConversationStore } from '@/stores/conversation'
import type { ConversationSummary } from '@/types'

const emit = defineEmits<{ select: [conversationId: string] }>()

const router = useRouter()
const conversationStore = useConversationStore()

const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const renameField = ref<HTMLInputElement>()

// - 從側邊欄開啟對話：先導到問答頁，再讓 store 載入內容
async function handleSelect(conversationId: string): Promise<void> {
	if (renamingId.value) return
	if (router.currentRoute.value.path !== '/ask') await router.push('/ask')
	await conversationStore.openConversation(conversationId)
	emit('select', conversationId)
}

async function startRename(conversation: ConversationSummary): Promise<void> {
	renamingId.value = conversation.id
	renameDraft.value = conversation.title
	await nextTick()
	renameField.value?.select()
}

function commitRename(): void {
	if (!renamingId.value) return
	conversationStore.renameConversation({ conversationId: renamingId.value, title: renameDraft.value })
	renamingId.value = null
}

function cancelRename(): void {
	renamingId.value = null
	renameDraft.value = ''
}

</script>

<template>
	<section class="drawer-history" aria-label="歷史對話">
		<div class="history-scroll">
			<slot name="navigation" />
			<VDivider class="history-divider" />
			<div class="section-head">
				<h2 class="section-label">對話</h2>
				<button
					type="button"
					class="head-toggle"
					:class="{ 'is-on': conversationStore.onlyArchived }"
					:aria-pressed="conversationStore.onlyArchived"
					@click="conversationStore.onlyArchived = !conversationStore.onlyArchived"
				>
					{{ conversationStore.onlyArchived ? '已封存' : '進行中' }}
				</button>
			</div>
			<template v-if="conversationStore.pinnedConversations.length">
				<p class="group-label">
					<VIcon icon="mdi-pin" size="11" aria-hidden="true" />釘選
				</p>
				<ul class="history-list">
					<li v-for="conversation in conversationStore.pinnedConversations" :key="conversation.id" class="history-item" :class="{ 'is-active': conversation.id === conversationStore.activeConversationId }">
						<template v-if="renamingId === conversation.id">
							<input
								ref="renameField"
								v-model="renameDraft"
								type="text"
								class="rename-field"
								:aria-label="`重新命名 ${conversation.title}`"
								@keydown.enter.prevent="commitRename"
								@keydown.esc.prevent="cancelRename"
								@blur="commitRename"
							>
						</template>
						<template v-else>
							<button type="button" class="history-open" :aria-current="conversation.id === conversationStore.activeConversationId" @click="handleSelect(conversation.id)">
								<span class="history-title">{{ conversation.title }}</span>
								<span class="history-meta mono">{{ formatHistoryTime({ isoDate: conversation.updatedAt }) }} · {{ conversation.messageCount }} 則</span>
								<span class="history-preview" role="tooltip">
									<span class="preview-title">{{ conversation.title }}</span>
									<span class="preview-answer">{{ conversation.previewAnswer }}</span>
								</span>
							</button>
							<VMenu location="bottom end" :close-on-content-click="true">
								<template #activator="{ props: menuProps }">
									<button type="button" class="row-action" v-bind="menuProps" :aria-label="`${conversation.title} 的更多操作`">
										<VIcon icon="mdi-dots-horizontal" size="16" />
									</button>
								</template>
								<VList density="compact" class="row-menu">
									<VListItem prepend-icon="mdi-pin-off-outline" title="取消釘選" @click="conversationStore.togglePin(conversation.id)" />
									<VListItem prepend-icon="mdi-pencil-outline" title="重新命名" @click="startRename(conversation)" />
									<VListItem prepend-icon="mdi-archive-arrow-down-outline" title="封存" @click="conversationStore.toggleArchive(conversation.id)" />
								</VList>
							</VMenu>
						</template>
					</li>
				</ul>
			</template>

			<p v-if="conversationStore.unpinnedConversations.length && conversationStore.pinnedConversations.length" class="group-label">最近</p>
			<ul class="history-list">
				<li v-for="conversation in conversationStore.unpinnedConversations" :key="conversation.id" class="history-item" :class="{ 'is-active': conversation.id === conversationStore.activeConversationId }">
					<template v-if="renamingId === conversation.id">
						<input
							ref="renameField"
							v-model="renameDraft"
							type="text"
							class="rename-field"
							:aria-label="`重新命名 ${conversation.title}`"
							@keydown.enter.prevent="commitRename"
							@keydown.esc.prevent="cancelRename"
							@blur="commitRename"
						>
					</template>
					<template v-else>
						<button type="button" class="history-open" :aria-current="conversation.id === conversationStore.activeConversationId" @click="handleSelect(conversation.id)">
							<span class="history-title">{{ conversation.title }}</span>
							<span class="history-meta mono">{{ formatHistoryTime({ isoDate: conversation.updatedAt }) }} · {{ conversation.messageCount }} 則</span>

							<!--
								@ 自訂 hover 預覽而非 VTooltip：Vuetify overlay 自帶底色與
								  opacity，覆寫後文字對比仍會被壓低，這裡完全自控。
							-->
							<span class="history-preview" role="tooltip">
								<span class="preview-title">{{ conversation.title }}</span>
								<span class="preview-answer">{{ conversation.previewAnswer }}</span>
							</span>
						</button>
						<!-- @ 用 VMenu 而非自寫下拉：它會 teleport，不會被側邊欄的 overflow 裁掉 -->
						<VMenu location="bottom end" :close-on-content-click="true">
							<template #activator="{ props: menuProps }">
								<button type="button" class="row-action" v-bind="menuProps" :aria-label="`${conversation.title} 的更多操作`">
									<VIcon icon="mdi-dots-horizontal" size="16" />
								</button>
							</template>
							<VList density="compact" class="row-menu">
								<VListItem prepend-icon="mdi-pin-outline" title="釘選" @click="conversationStore.togglePin(conversation.id)" />
								<VListItem prepend-icon="mdi-pencil-outline" title="重新命名" @click="startRename(conversation)" />
								<VListItem
									:prepend-icon="conversation.isArchived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-arrow-down-outline'"
									:title="conversation.isArchived ? '取消封存' : '封存'"
									@click="conversationStore.toggleArchive(conversation.id)"
								/>
							</VList>
						</VMenu>
					</template>
				</li>
			</ul>

			<p v-if="conversationStore.filteredConversations.length === 0" class="history-empty">
				{{ conversationStore.onlyArchived ? '沒有已封存的對話。' : '還沒有對話紀錄。' }}
			</p>
		</div>
	</section>
</template>

<style scoped>
/*
 * > 側邊欄的對話區：由父層給定剩餘高度，自己捲動。
 * @ 不使用卡片外觀——側邊欄本身已是一個面板，再包一層就是卡中卡。
 */
.drawer-history {
	display: flex;
	flex-direction: column;
	gap: var(--space-xs);
	flex: 1 1 auto;
	min-height: 0;
	padding: 0 var(--space-sm);
}

.section-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
	padding: 0 var(--space-sm);
	margin-bottom: var(--space-xs);
}

.history-divider {
	margin: var(--space-xs) var(--space-sm) var(--space-sm);
}

.section-label {
	color: var(--ink-muted);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.06em;
}

/* @ 進行中／已封存的切換：一顆按鈕兩個狀態，比兩個 checkbox 省空間也更清楚 */
.head-toggle {
	padding: 2px var(--space-sm);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	background: none;
	color: var(--ink-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.68rem;
	transition: background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.head-toggle:hover {
	border-color: rgba(var(--v-theme-primary), 0.6);
	color: var(--ink-strong);
}

.head-toggle.is-on {
	border-color: rgba(var(--v-theme-primary), 0.55);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
	font-weight: 650;
}

.history-scroll {
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	overflow-x: clip;
	overflow-y: auto;
	padding-bottom: var(--space-sm);
}

.group-label {
	display: flex;
	align-items: center;
	gap: 3px;
	margin: var(--space-sm) 0 var(--space-xs);
	padding: 0 var(--space-sm);
	color: var(--ink-subtle);
	font-size: 0.66rem;
	font-weight: 650;
	letter-spacing: 0.04em;
}

.history-list {
	display: flex;
	flex-direction: column;
	gap: 1px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.history-item {
	position: relative;
	display: flex;
	align-items: center;
	border-radius: var(--radius-sm);
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.history-item:hover {
	background: var(--tint-hover);
}

.history-item.is-active {
	background: var(--tint-active);
}

.history-item.is-active .history-title {
	color: rgb(var(--v-theme-primary));
}

.history-open {
	display: grid;
	gap: 1px;
	flex: 1 1 auto;
	min-width: 0;
	padding: 6px var(--space-sm);
	border: 0;
	background: none;
	color: inherit;
	cursor: pointer;
	font: inherit;
	text-align: left;
}

.history-title {
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.8rem;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.history-meta {
	color: var(--ink-subtle);
	font-size: 0.66rem;
}

/* > 就地重新命名 */
.rename-field {
	flex: 1 1 auto;
	min-width: 0;
	margin: 2px var(--space-xs);
	padding: 4px var(--space-sm);
	border: 1px solid rgb(var(--v-theme-primary));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	font: inherit;
	font-size: 0.8rem;
	outline: none;
}

.row-action {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 26px;
	height: 26px;
	margin-right: var(--space-xs);
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--ink-subtle);
	cursor: pointer;
	opacity: 0;
	transition: color var(--motion-fast) var(--ease-standard);
}

/* @ 操作鈕平時隱藏減少噪音，但鍵盤聚焦時必須現身 */
.history-item:hover .row-action,
.history-item:focus-within .row-action,
.history-item.is-active .row-action {
	opacity: 1;
}

.row-action:hover {
	color: rgb(var(--v-theme-primary));
}

/* > Hover 預覽：實心表面、文字全不透明，浮在側邊欄右側 */
.history-preview {
	display: none;
	position: absolute;
	top: 0;
	left: calc(100% + var(--space-sm));
	z-index: var(--z-tooltip);
	width: 260px;
	padding: var(--space-sm) var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
	text-align: left;
	white-space: normal;
}

.history-open:hover .history-preview,
.history-open:focus-visible .history-preview {
	display: grid;
	gap: var(--space-xs);
}

.preview-title {
	display: -webkit-box;
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.82rem;
	font-weight: 700;
	line-height: 1.5;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.preview-answer {
	display: -webkit-box;
	overflow: hidden;
	color: var(--ink-muted);
	font-size: 0.78rem;
	line-height: 1.6;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	line-clamp: 4;
}

.history-empty {
	padding: var(--space-md) var(--space-sm);
	color: var(--ink-muted);
	font-size: 0.76rem;
	line-height: 1.6;
}
</style>
