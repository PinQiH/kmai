<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import AnswerSettingsMenu from '@/components/AnswerSettingsMenu.vue'
import { CURRENT_HANDLER, addCaseNote } from '@/repositories/feedback.repository'
import { getEmployeeDocumentsBySourceId } from '@/repositories/knowledge.repository'
import { useAdminAssistantStore } from '@/stores/adminAssistant'
import { useNotebooksStore } from '@/stores/notebooks'
import type { AnswerSettings, KnowledgeSourceOption } from '@/types'

const props = defineProps<{
	pageTitle: string
	routePath: string
	sources: KnowledgeSourceOption[]
	remainingLabel: string
}>()

const emit = defineEmits<{
	minimize: []
	end: []
}>()

const assistantStore = useAdminAssistantStore()
const notebooksStore = useNotebooksStore()
const question = ref('')
const composer = ref<HTMLTextAreaElement>()
const isEndDialogOpen = ref(false)
const isSourceDialogOpen = ref(false)
const documentSearch = ref<string | null>('')
const recordedMessageIds = ref<string[]>([])
const recordError = ref('')

// @ 從回饋案件發起複測時，問題先放進輸入框讓管理者確認或修改再送出
watch(() => assistantStore.draftQuestion, (draft) => {
	if (!draft) return
	question.value = draft
	assistantStore.draftQuestion = ''
	recordedMessageIds.value = []
	void nextTick(() => composer.value?.focus())
}, { immediate: true })

function recordRetestResult(messageId: string, content: string): void {
	const retest = assistantStore.retest
	if (!retest) return
	const excerpt = content.length > 400 ? `${content.slice(0, 400)}…` : content
	recordError.value = addCaseNote(retest.caseId, `複測結果（${assistantStore.scopeSummary} · ${assistantStore.answerModelLabel} · ${assistantStore.answerStyleLabel}風格）：\n${excerpt}`, CURRENT_HANDLER)
	if (!recordError.value) recordedMessageIds.value.push(messageId)
}

const liveNotebook = computed(() => notebooksStore.notebooks.find((notebook) => notebook.id === assistantStore.selectedSource.id))
const missingNotebook = computed(() => assistantStore.selectedSource.kind === 'notebook' && !liveNotebook.value)
const emptyNotebook = computed(() => assistantStore.selectedSource.kind === 'notebook' && liveNotebook.value?.documents.length === 0)
const canSend = computed(() => (
	question.value.trim().length > 0 && !assistantStore.isResponding && !emptyNotebook.value && !missingNotebook.value
))
// > 限定文件：與前台問答同一套規則，知識庫取可見文件、筆記本取已完成處理的文件
const availableDocuments = computed(() => {
	const source = assistantStore.selectedSource
	if (source.kind === 'knowledge-base') {
		return getEmployeeDocumentsBySourceId(source.id).map((document) => ({ id: document.id, name: document.title }))
	}
	if (source.kind === 'notebook') {
		return (liveNotebook.value?.documents ?? [])
			.filter((document) => document.status === 'ready')
			.map((document) => ({ id: document.id, name: document.name }))
	}
	return []
})
const filteredDocuments = computed(() => {
	const keyword = documentSearch.value?.trim().toLocaleLowerCase('zh-TW') ?? ''
	if (!keyword) return availableDocuments.value
	return availableDocuments.value.filter((document) => document.name.toLocaleLowerCase('zh-TW').includes(keyword))
})
const webSearchSettingSource = computed(() => assistantStore.webSearchOverride === null ? 'default' : 'override')
const webSearchTitle = computed(() => {
	if (!assistantStore.selectedSource.supportsWebSearch) return '模型一般知識不使用網路搜尋'
	return webSearchSettingSource.value === 'default' ? '使用知識來源的預設值' : '你已覆寫知識來源的預設值'
})

