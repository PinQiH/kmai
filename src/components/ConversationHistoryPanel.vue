<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
	ALL_FOLDER_ID,
	FOLDER_NAME_MAX_LENGTH,
	UNFILED_FOLDER_ID,
	formatHistoryTime,
	useConversationStore,
	type FolderMutationResult,
} from '@/stores/conversation'
import { useToastStore } from '@/stores/toast'
import type { ConversationSummary } from '@/types'

const emit = defineEmits<{ select: [conversationId: string] }>()

const router = useRouter()
const conversationStore = useConversationStore()
const toastStore = useToastStore()

const renamingId = ref<string | null>(null)
const renameDraft = ref('')

const isFolderListOpen = ref(true)
const folderDraft = ref('')
// @ 同一個輸入框兼作新增與改名：'new' 代表新增，其餘為被改名的資料夾 id
const folderEditingId = ref<string | null>(null)
const deleteTargetId = ref<string | null>(null)
const isDeleteDialogOpen = ref(false)
const isSelecting = ref(false)

const FOLDER_ERROR_MESSAGES: Record<Exclude<FolderMutationResult, 'ok'>, string> = {
	'empty-name': '請輸入資料夾名稱。',
	'too-long': `資料夾名稱請控制在 ${FOLDER_NAME_MAX_LENGTH} 個字以內。`,
	duplicated: '已經有同名的資料夾了。',
	'not-found': '這個資料夾已不存在，請重新整理。',
}

// - 系統項目與使用者資料夾併成同一份清單渲染，選取狀態的判斷才只有一套
const folderItems = computed(() => [
	{ id: ALL_FOLDER_ID, name: '全部', icon: 'mdi-inbox-multiple-outline', isSystem: true },
	{ id: UNFILED_FOLDER_ID, name: '未分類', icon: 'mdi-tray-outline', isSystem: true },
	...conversationStore.folders.map((folder) => ({ id: folder.id, name: folder.name, icon: 'mdi-folder-outline', isSystem: false })),
])

const selectedFolderName = computed(() => folderItems.value.find((folder) => folder.id === conversationStore.selectedFolderId)?.name ?? '全部')
const deleteTargetName = computed(() => conversationStore.folders.find((folder) => folder.id === deleteTargetId.value)?.name ?? '')
const selectedCount = computed(() => conversationStore.selectedVisibleConversationIds.length)

// - 釘選與最近兩組共用同一份列點樣板，避免兩份幾乎相同的標記各自演化
const conversationGroups = computed(() => [
	{ key: 'pinned', label: '釘選', icon: 'mdi-pin', items: conversationStore.pinnedConversations },
	{ key: 'recent', label: '最近', icon: '', items: conversationStore.unpinnedConversations },
])

/**
 * 把游標移進剛開啟的就地編輯輸入框並選取原文。
 * @ 不用 template ref：這些輸入框位於 v-for 內，Vue 會把同名 ref 收集成陣列，
 *   直接呼叫 .select() 會丟 TypeError。改用固定 id 查詢，同時只會有一個存在。
 * @param fieldId 輸入框的 DOM id。
 */
async function focusDraftField(fieldId: string): Promise<void> {
	await nextTick()
	const field = document.getElementById(fieldId)
	if (!(field instanceof HTMLInputElement)) return
	// @ 明確 focus 再 select：jsdom 的 select() 不會移動焦點，不寫這行測不出焦點有沒有進去
	field.focus()
	field.select()
}

function showFolderError(result: FolderMutationResult): void {
	if (result === 'ok') return
	toastStore.show(FOLDER_ERROR_MESSAGES[result], 'error')
}

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
	await focusDraftField('conversation-rename-field')
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

/* > 資料夾 */

/**
 * 開啟資料夾的就地編輯輸入框。
 * @param folderId 要改名的資料夾識別碼；傳入 'new' 代表新增一個資料夾。
 */
async function startFolderDraft(folderId: string): Promise<void> {
	isFolderListOpen.value = true
	folderEditingId.value = folderId
	folderDraft.value = folderId === 'new' ? '' : (conversationStore.folders.find((folder) => folder.id === folderId)?.name ?? '')
	await focusDraftField('folder-draft-field')
}

function cancelFolderDraft(): void {
	folderEditingId.value = null
	folderDraft.value = ''
}

function commitFolderDraft(): void {
	const editingId = folderEditingId.value
	if (!editingId) return

	// @ 先清狀態再處理結果：失敗時輸入框已收起，使用者由 toast 得知原因後重新操作，
	//   比把錯誤留在一個 26px 高的輸入框旁邊好讀。
	const name = folderDraft.value
	cancelFolderDraft()

	if (editingId === 'new') {
		const { result, folderId } = conversationStore.createFolder(name)
		showFolderError(result)
		if (result !== 'ok' || !folderId) return
		conversationStore.selectFolder(folderId)
		toastStore.show(`已建立資料夾「${name.trim()}」。`)
		return
	}

	const result = conversationStore.renameFolder({ folderId: editingId, name })
	showFolderError(result)
	if (result === 'ok') toastStore.show('已更新資料夾名稱。')
}

