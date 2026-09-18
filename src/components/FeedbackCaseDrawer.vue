<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
	FEEDBACK_CAUSE_LABELS,
	FEEDBACK_HANDLERS,
	FEEDBACK_KIND_LABELS,
	FEEDBACK_STATUS_COLORS,
	FEEDBACK_STATUS_LABELS,
	RESOLUTION_MAX_LENGTH,
	addCaseNote,
	assignCase,
	closeCase,
	formatAge,
	formatDateTime,
	formatFileSize,
	getCase,
	getCaseSignals,
	isOpen,
	reopenCase,
	startCase,
	type FeedbackAttachment,
	type FeedbackCause,
} from '@/mocks/feedbackAdmin'
import { workspaceDocuments } from '@/mocks/documentWorkspace'
import StatusChip from '@/components/StatusChip.vue'
import { getAnswerModelLabel, getAnswerStyleLabel } from '@/utils/answerSettings'

interface ComponentProps {
	caseId: string | null
	actor: string
}

const props = defineProps<ComponentProps>()
const emit = defineEmits<{ close: []; saved: [message: string, tone?: 'success' | 'error']; filterDocument: [documentId: string]; retest: [caseId: string] }>()

const signalIcon = { error: 'mdi-alert-circle-outline', warning: 'mdi-alert-outline', info: 'mdi-information-outline' } as const
const causeOptions = (Object.keys(FEEDBACK_CAUSE_LABELS) as FeedbackCause[]).map((value) => ({ title: FEEDBACK_CAUSE_LABELS[value], value }))
const assigneeOptions = [{ title: '未指派', value: null }, ...FEEDBACK_HANDLERS.map((handler) => ({ title: handler.name, value: handler.name }))]

const outcome = ref<'resolved' | 'dismissed'>('resolved')
const cause = ref<FeedbackCause | null>(null)
const resolution = ref('')
const note = ref('')
const reopenReason = ref('')
const closeError = ref('')
const noteError = ref('')
const isAnswerExpanded = ref(false)
const previewAttachment = ref<FeedbackAttachment | null>(null)

const item = computed(() => (props.caseId ? getCase(props.caseId) : undefined))
// @ 案件沒有編號，操作訊息改以問題本身指認
const caseLabel = computed(() => item.value ? `「${item.value.title}」` : '')
const signals = computed(() => (item.value ? getCaseSignals(item.value) : []))
const citations = computed(() => (item.value?.citations ?? []).map((citation) => ({ citation, document: workspaceDocuments.find((doc) => doc.id === citation.documentId) })))
const events = computed(() => [...(item.value?.events ?? [])].reverse())
const settingRows = computed(() => {
	const settings = item.value?.run?.settings
	if (!settings) return []
	return [
		{ label: '知識來源', value: settings.sourceName },
		{ label: '限定文件', value: settings.documentNames.length ? settings.documentNames.join('、') : '不限' },
		{ label: '回答模型', value: getAnswerModelLabel(settings.answerModelId) },
		{ label: '回答風格', value: getAnswerStyleLabel(settings.answerStyleId) },
		{ label: '網路搜尋', value: settings.webSearchEnabled ? '開' : '關' },
	]
})

watch(() => props.caseId, () => {
	outcome.value = 'resolved'
	cause.value = null
	resolution.value = ''
	note.value = ''
	reopenReason.value = ''
	closeError.value = ''
	noteError.value = ''
	isAnswerExpanded.value = false
	previewAttachment.value = null
})

function assign(value: string | null): void {
	if (!item.value) return
	const error = assignCase(item.value.id, value, props.actor)
	if (error) emit('saved', error, 'error')
	else emit('saved', value ? `${caseLabel.value}已指派給 ${value}，並已通知對方。` : `${caseLabel.value}已取消指派。`)
}

function start(): void {
	if (!item.value) return
	const error = startCase(item.value.id, props.actor)
	emit('saved', error || `${caseLabel.value}已開始處理。`, error ? 'error' : 'success')
}

