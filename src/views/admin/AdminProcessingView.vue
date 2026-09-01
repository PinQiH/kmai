<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

type ProcessingTab = 'attention' | 'all' | 'strategy'
type ProcessingStatus = '已完成' | '處理中' | '失敗' | '等待中' | '已取消'

interface ProcessingJob {
	id: string
	documentId: string
	title: string
	status: ProcessingStatus
	progress: number
	stage: string
	startedAt: string
	durationLabel: string
	lastUpdatedAt: string
	failureReason: string | null
	needsAttention: boolean
}

interface ProcessingStrategy {
	parser: string
	chunkMethod: string
	chunkSize: number
	chunkOverlap: number
	generateSummary: boolean
	generateVector: boolean
	generateGraph: boolean
	autoRetryCount: number
}

const jobs = ref<ProcessingJob[]>([
	{
		id: 'job-1',
		documentId: 'doc-1',
		title: '員工差旅與費用報支辦法.pdf',
		status: '已完成',
		progress: 100,
		stage: '知識圖譜建立完成',
		startedAt: '今天 09:42',
		durationLabel: '2 分 18 秒',
		lastUpdatedAt: '今天 09:44',
		failureReason: null,
		needsAttention: false,
	},
	{
		id: 'job-2',
		documentId: 'doc-2',
		title: '採購請款標準作業流程.docx',
		status: '處理中',
		progress: 64,
		stage: '向量化 48 / 75',
		startedAt: '今天 10:18',
		durationLabel: '執行 19 分鐘',
		lastUpdatedAt: '2 分鐘前',
		failureReason: null,
		needsAttention: false,
	},
	{
		id: 'job-3',
		documentId: 'doc-3',
		title: '資訊安全教育訓練.pdf',
		status: '失敗',
		progress: 22,
		stage: '檔案解析',
		startedAt: '今天 10:31',
		durationLabel: '執行 42 秒後失敗',
		lastUpdatedAt: '8 分鐘前',
		failureReason: '檔案受到密碼保護，解析器無法讀取內容。',
		needsAttention: true,
	},
	{
		id: 'job-4',
		documentId: 'doc-4',
		title: '2026 產品規格彙整.xlsx',
		status: '等待中',
		progress: 0,
		stage: '等待處理資源',
		startedAt: '今天 08:37',
		durationLabel: '已等待 2 小時 12 分鐘',
		lastUpdatedAt: '17 分鐘前',
		failureReason: '等待時間超過 30 分鐘，需要確認處理資源。',
		needsAttention: true,
	},
])

const activeTab = ref<ProcessingTab>('attention')
const statusFilter = ref<ProcessingStatus | '全部狀態'>('全部狀態')
const selectedJob = ref<ProcessingJob | null>(null)
const isDetailOpen = ref(false)
const cancelTarget = ref<ProcessingJob | null>(null)
const feedbackMessage = ref('')
const feedbackTone = ref<'success' | 'error' | 'info'>('success')
const strategy = ref<ProcessingStrategy>({
	parser: '自動偵測',
	chunkMethod: '依標題與段落',
	chunkSize: 800,
	chunkOverlap: 120,
	generateSummary: true,
	generateVector: true,
	generateGraph: true,
	autoRetryCount: 2,
})

const attentionJobs = computed(() => jobs.value.filter((job) => job.needsAttention))
const visibleJobs = computed(() =>
	statusFilter.value === '全部狀態'
		? jobs.value
		: jobs.value.filter((job) => job.status === statusFilter.value),
)

const statusMeta: Record<ProcessingStatus, { color: string; icon: string }> = {
	已完成: { color: 'success', icon: 'mdi-check-circle-outline' },
	處理中: { color: 'primary', icon: 'mdi-progress-clock' },
	失敗: { color: 'error', icon: 'mdi-alert-circle-outline' },
	等待中: { color: 'warning', icon: 'mdi-timer-sand' },
	已取消: { color: 'secondary', icon: 'mdi-cancel' },
}

function notify(message: string, tone: 'success' | 'error' | 'info' = 'success'): void {
	feedbackMessage.value = message
	feedbackTone.value = tone
}

function openDetail(job: ProcessingJob): void {
	selectedJob.value = job
	isDetailOpen.value = true
}

function retryJob(job: ProcessingJob): void {
	job.status = '等待中'
	job.progress = 0
	job.stage = '已重新加入處理佇列'
	job.failureReason = null
	job.needsAttention = false
	job.lastUpdatedAt = '剛剛'
	notify(`已重新執行「${job.title}」。`)
}

function confirmCancel(): void {
	if (!cancelTarget.value) return
	cancelTarget.value.status = '已取消'
	cancelTarget.value.stage = '已由管理者取消'
	cancelTarget.value.needsAttention = false
	cancelTarget.value.lastUpdatedAt = '剛剛'
	cancelTarget.value = null
	notify('處理工作已取消。')
}

