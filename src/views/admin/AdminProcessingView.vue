<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'

interface ProcessingJob {
	id: string
	title: string
	status: '已完成' | '處理中' | '失敗' | '等待中' | '已取消'
	progress: number
	stage: string
	startedAt: string
}

const jobs = ref<ProcessingJob[]>([
	{ id: 'job-1', title: '員工差旅與費用報支辦法.pdf', status: '已完成', progress: 100, stage: '圖譜建立完成', startedAt: '今天 09:42' },
	{ id: 'job-2', title: '採購請款標準作業流程.docx', status: '處理中', progress: 64, stage: '向量化 48 / 75', startedAt: '今天 10:18' },
	{ id: 'job-3', title: '資訊安全教育訓練.pdf', status: '失敗', progress: 22, stage: '解析失敗：檔案已加密', startedAt: '今天 10:31' },
	{ id: 'job-4', title: '2026 產品規格彙整.xlsx', status: '等待中', progress: 0, stage: '等待處理資源', startedAt: '今天 10:37' },
])

const filter = ref('全部狀態')
const selectedJob = ref<ProcessingJob | null>(null)
const isDetailOpen = ref(false)
const detailTab = ref('steps')
const cancelTarget = ref<ProcessingJob | null>(null)
const processingMessage = ref('')
const chunkContents = ref([
	{ id: 'chunk-1', page: 1, content: '本辦法說明公司同仁因公出差時的申請、費用標準與核銷流程。' },
	{ id: 'chunk-2', page: 2, content: '國內住宿每晚以新台幣 3,000 元為原則，特殊情況需事前說明。' },
])
const visibleJobs = computed(() => filter.value === '全部狀態' ? jobs.value : jobs.value.filter((job) => job.status === filter.value))

function openDetail(job: ProcessingJob): void {
	selectedJob.value = job
	isDetailOpen.value = true
}

function retryJob(job: ProcessingJob): void {
	job.status = '等待中'
	job.progress = 0
	job.stage = '已重新加入處理佇列'
}

function cancelJob(job: ProcessingJob): void {
	job.status = '已取消'
	job.stage = '已由管理者取消'
}

function confirmCancel(): void {
	if (!cancelTarget.value) return
	cancelJob(cancelTarget.value)
	cancelTarget.value = null
	processingMessage.value = '處理工作已取消。'
}

function addChunk(): void {
	chunkContents.value.push({ id: crypto.randomUUID(), page: 1, content: '' })
}

function saveChunks(): void {
	processingMessage.value = `已儲存 ${chunkContents.value.length} 個切塊。`
}

