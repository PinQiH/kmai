<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import DocumentLifecycleTrail from '@/components/DocumentLifecycleTrail.vue'
import DocumentReprocessDialog from '@/components/DocumentReprocessDialog.vue'
import StatePanel from '@/components/StatePanel.vue'
import {
	getDocumentProcessingRecords,
	hasEditedChunks,
	getProcessingStageName,
	reprocessJob,
	type ReprocessScope,
	retryProcessingFile,
	updateProcessingJob,
	type ProcessingStageId,
} from '@/mocks/documentProcessing'
import { getEarliestPendingStage } from '@/mocks/documentStrategies'
import type { DocumentProcessingFile } from '@/types'
import {
	useProcessingJobs,
	type ProcessingJob,
	type ProcessingStatus,
} from '@/composables/useProcessingJobs'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
	/** 搜尋關鍵字，與文件清單分頁共用同一個輸入框。 */
	search?: string
	/** 只看這些文件的處理工作；空陣列代表不限。 */
	documentIds?: string[]
}>()

const PAGE_SIZE_OPTIONS = [10, 20, 50]

const { jobs } = useProcessingJobs()
const router = useRouter()
const page = ref(1)
const pageSize = ref(10)
const expandedJobIds = ref<string[]>([])
const selectedJobId = ref<string | null>(null)
const isDetailOpen = ref(false)
const cancelTarget = ref<ProcessingJob | null>(null)
const reprocessJobId = ref<string | null>(null)
const reprocessScope = ref<ReprocessScope>('all')

/** 名稱搜尋同時比對文件標題與主文件、附件檔名。 */
function matchesSearch(job: ProcessingJob): boolean {
	const keyword = (props.search ?? '').trim().toLowerCase()
	if (!keyword) return true
	return job.title.toLowerCase().includes(keyword) || job.files.some((file) => file.name.toLowerCase().includes(keyword))
}

const scopedJobs = computed(() => {
	const ids = props.documentIds ?? []
	return jobs.value.filter((job) => !ids.length || ids.includes(job.documentId))
})
const attentionJobs = computed(() => scopedJobs.value.filter((job) => job.needsAttention))
const visibleJobs = computed(() => attentionJobs.value.filter(matchesSearch))
const pageCount = computed(() => Math.max(1, Math.ceil(visibleJobs.value.length / pageSize.value)))
const pagedJobs = computed(() => visibleJobs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const rangeLabel = computed(() => {
	const total = visibleJobs.value.length
	if (!total) return '共 0 筆'
	const start = (page.value - 1) * pageSize.value + 1
	return `共 ${total} 筆，顯示第 ${start}–${Math.min(total, start + pageSize.value - 1)} 筆`
})
const hasActiveFilter = computed(() => Boolean((props.documentIds ?? []).length) || Boolean((props.search ?? '').trim()))

watch([() => props.search, () => props.documentIds, pageSize], () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })

const selectedJob = computed(() => jobs.value.find((job) => job.id === selectedJobId.value))
const selectedRecord = computed(() => getDocumentProcessingRecords().find((record) => record.jobId === selectedJobId.value))

const statusMeta: Record<ProcessingStatus, { color: string; icon: string }> = {
	已完成: { color: 'success', icon: 'mdi-check-circle-outline' },
	處理中: { color: 'primary', icon: 'mdi-progress-clock' },
	部分失敗: { color: 'error', icon: 'mdi-file-alert-outline' },
	失敗: { color: 'error', icon: 'mdi-alert-circle-outline' },
	等待中: { color: 'warning', icon: 'mdi-timer-sand' },
	已取消: { color: 'secondary', icon: 'mdi-cancel' },
}

const fileStateColor: Record<DocumentProcessingFile['state'], string> = {
	已完成: 'success',
	進行中: 'primary',
	等待中: 'warning',
	失敗: 'error',
	未執行: 'secondary',
}

const toastStore = useToastStore()
function notify(message: string, tone: 'success' | 'error' | 'info' = 'success'): void {
	toastStore.show(message, tone)
}

function toggleExpanded(jobId: string): void {
	expandedJobIds.value = expandedJobIds.value.includes(jobId)
		? expandedJobIds.value.filter((id) => id !== jobId)
		: [...expandedJobIds.value, jobId]
}

function openDetail(job: ProcessingJob): void {
	selectedJobId.value = job.id
	isDetailOpen.value = true
}

