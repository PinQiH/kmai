<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { DocumentProcessingRecord, DocumentProcessingStep, DocumentStatus } from '@/types'
import { processingStages } from '@/mocks/documentProcessing'
import { describeOptions, getFileTypeIdByExtension, getFileTypeName, resolveStrategy, strategySourceLabels } from '@/mocks/documentStrategies'
import { DOCUMENT_LIFECYCLE_STAGES, getDocumentLifecycle } from '@/utils/documentLifecycle'

interface ComponentProps {
	status: DocumentStatus
	record?: DocumentProcessingRecord
	/** 是否顯示系統處理步驟清單。 */
	showSteps?: boolean
	/** 是否顯示上方的四步生命週期軌。 */
	showStages?: boolean
	/** 是否提供切塊入口與逐檔重新處理；唯讀預覽不開放。 */
	actionable?: boolean
}

const props = withDefaults(defineProps<ComponentProps>(), { record: undefined, showSteps: true, showStages: true, actionable: false })

const emit = defineEmits<{
	/** 要查看某個檔案的切塊；主文件與附件都會帶檔案代號，沒有檔案清單時為 undefined。 */
	viewChunks: [fileId: string | undefined]
	/** 要重新處理某個附件。 */
	reprocessFile: [fileId: string]
}>()

const lifecycle = computed(() => getDocumentLifecycle(props.status))

const stepStateMeta: Record<DocumentProcessingStep['state'], { icon: string; className: string }> = {
	已完成: { icon: 'mdi-check-circle-outline', className: 'is-done' },
	進行中: { icon: 'mdi-progress-clock', className: 'is-running' },
	等待中: { icon: 'mdi-timer-sand', className: 'is-waiting' },
	失敗: { icon: 'mdi-alert-circle-outline', className: 'is-failed' },
	未執行: { icon: 'mdi-minus-circle-outline', className: 'is-skipped' },
}

// > 檔案切換：有附件時可逐一查看主文件與每個附件的步驟
const files = computed(() => props.record?.files ?? [])
const attachmentFiles = computed(() => files.value.filter((file) => file.role === '附件'))
const selectedFileId = ref<string | null>(null)
const selectedFile = computed(() => files.value.find((file) => file.id === selectedFileId.value))
const isAttachmentSelected = computed(() => selectedFile.value?.role === '附件')
const activeSteps = computed(() => selectedFile.value?.steps ?? props.record?.steps ?? [])

// @ 預設先打開失敗的檔案，使用者一進來就看到出問題的那一個；紀錄換了或檔案被刪除時重新挑選
watch(
	() => [props.record?.jobId, files.value.map((file) => `${file.id}:${file.state}`).join('|')],
	() => {
		if (selectedFile.value) return
		selectedFileId.value = (files.value.find((file) => file.state === '失敗') ?? files.value.find((file) => file.role === '主文件'))?.id ?? null
	},
	{ immediate: true },
)

// @ 附件依自己的副檔名套用檔案類型策略：文件層覆寫 > 附件的檔案類型 > 全域
const selectedFileTypeId = computed(() => (isAttachmentSelected.value ? getFileTypeIdByExtension(selectedFile.value!.extension) : undefined))
const stageStrategies = computed(() => Object.fromEntries(
	resolveStrategy(props.record?.documentId, selectedFileTypeId.value).map((stage) => [stage.stageId, stage]),
))

function getStrategyLabel(stepId: string): string {
	const stage = stageStrategies.value[stepId]
	return stage ? `${stage.strategyName}（${strategySourceLabels[stage.source]}）` : '使用全域設定'
}

function getOptionLabel(stepId: string): string {
	const stage = stageStrategies.value[stepId]
	return stage ? describeOptions(stage.stageId, stage.strategyId, stage.options).join(' · ') : ''
}


const stageNotes = Object.fromEntries(processingStages.map((stage) => [stage.id, stage.description]))

/** 判斷生命週期節點相對於目前階段的位置。 */
function getStageState(step: number): 'done' | 'current' | 'upcoming' {
	if (props.status === '已下架' && step === 4) return 'current'
	if (step < lifecycle.value.step) return 'done'
	if (step === lifecycle.value.step) return 'current'
	return 'upcoming'
}
</script>