function askDeleteFolder(folderId: string): void {
	deleteTargetId.value = folderId
	isDeleteDialogOpen.value = true
}

function confirmDeleteFolder(): void {
	if (!deleteTargetId.value) return
	const name = deleteTargetName.value
	const result = conversationStore.deleteFolder(deleteTargetId.value)
	isDeleteDialogOpen.value = false
	deleteTargetId.value = null
	showFolderError(result)
	if (result === 'ok') toastStore.show(`已刪除資料夾「${name}」，裡面的對話已移到未分類。`)
}

/* > 搬移與批次選取 */

function moveOne({ conversation, folderId }: { conversation: ConversationSummary; folderId: string | null }): void {
	const movedCount = conversationStore.moveConversations({ conversationIds: [conversation.id], folderId })
	if (movedCount === 0) return
	const folderName = conversationStore.folders.find((folder) => folder.id === folderId)?.name ?? '未分類'
	toastStore.show(`已將「${conversation.title}」移到「${folderName}」。`)
}

/**
 * 在指定資料夾底下開一段新對話。
 * @ 先選定資料夾再清空畫面，送出第一個問題時才會繼承到正確的歸屬。
 * @param folderId 資料夾識別碼，或系統項目 all／unfiled。
 */
async function startConversationInFolder(folderId: string): Promise<void> {
	conversationStore.selectFolder(folderId)
	conversationStore.startNewConversation()
	if (router.currentRoute.value.path !== '/ask' || Object.keys(router.currentRoute.value.query).length > 0) await router.push('/ask')
}

function toggleSelecting(): void {
	isSelecting.value = !isSelecting.value
	if (!isSelecting.value) conversationStore.clearConversationSelection()
}

function moveSelected(folderId: string | null): void {
	const conversationIds = conversationStore.selectedVisibleConversationIds
	if (conversationIds.length === 0) return

	const movedCount = conversationStore.moveConversations({ conversationIds, folderId })
	const folderName = conversationStore.folders.find((folder) => folder.id === folderId)?.name ?? '未分類'
	conversationStore.clearConversationSelection()
	isSelecting.value = false
	toastStore.show(movedCount > 0 ? `已將 ${movedCount} 筆對話移到「${folderName}」。` : '選取的對話原本就在這個資料夾。', movedCount > 0 ? 'success' : 'info')
}
</script>

