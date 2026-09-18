<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentLifecycleTrail from '@/components/DocumentLifecycleTrail.vue'
import DocumentReprocessDialog from '@/components/DocumentReprocessDialog.vue'
import DocumentStrategyEditor from '@/components/DocumentStrategyEditor.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import {
	getDocumentProcessingRecords,
	hasEditedChunks,
	processingStages,
	reprocessJob,
	type ReprocessScope,
	retryProcessingFile,
	updateProcessingJob,
	type ProcessingStageId,
} from '@/mocks/documentProcessing'
import {
	fileTypeGroups,
	fileTypeOverrideEnabled,
	getEarliestPendingStage,
	pendingStrategyStages,
} from '@/mocks/documentStrategies'
import { workspaceDocuments } from '@/mocks/documentWorkspace'
import type { DocumentProcessingFile } from '@/types'
import { useToastStore } from '@/stores/toast'

type ProcessingTab = 'attention' | 'all' | 'strategy'
type ProcessingStatus = '已完成' | '處理中' | '部分失敗' | '失敗' | '等待中' | '已取消'

interface ProcessingJob {
	id: string
	documentId: string
	version: string
	title: string
	status: ProcessingStatus
	progress: number
	stage: string
	note: string
	lastUpdatedAt: string
	failureReason: string | null
	/** 顯示在「需要處理」列上的原因。 */
	attentionReason: string
	needsAttention: boolean
	files: DocumentProcessingFile[]
	attachmentCount: number
	failedAttachmentCount: number
	/** 文件層策略已變更、尚未重跑的步驟。 */
	pendingStages: string[]
	failedStepId?: ProcessingStageId
}

const STATUS_OPTIONS: Array<ProcessingStatus | '全部狀態'> = ['全部狀態', '等待中', '處理中', '已完成', '部分失敗', '失敗', '已取消']
const PAGE_SIZE_OPTIONS = [10, 20, 50]

const jobs = computed<ProcessingJob[]>(() => getDocumentProcessingRecords().map((record) => {
	const document = workspaceDocuments.find((item) => item.id === record.documentId)
	const active = record.steps.find((step) => step.state === '進行中' || step.state === '失敗')
	const failedStep = record.steps.find((step) => step.state === '失敗')
	const files = record.files ?? []
	const attachments = files.filter((file) => file.role === '附件')
	const failedAttachments = attachments.filter((file) => file.state === '失敗')
	const runningAttachment = attachments.some((file) => file.state === '進行中' || file.state === '等待中')
	const pendingStages = pendingStrategyStages[record.documentId] ?? []
	const mainDone = record.progress === 100
	// @ 主文件成功但有附件失敗 = 部分失敗；主文件完成但附件還在跑 = 處理中，不能提早顯示已完成
	const status: ProcessingStatus = record.cancelled
		? '已取消'
		: record.failureReason
			? '失敗'
			: mainDone && failedAttachments.length
				? '部分失敗'
				: mainDone && !runningAttachment
					? '已完成'
					: active || (mainDone && runningAttachment)
						? '處理中'
						: '等待中'
	const isStale = status === '等待中' && Boolean(record.reviewNote?.includes('等待 2 小時'))
	const attentionReason = record.failureReason
		|| (failedAttachments.length ? `${failedAttachments.length} 個附件處理失敗：${failedAttachments[0]!.note ?? failedAttachments[0]!.name}` : '')
		|| (isStale ? record.reviewNote ?? '' : '')
		|| (pendingStages.length ? '處理策略已變更，需重新處理才會生效。' : '')
	return {
		id: record.jobId,
		documentId: record.documentId,
		version: record.version ?? document?.version ?? '',
		title: document?.title ?? record.documentId,
		status,
		progress: record.progress,
		stage: active?.name ?? (status === '已完成' || status === '部分失敗' ? '全部步驟完成' : '等待處理'),
		note: record.reviewNote ?? '',
		lastUpdatedAt: record.lastUpdatedAt,
		failureReason: record.failureReason,
		attentionReason,
		needsAttention: status === '失敗' || status === '部分失敗' || isStale || pendingStages.length > 0,
		files,
		attachmentCount: attachments.length,
		failedAttachmentCount: failedAttachments.length,
		pendingStages,
		failedStepId: failedStep?.id as ProcessingStageId | undefined,
	}
}))

