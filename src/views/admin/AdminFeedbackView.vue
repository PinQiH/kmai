<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FeedbackCaseDrawer from '@/components/FeedbackCaseDrawer.vue'
import MetricSparkline from '@/components/MetricSparkline.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
	breakdownRate,
	getIssueMetrics,
	getResolutionSatisfaction,
	getSatisfactionByModel,
	getSatisfactionBySource,
	getSatisfactionSummary,
} from '@/mocks/answerSatisfaction'
import {
	CURRENT_HANDLER,
	FEEDBACK_CAUSE_LABELS,
	FEEDBACK_HANDLERS,
	FEEDBACK_KIND_LABELS,
	FEEDBACK_STATUS_LABELS,
	OVERDUE_DAYS,
	feedbackAdminState,
	formatAge,
	formatDateTime,
	getCase,
	getCaseDocumentIds,
	getCaseSignals,
	getDocumentSummaries,
	isOpen,
	isOverdue,
	type FeedbackCase,
	type FeedbackKind,
} from '@/mocks/feedbackAdmin'
import { useAdminAssistantStore } from '@/stores/adminAssistant'
import { useNotebooksStore } from '@/stores/notebooks'
import { getAnswerModelLabel, getAnswerStyleLabel } from '@/utils/answerSettings'
import { buildKnowledgeSourceOptions } from '@/utils/knowledgeSources'

type FeedbackTab = 'overview' | 'queue' | 'documents' | 'closed'
type KindFilter = FeedbackKind | 'all'

// TODO(api-integration): 分頁改由後端處理（page / pageSize / total），前端只保留目前頁
const PAGE_SIZE = 10
const tabs: FeedbackTab[] = ['overview', 'queue', 'documents', 'closed']
const statusColor = { new: 'warning', investigating: 'info', resolved: 'success', dismissed: 'secondary' } as const
const signalColor = { error: 'error', warning: 'warning', info: 'info' } as const
const ownerOptions = [
	{ title: '全部處理人', value: 'all' },
	{ title: '未指派', value: 'unassigned' },
	...FEEDBACK_HANDLERS.map((handler) => ({ title: handler.name === CURRENT_HANDLER ? `${handler.name}（我）` : handler.name, value: handler.name })),
]
const sortOptions = [
	{ title: '最久未處理在前', value: 'oldest' },
	{ title: '最新回報在前', value: 'newest' },
]
const documentHeaders = [
	{ title: '文件', key: 'title' },
	{ title: '未結案', key: 'openCount', width: 110 },
	{ title: '已結案', key: 'closedCount', width: 110 },
	{ title: '最近一筆', key: 'latestDetail', sortable: false },
]

const route = useRoute()
const router = useRouter()
const assistantStore = useAdminAssistantStore()
const notebooksStore = useNotebooksStore()

// > 分頁寫進網址；案件與文件篩選只在進頁或從通知連過來時讀網址
// @ 開啟中的 temporary drawer 會攔下路由導覽，所以開關案件不經過 router
const initialQuery = route.query
const activeTab = ref<FeedbackTab>(tabs.find((tab) => tab === initialQuery.tab) ?? 'overview')
const openCaseId = ref<string | null>(typeof initialQuery.case === 'string' ? initialQuery.case : null)
const documentFilter = ref(typeof initialQuery.documentId === 'string' ? initialQuery.documentId : '')
watch(() => route.query.tab, (tab) => {
	activeTab.value = tabs.find((item) => item === tab) ?? 'overview'
})
// @ 已在本頁時點小鈴鐺的「查看案件」，query 會改變但元件不重建
watch(() => route.query.case, (id) => {
	if (typeof id === 'string') openCaseId.value = id
})
watch(activeTab, (tab) => {
	const next = tab === 'overview' ? undefined : tab
	if (next !== route.query.tab) router.replace({ query: { ...route.query, tab: next, case: undefined, documentId: undefined } })
})