async function submitQuestion(suggestedQuestion?: string): Promise<void> {
	const value = suggestedQuestion ?? question.value
	if (!value.trim() || assistantStore.isResponding || emptyNotebook.value || missingNotebook.value) return
	question.value = ''
	await assistantStore.sendMessage({
		question: value,
		pageTitle: props.pageTitle,
		routePath: props.routePath,
	})
	await nextTick()
	composer.value?.focus()
}

function handleComposerEnter(event: KeyboardEvent): void {
	if (event.isComposing || event.shiftKey) return
	event.preventDefault()
	void submitQuestion()
}

function handleSubmit(): void {
	void submitQuestion()
}

function selectKnowledgeSource(sourceId: string | null): void {
	if (!sourceId) return
	const source = props.sources.find((item) => item.id === sourceId)
	if (!source) return
	assistantStore.selectKnowledgeSource(source)
	documentSearch.value = ''
}

function isDocumentSelected(documentId: string): boolean {
	return assistantStore.selectedDocuments.some((document) => document.id === documentId)
}

function toggleDocument(document: { id: string; name: string }, isSelected: boolean | null): void {
	const documents = isSelected
		? [...assistantStore.selectedDocuments, document]
		: assistantStore.selectedDocuments.filter((selected) => selected.id !== document.id)
	assistantStore.setSelectedDocuments(documents)
}

function applyAnswerSettings(settings: AnswerSettings): void {
	assistantStore.applyAnswerSettings(settings)
}

function toggleWebSearch(): void {
	if (!assistantStore.selectedSource.supportsWebSearch) return
	assistantStore.setWebSearchEnabled(!assistantStore.isWebSearchEnabled)
}

function confirmEndSession(): void {
	isEndDialogOpen.value = false
	emit('end')
}

onMounted(() => window.requestAnimationFrame(() => composer.value?.focus()))
</script>