const route = useRoute()
const router = useRouter()
const activeTab = ref<ProcessingTab>('attention')

// @ 剛上傳的文件不會是「需要處理」，由上傳完成頁帶 ?tab=all 進來才找得到自己的工作
const processingTabs: ProcessingTab[] = ['attention', 'all', 'strategy']
watch(
	() => route.query.tab,
	(tab) => {
		const nextTab = processingTabs.find((item) => item === tab)
		if (nextTab) activeTab.value = nextTab
	},
	{ immediate: true },
)

const statusFilter = ref<ProcessingStatus | '全部狀態'>('全部狀態')
const searchQuery = ref('')
const page = ref(1)
const pageSize = ref(10)
const expandedJobIds = ref<string[]>([])
const selectedJobId = ref<string | null>(null)
const isDetailOpen = ref(false)
const cancelTarget = ref<ProcessingJob | null>(null)
const reprocessJobId = ref<string | null>(null)
const reprocessScope = ref<ReprocessScope>('all')
const strategyScope = ref<string>('global')

const documentIds = computed(() => {
	const value = route.query.documentId
	return (Array.isArray(value) ? value : [value]).filter((id): id is string => typeof id === 'string' && Boolean(id))
})
const documentFilters = computed(() => documentIds.value.map((id) => ({
	id,
	title: workspaceDocuments.find((document) => document.id === id)?.title ?? id,
})))

/** 名稱搜尋同時比對文件標題與主文件、附件檔名。 */
function matchesSearch(job: ProcessingJob): boolean {
	const keyword = searchQuery.value.trim().toLowerCase()
	if (!keyword) return true
	return job.title.toLowerCase().includes(keyword) || job.files.some((file) => file.name.toLowerCase().includes(keyword))
}

const scopedJobs = computed(() => jobs.value.filter((job) => !documentIds.value.length || documentIds.value.includes(job.documentId)))
const attentionJobs = computed(() => scopedJobs.value.filter((job) => job.needsAttention))
const tabJobs = computed(() => {
	if (activeTab.value === 'attention') return attentionJobs.value.filter(matchesSearch)
	return scopedJobs.value.filter((job) => matchesSearch(job) && (statusFilter.value === '全部狀態' || job.status === statusFilter.value))
})
const pageCount = computed(() => Math.max(1, Math.ceil(tabJobs.value.length / pageSize.value)))
const pagedJobs = computed(() => tabJobs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const rangeLabel = computed(() => {
	const total = tabJobs.value.length
	if (!total) return '共 0 筆'
	const start = (page.value - 1) * pageSize.value + 1
	return `共 ${total} 筆，顯示第 ${start}–${Math.min(total, start + pageSize.value - 1)} 筆`
})
const hasActiveFilter = computed(() => Boolean(documentIds.value.length) || Boolean(searchQuery.value.trim()) || (activeTab.value === 'all' && statusFilter.value !== '全部狀態'))

watch([searchQuery, statusFilter, pageSize, activeTab], () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })
watch(() => route.query.documentId, () => {
	statusFilter.value = '全部狀態'
	searchQuery.value = ''
	isDetailOpen.value = false
	selectedJobId.value = null
})

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

function getStageName(stageId: string | undefined): string {
	return processingStages.find((stage) => stage.id === stageId)?.name ?? ''
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
	notify(`「${job.title}」已從「${getStageName(fromStage)}」重新排入示範佇列，尚未執行後端處理。`)
}