const message = ref('')
const messageTone = ref<'success' | 'error'>('success')
const now = ref(Date.now())

// > 概況
const cases = computed(() => feedbackAdminState.cases)
const openCases = computed(() => cases.value.filter(isOpen))
const unassignedCount = computed(() => openCases.value.filter((item) => !item.assignee).length)
const overdueCount = computed(() => openCases.value.filter((item) => isOverdue(item, now.value)).length)
const closedCases = computed(() => cases.value.filter((item) => !isOpen(item)).sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')))
const closedThisWeek = computed(() => closedCases.value.filter((item) => item.closedAt && now.value - new Date(item.closedAt).getTime() < 7 * 86_400_000).length)
const documentSummaries = computed(() => getDocumentSummaries())
const topDocument = computed(() => documentSummaries.value.find((summary) => summary.openCount > 0))

// > 概況：回答滿意度（讚／倒讚）、處理滿意度（結案後回報者確認）與問題回報的客觀指標
const satisfactionDays = ref(7)
const satisfactionDayOptions = [
	{ title: '近 7 天', value: 7 },
	{ title: '近 14 天', value: 14 },
]
const answerSatisfaction = computed(() => getSatisfactionSummary(satisfactionDays.value))
const satisfactionBySource = computed(() => getSatisfactionBySource())
const satisfactionByModel = computed(() => getSatisfactionByModel())
const resolutionSatisfaction = computed(() => getResolutionSatisfaction())
const issueMetrics = computed(() => getIssueMetrics(30))
const satisfactionTone = computed(() => {
	const rate = answerSatisfaction.value.rate
	if (rate === null) return 'primary'
	return rate >= 80 ? 'success' : rate >= 70 ? 'warning' : 'error'
})

function formatRate(rate: number | null): string {
	return rate === null ? '—' : `${rate}%`
}

// > 待處理佇列
const search = ref('')
const kindFilter = ref<KindFilter>('all')
const ownerFilter = ref('all')
const sortOrder = ref<'oldest' | 'newest'>('oldest')
const queuePage = ref(1)
const kindCounts = computed(() => ({
	all: openCases.value.length,
	answer: openCases.value.filter((item) => item.kind === 'answer').length,
	issue: openCases.value.filter((item) => item.kind === 'issue').length,
}))

function matchesText(item: FeedbackCase, keyword: string): boolean {
	return !keyword || [item.title, item.detail, item.reporter.name, item.reporter.department ?? '', item.resolution ?? ''].join(' ').toLocaleLowerCase('zh-TW').includes(keyword)
}

const queueRows = computed(() => {
	const keyword = search.value?.trim().toLocaleLowerCase('zh-TW') ?? ''
	return openCases.value
		.filter((item) => {
			if (kindFilter.value !== 'all' && item.kind !== kindFilter.value) return false
			if (ownerFilter.value === 'unassigned' && item.assignee) return false
			if (!['all', 'unassigned'].includes(ownerFilter.value) && item.assignee !== ownerFilter.value) return false
			if (documentFilter.value && !getCaseDocumentIds(item).includes(documentFilter.value)) return false
			return matchesText(item, keyword)
		})
		.sort((a, b) => sortOrder.value === 'oldest' ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt))
})
const queuePageCount = computed(() => Math.max(1, Math.ceil(queueRows.value.length / PAGE_SIZE)))
const pagedQueue = computed(() => {
	const page = Math.min(queuePage.value, queuePageCount.value)
	return queueRows.value
		.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
		.map((item) => ({ item, signals: getCaseSignals(item), overdue: isOverdue(item, now.value) }))
})
const hasQueueFilter = computed(() => Boolean(search.value?.trim()) || kindFilter.value !== 'all' || ownerFilter.value !== 'all' || Boolean(documentFilter.value))
const documentFilterTitle = computed(() => documentSummaries.value.find((summary) => summary.documentId === documentFilter.value)?.title ?? documentFilter.value)
watch([search, kindFilter, ownerFilter, sortOrder, documentFilter], () => { queuePage.value = 1 })