<template>
	<section
		class="assistant-panel"
		aria-label="AI 小幫手對話"
		data-testid="admin-assistant-panel"
		@keydown.esc="emit('minimize')"
	>
		<header class="assistant-header">
			<div class="assistant-identity">
				<div class="assistant-avatar" aria-hidden="true"><VIcon icon="mdi-robot-happy-outline" /></div>
				<div>
					<h2>AI 小幫手</h2>
					<p>管理工作助理 · {{ pageTitle }}</p>
				</div>
			</div>
			<div class="assistant-header-actions">
				<span v-if="remainingLabel" class="assistant-timer" aria-label="對話剩餘有效時間">{{ remainingLabel }}</span>
				<VBtn icon="mdi-minus" variant="text" size="small" aria-label="縮小 AI 小幫手" @click="emit('minimize')" />
				<VBtn
					v-if="assistantStore.activeSessionId"
					icon="mdi-close-circle-outline"
					variant="text"
					size="small"
					aria-label="結束對話"
					@click="isEndDialogOpen = true"
				/>
			</div>
		</header>

		<VAlert
			v-if="assistantStore.isExpiryWarningVisible"
			type="warning"
			variant="tonal"
			density="compact"
			class="assistant-alert"
		>
			這段對話即將因閒置而結束。
			<template #append>
				<VBtn size="small" variant="tonal" @click="assistantStore.continueSession()">繼續對話</VBtn>
			</template>
		</VAlert>

		<div v-if="assistantStore.retest" class="assistant-retest" data-testid="assistant-retest">
			<div class="assistant-retest-text">
				<strong>複測「{{ assistantStore.retest.caseTitle }}」</strong>
				<span v-if="assistantStore.retest.sourceAvailable">已套用 {{ assistantStore.retest.reporterName }} 當時的設定：{{ assistantStore.retest.sourceName }} · {{ assistantStore.retest.settingLabels.join(' · ') }}</span>
				<span v-else class="text-warning">當時的來源「{{ assistantStore.retest.sourceName }}」已無法使用，改用 {{ assistantStore.selectedSource.name }}。</span>
			</div>
			<VBtn size="x-small" variant="text" aria-label="結束複測模式" @click="assistantStore.clearRetest()">結束複測</VBtn>
		</div>

		<div class="assistant-messages" role="log" aria-live="polite">
			<div v-if="assistantStore.messages.length === 0 && !assistantStore.retest" class="assistant-empty">
				<VIcon icon="mdi-sparkles" size="28" color="primary" aria-hidden="true" />
				<h3 class="assistant-empty-title">快速問答與管理工作協助</h3>
				<p class="assistant-empty-description">可測試不同知識來源、草擬通知與公告，或整理管理內容。對話閒置 15 分鐘後會自動清除。</p>
				<div class="assistant-starters" aria-label="建議問題">
					<button type="button" @click="submitQuestion('產生一份系統維護通知範本')">產生系統維護通知範本</button>
					<button type="button" @click="submitQuestion('幫我整理一份管理公告的重點')">整理管理公告重點</button>
					<button type="button" @click="submitQuestion('測試這個知識來源可以回答哪些問題')">測試目前知識來源</button>
				</div>
			</div>
			<article
				v-for="message in assistantStore.messages"
				:key="message.id"
				class="assistant-message"
				:class="`is-${message.role}`"
			>
				<p>{{ message.content }}</p>
				<div v-if="message.citations?.length" class="assistant-citations">
					<VChip v-for="citation in message.citations" :key="citation.id" size="x-small" variant="tonal">
						{{ citation.title }}
					</VChip>
				</div>
				<div v-if="assistantStore.retest && message.role === 'assistant'" class="assistant-record">
					<span v-if="recordedMessageIds.includes(message.id)"><VIcon icon="mdi-check" size="14" aria-hidden="true" /> 已記到這筆案件的處理紀錄</span>
					<VBtn v-else size="x-small" variant="tonal" data-testid="assistant-record-retest" @click="recordRetestResult(message.id, message.content)">記到這筆案件</VBtn>
				</div>
			</article>
			<p v-if="recordError" class="text-error text-body-2" role="alert">{{ recordError }}</p>
			<div v-if="assistantStore.isResponding" class="assistant-thinking" role="status">
				<VProgressCircular indeterminate size="18" width="2" />
				正在整理回答…
			</div>
		</div>

		<div class="assistant-controls">
			<VAlert v-if="emptyNotebook" type="info" variant="tonal" density="compact">
				這本筆記本目前沒有文件，請先新增文件或改選其他來源。
			</VAlert>
			<VAlert v-else-if="missingNotebook" type="warning" variant="tonal" density="compact">
				這本筆記本已無法使用，請重新選擇知識來源。
			</VAlert>
			<VAlert v-if="assistantStore.errorMessage" type="error" variant="tonal" density="compact">
				{{ assistantStore.errorMessage }}
				<template v-if="assistantStore.lastFailedQuestion" #append>
					<VBtn
						size="small"
						variant="tonal"
						@click="assistantStore.retryLastQuestion({ pageTitle, routePath })"
					>重試</VBtn>
				</template>
			</VAlert>
			<div class="assistant-tools" aria-label="回答工具">
				<button
					type="button"
					class="assistant-tool-chip is-source"
					data-testid="assistant-source-control"
					aria-controls="admin-assistant-source-dialog"
					aria-haspopup="dialog"
					:aria-expanded="isSourceDialogOpen"
					@click="isSourceDialogOpen = true"
				>
					<VIcon icon="mdi-filter-variant" size="13" aria-hidden="true" />
					<span class="assistant-tool-label">{{ assistantStore.scopeSummary }}</span>
				</button>
				<AnswerSettingsMenu
					:selected-answer-style-id="assistantStore.answerStyleId"
					:selected-answer-model-id="assistantStore.answerModelId"
					:is-responding="assistantStore.isResponding"
					@apply="applyAnswerSettings"
				>
					<template #activator="{ activatorProps, isOpen }">
						<button
							v-bind="activatorProps"
							type="button"
							class="assistant-tool-chip"
							data-testid="assistant-answer-settings"
							:aria-expanded="isOpen"
						>
							<VIcon icon="mdi-tune-variant" size="13" aria-hidden="true" />
							{{ assistantStore.answerStyleLabel }} · {{ assistantStore.answerModelLabel }}
						</button>
					</template>
				</AnswerSettingsMenu>
				<button
					type="button"
					class="assistant-tool-chip"
					:class="{ 'is-enabled': assistantStore.isWebSearchEnabled }"
					data-testid="assistant-web-search-control"
					:disabled="!assistantStore.selectedSource.supportsWebSearch"
					:aria-pressed="assistantStore.isWebSearchEnabled"
					:title="webSearchTitle"
					@click="toggleWebSearch"
				>
					<VIcon icon="mdi-web" size="13" aria-hidden="true" />
					網路搜尋：{{ assistantStore.selectedSource.supportsWebSearch ? (assistantStore.isWebSearchEnabled ? '開' : '關') : '不可用' }}
					<span v-if="assistantStore.selectedSource.supportsWebSearch" class="assistant-setting-origin">
						{{ webSearchSettingSource === 'default' ? '預設' : '已調整' }}
					</span>
				</button>
			</div>
			<form class="assistant-composer" @submit.prevent="handleSubmit">
				<textarea
					ref="composer"
					v-model="question"
					rows="2"
					maxlength="1000"
					placeholder="輸入問題…"
					aria-label="輸入給 AI 小幫手的問題"
					:disabled="assistantStore.isResponding || emptyNotebook || missingNotebook"
					@keydown.enter="handleComposerEnter"
				/>
				<VBtn
					type="submit"
					icon="mdi-arrow-up"
					color="primary"
					size="small"
					:disabled="!canSend"
					aria-label="送出問題"
				/>
			</form>
			<p class="assistant-disclaimer">Mock 示範：重新整理後稽核紀錄會清除，請勿輸入真實機密。</p>
		</div>

		<VDialog v-model="isSourceDialogOpen" max-width="480">
			<VCard id="admin-assistant-source-dialog" class="pa-6">
				<h2 class="assistant-dialog-title">知識來源</h2>
				<p class="assistant-dialog-hint">切換來源會套用該來源的網路搜尋預設值，仍可在輸入框下方單次調整。</p>
				<VRadioGroup
					:model-value="assistantStore.selectedSource.id"
					hide-details
					@update:model-value="selectKnowledgeSource"
				>
					<VRadio v-for="source in sources" :key="source.id" :value="source.id">
						<template #label>
							<div class="assistant-source-option">
								<strong>{{ source.name }}</strong>
								<div class="assistant-source-description">
									{{ source.description }} · {{ source.supportsWebSearch ? `預設${source.defaultWebSearchEnabled ? '搜尋網路' : '不搜尋網路'}` : '不使用網路搜尋' }}
								</div>
							</div>
						</template>
					</VRadio>
				</VRadioGroup>
				<section v-if="assistantStore.supportsDocumentScope" class="assistant-scope" aria-labelledby="assistant-scope-title">
					<div class="assistant-scope-head">
						<h3 id="assistant-scope-title">限定文件（選填）</h3>
						<span>{{ availableDocuments.length }} 份可用</span>
					</div>
					<p class="assistant-dialog-hint">不選擇文件時，會使用整個來源。</p>
					<FilterSearchField
						v-if="availableDocuments.length > 0"
						v-model="documentSearch"
						label="搜尋文件"
						density="compact"
						variant="outlined"
						data-testid="assistant-document-search"
					/>
					<p v-if="availableDocuments.length === 0" class="assistant-dialog-hint">這個來源目前沒有可限定的文件。</p>
					<p v-else-if="filteredDocuments.length === 0" class="assistant-dialog-hint">找不到符合的文件，請調整搜尋文字。</p>
					<fieldset v-else class="assistant-scope-options">
						<legend class="assistant-scope-legend">選擇要限定的文件</legend>
						<VCheckbox
							v-for="document in filteredDocuments"
							:key="document.id"
							:model-value="isDocumentSelected(document.id)"
							:label="document.name"
							density="compact"
							hide-details
							:data-testid="`assistant-document-${document.id}`"
							@update:model-value="toggleDocument(document, $event)"
						/>
					</fieldset>
				</section>
				<div class="assistant-dialog-actions">
					<VBtn
						v-if="assistantStore.selectedDocuments.length > 0"
						variant="text"
						data-testid="assistant-clear-documents"
						@click="assistantStore.clearSelectedDocuments()"
					>使用全部文件</VBtn>
					<VSpacer />
					<VBtn color="primary" variant="tonal" @click="isSourceDialogOpen = false">完成</VBtn>
				</div>
			</VCard>
		</VDialog>

		<VDialog v-model="isEndDialogOpen" max-width="420">
			<VCard class="pa-5">
				<VCardTitle>結束這段對話？</VCardTitle>
				<VCardText>使用者畫面會立即清空，這個頁籤內的稽核副本仍可在系統紀錄查看。</VCardText>
				<VCardActions>
					<VSpacer />
					<VBtn variant="text" @click="isEndDialogOpen = false">取消</VBtn>
					<VBtn color="error" variant="tonal" @click="confirmEndSession">結束對話</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
	</section>