/** 批次捷徑：失敗的附件各自從失敗步驟重跑，主文件不動。 */
function retryFailedAttachments(job: ProcessingJob): void {
	for (const file of job.files.filter((item) => item.role === '附件' && item.state === '失敗')) retryProcessingFile(job.id, file.id)
	notify(`「${job.title}」的失敗附件已重新排入示範佇列；主文件不受影響。`)
}

// > 重新處理對話框（與文件管理頁共用）
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

/** 從處理詳情跳到文件管理的切塊分頁，並直接選好主文件或該附件。 */
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

function clearDocumentFilter(documentId?: string): void {
	const remainingIds = documentId ? documentIds.value.filter((id) => id !== documentId) : []
	const nextDocumentId = remainingIds.length === 1 ? remainingIds[0] : remainingIds.length ? remainingIds : undefined
	router.replace({ query: { ...route.query, documentId: nextDocumentId } })
}

function clearFilters(): void {
	searchQuery.value = ''
	statusFilter.value = '全部狀態'
	clearDocumentFilter()
}

// > 處理策略分頁：全域 + 各檔案類型
const strategyScopes = computed(() => [
	{ id: 'global', name: '全域預設', description: '沒有其他設定時使用', isCustom: true },
	...fileTypeGroups.map((group) => ({ id: group.id, name: group.name, description: group.description, isCustom: Boolean(fileTypeOverrideEnabled[group.id]) })),
])
const strategyFileTypeId = computed(() => (strategyScope.value === 'global' ? undefined : strategyScope.value))
</script>