/** 一鍵重新執行失敗工作：從失敗步驟起跑；沒有失敗步驟時依策略變更或切塊修改決定。 */
function getDefaultStartStage(job: ProcessingJob): ProcessingStageId {
	if (job.failedStepId) return job.failedStepId
	const pending = getEarliestPendingStage(job.documentId)
	if (pending) return pending
	if (hasEditedChunks(job.documentId, job.version)) return 'embed'
	return 'parse'
}

function retryJob(job: ProcessingJob): void {
	const fromStage = getDefaultStartStage(job)
	reprocessJob(job.id, fromStage)
	notify(`「${job.title}」已從「${getProcessingStageName(fromStage)}」重新排入示範佇列，尚未執行後端處理。`)
}

/** 批次捷徑：失敗的附件各自從失敗步驟重跑，主文件不動。 */
function retryFailedAttachments(job: ProcessingJob): void {
	for (const file of job.files.filter((item) => item.role === '附件' && item.state === '失敗')) retryProcessingFile(job.id, file.id)
	notify(`「${job.title}」的失敗附件已重新排入示範佇列；主文件不受影響。`)
}

// > 重新處理對話框（與文件清單分頁的批次重新處理共用底層資料）
const reprocessJobItem = computed(() => jobs.value.find((job) => job.id === reprocessJobId.value))
const reprocessRecord = computed(() => getDocumentProcessingRecords().find((record) => record.jobId === reprocessJobId.value))
const isReprocessOpen = computed({
	get: () => Boolean(reprocessJobId.value),
	set: (open: boolean) => { if (!open) reprocessJobId.value = null },
})

function openReprocess(job: ProcessingJob, scope: ReprocessScope = 'all'): void {
	reprocessScope.value = scope
	reprocessJobId.value = job.id
}

function openFileReprocess(fileId: string): void {
	const job = selectedJob.value
	if (!job) return
	isDetailOpen.value = false
	openReprocess(job, fileId)
}

/** 從處理詳情跳到文件詳情的切塊分頁，並直接選好主文件或該附件。 */
function viewChunks(fileId: string | undefined): void {
	const job = selectedJob.value
	if (!job) return
	const file = job.files.find((item) => item.id === fileId)
	router.push({ path: `/admin/documents/${job.documentId}/manage`, query: { tab: 'chunks', ...(file?.role === '附件' ? { file: file.id } : {}) } })
}

function confirmCancel(): void {
	if (!cancelTarget.value) return
	updateProcessingJob(cancelTarget.value.id, 'cancel')
	cancelTarget.value = null
	notify('示範處理工作已取消。')
}
</script>