<template>
	<section class="lifecycle-trail" aria-label="文件生命週期">
		<ol v-if="showStages" class="stage-rail">
			<li
				v-for="stage in DOCUMENT_LIFECYCLE_STAGES"
				:key="stage.id"
				class="stage"
				:class="[`is-${getStageState(stage.step)}`, { 'is-alert': getStageState(stage.step) === 'current' && lifecycle.needsAttention }]"
				:aria-current="getStageState(stage.step) === 'current' ? 'step' : undefined"
			>
				<span class="stage-marker" aria-hidden="true">
					<VIcon v-if="getStageState(stage.step) === 'done'" icon="mdi-check" size="14" />
					<template v-else>{{ stage.step }}</template>
				</span>
				<span class="stage-text">
					<strong>{{ getStageState(stage.step) === 'current' ? lifecycle.stageName : stage.name }}</strong>
					<span>{{ getStageState(stage.step) === 'current' ? lifecycle.headline : stage.description }}</span>
				</span>
			</li>
		</ol>

		<p v-if="showStages" class="next-action">
			<VIcon :icon="lifecycle.icon" size="18" aria-hidden="true" />
			<span><strong>下一步：</strong>{{ lifecycle.nextAction }}</span>
		</p>

		<template v-if="showSteps">
			<div v-if="record" class="processing-block">
				<div class="processing-heading">
					<h3>系統處理步驟</h3>
					<span>{{ record.jobId }} · 最後更新 {{ record.lastUpdatedAt }}</span>
				</div>
				<VProgressLinear
					v-if="status === '處理中'"
					:model-value="record.progress"
					color="primary"
					height="6"
					rounded
					class="mb-4"
					:aria-label="`處理進度 ${record.progress}%`"
				/>
				<div v-if="attachmentFiles.length" class="file-block">
					<h4>檔案（主文件與 {{ attachmentFiles.length }} 個附件）· 點選查看各自的處理步驟</h4>
					<div class="file-list" role="tablist" aria-label="選擇要查看的檔案">
						<button
							v-for="file in files"
							:key="file.id"
							type="button"
							role="tab"
							class="file-item"
							:class="[stepStateMeta[file.state].className, { 'is-selected': file.id === selectedFileId }]"
							:aria-selected="file.id === selectedFileId"
							:data-testid="`processing-file-${file.id}`"
							@click="selectedFileId = file.id"
						>
							<VIcon :icon="stepStateMeta[file.state].icon" size="16" aria-hidden="true" />
							<span class="file-role">{{ file.role }}</span>
							<span class="file-name" :title="file.name">{{ file.name }}</span>
							<span class="file-state">{{ file.state }} · {{ file.stage }}</span>
						</button>
					</div>
				</div>
				<div v-if="selectedFile && attachmentFiles.length" class="file-focus">
					<span>正在查看：<strong>{{ selectedFile.name }}</strong></span>
					<span v-if="isAttachmentSelected" class="file-focus-type">套用「{{ getFileTypeName(selectedFileTypeId) }}」策略層級</span>
					<VBtn
						v-if="actionable && isAttachmentSelected"
						variant="tonal"
						:color="selectedFile.state === '失敗' ? 'error' : undefined"
						size="small"
						prepend-icon="mdi-restart"
						@click="emit('reprocessFile', selectedFile.id)"
					>
						重新處理此附件…
					</VBtn>
				</div>
				<VAlert v-if="isAttachmentSelected && selectedFile?.note" type="error" variant="tonal" density="compact" class="mb-3">
					{{ selectedFile.note }}
				</VAlert>
				<VExpansionPanels :key="selectedFileId ?? 'main'" variant="accordion" class="processing-steps">
					<VExpansionPanel v-for="(step, index) in activeSteps" :key="step.id" :class="stepStateMeta[step.state].className">
						<VExpansionPanelTitle>
							<span class="step-line">
								<VIcon :icon="stepStateMeta[step.state].icon" size="18" aria-hidden="true" />
								<span class="step-name">{{ index + 1 }}. {{ step.name }}</span>
								<span class="step-detail">{{ step.detail }}</span>
								<span class="step-state">{{ step.state }}<template v-if="step.finishedAt"> · {{ step.finishedAt }}</template></span>
							</span>
						</VExpansionPanelTitle>
						<VExpansionPanelText>
							<dl class="step-facts">
								<div><dt>執行狀態</dt><dd>{{ step.state }}</dd></div>
								<div><dt>處理結果</dt><dd>{{ step.detail }}</dd></div>
								<div><dt>套用策略</dt><dd>{{ getStrategyLabel(step.id) }}</dd></div>
								<div v-if="getOptionLabel(step.id)"><dt>策略參數</dt><dd>{{ getOptionLabel(step.id) }}</dd></div>
								<div><dt>耗時</dt><dd>{{ step.durationLabel ?? '—' }}</dd></div>
								<div><dt>完成時間</dt><dd>{{ step.finishedAt ?? '尚未完成' }}</dd></div>
							</dl>
							<ul v-if="step.warnings?.length" class="step-warnings">
								<li v-for="warning in step.warnings" :key="warning">
									<VIcon icon="mdi-alert-outline" size="16" aria-hidden="true" />
									<span>{{ warning }}</span>
								</li>
							</ul>
							<p class="step-note">{{ stageNotes[step.id] ?? '這個步驟的細節會在串接處理服務後提供更完整的紀錄。' }}</p>
							<VBtn
								v-if="step.id === 'chunk' && actionable"
								variant="tonal"
								size="small"
								prepend-icon="mdi-view-split-horizontal"
								class="mt-3"
								data-testid="trail-view-chunks"
								@click="emit('viewChunks', selectedFile?.id)"
							>
								{{ step.state === '已完成' ? '檢視這個檔案的切塊' : '查看切塊狀態' }}
							</VBtn>
						</VExpansionPanelText>
					</VExpansionPanel>
				</VExpansionPanels>
				<VAlert v-if="record.failureReason && !isAttachmentSelected" type="error" variant="tonal" density="compact" class="mt-4">
					{{ record.failureReason }}
				</VAlert>
				<p v-else-if="record.reviewNote && !isAttachmentSelected" class="review-note">
					<VIcon icon="mdi-note-text-outline" size="16" aria-hidden="true" />
					<span>{{ record.reviewNote }}</span>
				</p>
			</div>
			<p v-else class="processing-empty">這個版本沒有處理紀錄，可能是在導入處理流程前就已建立。</p>
		</template>
	</section>