function submitNote(): void {
	if (!item.value) return
	noteError.value = addCaseNote(item.value.id, note.value, props.actor)
	if (!noteError.value) note.value = ''
}

function submitClose(): void {
	if (!item.value) return
	closeError.value = closeCase(item.value.id, outcome.value, cause.value, resolution.value, props.actor)
	if (closeError.value) return
	const notified = item.value.reporter.userId ? `，已通知 ${item.value.reporter.name}` : '；回報者沒有系統帳號，無法發送通知'
	emit('saved', `${caseLabel.value}已標記為${FEEDBACK_STATUS_LABELS[outcome.value]}${notified}。`)
}

function submitReopen(): void {
	if (!item.value) return
	closeError.value = reopenCase(item.value.id, reopenReason.value, props.actor)
	if (closeError.value) return
	reopenReason.value = ''
	emit('saved', `${caseLabel.value}已重新開啟。`)
}

function percent(value: number): string {
	return `${Math.round(value * 100)}%`
}
</script>

<template>
	<VNavigationDrawer :model-value="Boolean(item)" location="end" temporary width="560" @update:model-value="!$event && emit('close')">
		<section v-if="item" class="drawer-body" :aria-label="`案件：${item.title}`" data-testid="feedback-drawer">
			<header class="drawer-head">
				<div>
					<p class="drawer-meta">{{ FEEDBACK_KIND_LABELS[item.kind] }}<template v-if="item.category"> · {{ item.category }}</template></p>
					<h2 class="section-heading">{{ item.title }}</h2>
					<p class="drawer-meta">
						<StatusChip :status="item.status" :color="FEEDBACK_STATUS_COLORS[item.status]" :label="FEEDBACK_STATUS_LABELS[item.status]" size="x-small" class="me-1" />
						{{ item.reporter.name }}<template v-if="item.reporter.department"> · {{ item.reporter.department }}</template> · <time :datetime="item.submittedAt" :title="formatDateTime(item.submittedAt)">{{ formatAge(item.submittedAt) }}</time>
					</p>
				</div>
				<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉" @click="emit('close')" />
			</header>

			<blockquote class="reporter-words">
				<span class="block-label">{{ item.kind === 'answer' ? '倒讚原因' : '問題描述' }}</span>
				{{ item.detail }}
			</blockquote>

			<section v-if="item.attachments.length" class="drawer-section" aria-labelledby="attachment-title">
				<h3 id="attachment-title">附件 <span>{{ item.attachments.length }}</span></h3>
				<ul class="attachment-list">
					<li v-for="attachment in item.attachments" :key="attachment.id">
						<button type="button" class="attachment-thumb" :aria-label="`放大檢視 ${attachment.name}`" @click="previewAttachment = attachment">
							<img :src="attachment.url" :alt="attachment.name" loading="lazy" />
						</button>
						<span class="citation-meta">{{ attachment.name }} · {{ formatFileSize(attachment.size) }}</span>
					</li>
				</ul>
			</section>

			<section v-if="signals.length" class="drawer-section" aria-labelledby="signal-title">
				<h3 id="signal-title">診斷線索</h3>
				<ul class="signal-list">
					<li v-for="signal in signals" :key="signal.id" :class="`is-${signal.tone}`">
						<VIcon :icon="signalIcon[signal.tone]" size="16" aria-hidden="true" />
						<span>{{ signal.text }}</span>
						<button v-if="signal.id.startsWith('repeat-') && signal.documentId" type="button" class="link-button" @click="emit('filterDocument', signal.documentId)">只看這份文件的回饋</button>
					</li>
				</ul>
			</section>

			<template v-if="item.kind === 'answer'">
				<section class="drawer-section" aria-labelledby="answer-title">
					<div class="section-head">
						<h3 id="answer-title">當時的回答</h3>
						<VBtn size="small" variant="tonal" color="primary" prepend-icon="mdi-robot-outline" data-testid="feedback-retest" @click="emit('retest', item.id)">用當時設定複測</VBtn>
					</div>
					<p class="answer-text" :class="{ 'is-clamped': !isAnswerExpanded }">{{ item.answer }}</p>
					<button v-if="(item.answer?.length ?? 0) > 90" type="button" class="link-button" :aria-expanded="isAnswerExpanded" @click="isAnswerExpanded = !isAnswerExpanded">{{ isAnswerExpanded ? '收合' : '展開完整回答' }}</button>

					<dl v-if="settingRows.length" class="setting-grid">
						<template v-for="row in settingRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></template>
					</dl>
				</section>

				<section v-if="item.run" class="drawer-section" aria-labelledby="run-title">
					<h3 id="run-title">檢索過程 <span>{{ item.run.totalMs.toLocaleString() }} ms · {{ item.run.requestId }}</span></h3>
					<VExpansionPanels variant="accordion" multiple class="run-panels">
						<VExpansionPanel v-for="step in item.run.steps" :key="step.id" elevation="0">
							<VExpansionPanelTitle class="run-title">
								<span class="run-step">
									<strong>{{ step.label }}</strong>
									<span class="citation-meta">{{ step.method }} · {{ step.elapsedMs }} ms</span>
									<span class="run-summary">{{ step.summary }}</span>
								</span>
							</VExpansionPanelTitle>
							<VExpansionPanelText>
								<dl class="setting-grid">
									<template v-for="param in step.params" :key="param.label"><dt>{{ param.label }}</dt><dd>{{ param.value }}</dd></template>
								</dl>
								<table v-if="step.hits?.length" class="hit-table">
									<thead><tr><th scope="col">段落</th><th scope="col">分數</th><th v-if="step.id === 'rerank'" scope="col">採用</th></tr></thead>
									<tbody>
										<tr v-for="hit in step.hits" :key="`${hit.documentId}-${hit.section}`" :class="{ 'is-dropped': step.id === 'rerank' && !hit.kept }">
											<td><span class="hit-title">{{ hit.title }}</span><span class="citation-meta">{{ hit.section }}</span></td>
											<td class="num">{{ percent(hit.score) }}</td>
											<td v-if="step.id === 'rerank'">{{ hit.kept ? '是' : `否（低於 ${percent(item.run.citationThreshold)}）` }}</td>
										</tr>
									</tbody>
								</table>
								<p v-else-if="step.hits" class="empty-note">沒有命中任何段落。</p>
								<RouterLink v-if="step.id === 'rerank'" :to="{ path: '/admin/ai-settings', query: { section: 'citation' } }" class="link-button settings-link">調整引用門檻</RouterLink>
							</VExpansionPanelText>
						</VExpansionPanel>
					</VExpansionPanels>
				</section>

				<section class="drawer-section" aria-labelledby="citation-title">
					<h3 id="citation-title">引用 <span>{{ citations.length }}</span></h3>
					<p v-if="!citations.length" class="empty-note">沒有引用。</p>
					<ul v-else class="citation-list">
						<li v-for="{ citation, document } in citations" :key="citation.id">
							<div class="citation-head">
								<RouterLink v-if="document" :to="`/admin/documents/${citation.documentId}/manage`" class="link-button">{{ citation.title }}</RouterLink>
								<span v-else>{{ citation.title }}（已刪除）</span>
								<span class="citation-meta">相關度 {{ percent(citation.confidence) }}</span>
							</div>
							<p class="citation-meta">{{ citation.section }}<template v-if="document"> · 目前 {{ document.version }} 版 · {{ document.status }}</template></p>
							<p class="citation-excerpt">「{{ citation.excerpt }}」</p>
						</li>
					</ul>
				</section>
			</template>

			<section class="drawer-section" aria-labelledby="handle-title">
				<h3 id="handle-title">處理</h3>
				<div class="assign-row">
					<VSelect :model-value="item.assignee ?? null" :items="assigneeOptions" label="處理人" hint="指派後對方會收到站內通知" persistent-hint density="compact" :disabled="!isOpen(item)" data-testid="feedback-assignee" @update:model-value="assign" />
					<VBtn v-if="item.status === 'new'" variant="outlined" data-testid="feedback-start" @click="start">開始處理</VBtn>
				</div>

				<form v-if="isOpen(item)" class="close-form" @submit.prevent="submitClose">
					<VBtnToggle v-model="outcome" mandatory density="compact" variant="outlined" divided color="primary" aria-label="處理結果">
						<VBtn value="resolved">已解決</VBtn>
						<VBtn value="dismissed">不處理</VBtn>
					</VBtnToggle>
					<VSelect v-model="cause" :items="causeOptions" label="問題原因" density="compact" data-testid="feedback-cause" />
					<VTextarea v-model="resolution" :label="outcome === 'resolved' ? '做了哪些修正' : '不處理的理由'" :hint="item.reporter.userId ? `結案後會以站內通知告訴 ${item.reporter.name}` : '回報者沒有系統帳號，不會發送通知'" persistent-hint rows="3" auto-grow :counter="RESOLUTION_MAX_LENGTH" density="compact" data-testid="feedback-resolution" />
					<p v-if="closeError" class="text-error text-body-2" role="alert">{{ closeError }}</p>
					<div class="form-actions"><VBtn type="submit" color="primary" variant="flat" data-testid="feedback-close">結案</VBtn></div>
				</form>
				<div v-else class="closed-summary">
					<p><strong>{{ FEEDBACK_STATUS_LABELS[item.status] }}</strong> · {{ item.cause ? FEEDBACK_CAUSE_LABELS[item.cause] : '' }}<template v-if="item.closedAt"> · {{ formatDateTime(item.closedAt) }}</template></p>
					<p>{{ item.resolution }}</p>
					<form class="inline-form" @submit.prevent="submitReopen">
						<VTextField v-model="reopenReason" label="重新開啟的原因" density="compact" hide-details />
						<VBtn type="submit" variant="outlined">重新開啟</VBtn>
					</form>
					<p v-if="closeError" class="text-error text-body-2" role="alert">{{ closeError }}</p>
				</div>
			</section>

			<section class="drawer-section" aria-labelledby="history-title">
				<h3 id="history-title">處理紀錄</h3>
				<form class="inline-form" @submit.prevent="submitNote">
					<VTextField v-model="note" label="新增備註，例如已聯絡誰、等待什麼" density="compact" :error-messages="noteError" hide-details="auto" />
					<VBtn type="submit" variant="text">新增</VBtn>
				</form>
				<ol class="event-list">
					<li v-for="entry in events" :key="entry.id">
						<span class="citation-meta">{{ formatDateTime(entry.at) }} · {{ entry.actor }}</span>
						<span class="event-text">{{ entry.text }}</span>
					</li>
					<li>
						<span class="citation-meta">{{ formatDateTime(item.submittedAt) }} · {{ item.reporter.name }}</span>
						<span>送出{{ item.kind === 'answer' ? '回答倒讚' : '問題回報' }}</span>
					</li>
				</ol>
			</section>

			<VDialog :model-value="Boolean(previewAttachment)" max-width="720" @update:model-value="!$event && (previewAttachment = null)">
				<VCard v-if="previewAttachment">
					<VCardTitle class="d-flex align-center">
						<span class="text-body-1">{{ previewAttachment.name }}</span>
						<VSpacer />
						<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉預覽" @click="previewAttachment = null" />
					</VCardTitle>
					<img :src="previewAttachment.url" :alt="previewAttachment.name" class="attachment-full" />
				</VCard>
			</VDialog>
		</section>
	</VNavigationDrawer>