<template>
	<div class="processing-panel">
		<VAlert type="warning" variant="tonal" class="mb-5">
			這裡只顯示失敗、部分附件失敗、等待過久，或策略已變更待重新處理的工作。其餘文件請看「全部文件」分頁。
		</VAlert>

		<ul v-if="pagedJobs.length" class="job-list" data-testid="processing-list-attention">
			<li v-for="job in pagedJobs" :key="job.id" class="job-item" data-testid="processing-job">
				<div class="job-row">
					<VBtn
						v-if="job.attachmentCount"
						:icon="expandedJobIds.includes(job.id) ? 'mdi-chevron-down' : 'mdi-chevron-right'"
						variant="text"
						size="x-small"
						:aria-expanded="expandedJobIds.includes(job.id)"
						:aria-label="`${expandedJobIds.includes(job.id) ? '收合' : '展開'}「${job.title}」的檔案`"
						@click="toggleExpanded(job.id)"
					/>
					<span v-else class="expand-spacer" aria-hidden="true" />
					<VIcon :icon="statusMeta[job.status].icon" :color="statusMeta[job.status].color" size="18" aria-hidden="true" />
					<div class="job-main">
						<p class="job-title">
							<span class="job-name">{{ job.title }}</span>
							<span class="job-version">v{{ job.version }}</span>
							<span v-if="job.attachmentCount" class="job-tag" :class="{ 'is-error': job.failedAttachmentCount }">
								附件 {{ job.attachmentCount }}<template v-if="job.failedAttachmentCount"> · {{ job.failedAttachmentCount }} 失敗</template>
							</span>
							<span v-if="job.pendingStages.length" class="job-tag is-warning">策略待套用</span>
						</p>
						<p class="job-meta">
							<template v-if="job.attentionReason">{{ job.attentionReason }}</template>
							<template v-else>{{ job.stage }}<template v-if="job.note"> · {{ job.note }}</template></template>
						</p>
					</div>
					<div class="job-progress">
						<VProgressLinear :model-value="job.progress" :color="statusMeta[job.status].color" height="4" rounded :aria-label="`處理進度 ${job.progress}%`" />
						<span>{{ job.progress }}%</span>
					</div>
					<span class="job-updated">{{ job.lastUpdatedAt }}</span>
					<VChip :color="statusMeta[job.status].color" variant="tonal" size="x-small" class="job-status">{{ job.status }}</VChip>
					<div class="job-actions">
						<VBtn v-if="job.status === '失敗'" variant="tonal" color="error" size="small" @click="retryJob(job)">重新執行</VBtn>
						<VBtn v-else-if="job.status === '部分失敗'" variant="tonal" color="error" size="small" @click="retryFailedAttachments(job)">重試附件</VBtn>
						<VBtn v-else-if="job.pendingStages.length" variant="tonal" color="warning" size="small" @click="openReprocess(job)">重新處理</VBtn>
						<VBtn v-else variant="text" size="small" @click="openDetail(job)">詳情</VBtn>
						<VMenu location="bottom end">
							<template #activator="{ props: menuProps }">
								<VBtn v-bind="menuProps" icon="mdi-dots-vertical" variant="text" size="small" :aria-label="`「${job.title}」的更多操作`" />
							</template>
							<VList density="compact" min-width="180">
								<VListItem prepend-icon="mdi-text-box-search-outline" title="處理詳情" @click="openDetail(job)" />
								<VListItem
									v-if="job.status !== '處理中' && job.status !== '等待中'"
									prepend-icon="mdi-restart"
									title="重新處理…"
									@click="openReprocess(job)"
								/>
								<VListItem
									v-if="job.status === '處理中' || job.status === '等待中'"
									prepend-icon="mdi-cancel"
									title="取消工作"
									base-color="error"
									@click="cancelTarget = job"
								/>
								<VListItem prepend-icon="mdi-file-cog-outline" title="開啟文件詳情" :to="`/admin/documents/${job.documentId}/manage`" />
							</VList>
						</VMenu>
					</div>
				</div>
				<ul v-if="job.attachmentCount && expandedJobIds.includes(job.id)" class="file-rows" :aria-label="`「${job.title}」的檔案`">
					<li v-for="file in job.files" :key="file.id" class="file-row">
						<span class="file-role">{{ file.role }}</span>
						<span class="file-name" :title="file.name">{{ file.name }}</span>
						<span class="file-stage">{{ file.stage }}</span>
						<VProgressLinear :model-value="file.progress" :color="fileStateColor[file.state]" height="3" rounded class="file-progress" />
						<VChip :color="fileStateColor[file.state]" variant="tonal" size="x-small">{{ file.state }}</VChip>
						<p v-if="file.note" class="file-note">{{ file.note }}</p>
					</li>
				</ul>
			</li>
		</ul>
		<StatePanel
			v-else-if="hasActiveFilter"
			icon="mdi-filter-off-outline"
			title="沒有符合條件的處理工作"
			description="請調整搜尋文字，或清除文件篩選。"
		/>
		<StatePanel
			v-else
			icon="mdi-check-circle-outline"
			title="目前沒有需要處理的工作"
			description="失敗、停滯、等待過久或策略待套用的工作會集中顯示在這裡。"
		/>

		<div v-if="visibleJobs.length" class="list-footer">
			<span class="range-label">{{ rangeLabel }}</span>
			<VSelect v-model="pageSize" :items="PAGE_SIZE_OPTIONS" label="每頁" density="compact" hide-details class="page-size" />
			<VPagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="5" density="compact" size="small" />
		</div>

		<VDialog v-model="isDetailOpen" max-width="820" scrollable>
			<VCard v-if="selectedJob">
				<VCardTitle class="pa-6 pb-1">處理詳情</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<p class="font-weight-bold mb-1">{{ selectedJob.title }} · v{{ selectedJob.version }}</p>
					<p class="text-caption text-medium-emphasis mb-4">點上方檔案切換主文件或附件；展開每個步驟可看套用的策略、參數、耗時與警告，切段步驟可前往檢視該檔案的切塊。</p>
					<DocumentLifecycleTrail
						:status="selectedJob.status === '失敗' ? '失敗' : selectedJob.status === '已完成' ? '已發布' : '處理中'"
						:record="selectedRecord"
						:show-stages="false"
						actionable
						@view-chunks="viewChunks"
						@reprocess-file="openFileReprocess"
					/>
				</VCardText>
				<VCardActions class="pa-5">
					<VBtn :to="`/admin/documents/${selectedJob.documentId}/manage`" variant="tonal">開啟文件詳情</VBtn>
					<VBtn
						v-if="selectedJob.status !== '處理中' && selectedJob.status !== '等待中'"
						variant="text"
						prepend-icon="mdi-restart"
						@click="isDetailOpen = false; openReprocess(selectedJob)"
					>
						重新處理…
					</VBtn>
					<VSpacer />
					<VBtn @click="isDetailOpen = false">關閉</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<DocumentReprocessDialog
			v-model="isReprocessOpen"
			:record="reprocessRecord"
			:title="reprocessJobItem?.title ?? ''"
			:initial-scope="reprocessScope"
			@done="notify($event)"
		/>

		<VDialog :model-value="Boolean(cancelTarget)" max-width="460" @update:model-value="cancelTarget = null">
			<VCard>
				<VCardTitle class="pa-6 pb-2">取消處理工作？</VCardTitle>
				<VCardText class="pa-6 pt-2">目前進度將停止，已產生但未完成的資料不會發布。稍後仍可重新處理。</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="cancelTarget = null">返回</VBtn>
					<VBtn color="error" @click="confirmCancel">確認取消</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.job-list {
	margin: 0;
	padding: 0;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
	list-style: none;
}