<template>
	<section class="drawer-history" aria-label="歷史對話">
		<div class="history-scroll">
			<slot name="navigation" />
			<VDivider class="history-divider" />

			<!--
				> 專案資料夾：單層、單一歸屬。
				@ 刻意不做巢狀與拖拉：在側邊欄的寬度裡拖拉命中範圍太小，
				  用選單搬移反而快，也不會誤放。
			-->
			<div class="section-head">
				<button
					type="button"
					class="section-toggle"
					:aria-expanded="isFolderListOpen"
					aria-controls="folder-list"
					@click="isFolderListOpen = !isFolderListOpen"
				>
					<VIcon :icon="isFolderListOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="14" aria-hidden="true" />
					<h2 class="section-label">資料夾</h2>
				</button>
				<button type="button" class="head-icon" aria-label="新增資料夾" title="新增資料夾" @click="startFolderDraft('new')">
					<VIcon icon="mdi-folder-plus-outline" size="15" />
				</button>
			</div>

			<ul v-show="isFolderListOpen" id="folder-list" class="folder-list">
				<li
					v-for="folder in folderItems"
					:key="folder.id"
					class="folder-item"
					:class="{ 'is-active': folder.id === conversationStore.selectedFolderId }"
				>
					<template v-if="folderEditingId === folder.id">
						<input
							id="folder-draft-field"
							v-model="folderDraft"
							type="text"
							class="rename-field"
							:maxlength="FOLDER_NAME_MAX_LENGTH"
							:aria-label="`重新命名資料夾 ${folder.name}`"
							@keydown.enter.prevent="commitFolderDraft"
							@keydown.esc.prevent="cancelFolderDraft"
							@blur="commitFolderDraft"
						>
					</template>
					<template v-else>
						<button
							type="button"
							class="folder-open"
							:aria-current="folder.id === conversationStore.selectedFolderId"
							@click="conversationStore.selectFolder(folder.id)"
						>
							<VIcon :icon="folder.icon" size="15" aria-hidden="true" />
							<span class="folder-name">{{ folder.name }}</span>
							<span class="folder-count mono">{{ conversationStore.folderCounts[folder.id] ?? 0 }}</span>
						</button>
						<button
							type="button"
							class="row-action"
							:aria-label="`在「${folder.name}」開新對話`"
							:title="`在「${folder.name}」開新對話`"
							@click="startConversationInFolder(folder.id)"
						>
							<VIcon icon="mdi-message-plus-outline" size="15" />
						</button>
						<VMenu v-if="!folder.isSystem" location="bottom end" :close-on-content-click="true">
							<template #activator="{ props: menuProps }">
								<button type="button" class="row-action" v-bind="menuProps" :aria-label="`${folder.name} 的更多操作`">
									<VIcon icon="mdi-dots-horizontal" size="16" />
								</button>
							</template>
							<VList density="compact" class="row-menu">
								<VListItem prepend-icon="mdi-pencil-outline" title="重新命名" @click="startFolderDraft(folder.id)" />
								<VListItem prepend-icon="mdi-folder-remove-outline" title="刪除資料夾" @click="askDeleteFolder(folder.id)" />
							</VList>
						</VMenu>
					</template>
				</li>
				<li v-if="folderEditingId === 'new'" class="folder-item">
					<input
						id="folder-draft-field"
						v-model="folderDraft"
						type="text"
						class="rename-field"
						:maxlength="FOLDER_NAME_MAX_LENGTH"
						placeholder="資料夾名稱"
						aria-label="新資料夾名稱"
						@keydown.enter.prevent="commitFolderDraft"
						@keydown.esc.prevent="cancelFolderDraft"
						@blur="commitFolderDraft"
					>
				</li>
			</ul>

			<div class="section-head">
				<h2 class="section-label">{{ selectedFolderName }}</h2>
				<div class="head-actions">
					<button
						type="button"
						class="head-toggle"
						:class="{ 'is-on': isSelecting }"
						:aria-pressed="isSelecting"
						data-testid="history-select-toggle"
						@click="toggleSelecting"
					>
						{{ isSelecting ? '取消選取' : '選取' }}
					</button>
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
			</div>

			<template v-for="group in conversationGroups" :key="group.key">
				<p v-if="group.items.length && (group.key === 'pinned' || conversationStore.pinnedConversations.length)" class="group-label">
					<VIcon v-if="group.icon" :icon="group.icon" size="11" aria-hidden="true" />{{ group.label }}
				</p>
				<ul v-if="group.items.length" class="history-list">
					<li
						v-for="conversation in group.items"
						:key="conversation.id"
						class="history-item"
						:class="{ 'is-active': conversation.id === conversationStore.activeConversationId }"
					>
						<template v-if="renamingId === conversation.id">
							<input
								id="conversation-rename-field"
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
							<label v-if="isSelecting" class="select-box">
								<input
									type="checkbox"
									:checked="conversationStore.selectedConversationIds.includes(conversation.id)"
									:aria-label="`選取 ${conversation.title}`"
									@change="conversationStore.toggleConversationSelection(conversation.id)"
								>
							</label>
							<button
								type="button"
								class="history-open"
								:aria-current="conversation.id === conversationStore.activeConversationId"
								@click="handleSelect(conversation.id)"
							>
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
									<VListItem
										:prepend-icon="conversation.isPinned ? 'mdi-pin-off-outline' : 'mdi-pin-outline'"
										:title="conversation.isPinned ? '取消釘選' : '釘選'"
										@click="conversationStore.togglePin(conversation.id)"
									/>
									<VListItem prepend-icon="mdi-pencil-outline" title="重新命名" @click="startRename(conversation)" />
									<VListItem
										:prepend-icon="conversation.isArchived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-arrow-down-outline'"
										:title="conversation.isArchived ? '取消封存' : '封存'"
										@click="conversationStore.toggleArchive(conversation.id)"
									/>
									<VDivider class="my-1" />
									<VListSubheader class="move-subheader">移至資料夾</VListSubheader>
									<VListItem
										prepend-icon="mdi-tray-outline"
										title="未分類"
										:disabled="conversation.folderId === null"
										@click="moveOne({ conversation, folderId: null })"
									/>
									<VListItem
										v-for="folder in conversationStore.folders"
										:key="folder.id"
										prepend-icon="mdi-folder-outline"
										:title="folder.name"
										:disabled="conversation.folderId === folder.id"
										@click="moveOne({ conversation, folderId: folder.id })"
									/>
								</VList>
							</VMenu>
						</template>
					</li>
				</ul>
			</template>

			<p v-if="conversationStore.filteredConversations.length === 0" class="history-empty">
				{{ conversationStore.onlyArchived ? '這個資料夾沒有已封存的對話。' : '這個資料夾還沒有對話。在這裡開始新對話，就會直接歸入目前的資料夾。' }}
			</p>
		</div>

		<!-- > 批次搬移列：只在選取模式且真的選到東西時出現，平時不佔高度 -->
		<div v-if="isSelecting && selectedCount > 0" class="batch-bar">
			<span class="batch-count">已選 {{ selectedCount }} 筆</span>
			<VMenu location="top end" :close-on-content-click="true">
				<template #activator="{ props: menuProps }">
					<button type="button" class="batch-move" v-bind="menuProps" data-testid="history-batch-move">移至…</button>
				</template>
				<VList density="compact" class="row-menu">
					<VListItem prepend-icon="mdi-tray-outline" title="未分類" @click="moveSelected(null)" />
					<VListItem
						v-for="folder in conversationStore.folders"
						:key="folder.id"
						prepend-icon="mdi-folder-outline"
						:title="folder.name"
						@click="moveSelected(folder.id)"
					/>
				</VList>
			</VMenu>
		</div>

		<ConfirmDialog
			v-model="isDeleteDialogOpen"
			:title="`刪除資料夾「${deleteTargetName}」？`"
			description="資料夾會被刪除，裡面的對話不會消失，會移到「未分類」。"
			confirm-label="刪除資料夾"
			@confirm="confirmDeleteFolder"
		/>
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