function clearQueueFilters(): void {
	search.value = ''
	kindFilter.value = 'all'
	ownerFilter.value = 'all'
	documentFilter.value = ''
}

// > 已結案
const closedSearch = ref('')
const closedPage = ref(1)
const closedRows = computed(() => {
	const keyword = closedSearch.value?.trim().toLocaleLowerCase('zh-TW') ?? ''
	return closedCases.value.filter((item) => matchesText(item, keyword))
})
const closedPageCount = computed(() => Math.max(1, Math.ceil(closedRows.value.length / PAGE_SIZE)))
const pagedClosed = computed(() => {
	const page = Math.min(closedPage.value, closedPageCount.value)
	return closedRows.value.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
})
watch(closedSearch, () => { closedPage.value = 1 })

function rangeLabel(page: number, total: number): string {
	if (!total) return ''
	const start = (Math.min(page, Math.ceil(total / PAGE_SIZE)) - 1) * PAGE_SIZE + 1
	return `第 ${start}–${Math.min(start + PAGE_SIZE - 1, total)} 筆`
}

// > 開啟案件
function openCase(id: string): void {
	now.value = Date.now()
	openCaseId.value = id
}

function closeDrawer(): void {
	openCaseId.value = null
}

function showDocumentFeedback(documentId: string): void {
	openCaseId.value = null
	activeTab.value = 'queue'
	documentFilter.value = documentId
}

function onSaved(text: string, tone: 'success' | 'error' = 'success'): void {
	message.value = text
	messageTone.value = tone
	now.value = Date.now()
}