</template>

<style scoped>
.assistant-panel {
	display: flex;
	flex-direction: column;
	width: min(420px, 100vw);
	height: 100dvh;
	max-height: none;
	overflow: hidden;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 0;
	background: rgb(var(--v-theme-surface));
	box-shadow: 0 18px 52px rgb(0 0 0 / 25%);
}

.assistant-header,
.assistant-identity,
.assistant-header-actions,
.assistant-thinking {
	display: flex;
	align-items: center;
}

.assistant-header {
	justify-content: space-between;
	gap: var(--space-sm);
	padding: 12px 14px;
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.assistant-identity {
	min-width: 0;
	gap: 10px;
}

.assistant-avatar {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
}

.assistant-identity h2 {
	color: var(--ink-strong);
	font-size: 0.95rem;
}

.assistant-identity p {
	overflow: hidden;
	color: var(--ink-muted);
	font-size: 0.75rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.assistant-header-actions {
	flex: 0 0 auto;
}

.assistant-timer {
	font-family: var(--font-mono);
	font-size: 0.72rem;
}

.assistant-alert {
	margin: 10px 12px 0;
}

.assistant-retest {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	padding: 10px 14px;
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	background: rgb(var(--v-theme-primary) / 6%);
	font-size: 0.8rem;
}

.assistant-retest-text {
	display: grid;
	flex: 1 1 auto;
	gap: 2px;
	min-width: 0;
}

.assistant-retest-text span {
	color: var(--ink-muted);
	line-height: 1.5;
}

.assistant-record {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-top: 8px;
	color: var(--ink-muted);
	font-size: 0.74rem;
	white-space: normal;
}

.assistant-messages {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 10px;
	min-height: 180px;
	overflow-y: auto;
	padding: 14px;
}

.assistant-empty {
	display: grid;
	place-items: center;
	align-content: center;
	gap: 8px;
	height: 100%;
	padding: 24px;
	color: var(--ink-strong);
	text-align: center;
}

.assistant-empty-title {
	color: var(--ink-strong);
	font-size: 0.95rem;
	line-height: 1.4;
}

.assistant-empty-description {
	max-width: 38ch;
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.65;
}

.assistant-starters {
	display: grid;
	gap: 8px;
	width: 100%;
	margin-top: 8px;
}

.assistant-starters button {
	padding: 9px 12px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 10px;
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
	font: inherit;
	font-size: 0.84rem;
	font-weight: 600;
	text-align: left;
	cursor: pointer;
}

.assistant-starters button:hover,
.assistant-starters button:focus-visible {
	border-color: rgb(var(--v-theme-primary));
	background: rgb(var(--v-theme-primary) / 8%);
}

.assistant-message {
	max-width: 88%;
	padding: 9px 11px;
	border-radius: 14px;
	font-size: 0.86rem;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.assistant-message.is-user {
	align-self: flex-end;
	border-bottom-right-radius: 4px;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
}

.assistant-message.is-assistant {
	align-self: flex-start;
	border-bottom-left-radius: 4px;
	background: rgb(var(--v-theme-surface-variant));
	color: rgb(var(--v-theme-on-surface));
}

.assistant-citations {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 8px;
}

.assistant-thinking {
	gap: 8px;
	color: var(--ink-muted);
	font-size: 0.82rem;
}

.assistant-controls {
	display: grid;
	gap: 8px;
	padding: 12px;
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.assistant-tools {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-xs);
}

.assistant-tool-chip {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	max-width: 100%;
	padding: 4px var(--space-sm);
	border: 1px solid transparent;
	border-radius: 999px;
	background: transparent;
	color: var(--ink-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.72rem;
	line-height: 1.35;
	transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.assistant-tool-chip:hover {
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

.assistant-tool-chip.is-source,
.assistant-tool-chip.is-enabled {
	border-color: rgba(var(--v-theme-primary), 0.4);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
}

.assistant-tool-chip.is-source {
	min-width: 0;
	font-weight: 650;
}

.assistant-tool-chip:disabled {
	border-color: rgb(var(--v-theme-outline));
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-subtle);
	cursor: not-allowed;
}

.assistant-tool-chip:focus-visible,
.assistant-starters button:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.assistant-tool-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.assistant-setting-origin {
	padding-left: var(--space-xs);
	border-left: 1px solid currentColor;
	font-size: 0.6rem;
}

.assistant-composer {
	display: flex;
	align-items: end;
	gap: 8px;
	padding: 8px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 12px;
}

.assistant-composer:focus-within {
	border-color: rgb(var(--v-theme-primary));
}

.assistant-composer textarea {
	flex: 1 1 auto;
	min-width: 0;
	max-height: 96px;
	resize: vertical;
	border: 0;
	outline: 0;
	background: transparent;
	color: inherit;
	font: inherit;
}

.assistant-disclaimer {
	color: var(--ink-muted);
	font-size: 0.68rem;
	text-align: center;
}

.assistant-dialog-title {
	color: var(--ink-strong);
	font-size: 1.1rem;
}

.assistant-dialog-hint {
	margin: 6px 0 16px;
	color: var(--ink-muted);
	font-size: 0.84rem;
	line-height: 1.55;
}

.assistant-source-option {
	min-width: 0;
	padding: 5px 0;
	color: var(--ink-strong);
}

.assistant-source-description {
	margin-top: 2px;
	color: var(--ink-muted);
	font-size: 0.75rem;
	line-height: 1.45;
}

.assistant-dialog-actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	margin-top: 20px;
}

.assistant-scope {
	display: grid;
	gap: 8px;
	margin-top: 18px;
	padding-top: 14px;
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.assistant-scope-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-sm);
}

.assistant-scope-head h3 {
	color: var(--ink-strong);
	font-size: 0.92rem;
}

.assistant-scope-head span {
	color: var(--ink-muted);
	font-size: 0.75rem;
}

.assistant-scope .assistant-dialog-hint {
	margin: 0;
}

.assistant-scope-legend {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	white-space: nowrap;
}

.assistant-scope-options {
	display: grid;
	max-height: 210px;
	overflow-y: auto;
	margin: 0;
	padding: 0;
	border: 0;
}

@media (max-width: 600px) {
	.assistant-panel {
		width: 100%;
	}

	.assistant-controls {
		padding-bottom: max(12px, env(safe-area-inset-bottom));
	}
}
</style>