</template>

<style scoped>
.lifecycle-trail {
	display: grid;
	gap: var(--space-md);
}

.stage-rail {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: var(--space-sm);
	margin: 0;
	padding: 0;
	list-style: none;
	counter-reset: stage;
}

.stage {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	padding-top: var(--space-sm);
	border-top: 2px solid rgb(var(--v-theme-outline));
	color: var(--ink-muted);
}

.stage.is-done {
	border-top-color: rgb(var(--v-theme-primary));
}

.stage.is-current {
	border-top-color: rgb(var(--v-theme-primary));
	color: var(--ink-strong);
}

.stage.is-alert {
	border-top-color: rgb(var(--v-theme-warning));
}

.stage-marker {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	width: 22px;
	height: 22px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	line-height: 1;
}

.stage.is-done .stage-marker {
	border-color: transparent;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
}

.stage.is-current .stage-marker {
	border-color: rgb(var(--v-theme-primary));
	background: rgb(var(--v-theme-primary) / 12%);
	color: rgb(var(--v-theme-primary));
}

.stage.is-alert .stage-marker {
	border-color: rgb(var(--v-theme-warning));
	background: rgb(var(--v-theme-warning) / 14%);
	color: rgb(var(--v-theme-warning));
}

.stage-text {
	display: grid;
	gap: 2px;
	min-width: 0;
}

.stage-text strong {
	font-size: 0.86rem;
}

.stage-text span {
	font-size: 0.74rem;
	line-height: 1.45;
	text-wrap: pretty;
}

.next-action {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	margin: 0;
	padding: 10px var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
	font-size: 0.84rem;
	line-height: 1.6;
}

.processing-block {
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.processing-heading {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-sm);
	margin-bottom: var(--space-md);
}

.processing-heading h3 {
	font-size: 0.92rem;
	font-weight: 700;
}

.processing-heading span {
	color: var(--ink-muted);
	font-size: 0.74rem;
	font-variant-numeric: tabular-nums;
}