function saveStrategy(): void {
	if (strategy.value.chunkSize < 200 || strategy.value.chunkSize > 4000) {
		notify('切塊大小必須介於 200 到 4,000 字元。', 'error')
		return
	}
	if (strategy.value.chunkOverlap < 0 || strategy.value.chunkOverlap >= strategy.value.chunkSize) {
		notify('重疊範圍必須大於等於 0，且小於切塊大小。', 'error')
		return
	}

	notify('全域文件處理策略已儲存；前端 Mock 會在重新整理後還原。')
}
</script>

<template>
	<div class="page-shell">
		<PageHeader
			eyebrow="內容與知識"
			title="文件處理"
			description="先處理失敗、停滯與等待過久的工作，再查看完整佇列或調整全域處理策略。"
		>
			<template #actions>
				<VBtn variant="outlined" prepend-icon="mdi-refresh" @click="notify('處理狀態已更新。', 'info')">重新整理</VBtn>
			</template>
		</PageHeader>

		<VAlert
			v-if="feedbackMessage"
			:type="feedbackTone"
			variant="tonal"
			closable
			class="mb-5"
			role="status"
			@click:close="feedbackMessage = ''"
		>
			{{ feedbackMessage }}
		</VAlert>

		<VTabs v-model="activeTab" color="primary" class="mb-5">
			<VTab value="attention">需要處理 <VChip size="x-small" color="error" class="ml-2">{{ attentionJobs.length }}</VChip></VTab>
			<VTab value="all">全部工作</VTab>
			<VTab value="strategy">處理策略</VTab>
		</VTabs>

		<VWindow v-model="activeTab">
			<VWindowItem value="attention">
				<VAlert type="warning" variant="tonal" class="mb-5">
					這裡只顯示失敗、等待過久、停滯或需要人工介入的工作。
				</VAlert>
				<div v-if="attentionJobs.length > 0" class="d-grid ga-3">
					<VCard v-for="job in attentionJobs" :key="job.id" class="job-row surface-border pa-5">
						<div class="job-main">
							<div class="d-flex align-center ga-2">
								<VIcon :icon="statusMeta[job.status].icon" :color="statusMeta[job.status].color" aria-hidden="true" />
								<p class="font-weight-bold">{{ job.title }}</p>
							</div>
							<p class="text-body-2 mt-2">{{ job.failureReason }}</p>
							<p class="text-caption text-medium-emphasis mt-1">
								{{ job.stage }} · {{ job.durationLabel }} · 最後更新 {{ job.lastUpdatedAt }}
							</p>
							<VProgressLinear :model-value="job.progress" :color="statusMeta[job.status].color" height="7" rounded class="mt-3" />
						</div>
						<div class="job-actions">
							<VChip :color="statusMeta[job.status].color" variant="tonal" size="small">{{ job.status }}</VChip>
							<VBtn v-if="job.status === '失敗'" variant="tonal" color="error" size="small" @click="retryJob(job)">重新執行</VBtn>
							<VBtn v-if="job.status === '等待中'" variant="text" color="error" size="small" @click="cancelTarget = job">取消</VBtn>
							<VBtn variant="text" size="small" @click="openDetail(job)">唯讀檢查</VBtn>
							<VBtn :to="`/admin/documents/${job.documentId}/manage`" variant="text" size="small">前往文件管理</VBtn>
						</div>
					</VCard>
				</div>
				<StatePanel
					v-else
					icon="mdi-check-circle-outline"
					title="目前沒有需要處理的工作"
					description="失敗、停滯或等待過久的工作會集中顯示在這裡。"
				/>
			</VWindowItem>

			<VWindowItem value="all">
				<div class="d-flex flex-wrap align-center ga-3 mb-5">
					<VSelect
						v-model="statusFilter"
						:items="['全部狀態', '等待中', '處理中', '已完成', '失敗', '已取消']"
						label="處理狀態"
						hide-details
						max-width="220"
					/>
				</div>
				<div v-if="visibleJobs.length > 0" class="d-grid ga-3">
					<VCard v-for="job in visibleJobs" :key="job.id" class="job-row surface-border pa-5">
						<div class="job-main">
							<div class="d-flex align-center ga-2">
								<VIcon :icon="statusMeta[job.status].icon" :color="statusMeta[job.status].color" aria-hidden="true" />
								<p class="font-weight-bold">{{ job.title }}</p>
							</div>
							<p class="text-caption text-medium-emphasis mt-1">
								{{ job.stage }} · {{ job.durationLabel }} · 最後更新 {{ job.lastUpdatedAt }}
							</p>
							<p v-if="job.failureReason" class="text-caption text-error mt-1">{{ job.failureReason }}</p>
							<VProgressLinear :model-value="job.progress" :color="statusMeta[job.status].color" height="7" rounded class="mt-3" />
						</div>
						<div class="job-actions">
							<VChip :color="statusMeta[job.status].color" variant="tonal" size="small">{{ job.status }}</VChip>
							<VBtn v-if="job.status === '失敗'" variant="tonal" color="error" size="small" @click="retryJob(job)">重新執行</VBtn>
							<VBtn v-if="job.status === '處理中' || job.status === '等待中'" variant="text" color="error" size="small" @click="cancelTarget = job">取消</VBtn>
							<VBtn variant="text" size="small" @click="openDetail(job)">唯讀檢查</VBtn>
							<VBtn :to="`/admin/documents/${job.documentId}/manage`" variant="text" size="small">前往文件管理</VBtn>
						</div>
					</VCard>
				</div>
				<StatePanel
					v-else
					icon="mdi-filter-off-outline"
					title="這個狀態沒有處理工作"
					description="請選擇其他狀態，或清除篩選查看全部工作。"
					action-label="查看全部工作"
					@action="statusFilter = '全部狀態'"
				/>
			</VWindowItem>

			<VWindowItem value="strategy">
				<VAlert type="info" variant="tonal" class="mb-5">
					此處設定所有文件的預設策略；個別文件覆蓋與切塊內容編輯仍在文件管理詳情。
				</VAlert>
				<VCard class="surface-border pa-6 strategy-card">
					<div class="strategy-grid">
						<VSelect v-model="strategy.parser" :items="['自動偵測', '通用文件解析器', 'OCR 優先解析器']" label="解析器" />
						<VSelect v-model="strategy.chunkMethod" :items="['依標題與段落', '固定字元', '語意切塊']" label="切塊方式" />
						<VTextField v-model.number="strategy.chunkSize" label="切塊大小（字元）" type="number" min="200" max="4000" />
						<VTextField v-model.number="strategy.chunkOverlap" label="重疊範圍（字元）" type="number" min="0" />
						<VSelect v-model.number="strategy.autoRetryCount" :items="[0, 1, 2, 3, 5]" label="自動重試次數" />
					</div>
					<VDivider class="my-5" />
					<div class="d-flex flex-wrap ga-5">
						<VSwitch v-model="strategy.generateSummary" color="primary" label="產生摘要" hide-details />
						<VSwitch v-model="strategy.generateVector" color="primary" label="產生向量" hide-details />
						<VSwitch v-model="strategy.generateGraph" color="primary" label="產生知識圖譜" hide-details />
					</div>
					<div class="d-flex justify-end mt-6">
						<VBtn color="primary" prepend-icon="mdi-content-save-outline" @click="saveStrategy">儲存全域策略</VBtn>
					</div>
				</VCard>
			</VWindowItem>
		</VWindow>

		<VDialog v-model="isDetailOpen" max-width="720">
			<VCard v-if="selectedJob">
				<VCardTitle class="pa-6 pb-2">處理詳情</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<p class="font-weight-bold mb-1">{{ selectedJob.title }}</p>
					<p class="text-caption text-medium-emphasis mb-5">唯讀檢查；內容與切塊修改請前往文件管理。</p>
					<VTimeline side="end" density="compact" truncate-line="both">
						<VTimelineItem dot-color="success" size="small">
							<p class="font-weight-bold">檔案解析</p>
							<p class="text-caption text-medium-emphasis">{{ selectedJob.status === '失敗' ? '失敗' : '完成 · 取得 24 頁' }}</p>
						</VTimelineItem>
						<VTimelineItem :dot-color="selectedJob.progress > 25 ? 'success' : 'secondary'" size="small">
							<p class="font-weight-bold">內容切塊</p>
							<p class="text-caption text-medium-emphasis">{{ selectedJob.progress > 25 ? '完成 · 75 個內容區塊' : '尚未執行' }}</p>
						</VTimelineItem>
						<VTimelineItem :dot-color="selectedJob.progress > 60 ? 'success' : 'secondary'" size="small">
							<p class="font-weight-bold">向量化</p>
							<p class="text-caption text-medium-emphasis">{{ selectedJob.stage }}</p>
						</VTimelineItem>
						<VTimelineItem :dot-color="selectedJob.progress === 100 ? 'success' : 'secondary'" size="small">
							<p class="font-weight-bold">知識圖譜</p>
							<p class="text-caption text-medium-emphasis">{{ selectedJob.progress === 100 ? '完成' : '等待前一步驟' }}</p>
						</VTimelineItem>
					</VTimeline>
					<VAlert v-if="selectedJob.failureReason" type="error" variant="tonal" class="mt-5">
						{{ selectedJob.failureReason }}
					</VAlert>
				</VCardText>
				<VCardActions class="pa-5">
					<VBtn :to="`/admin/documents/${selectedJob.documentId}/manage`" variant="tonal">前往文件管理</VBtn>
					<VSpacer />
					<VBtn @click="isDetailOpen = false">關閉</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
		<VDialog :model-value="Boolean(cancelTarget)" max-width="460" @update:model-value="cancelTarget = null">
			<VCard>
				<VCardTitle class="pa-6 pb-2">取消處理工作？</VCardTitle>
				<VCardText class="pa-6 pt-2">目前進度將停止，已產生但未完成的資料不會發布。稍後仍可重新執行。</VCardText>
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
.job-row {
	display: flex;
	align-items: center;
	gap: 24px;
}

.job-main {
	flex: 1;
	min-width: 0;
}

.job-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.strategy-card {
	max-width: 980px;
}

.strategy-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-sm);
}

@media (max-width: 760px) {
	.job-row {
		align-items: stretch;
		flex-direction: column;
	}

	.strategy-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