function mergeChunks(): void {
	if (chunkContents.value.length < 2) return
	chunkContents.value = [{ id: 'chunk-merged', page: chunkContents.value[0]?.page ?? 1, content: chunkContents.value.map((chunk) => chunk.content).join('\n') }]
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="知識處理管線" title="處理監控" description="追蹤文件從解析、切塊、向量化到知識圖譜的每個步驟。" />
		<div class="d-flex flex-wrap align-center ga-3 mb-5"><VSelect v-model="filter" :items="['全部狀態', '等待中', '處理中', '已完成', '失敗', '已取消']" label="處理狀態" hide-details max-width="220" /><VSpacer /><VBtn variant="outlined" prepend-icon="mdi-refresh" @click="processingMessage = '處理狀態已更新。'">重新整理</VBtn></div>
		<VAlert v-if="processingMessage" type="success" variant="tonal" closable class="mb-4" @click:close="processingMessage = ''">{{ processingMessage }}</VAlert>
		<div class="d-grid ga-3">
			<VCard v-for="job in visibleJobs" :key="job.id" class="job-row surface-border pa-5">
				<div class="job-main">
					<div class="d-flex align-center ga-2"><VIcon :icon="job.status === '失敗' ? 'mdi-alert-circle-outline' : job.status === '已完成' ? 'mdi-check-circle-outline' : 'mdi-progress-clock'" :color="job.status === '失敗' ? 'error' : job.status === '已完成' ? 'success' : 'primary'" aria-hidden="true" /><p class="font-weight-bold">{{ job.title }}</p></div>
					<p class="text-caption text-medium-emphasis mt-1">{{ job.stage }} · {{ job.startedAt }}</p>
					<VProgressLinear :model-value="job.progress" :color="job.status === '失敗' ? 'error' : 'primary'" height="7" rounded class="mt-3" />
				</div>
				<div class="job-actions"><VChip :color="job.status === '失敗' ? 'error' : job.status === '已完成' ? 'success' : 'info'" variant="tonal" size="small">{{ job.status }}</VChip><VBtn v-if="job.status === '失敗'" variant="tonal" color="error" size="small" @click="retryJob(job)">重新執行</VBtn><VBtn v-if="job.status === '處理中' || job.status === '等待中'" variant="text" color="error" size="small" @click="cancelTarget = job">取消工作</VBtn><VBtn variant="text" size="small" @click="openDetail(job)">查看詳情</VBtn></div>
			</VCard>
		</div>

		<VDialog v-model="isDetailOpen" max-width="720">
			<VCard v-if="selectedJob"><VCardTitle class="pa-6 pb-2">處理詳情</VCardTitle><VCardText class="pa-6 pt-2"><p class="font-weight-bold mb-4">{{ selectedJob.title }}</p><VTabs v-model="detailTab" color="primary" class="mb-4"><VTab value="steps">執行步驟</VTab><VTab value="chunks">切塊檢查</VTab></VTabs><VWindow v-model="detailTab"><VWindowItem value="steps"><VTimeline side="end" density="compact" truncate-line="both"><VTimelineItem dot-color="success" size="small"><p class="font-weight-bold">檔案解析</p><p class="text-caption text-medium-emphasis">完成 · 8.2 秒 · 取得 24 頁</p></VTimelineItem><VTimelineItem :dot-color="selectedJob.progress > 25 ? 'success' : selectedJob.status === '失敗' ? 'error' : 'secondary'" size="small"><p class="font-weight-bold">內容切塊</p><p class="text-caption text-medium-emphasis">{{ selectedJob.status === '失敗' ? '未執行' : '完成 · 75 個內容區塊' }}</p></VTimelineItem><VTimelineItem :dot-color="selectedJob.progress > 60 ? 'success' : 'secondary'" size="small"><p class="font-weight-bold">向量化</p><p class="text-caption text-medium-emphasis">{{ selectedJob.stage }}</p></VTimelineItem><VTimelineItem :dot-color="selectedJob.progress === 100 ? 'success' : 'secondary'" size="small"><p class="font-weight-bold">知識圖譜</p><p class="text-caption text-medium-emphasis">{{ selectedJob.progress === 100 ? '完成' : '等待前一步驟' }}</p></VTimelineItem></VTimeline><VAlert v-if="selectedJob.status === '失敗'" type="error" variant="tonal" class="mt-5">檔案受到密碼保護，請先移除密碼後重新上傳。</VAlert></VWindowItem><VWindowItem value="chunks"><div class="d-flex justify-end ga-2 mb-3"><VBtn size="small" variant="outlined" prepend-icon="mdi-plus" @click="addChunk">新增切塊</VBtn><VBtn size="small" variant="outlined" prepend-icon="mdi-call-merge" :disabled="chunkContents.length < 2" @click="mergeChunks">合併全部</VBtn></div><VCard v-for="chunk in chunkContents" :key="chunk.id" variant="outlined" class="pa-4 mb-3"><VTextField v-model.number="chunk.page" label="頁碼" type="number" /><VTextarea v-model="chunk.content" label="切塊內容" rows="3" /><VBtn size="small" variant="text" color="error" @click="chunkContents = chunkContents.filter((item) => item.id !== chunk.id)">刪除切塊</VBtn></VCard></VWindowItem></VWindow></VCardText><VCardActions class="pa-5"><VBtn v-if="detailTab === 'chunks'" color="primary" variant="tonal" @click="saveChunks">儲存切塊</VBtn><VSpacer /><VBtn @click="isDetailOpen = false">關閉</VBtn></VCardActions></VCard>
		</VDialog>
		<VDialog :model-value="Boolean(cancelTarget)" max-width="460" @update:model-value="cancelTarget = null"><VCard><VCardTitle class="pa-6 pb-2">取消處理工作？</VCardTitle><VCardText class="pa-6 pt-2">目前進度將停止，已產生但未完成的資料不會發布。稍後仍可重新執行。</VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="cancelTarget = null">返回</VBtn><VBtn color="error" @click="confirmCancel">確認取消</VBtn></VCardActions></VCard></VDialog>
	</div>
</template>

<style scoped>
.job-row { display: flex; align-items: center; gap: 24px; }
.job-main { flex: 1; min-width: 0; }
.job-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
@media (max-width: 760px) { .job-row { align-items: stretch; flex-direction: column; } }
</style>