.processing-steps {
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	overflow: hidden;
}

.processing-steps :deep(.v-expansion-panel) {
	background: rgb(var(--v-theme-surface));
}

.processing-steps :deep(.v-expansion-panel-title) {
	min-height: 52px;
	padding-block: 6px;
}

.step-line {
	display: grid;
	grid-template-columns: 20px 6.5rem minmax(0, 1fr) auto;
	align-items: center;
	gap: var(--space-sm);
	width: 100%;
	font-size: 0.84rem;
}

.step-name {
	font-weight: 600;
}

.step-detail,
.step-state {
	color: var(--ink-muted);
}

.step-state {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.processing-steps .is-done :deep(.v-icon),
.processing-steps .is-done .step-state {
	color: rgb(var(--v-theme-success));
}

.processing-steps .is-running :deep(.v-icon),
.processing-steps .is-running .step-state {
	color: rgb(var(--v-theme-primary));
}

.processing-steps .is-failed :deep(.v-icon),
.processing-steps .is-failed .step-state {
	color: rgb(var(--v-theme-error));
}

.step-facts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: var(--space-sm);
	margin: 0 0 var(--space-md);
}

.step-facts > div {
	padding: var(--space-sm) var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.step-facts dt {
	margin-bottom: 2px;
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.step-facts dd {
	margin: 0;
	font-size: 0.84rem;
	font-weight: 600;
}

.step-warnings {
	display: grid;
	gap: 4px;
	margin: 0 0 var(--space-sm);
	padding: 0;
	list-style: none;
}

.step-warnings li {
	display: flex;
	align-items: flex-start;
	gap: 6px;
	color: rgb(var(--v-theme-warning));
	font-size: 0.8rem;
	line-height: 1.5;
}

.file-block {
	margin-bottom: var(--space-sm);
}

.file-block h4 {
	margin-bottom: var(--space-sm);
	font-size: 0.84rem;
	font-weight: 700;
}

.file-list {
	display: grid;
	margin: 0;
	padding: 0;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	list-style: none;
}

.file-item {
	display: grid;
	grid-template-columns: 18px 3rem minmax(0, 1fr) auto;
	width: 100%;
	color: inherit;
	text-align: left;
	cursor: pointer;
	align-items: center;
	gap: var(--space-sm);
	padding: 6px var(--space-md);
	font-size: 0.8rem;
}

.file-item:hover {
	background: rgb(var(--v-theme-on-surface) / 4%);
}

.file-item:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: -2px;
}

.file-item.is-selected {
	background: rgb(var(--v-theme-primary) / 9%);
	box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
}

.file-focus {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
	margin-bottom: var(--space-sm);
	font-size: 0.82rem;
}

.file-focus-type {
	color: var(--ink-muted);
	font-size: 0.74rem;
}

.file-item + .file-item {
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.file-role {
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.file-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-state {
	color: var(--ink-muted);
	white-space: nowrap;
}


.file-list .is-done :deep(.v-icon) {
	color: rgb(var(--v-theme-success));
}

.file-list .is-running :deep(.v-icon) {
	color: rgb(var(--v-theme-primary));
}

.file-list .is-failed :deep(.v-icon),
.file-list .is-failed .file-state {
	color: rgb(var(--v-theme-error));
}

.step-note {
	margin: 0;
	color: var(--ink-muted);
	font-size: 0.8rem;
	line-height: 1.6;
}

.review-note {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	margin: var(--space-md) 0 0;
	color: var(--ink-muted);
	font-size: 0.8rem;
	line-height: 1.6;
}

.processing-empty {
	margin: 0;
	padding: var(--space-md);
	border: 1px dashed rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
	font-size: 0.84rem;
}

@media (max-width: 860px) {
	.stage-rail {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.stage-rail {
		grid-template-columns: minmax(0, 1fr);
	}

	.step-line {
		grid-template-columns: 20px minmax(0, 1fr);
		grid-template-areas: 'icon name' '. detail' '. state';
		row-gap: 2px;
	}

	.step-line :deep(.v-icon) { grid-area: icon; }
	.step-name { grid-area: name; }
	.step-detail { grid-area: detail; }
	.step-state { grid-area: state; }
}
</style>