// > 複測：關掉抽屜，把回報者當時的問題與設定帶進後台小幫手
function retest(caseId: string): void {
	const item = getCase(caseId)
	const settings = item?.run?.settings
	if (!item || !settings) return
	const source = buildKnowledgeSourceOptions(notebooksStore.notebooks).find((option) => option.id === settings.sourceId)
	assistantStore.startRetest({
		caseId: item.id,
		caseTitle: item.title,
		reporterName: item.reporter.name,
		question: item.title,
		sourceId: settings.sourceId,
		sourceName: settings.sourceName,
		settingLabels: [
			settings.documentNames.length ? `限定 ${settings.documentNames.length} 份文件` : '',
			getAnswerModelLabel(settings.answerModelId),
			`${getAnswerStyleLabel(settings.answerStyleId)}風格`,
			`網路搜尋${settings.webSearchEnabled ? '開' : '關'}`,
		].filter(Boolean),
		webSearchEnabled: settings.webSearchEnabled,
	}, source, {
		// @ 限定文件以 id 對應，名稱只用於顯示；文件被刪除時不會誤選到別份
		documents: settings.documentIds.map((id, index) => ({ id, name: settings.documentNames[index] ?? id })),
		answerStyleId: settings.answerStyleId,
		answerModelId: settings.answerModelId,
	})
	openCaseId.value = null
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="使用者回饋" title="回饋與問題" description="同仁對 AI 回答按倒讚、或從帳號頁回報問題，都會進到這裡。先看診斷線索與檢索過程判斷原因，修正後結案，系統會以站內通知告訴回報者。" />

		<VAlert v-if="message" :type="messageTone" variant="tonal" density="compact" closable class="mb-5" role="status" @click:close="message = ''">{{ message }}</VAlert>

		<dl class="metric-row" aria-label="回饋處理概況">
			<div><dt>待處理</dt><dd>{{ openCases.length }}</dd><span>{{ unassignedCount ? `其中 ${unassignedCount} 筆尚未指派` : '全部已有處理人' }}</span></div>
			<div :class="{ 'is-alert': overdueCount }"><dt>超過 {{ OVERDUE_DAYS }} 天未結案</dt><dd>{{ overdueCount }}</dd><span>{{ overdueCount ? '回報者還在等回覆' : '沒有逾期案件' }}</span></div>
			<div><dt>近 7 天結案</dt><dd>{{ closedThisWeek }}</dd><span>共 {{ closedCases.length }} 筆已結案</span></div>
			<div>
				<dt>最多回饋的文件</dt>
				<dd class="is-text">
					<button v-if="topDocument" type="button" class="row-link" @click="showDocumentFeedback(topDocument.documentId)">{{ topDocument.title }}</button>
					<template v-else>—</template>
				</dd>
				<span>{{ topDocument ? `${topDocument.openCount} 筆未結案` : '目前沒有指向文件的回饋' }}</span>
			</div>
		</dl>

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="overview">概況</VTab>
			<VTab value="queue">待處理<VChip v-if="openCases.length" size="x-small" color="warning" variant="tonal" class="ms-2">{{ openCases.length }}</VChip></VTab>
			<VTab value="documents">依文件彙整</VTab>
			<VTab value="closed">已結案</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="feedback-window">
			<!-- > 概況：使用者覺得好不好用，這裡是唯一有真實評價訊號的地方 -->
			<VWindowItem value="overview">
				<section aria-labelledby="answer-quality-title" class="mb-8">
					<div class="overview-head">
						<div>
							<h2 id="answer-quality-title" class="section-heading">AI 回答滿意度</h2>
							<p class="overview-note">以「有幫助 ÷ 有評價」計算；沒有評價的回答不列入。</p>
						</div>
						<VSelect v-model="satisfactionDays" :items="satisfactionDayOptions" label="統計區間" density="compact" hide-details class="range-select" />
					</div>
					<dl class="metric-row" :aria-label="`最近 ${satisfactionDays} 天的回答評價`">
						<div>
							<dt>滿意度</dt>
							<dd :class="`text-${satisfactionTone}`">{{ formatRate(answerSatisfaction.rate) }}</dd>
							<span v-if="answerSatisfaction.deltaPoints !== null">與前 {{ satisfactionDays }} 天相比 {{ answerSatisfaction.deltaPoints > 0 ? '+' : '' }}{{ answerSatisfaction.deltaPoints }} 個百分點</span>
							<span v-else>沒有可比較的區間</span>
						</div>
						<div>
							<dt>有幫助</dt>
							<dd>{{ answerSatisfaction.helpful.toLocaleString() }}</dd>
							<span>共 {{ answerSatisfaction.rated.toLocaleString() }} 筆評價</span>
						</div>
						<div>
							<dt>倒讚</dt>
							<dd :class="{ 'text-error': answerSatisfaction.unhelpful > 0 }">{{ answerSatisfaction.unhelpful.toLocaleString() }}</dd>
							<span>每筆倒讚都會成為待處理案件</span>
						</div>
						<div>
							<dt>評價率</dt>
							<dd>{{ answerSatisfaction.ratedRate }}%</dd>
							<span>{{ answerSatisfaction.answered.toLocaleString() }} 次回答中有評價的比例</span>
						</div>
					</dl>
					<VCard class="surface-border pa-5">
						<h3 class="text-subtitle-1 font-weight-bold mb-1">每日滿意度</h3>
						<p class="overview-note mb-4">評價數少的日子波動較大，判讀時請一併看評價率。</p>
						<MetricSparkline :values="answerSatisfaction.series" :tone="satisfactionTone" :label="`最近 ${satisfactionDays} 天的每日滿意度`" :height="72" />
					</VCard>
				</section>

				<section aria-labelledby="resolution-title" class="mb-8">
					<h2 id="resolution-title" class="section-heading">處理滿意度</h2>
					<p class="overview-note mb-4">案件結案後，回報者在個人設定的「問題回報」回覆有沒有真的解決；這是系統整體好不好用最直接的訊號。</p>
					<dl class="metric-row" aria-label="結案後回報者的回覆">
						<div>
							<dt>說已解決</dt>
							<dd :class="resolutionSatisfaction.rate !== null && resolutionSatisfaction.rate < 70 ? 'text-warning' : ''">{{ formatRate(resolutionSatisfaction.rate) }}</dd>
							<span>{{ resolutionSatisfaction.rated }} 位回報者已回覆</span>
						</div>
						<div>
							<dt>說還沒解決</dt>
							<dd :class="{ 'text-error': resolutionSatisfaction.unsolved > 0 }">{{ resolutionSatisfaction.unsolved }}</dd>
							<span>回覆沒解決時，處理人會收到通知</span>
						</div>
						<div>
							<dt>等待回覆</dt>
							<dd>{{ resolutionSatisfaction.awaiting }}</dd>
							<span>已結案但回報者還沒回覆</span>
						</div>
						<div>
							<dt>平均處理天數</dt>
							<dd>{{ issueMetrics.averageDaysToClose ?? '—' }}</dd>
							<span>近 30 天已結案的案件</span>
						</div>
					</dl>
				</section>

				<section aria-labelledby="issue-metrics-title">
					<h2 id="issue-metrics-title" class="section-heading">近 30 天的回報</h2>
					<p class="overview-note mb-4">沒有人評分時，回報量與分類一樣能看出哪裡卡住。</p>
					<VRow>
						<VCol cols="12" md="6">
							<VCard class="surface-border pa-5 h-100">
								<h3 class="text-subtitle-1 font-weight-bold mb-4">回報分類</h3>
								<table class="overview-table">
									<thead><tr><th scope="col">分類</th><th scope="col">件數</th></tr></thead>
									<tbody>
										<tr v-for="row in issueMetrics.byCategory" :key="row.label">
											<td>{{ row.label }}</td>
											<td class="num">{{ row.count }}</td>
										</tr>
										<tr v-if="!issueMetrics.byCategory.length"><td colspan="2" class="cell-sub">近 30 天沒有回報</td></tr>
									</tbody>
								</table>
								<p class="overview-note mt-4">共 {{ issueMetrics.reported }} 件，已結案 {{ issueMetrics.closed }} 件、未結案 {{ issueMetrics.open }} 件。</p>
							</VCard>
						</VCol>
						<VCol cols="12" md="6">
							<VCard class="surface-border pa-5 h-100">
								<h3 class="text-subtitle-1 font-weight-bold mb-1">回答滿意度分組</h3>
								<p class="overview-note mb-4">累計統計，不受上方統計區間影響。</p>
								<table class="overview-table">
									<thead><tr><th scope="col">知識來源</th><th scope="col">滿意度</th><th scope="col">倒讚</th></tr></thead>
									<tbody>
										<tr v-for="row in satisfactionBySource" :key="row.id">
											<td>{{ row.label }}</td>
											<td class="num">{{ formatRate(breakdownRate(row)) }}</td>
											<td class="num">{{ row.unhelpful.toLocaleString() }}</td>
										</tr>
									</tbody>
								</table>
								<table class="overview-table mt-4">
									<thead><tr><th scope="col">回答模型</th><th scope="col">滿意度</th><th scope="col">倒讚</th></tr></thead>
									<tbody>
										<tr v-for="row in satisfactionByModel" :key="row.id">
											<td>{{ row.label }}</td>
											<td class="num">{{ formatRate(breakdownRate(row)) }}</td>
											<td class="num">{{ row.unhelpful.toLocaleString() }}</td>
										</tr>
									</tbody>
								</table>
							</VCard>
						</VCol>
					</VRow>
				</section>
			</VWindowItem>

			<VWindowItem value="queue">
				<div class="toolbar">
					<VTextField v-model="search" density="compact" placeholder="搜尋問題、原因或回報者" prepend-inner-icon="mdi-magnify" aria-label="搜尋待處理案件" hide-details clearable class="toolbar-search" data-testid="feedback-search" />
					<VBtnToggle v-model="kindFilter" mandatory density="compact" variant="outlined" divided color="primary" aria-label="依類型篩選">
						<VBtn value="all">全部 {{ kindCounts.all }}</VBtn>
						<VBtn value="answer">{{ FEEDBACK_KIND_LABELS.answer }} {{ kindCounts.answer }}</VBtn>
						<VBtn value="issue">{{ FEEDBACK_KIND_LABELS.issue }} {{ kindCounts.issue }}</VBtn>
					</VBtnToggle>
					<VSelect v-model="ownerFilter" :items="ownerOptions" density="compact" hide-details aria-label="處理人" class="toolbar-select" />
					<VSpacer />
					<VSelect v-model="sortOrder" :items="sortOptions" density="compact" hide-details aria-label="排序" class="toolbar-select" />
				</div>
				<VChip v-if="documentFilter" closable size="small" prepend-icon="mdi-file-document-outline" class="mb-2" @click:close="documentFilter = ''">引用文件：{{ documentFilterTitle }}</VChip>
				<p class="result-count" aria-live="polite">
					{{ hasQueueFilter ? `符合 ${queueRows.length} / ${openCases.length} 筆` : `共 ${openCases.length} 筆待處理` }}<template v-if="queuePageCount > 1"> · {{ rangeLabel(queuePage, queueRows.length) }}</template>
					<button v-if="hasQueueFilter" type="button" class="link-button" @click="clearQueueFilters">清除條件</button>
				</p>

				<div v-if="!openCases.length" class="empty-state" role="status">
					<VIcon icon="mdi-check-circle-outline" color="success" size="32" />
					<strong>沒有待處理的回饋</strong>
					<span>同仁按倒讚或回報問題時，會出現在這裡。</span>
				</div>
				<div v-else-if="!queueRows.length" class="empty-state" role="status">
					<strong>沒有符合條件的案件</strong>
					<button type="button" class="link-button" @click="clearQueueFilters">清除條件</button>
				</div>
				<template v-else>
					<ul class="case-list" data-testid="feedback-queue">
						<li v-for="{ item, signals, overdue } in pagedQueue" :key="item.id">
							<button type="button" class="case-row" :data-testid="`case-${item.id}`" @click="openCase(item.id)">
								<span class="case-main">
									<span class="case-meta">
										<VIcon :icon="item.kind === 'answer' ? 'mdi-thumb-down-outline' : 'mdi-message-alert-outline'" size="14" aria-hidden="true" />
										{{ FEEDBACK_KIND_LABELS[item.kind] }}<template v-if="item.category"> · {{ item.category }}</template>
										<template v-if="item.attachments.length"> · <VIcon icon="mdi-paperclip" size="13" aria-hidden="true" />{{ item.attachments.length }} 張截圖</template>
									</span>
									<strong class="case-title">{{ item.title }}</strong>
									<span class="case-detail">{{ item.detail }}</span>
									<span v-if="signals[0]" class="case-signal" :class="`text-${signalColor[signals[0].tone]}`">
										{{ signals[0].text }}<template v-if="signals.length > 1">（另有 {{ signals.length - 1 }} 項線索）</template>
									</span>
								</span>
								<span class="case-side">
									<VChip :color="statusColor[item.status]" size="small" variant="tonal">{{ FEEDBACK_STATUS_LABELS[item.status] }}</VChip>
									<span class="case-meta">{{ item.assignee ?? '未指派' }}</span>
									<span class="case-meta" :class="{ 'text-error font-weight-bold': overdue }">
										<time :datetime="item.submittedAt" :title="formatDateTime(item.submittedAt)">{{ formatAge(item.submittedAt, now) }}</time><template v-if="overdue"> · 逾期</template>
									</span>
									<span class="case-meta">{{ item.reporter.name }}</span>
								</span>
							</button>
						</li>
					</ul>
					<VPagination v-if="queuePageCount > 1" v-model="queuePage" :length="queuePageCount" :total-visible="7" density="comfortable" class="mt-3" aria-label="待處理案件分頁" />
				</template>
			</VWindowItem>

			<VWindowItem value="documents">
				<p class="toolbar-note mb-3">回答回饋依引用的文件彙整。同一份文件累積多筆回饋，通常代表內容過時或寫得不清楚，修正文件比逐筆回覆更有效。</p>
				<VCard class="surface-border overflow-hidden">
					<div class="table-scroll">
						<VDataTable :headers="documentHeaders" :items="documentSummaries" item-value="documentId" :items-per-page="10" no-data-text="目前沒有指向文件的回饋" data-testid="feedback-documents">
							<template #item.title="{ item }">
								<div class="py-2">
									<RouterLink :to="`/admin/documents/${item.documentId}/manage`" class="row-link">{{ item.title }}</RouterLink>
									<p class="cell-sub">{{ item.version }} 版 · {{ item.status }}</p>
								</div>
							</template>
							<template #item.openCount="{ item }">
								<button v-if="item.openCount" type="button" class="link-button" @click="showDocumentFeedback(item.documentId)">{{ item.openCount }} 筆</button>
								<span v-else class="cell-sub">0</span>
							</template>
							<template #item.latestDetail="{ item }">
								<p class="cell-sub clamp-2">{{ item.latestDetail }}</p>
								<p class="cell-sub">{{ formatAge(item.latestAt, now) }}</p>
							</template>
						</VDataTable>
					</div>
				</VCard>
			</VWindowItem>

			<VWindowItem value="closed">
				<div class="toolbar">
					<VTextField v-model="closedSearch" density="compact" placeholder="搜尋問題或處理說明" prepend-inner-icon="mdi-magnify" aria-label="搜尋已結案案件" hide-details clearable class="toolbar-search" />
				</div>
				<p v-if="closedRows.length" class="result-count" aria-live="polite">共 {{ closedRows.length }} 筆<template v-if="closedPageCount > 1"> · {{ rangeLabel(closedPage, closedRows.length) }}</template></p>
				<div v-if="!closedRows.length" class="empty-state" role="status">
					<strong>{{ closedCases.length ? '沒有符合條件的案件' : '還沒有結案紀錄' }}</strong>
				</div>
				<template v-else>
					<ul class="case-list">
						<li v-for="item in pagedClosed" :key="item.id">
							<button type="button" class="case-row" @click="openCase(item.id)">
								<span class="case-main">
									<span class="case-meta">{{ FEEDBACK_KIND_LABELS[item.kind] }}<template v-if="item.cause"> · {{ FEEDBACK_CAUSE_LABELS[item.cause] }}</template></span>
									<strong class="case-title">{{ item.title }}</strong>
									<span class="case-detail">{{ item.resolution }}</span>
								</span>
								<span class="case-side">
									<VChip :color="statusColor[item.status]" size="small" variant="tonal">{{ FEEDBACK_STATUS_LABELS[item.status] }}</VChip>
									<span class="case-meta">{{ item.assignee }}</span>
									<span v-if="item.closedAt" class="case-meta">{{ formatDateTime(item.closedAt) }}</span>
								</span>
							</button>
						</li>
					</ul>
					<VPagination v-if="closedPageCount > 1" v-model="closedPage" :length="closedPageCount" :total-visible="7" density="comfortable" class="mt-3" aria-label="已結案案件分頁" />
				</template>
			</VWindowItem>
		</VWindow>

		<FeedbackCaseDrawer :case-id="openCaseId" :actor="CURRENT_HANDLER" @close="closeDrawer" @saved="onSaved" @filter-document="showDocumentFeedback" @retest="retest" />
	</div>
</template>

<style scoped>
.feedback-window { overflow: visible; }

.overview-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-sm); margin-bottom: var(--space-md); }
.overview-note { max-width: 72ch; margin: 4px 0 0; color: var(--ink-muted); font-size: 0.86rem; }
.range-select { max-width: 180px; }
.overview-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.overview-table th { padding: 4px 6px; border-bottom: 1px solid rgb(var(--v-theme-outline)); color: var(--ink-muted); font-weight: 500; text-align: left; }
.overview-table td { padding: 8px 6px; border-bottom: 1px solid rgb(var(--v-theme-outline) / 50%); }
.overview-table .num { font-variant-numeric: tabular-nums; }