<template>
	<div class="page-shell">
		<PageHeader
			eyebrow="內容與知識"
			title="文件處理"
			description="先處理失敗、停滯與等待過久的工作，再查看完整佇列或調整處理策略。"
		>
			<template #actions>
				<VBtn variant="outlined" prepend-icon="mdi-refresh" @click="notify('處理狀態已更新。', 'info')">重新整理</VBtn>
			</template>
		</PageHeader>


		<VTabs v-model="activeTab" color="primary" class="mb-4">
			<VTab value="attention">需要處理 <VChip size="x-small" color="error" class="ml-2">{{ attentionJobs.length }}</VChip></VTab>
			<VTab value="all">全部工作</VTab>
			<VTab v-if="!documentIds.length" value="strategy">處理策略</VTab>
		</VTabs>

		<!-- @ 工具列放在 VWindow 外面：VWindow 預設 overflow hidden，放裡面會把浮動 label 裁掉一半 -->
		<div v-if="activeTab !== 'strategy'" class="list-toolbar">
			<VTextField
				v-model="searchQuery"
				label="搜尋文件或附件名稱"
				prepend-inner-icon="mdi-magnify"
				density="compact"
				clearable
				hide-details
				class="toolbar-search"
				data-testid="processing-search"
			/>
			<VSelect
				v-if="activeTab === 'all'"
				v-model="statusFilter"
				:items="STATUS_OPTIONS"
				label="處理狀態"
				density="compact"
				hide-details
				class="toolbar-status"
			/>
		</div>
		<div v-if="activeTab !== 'strategy' && documentFilters.length" class="document-filter-row" aria-label="目前套用的文件篩選">
			<span class="document-filter-label">目前篩選</span>
			<VChip
				v-for="filter in documentFilters"
				:key="filter.id"
				closable
				size="small"
				prepend-icon="mdi-file-document-outline"
				:data-testid="`processing-document-filter-${filter.id}`"
				@click:close="clearDocumentFilter(filter.id)"
			>
				文件：{{ filter.title }}
			</VChip>
			<VBtn variant="text" size="small" @click="clearDocumentFilter()">查看全部文件</VBtn>
		</div>

		<VAlert v-if="activeTab === 'attention'" type="warning" variant="tonal" class="mb-5">
			這裡只顯示失敗、部分附件失敗、等待過久，或策略已變更待重新處理的工作。
		</VAlert>

		<VWindow v-model="activeTab">
			<VWindowItem v-for="tab in (['attention', 'all'] as const)" :key="tab" :value="tab">
				<template v-if="activeTab === tab">
					<ul v-if="pagedJobs.length" class="job-list" :data-testid="`processing-list-${tab}`">
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
										<template v-if="tab === 'attention' && job.attentionReason">{{ job.attentionReason }}</template>
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
											<VListItem prepend-icon="mdi-file-cog-outline" title="前往文件管理" :to="`/admin/documents/${job.documentId}/manage`" />
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
						description="請調整搜尋文字或處理狀態。"
						action-label="清除篩選"
						@action="clearFilters"
					/>
					<StatePanel
						v-else-if="tab === 'attention'"
						icon="mdi-check-circle-outline"
						title="目前沒有需要處理的工作"
						description="失敗、停滯、等待過久或策略待套用的工作會集中顯示在這裡。"
					/>
					<StatePanel v-else icon="mdi-tray-remove" title="目前沒有處理工作" description="上傳文件後，處理工作會出現在這裡。" />

					<div v-if="tabJobs.length" class="list-footer">
						<span class="range-label">{{ rangeLabel }}</span>
						<VSelect v-model="pageSize" :items="PAGE_SIZE_OPTIONS" label="每頁" density="compact" hide-details class="page-size" />
						<VPagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="5" density="compact" size="small" />
					</div>
				</template>
			</VWindowItem>

			<VWindowItem value="strategy">
				<p class="strategy-hint">
					優先順序：<strong>文件</strong>（在文件管理詳情設定）＞ <strong>檔案類型</strong> ＞ <strong>全域預設</strong>。
					沒有對應檔案類型的檔案，直接使用全域預設。
				</p>
				<div class="strategy-layout">
					<nav class="scope-nav" aria-label="策略層級">
						<button
							v-for="scopeItem in strategyScopes"
							:key="scopeItem.id"
							type="button"
							class="scope-item"
							:class="{ 'is-active': strategyScope === scopeItem.id }"
							:aria-current="strategyScope === scopeItem.id ? 'true' : undefined"
							:data-testid="`strategy-scope-${scopeItem.id}`"
							@click="strategyScope = scopeItem.id"
						>
							<span class="scope-name">{{ scopeItem.name }}</span>
							<span class="scope-state">{{ scopeItem.id === 'global' ? scopeItem.description : scopeItem.isCustom ? '已自訂' : '沿用全域' }}</span>
						</button>
					</nav>
					<VCard class="surface-border pa-6">
						<DocumentStrategyEditor :key="strategyScope" :file-type-id="strategyFileTypeId" />
					</VCard>
				</div>
			</VWindowItem>
		</VWindow>

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
					<VBtn :to="`/admin/documents/${selectedJob.documentId}/manage`" variant="tonal">前往文件管理</VBtn>
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
.list-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-sm);
	margin-bottom: var(--space-md);
}

.toolbar-search {
	flex: 1 1 280px;
	max-width: 420px;
}

.toolbar-status {
	flex: 0 0 180px;
}

.document-filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-xs);
	margin: calc(var(--space-sm) * -1) 0 var(--space-md);
}

.document-filter-label {
	color: var(--ink-muted);
	font-size: 0.78rem;
}

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

.strategy-hint {
	margin: 0 0 var(--space-md);
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.6;
}

.strategy-layout {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr);
	align-items: start;
	gap: var(--space-md);
}

.scope-nav {
	display: grid;
	gap: 2px;
	padding: 4px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.scope-item {
	display: grid;
	gap: 1px;
	padding: 8px 10px;
	border-radius: 6px;
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.scope-item:hover {
	background: rgb(var(--v-theme-on-surface) / 5%);
}

.scope-item:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 1px;
}

.scope-item.is-active {
	background: rgb(var(--v-theme-primary) / 10%);
	color: rgb(var(--v-theme-primary));
}

.scope-name {
	font-size: 0.86rem;
	font-weight: 600;
}

.scope-state {
	color: var(--ink-muted);
	font-size: 0.72rem;
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
	.strategy-layout {
		grid-template-columns: minmax(0, 1fr);
	}

	.scope-nav {
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	}

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