.head-actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

/* @ 標題本身就是收合鈕：側邊欄寬度有限，不再多放一顆箭頭按鈕 */
.section-toggle {
	display: flex;
	align-items: center;
	gap: 2px;
	min-width: 0;
	padding: 0;
	border: 0;
	background: none;
	color: var(--ink-subtle);
	cursor: pointer;
	font: inherit;
}

.section-toggle:hover .section-label {
	color: var(--ink-strong);
}

.head-icon {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--ink-subtle);
	cursor: pointer;
	transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.head-icon:hover,
.head-icon:focus-visible {
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

/* > 專案資料夾清單 */
.folder-list {
	display: flex;
	flex-direction: column;
	gap: 1px;
	margin: 0 0 var(--space-xs);
	padding: 0;
	list-style: none;
}

.folder-item {
	display: flex;
	align-items: center;
	border-radius: var(--radius-sm);
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.folder-item:hover {
	background: var(--tint-hover);
}

.folder-item.is-active {
	background: var(--tint-active);
}

.folder-item.is-active .folder-name {
	color: rgb(var(--v-theme-primary));
	font-weight: 650;
}

.folder-open {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	flex: 1 1 auto;
	min-width: 0;
	padding: 5px var(--space-sm);
	border: 0;
	background: none;
	color: var(--ink-subtle);
	cursor: pointer;
	font: inherit;
	text-align: left;
}

.folder-name {
	flex: 1 1 auto;
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.78rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.folder-count {
	flex: 0 0 auto;
	color: var(--ink-subtle);
	font-size: 0.66rem;
}

/* @ 資料夾列的操作鈕沿用對話列的顯示規則：平時隱藏，hover 或鍵盤聚焦才現身 */
.folder-item .row-action {
	opacity: 0;
}

.folder-item:hover .row-action,
.folder-item:focus-within .row-action {
	opacity: 1;
}

/* > 批次選取 */
.select-box {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 26px;
	height: 26px;
	margin-left: 2px;
	cursor: pointer;
}

.select-box input {
	width: 14px;
	height: 14px;
	accent-color: rgb(var(--v-theme-primary));
	cursor: pointer;
}

/* @ 固定在面板底部而非跟著清單捲動：選到第 20 筆時搬移鈕仍然看得到 */
.batch-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
	flex: 0 0 auto;
	margin: 0 var(--space-sm) var(--space-sm);
	padding: var(--space-xs) var(--space-sm);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
}

.batch-count {
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.batch-move {
	padding: 3px var(--space-sm);
	border: 1px solid rgba(var(--v-theme-primary), 0.55);
	border-radius: var(--radius-sm);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
	cursor: pointer;
	font: inherit;
	font-size: 0.72rem;
	font-weight: 650;
}

:global(.row-menu .move-subheader) {
	min-height: 24px;
	padding-inline: 8px;
	color: var(--ink-subtle);
	font-size: 0.68rem;
	font-weight: 700;
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

/* @ VMenu 會傳送到 body，因此用 global 精準縮小這個清單，不影響其他選單。 */
:global(.row-menu.v-list) {
	width: 168px;
	min-width: 168px;
	padding: 4px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

:global(.row-menu .v-list-item) {
	min-height: 32px;
	padding-inline: 8px;
	border-radius: 6px;
}

:global(.row-menu .v-list-item__prepend) {
	width: auto;
	margin-inline-end: 6px;
}

:global(.row-menu .v-list-item__spacer) {
	width: 0;
}

:global(.row-menu .v-icon) {
	font-size: 15px;
}

:global(.row-menu .v-list-item-title) {
	font-size: 0.75rem;
	line-height: 1.35;
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