.metric-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-md); margin: 0 0 var(--space-lg); }
.metric-row > div { display: grid; align-content: start; gap: 2px; padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.metric-row > div.is-alert dd { color: rgb(var(--v-theme-error)); }
.metric-row dt { color: var(--ink-muted); font-size: 0.8rem; }
.metric-row dd { margin: 0; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.metric-row dd.is-text { font-size: 1rem; line-height: 1.5; padding-block: 4px; }
.metric-row span { color: var(--ink-muted); font-size: 0.76rem; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.toolbar-search { max-width: 320px; min-width: 220px; }
.toolbar-select { max-width: 190px; min-width: 150px; }
.toolbar-note { max-width: 70ch; margin: 0; color: var(--ink-muted); font-size: 0.86rem; }
.result-count { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin: 0 0 var(--space-sm); color: var(--ink-muted); font-size: 0.8rem; font-variant-numeric: tabular-nums; }

.empty-state { display: grid; justify-items: center; gap: var(--space-xs); padding: var(--space-2xl) var(--space-md); border: 1px dashed rgb(var(--v-theme-outline)); border-radius: var(--radius-md); color: var(--ink-muted); text-align: center; }
.empty-state strong { color: rgb(var(--v-theme-on-surface)); }

.case-list { margin: 0; padding: 0; overflow: hidden; border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); list-style: none; }
.case-list li + li { border-top: 1px solid rgb(var(--v-theme-outline)); }
.case-row { display: flex; width: 100%; gap: var(--space-lg); padding: 14px var(--space-md); color: inherit; text-align: left; transition: background-color 120ms ease-out; }
.case-row:hover { background: rgb(var(--v-theme-primary) / 4%); }
.case-row:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.case-main { display: grid; flex: 1; gap: 3px; min-width: 0; }
.case-meta { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--ink-muted); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.case-title { font-size: 0.95rem; }
.case-detail { display: -webkit-box; overflow: hidden; max-width: 80ch; color: var(--ink-muted); font-size: 0.86rem; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.case-signal { font-size: 0.8rem; }
.case-side { display: grid; flex: 0 0 132px; justify-items: end; align-content: start; gap: 4px; text-align: right; }

.link-button { color: rgb(var(--v-theme-primary)); font-size: 0.82rem; text-decoration: underline; text-underline-offset: 2px; }
.row-link { color: inherit; font-weight: 600; text-align: left; text-decoration: none; }
.row-link:hover { color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 2px; }
.link-button:focus-visible, .row-link:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.cell-sub { margin: 0; color: var(--ink-muted); font-size: 0.78rem; }
.clamp-2 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.table-scroll { overflow-x: auto; }
.table-scroll :deep(table) { min-width: 680px; }

@media (prefers-reduced-motion: reduce) { .case-row { transition: none; } }

@media (max-width: 960px) {
	.metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
	.metric-row { grid-template-columns: minmax(0, 1fr); }
	.toolbar-search, .toolbar-select { max-width: none; flex: 1 1 100%; }
	.case-row { flex-direction: column; gap: var(--space-sm); }
	.case-side { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-items: start; gap: var(--space-sm); text-align: left; }
}
</style>