.job-item + .job-item {
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.job-row {
	display: grid;
	grid-template-columns: 28px 18px minmax(0, 1fr) 120px 112px 72px 150px;
	align-items: center;
	gap: var(--space-sm);
	min-height: 52px;
	padding: 6px var(--space-sm) 6px 4px;
}

.expand-spacer {
	width: 28px;
}

.job-main {
	min-width: 0;
}

.job-title {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	margin: 0;
	font-size: 0.88rem;
}

.job-name {
	overflow: hidden;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.job-version {
	flex: 0 0 auto;
	color: var(--ink-muted);
	font-size: 0.74rem;
	font-variant-numeric: tabular-nums;
}

.job-tag {
	flex: 0 0 auto;
	padding: 0 6px;
	border-radius: 4px;
	background: rgb(var(--v-theme-on-surface) / 7%);
	color: var(--ink-muted);
	font-size: 0.7rem;
	line-height: 1.6;
}

.job-tag.is-error {
	background: rgb(var(--v-theme-error) / 12%);
	color: rgb(var(--v-theme-error));
}

.job-tag.is-warning {
	background: rgb(var(--v-theme-warning) / 16%);
	color: rgb(var(--v-theme-warning));
}

.job-meta {
	overflow: hidden;
	margin: 1px 0 0;
	color: var(--ink-muted);
	font-size: 0.76rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.job-progress {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 2.6rem;
	align-items: center;
	gap: 6px;
	font-size: 0.74rem;
	font-variant-numeric: tabular-nums;
	text-align: right;
}

.job-updated {
	color: var(--ink-muted);
	font-size: 0.74rem;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.job-status {
	justify-self: start;
}

.job-actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 2px;
}

.file-rows {
	margin: 0 var(--space-sm) var(--space-sm) 50px;
	padding: 0;
	border-left: 2px solid rgb(var(--v-theme-outline));
	list-style: none;
}

.file-row {
	display: grid;
	grid-template-columns: 3rem minmax(0, 1fr) 6rem 80px auto;
	align-items: center;
	gap: var(--space-sm);
	padding: 4px var(--space-sm);
	font-size: 0.78rem;
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

.file-stage {
	color: var(--ink-muted);
	white-space: nowrap;
}

.file-note {
	grid-column: 2 / -1;
	margin: 0;
	color: rgb(var(--v-theme-error));
	font-size: 0.74rem;
	line-height: 1.5;
}

.list-footer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
	margin-top: var(--space-md);
}

.range-label {
	margin-right: auto;
	color: var(--ink-muted);
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

.page-size {
	flex: 0 0 96px;
}

@media (max-width: 960px) {
	.job-row {
		grid-template-columns: 28px 18px minmax(0, 1fr) auto auto;
	}

	.job-progress,
	.job-updated {
		display: none;
	}
}

@media (max-width: 760px) {
	.file-rows {
		margin-left: var(--space-sm);
	}

	.file-row {
		grid-template-columns: 3rem minmax(0, 1fr) auto;
	}

	.file-stage,
	.file-progress {
		display: none;
	}
}

/* NOTE: 手機寬度把狀態與操作移到第二行，讓文件名稱取得整列寬度，避免被截成「客戶資…」 */
@media (max-width: 600px) {
	.job-row {
		grid-template-columns: 28px 18px minmax(0, 1fr);
		row-gap: 2px;
	}

	.job-title {
		flex-wrap: wrap;
	}

	.job-name {
		white-space: normal;
	}

	.job-status,
	.job-actions {
		grid-row: 2;
		grid-column: 3;
	}

	.job-actions {
		justify-self: end;
	}
}
</style>