</template>

<style scoped>
.drawer-body { display: grid; gap: var(--space-lg); padding: var(--space-lg); }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
.drawer-head .section-heading { margin: 2px 0 6px; }
.drawer-meta { margin: 0; color: var(--ink-muted); font-size: 0.8rem; }
.reporter-words { display: grid; gap: 4px; margin: 0; padding: 12px 14px; border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 4%); font-size: 0.92rem; line-height: 1.65; }
.block-label { color: var(--ink-muted); font-size: 0.74rem; }
.drawer-section h3 { margin-bottom: var(--space-sm); font-size: 0.92rem; font-weight: 700; }
.drawer-section h3 span { color: var(--ink-muted); font-size: 0.78rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.section-head h3 { margin: 0; }
.signal-list, .citation-list, .event-list, .attachment-list { display: grid; gap: var(--space-sm); margin: 0; padding: 0; list-style: none; }
.signal-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 0.86rem; }
.signal-list li > span { flex: 1 1 260px; }
.signal-list .is-error .v-icon { color: rgb(var(--v-theme-error)); }
.signal-list .is-warning .v-icon { color: rgb(var(--v-theme-warning)); }
.signal-list .is-info .v-icon { color: rgb(var(--v-theme-info)); }
.attachment-list { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.attachment-list li { display: grid; gap: 4px; }
.attachment-thumb { overflow: hidden; aspect-ratio: 3 / 4; max-width: 100%; border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 4%); }
.attachment-thumb img { width: 100%; height: 100%; object-fit: cover; }
.attachment-thumb:hover { border-color: rgb(var(--v-theme-primary)); }
.attachment-thumb:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.attachment-full { display: block; width: 100%; max-height: 75vh; object-fit: contain; background: rgb(var(--v-theme-on-surface) / 4%); }
.answer-text { margin: 0; font-size: 0.88rem; line-height: 1.7; white-space: pre-line; }
.answer-text.is-clamped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.setting-grid { display: grid; grid-template-columns: max-content 1fr; gap: 4px var(--space-md); margin: var(--space-sm) 0 0; font-size: 0.82rem; }
.setting-grid dt { color: var(--ink-muted); }
.setting-grid dd { margin: 0; }
.run-panels { border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); }
.run-panels :deep(.v-expansion-panel-title) { min-height: 0; padding: 10px 12px; }
.run-panels :deep(.v-expansion-panel-text__wrapper) { padding: 0 12px 12px; }
.run-step { display: grid; gap: 3px; line-height: 1.45; }
.run-step strong { font-size: 0.86rem; }
.run-summary { font-size: 0.8rem; }
.hit-table { width: 100%; margin-top: var(--space-sm); border-collapse: collapse; font-size: 0.8rem; }
.hit-table th { padding: 4px 6px; border-bottom: 1px solid rgb(var(--v-theme-outline)); color: var(--ink-muted); font-weight: 500; text-align: left; }
.hit-table td { padding: 6px; border-bottom: 1px solid rgb(var(--v-theme-outline) / 50%); vertical-align: top; }
.hit-table .num { font-variant-numeric: tabular-nums; }
.hit-table tr.is-dropped td { color: var(--ink-muted); }
.hit-title { display: block; }
.citation-list li { display: grid; gap: 2px; padding-bottom: var(--space-sm); border-bottom: 1px solid rgb(var(--v-theme-outline) / 60%); }
.citation-list li:last-child { border-bottom: 0; }
.citation-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; font-size: 0.88rem; }
.citation-meta { display: block; margin: 0; color: var(--ink-muted); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.citation-excerpt { margin: 0; font-size: 0.84rem; }
.empty-note { margin: 0; color: var(--ink-muted); font-size: 0.84rem; }
.assign-row { display: flex; align-items: flex-start; gap: var(--space-sm); margin-bottom: var(--space-md); }
.close-form { display: grid; gap: var(--space-sm); }
.close-form .v-btn-toggle { justify-self: start; margin-bottom: var(--space-xs); }
.closed-summary { display: grid; gap: var(--space-xs); font-size: 0.86rem; }
.closed-summary p { margin: 0; }
.inline-form { display: flex; align-items: flex-start; gap: var(--space-sm); margin-top: var(--space-sm); }
.event-list { margin-top: var(--space-md); }
.event-list li { display: grid; gap: 1px; padding-left: 12px; border-left: 1px solid rgb(var(--v-theme-outline)); font-size: 0.86rem; }
.event-text { white-space: pre-line; }
.form-actions { display: flex; justify-content: flex-end; }
.link-button { color: rgb(var(--v-theme-primary)); font-size: 0.82rem; text-decoration: underline; text-underline-offset: 2px; }
.link-button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.settings-link { display: inline-block; margin-top: 8px; }
</style>
