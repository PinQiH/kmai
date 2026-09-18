<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { baseSystemRecords } from '@/mocks/systemRecords'
import { getAdminQuestionRecordsSnapshot } from '@/repositories/adminQuestions.repository'
import { useAppStore } from '@/stores/app'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotificationsStore } from '@/stores/notifications'
import { systemRecordCategoryPalette } from '@/theme'
import type {
	AdminQuestionRecord,
	AdminQuestionRecordStatus,
	AdminQuestionSource,
	AssistantAuditSession,
	SystemRecordCategory,
	SystemRecordEntry,
	SystemRecordLevel,
} from '@/types'
import {
	assistantSessionEndReasonLabel,
	assistantSessionStatusLabel,
	countAssistantQuestions,
} from '@/utils/assistantAudit'
import { buildCsvFileName, downloadCsvFile, toCsvContent, type CsvColumn } from '@/utils/csv'
import { formatDuration, formatNumber } from '@/utils/format'
import { formatNotificationTimestamp } from '@/utils/notifications'
import {
	buildAuditRecords,
	buildSystemEventRecords,
	filterAdminQuestionRecords,
	filterAuditRecords,
	getSystemRecordTimeCutoff,
	SYSTEM_EVENT_CATEGORIES,
	type SystemRecordTimeRange,
} from '@/utils/systemRecords'

type SystemRecordTab = 'questions' | 'events' | 'audit'
type QuestionView = 'answers' | 'assistant' | 'mail'
type CategoryFilter = SystemRecordCategory | 'all'
type LevelFilter = SystemRecordLevel | 'all'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const assistantAuditStore = useAssistantAuditStore()
const notificationsStore = useNotificationsStore()

const isSystemAdmin = computed(() => appStore.adminRole === 'system-admin')
const activeTab = ref<SystemRecordTab>(isSystemAdmin.value ? 'questions' : 'events')
const questionRecords = ref<AdminQuestionRecord[]>([])
const questionLoading = ref(false)
const questionLoadError = ref('')
const selectedQuestion = ref<AdminQuestionRecord | null>(null)
const questionDrawerOpen = ref(false)
const routeMessage = ref('')
const routeMessageType = ref<'warning' | 'error'>('warning')
const routeMessageVisible = ref(false)
const drawerTriggerQuestionId = ref<string | null>(null)
const assistantDetailOpen = ref(false)
// > AI 問答紀錄分頁內再分「前台問答」「後台小幫手對話」「自動回信」，兩者都含完整內容，同受系統管理員權限保護
const questionView = ref<QuestionView>('answers')

const questionKeyword = ref('')
const questionUserFilter = ref('all')
const questionDepartmentFilter = ref('all')
const questionStatusFilter = ref<AdminQuestionRecordStatus | 'all'>('all')
const questionTimeRangeFilter = ref<SystemRecordTimeRange>('all')

const eventKeyword = ref('')
const categoryFilter = ref<CategoryFilter>('all')
const levelFilter = ref<LevelFilter>('all')
const eventTimeRangeFilter = ref<SystemRecordTimeRange>('all')

const auditKeyword = ref('')
const auditActorFilter = ref('all')
const auditTimeRangeFilter = ref<SystemRecordTimeRange>('all')

// > 時間序紀錄一律以發生時間新到舊為預設排序，避免使用者點過欄位後與預設脫鉤
const ITEMS_PER_PAGE = 25
const itemsPerPageOptions = [
	{ title: '25', value: 25 },
	{ title: '50', value: 50 },
	{ title: '100', value: 100 },
]
const questionSortBy = [{ key: 'askedAt', order: 'desc' as const }]
const eventSortBy = [{ key: 'occurredAt', order: 'desc' as const }]
const auditSortBy = [{ key: 'occurredAt', order: 'desc' as const }]
const assistantSortBy = [{ key: 'startedAt', order: 'desc' as const }]

const categoryMeta: Record<SystemRecordCategory, { label: string; icon: string }> = {
	auth: { label: '登入登出', icon: 'mdi-login-variant' },
	ai: { label: 'AI 問答', icon: 'mdi-creation-outline' },
	job: { label: '排程工作', icon: 'mdi-calendar-clock-outline' },
	audit: { label: '操作稽核', icon: 'mdi-clipboard-text-search-outline' },
	notification: { label: '通知', icon: 'mdi-bell-outline' },
	alert: { label: '告警', icon: 'mdi-alert-outline' },
}
const levelMeta: Record<SystemRecordLevel, { label: string; color: string }> = {
	info: { label: '資訊', color: 'info' },
	success: { label: '成功', color: 'success' },
	warning: { label: '警告', color: 'warning' },
	error: { label: '失敗', color: 'error' },
}
const statusMeta: Record<AdminQuestionRecordStatus, { label: string; color: string }> = {
	completed: { label: '完成', color: 'success' },
	failed: { label: '失敗', color: 'error' },
}
const categoryOptions = [
	{ title: '全部類別', value: 'all' },
	...SYSTEM_EVENT_CATEGORIES.map((category) => ({ title: categoryMeta[category].label, value: category })),
]
const levelOptions = [
	{ title: '全部等級', value: 'all' },
	...Object.entries(levelMeta).map(([value, meta]) => ({ title: meta.label, value })),
]
const questionStatusOptions = [
	{ title: '全部狀態', value: 'all' },
	{ title: '完成', value: 'completed' },
	{ title: '失敗', value: 'failed' },
]
const timeRangeOptions = [
	{ title: '全部時間', value: 'all' },
	{ title: '最近 1 小時', value: '1h' },
	{ title: '最近 24 小時', value: '24h' },
	{ title: '最近 7 天', value: '7d' },
]
const questionHeaders = computed(() => [
	{ title: '提問時間', key: 'askedAt', width: 180 },
	{ title: questionView.value === 'mail' ? '寄件者' : '使用者', key: 'userName', width: 210 },
	{ title: '問題摘要', key: 'question', minWidth: 320 },
	{ title: '知識範圍／模型', key: 'knowledgeScopeLabel', width: 240 },
	{ title: '狀態', key: 'status', width: 100 },
	{ title: '耗時', key: 'durationMs', width: 120 },
	{ title: 'Tokens', key: 'tokenUsage.totalTokens', width: 110, align: 'end' as const },
	{ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 110 },
])
const eventHeaders = [
	{ title: '發生時間', key: 'occurredAt', width: 180 },
	{ title: '類別', key: 'category', width: 130 },
	{ title: '事件', key: 'title', minWidth: 320 },
	{ title: '狀態', key: 'statusLabel', width: 120 },
	{ title: '', key: 'data-table-expand', width: 56 },
]
const auditHeaders = [
	{ title: '操作時間', key: 'occurredAt', width: 170 },
	{ title: '操作者', key: 'actorLabel', width: 210 },
	{ title: '操作項目', key: 'operationLabel', width: 210 },
	{ title: '操作對象', key: 'resourceName', minWidth: 240 },
	{ title: '結果', key: 'statusLabel', width: 100 },
	{ title: 'Request ID', key: 'requestId', width: 210 },
]
const assistantHeaders = [
	{ title: '開始時間', key: 'startedAt', width: 180 },
	{ title: '使用者', key: 'userName', width: 200 },
	{ title: '提問數', key: 'questionCount', width: 100, align: 'end' as const, sortable: false },
	{ title: '模型', key: 'modelLabel', width: 160 },
	{ title: '狀態', key: 'status', width: 110 },
	{ title: '結束原因', key: 'endReason', width: 140 },
	{ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 110 },
]

const sourceQuestionRecords = computed(() => questionRecords.value.filter((record) => (record.source ?? 'web') === currentQuestionSource.value))
const questionUserOptions = computed(() => [
	{ title: questionView.value === 'mail' ? '全部寄件者' : '全部使用者', value: 'all' },
	...Array.from(
		new Map(
			sourceQuestionRecords.value.map((record) => [
				record.userId,
				{ title: `${record.userName}（${record.userEmail}）`, value: record.userId },
			]),
		).values(),
	),
])
// > 自動回信也會走問答流程，與前台問答共用同一份紀錄與詳情；信件本身與回信統計在自動回信頁
watch(questionView, () => {
	questionUserFilter.value = 'all'
	questionDepartmentFilter.value = 'all'
})
const currentQuestionSource = computed<AdminQuestionSource>(() => (questionView.value === 'mail' ? 'mail' : 'web'))
const questionDepartmentOptions = computed(() => [
	{ title: '全部部門', value: 'all' },
	...Array.from(new Set(sourceQuestionRecords.value.map((record) => record.department)))
		.sort((left, right) => left.localeCompare(right, 'zh-TW'))
		.map((department) => ({ title: department, value: department })),
])
const filteredQuestionRecords = computed(() =>
	filterAdminQuestionRecords(questionRecords.value, {
		keyword: questionKeyword.value,
		userId: questionUserFilter.value,
		department: questionDepartmentFilter.value,
		status: questionStatusFilter.value,
		source: currentQuestionSource.value,
		timeRange: questionTimeRangeFilter.value,
		now: notificationsStore.deliveryClock,
	}),
)
const hasQuestionFilters = computed(
	() =>
		questionKeyword.value.trim().length > 0 ||
		questionUserFilter.value !== 'all' ||
		questionDepartmentFilter.value !== 'all' ||
		questionStatusFilter.value !== 'all' ||
		questionTimeRangeFilter.value !== 'all',
)
const conversationQuestions = computed(() => {
	if (!selectedQuestion.value) return []
	return questionRecords.value
		.filter((record) => record.conversationId === selectedQuestion.value?.conversationId)
		.sort((left, right) => Date.parse(left.askedAt) - Date.parse(right.askedAt))
})
const selectedAssistantSession = computed<AssistantAuditSession | null>(() => {
	const sessionId = firstQueryValue(route.query.assistantSessionId).trim()
	return sessionId ? assistantAuditStore.getSessionById(sessionId) : null
})

const allEventRecords = computed(() => buildSystemEventRecords(baseSystemRecords))
const eventRecords = computed(() => {
	const normalizedKeyword = eventKeyword.value.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(eventTimeRangeFilter.value, notificationsStore.deliveryClock)

	return allEventRecords.value.filter((record) => {
		const matchesCategory = categoryFilter.value === 'all' || record.category === categoryFilter.value
		const matchesLevel = levelFilter.value === 'all' || record.level === levelFilter.value
		const matchesTime = Date.parse(record.occurredAt) >= cutoff
		// > 詳情也要搜得到，否則展開後才看得到的帳號、IP、排程名稱會找不到
		const detailText = (record.details ?? []).map((detail) => detail.value).join(' ')
		const searchableText = `${record.title} ${record.summary} ${record.statusLabel} ${detailText}`.toLocaleLowerCase('zh-TW')
		return matchesCategory && matchesLevel && matchesTime && (!normalizedKeyword || searchableText.includes(normalizedKeyword))
	})
})
const allAuditRecords = computed(() => buildAuditRecords(baseSystemRecords, assistantAuditStore.inspectionRecords))
const assistantSessions = computed(() =>
	assistantAuditStore.sessions.map((session) => ({
		...session,
		questionCount: countAssistantQuestions(session),
	})),
)
const auditActorOptions = computed(() => [
	{ title: '全部操作者', value: 'all' },
	...Array.from(
		new Set(
			allAuditRecords.value
				.map((record) => record.actorLabel)
				.filter((actorLabel): actorLabel is string => Boolean(actorLabel)),
		),
	)
		.sort((left, right) => left.localeCompare(right, 'zh-TW'))
		.map((actorLabel) => ({ title: actorLabel, value: actorLabel })),
])
const auditRecords = computed(() =>
	filterAuditRecords(allAuditRecords.value, {
		keyword: auditKeyword.value,
		actorLabel: auditActorFilter.value,
		timeRange: auditTimeRangeFilter.value,
		now: notificationsStore.deliveryClock,
	}),
)
const hasAuditFilters = computed(
	() =>
		auditKeyword.value.trim().length > 0 ||
		auditActorFilter.value !== 'all' ||
		auditTimeRangeFilter.value !== 'all',
)

function firstQueryValue(value: unknown): string {
	if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
	return typeof value === 'string' ? value : ''
}

function normalizeTab(value: unknown): SystemRecordTab {
	const candidate = firstQueryValue(value)
	if (candidate === 'questions' || candidate === 'events' || candidate === 'audit') return candidate
	return isSystemAdmin.value ? 'questions' : 'events'
}

function loadQuestionRecords(): void {
	questionLoading.value = true
	questionLoadError.value = ''
	try {
		questionRecords.value = getAdminQuestionRecordsSnapshot()
	} catch {
		questionLoadError.value = '目前無法載入 AI 問答紀錄，請稍後重試。'
	} finally {
		questionLoading.value = false
	}
}

function questionSummary(question: string): string {
	return question.length > 80 ? `${question.slice(0, 80)}…` : question
}

/**
 * 組出以 requestId 篩選服務日誌的連結。
 * @param requestId 問答或稽核紀錄的 Request ID。
 * @returns 營運監控日誌查詢頁的路徑。
 */
function logQueryLink(requestId: string): string {
	return `/admin/monitoring?tab=logs&keyword=${encodeURIComponent(requestId)}`
}

function scopedDocumentLabel(record: AdminQuestionRecord): string {
	return record.scopedDocuments.length > 0 ? `限定 ${record.scopedDocuments.length} 份文件` : '未限定文件'
}

function resetQuestionFilters(): void {
	questionKeyword.value = ''
	questionUserFilter.value = 'all'
	questionDepartmentFilter.value = 'all'
	questionStatusFilter.value = 'all'
	questionTimeRangeFilter.value = 'all'
}

function resetEventFilters(): void {
	eventKeyword.value = ''
	categoryFilter.value = 'all'
	levelFilter.value = 'all'
	eventTimeRangeFilter.value = 'all'
}

function resetAuditFilters(): void {
	auditKeyword.value = ''
	auditActorFilter.value = 'all'
	auditTimeRangeFilter.value = 'all'
}

const eventCsvColumns: CsvColumn<SystemRecordEntry>[] = [
	{ label: '時間', value: (record) => formatNotificationTimestamp(record.occurredAt) },
	{ label: '類別', value: (record) => categoryMeta[record.category].label },
	{ label: '事件', value: (record) => record.title },
	{ label: '摘要', value: (record) => record.summary },
	{ label: '狀態', value: (record) => record.statusLabel },
	{ label: '詳情', value: (record) => (record.details ?? []).map((detail) => `${detail.label}：${detail.value}`).join('；') },
	{ label: 'Request ID', value: (record) => record.requestId ?? '' },
]
// ! 稽核匯出只帶欄位摘要，不得加入問題、回答或引用原文
const auditCsvColumns: CsvColumn<SystemRecordEntry>[] = [
	{ label: '操作時間', value: (record) => formatNotificationTimestamp(record.occurredAt) },
	{ label: '操作者', value: (record) => record.actorLabel ?? '' },
	{ label: '帳號', value: (record) => record.actorAccount ?? '' },
	{ label: '來源 IP', value: (record) => record.actorIp ?? '' },
	{ label: '操作項目', value: (record) => record.operationLabel ?? record.title },
	{ label: '操作代碼', value: (record) => record.operationScope ?? '' },
	{ label: '操作對象', value: (record) => record.resourceName ?? '' },
	{ label: '對象代碼', value: (record) => record.resourceLabel ?? record.sourceId ?? '' },
	{ label: '結果', value: (record) => record.statusLabel },
	{ label: 'Request ID', value: (record) => record.requestId ?? '' },
]

function exportEventRecords(): void {
	if (eventRecords.value.length === 0) return
	downloadCsvFile(buildCsvFileName('system-events'), toCsvContent(eventCsvColumns, eventRecords.value))
	assistantAuditStore.recordRecordExport({ scope: 'system_event.export', rowCount: eventRecords.value.length })
}

function exportAuditRecords(): void {
	if (auditRecords.value.length === 0) return
	const rowCount = auditRecords.value.length
	downloadCsvFile(buildCsvFileName('system-audit'), toCsvContent(auditCsvColumns, auditRecords.value))
	assistantAuditStore.recordRecordExport({ scope: 'audit_record.export', rowCount })
}

function changeTab(value: unknown): void {
	const nextTab = normalizeTab(value)
	if (nextTab === 'questions' && !isSystemAdmin.value) return
	if (nextTab === normalizeTab(route.query.tab)) return
	void router.replace({ query: { tab: nextTab } })
}

function showRouteMessage(message: string, type: 'warning' | 'error' = 'warning'): void {
	routeMessage.value = message
	routeMessageType.value = type
	routeMessageVisible.value = true
}

function createInspectionAudit(record: AdminQuestionRecord): void {
	assistantAuditStore.recordContentInspection({
		resourceId: record.id,
		operationScope: 'ai_question_content.inspect',
	})
}

function openQuestionRecord(record: AdminQuestionRecord): void {
	if (!isSystemAdmin.value) {
		showRouteMessage('只有系統管理員可以調閱完整 AI 問答內容。', 'error')
		return
	}
	selectedQuestion.value = record
	questionDrawerOpen.value = true
	createInspectionAudit(record)
}

function captureDrawerTrigger(questionId: string): void {
	drawerTriggerQuestionId.value = questionId
}

function selectConversationQuestion(record: AdminQuestionRecord): void {
	void router.replace({ query: { tab: 'questions', questionId: record.id } })
}

async function closeQuestionDrawer(updateRoute = true): Promise<void> {
	const triggerQuestionId = drawerTriggerQuestionId.value
	questionDrawerOpen.value = false
	selectedQuestion.value = null
	if (updateRoute && route.query.questionId) {
		await router.replace({ query: { tab: 'questions' } })
	}
	await nextTick()
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
	if (triggerQuestionId) {
		const trigger = document.querySelector<HTMLElement>(`[data-question-trigger-id="${triggerQuestionId}"]`)
		trigger?.focus()
	}
	drawerTriggerQuestionId.value = null
}

function handleDrawerModel(value: boolean): void {
	if (!value && questionDrawerOpen.value) void closeQuestionDrawer()
}

function handleEscapeKey(event: KeyboardEvent): void {
	if (event.key === 'Escape' && questionDrawerOpen.value) void closeQuestionDrawer()
}

function openAssistantSession(sessionId: string): void {
	void router.replace({ query: { tab: 'questions', assistantSessionId: sessionId } })
}

async function closeAssistantDetail(): Promise<void> {
	assistantDetailOpen.value = false
	const nextQuery = { ...route.query }
	delete nextQuery.assistantSessionId
	await router.replace({ query: nextQuery })
}

function handleAssistantDetailModel(value: boolean): void {
	if (!value) void closeAssistantDetail()
}

loadQuestionRecords()
onMounted(() => window.addEventListener('keydown', handleEscapeKey))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscapeKey))

watch(
	() => [route.query.tab, route.query.questionId, appStore.adminRole] as const,
	async ([tabQuery, questionIdQuery]) => {
		const nextTab = normalizeTab(tabQuery)
		const questionId = firstQueryValue(questionIdQuery).trim()

		if (nextTab === 'questions' && !isSystemAdmin.value) {
			activeTab.value = 'events'
			await closeQuestionDrawer(false)
			showRouteMessage('只有系統管理員可以查看 AI 問答紀錄，已改為顯示系統事件。', 'error')
			await router.replace({ query: { tab: 'events' } })
			return
		}

		activeTab.value = nextTab
		if (nextTab !== 'questions' || !questionId) {
			if (questionDrawerOpen.value) void closeQuestionDrawer(false)
			return
		}

		const record = questionRecords.value.find((item) => item.id === questionId)
		if (!record) {
			void closeQuestionDrawer(false)
			showRouteMessage(`找不到 Question ID「${questionId}」的紀錄。`)
			return
		}

		questionView.value = record.source === 'mail' ? 'mail' : 'answers'
		if (selectedQuestion.value?.id !== record.id || !questionDrawerOpen.value) {
			openQuestionRecord(record)
		}
	},
	{ immediate: true },
)

watch(
	() => [route.query.assistantSessionId, appStore.adminRole] as const,
	async ([value]) => {
		const sessionId = firstQueryValue(value).trim()
		if (!sessionId) {
			assistantDetailOpen.value = false
			return
		}
		if (!isSystemAdmin.value) {
			assistantDetailOpen.value = false
			showRouteMessage('只有系統管理員可以調閱小幫手對話內容，已改為顯示系統事件。', 'error')
			const nextQuery = { ...route.query, tab: 'events' }
			Reflect.deleteProperty(nextQuery, 'assistantSessionId')
			await router.replace({ query: nextQuery })
			return
		}
		if (!selectedAssistantSession.value) {
			assistantDetailOpen.value = false
			showRouteMessage(`找不到小幫手 Session ID「${sessionId}」的紀錄。`)
			return
		}
		activeTab.value = 'questions'
		questionView.value = 'assistant'
		assistantDetailOpen.value = true
		// > 舊連結可能帶 tab=events，校正網址讓分頁與畫面一致
		if (firstQueryValue(route.query.tab) !== 'questions') {
			void router.replace({ query: { ...route.query, tab: 'questions' } })
		}
		assistantAuditStore.recordContentInspection({
			resourceId: sessionId,
			operationScope: 'admin_assistant_content.inspect',
		})
	},
	{ immediate: true },
)
</script>

<template>
	<div class="page-shell">
		<PageHeader
			eyebrow="營運與治理"
			title="系統紀錄"
			description="追溯 AI 問答、系統事件與管理操作；技術診斷日誌請至營運監控。"
		/>

		<VAlert
			v-if="routeMessageVisible"
			v-model="routeMessageVisible"
			:type="routeMessageType"
			variant="tonal"
			closable
			class="mb-5"
			data-testid="system-record-route-message"
		>
			{{ routeMessage }}
		</VAlert>

		<VTabs :model-value="activeTab" show-arrows class="mb-5" @update:model-value="changeTab">
			<VTab v-if="isSystemAdmin" value="questions">AI 問答紀錄</VTab>
			<VTab value="events">系統事件</VTab>
			<VTab value="audit">操作稽核</VTab>
		</VTabs>

		<VWindow v-model="activeTab">
			<VWindowItem v-if="isSystemAdmin" value="questions">
				<VBtnToggle
					v-model="questionView"
					mandatory
					density="comfortable"
					variant="outlined"
					divided
					class="mb-5"
					data-testid="question-view-toggle"
				>
					<VBtn value="answers" prepend-icon="mdi-message-text-outline">前台 AI 問答</VBtn>
					<VBtn value="assistant" prepend-icon="mdi-robot-outline">
						後台小幫手對話
					</VBtn>
					<VBtn value="mail" prepend-icon="mdi-email-fast-outline" data-testid="question-view-mail">
						自動回信
					</VBtn>
				</VBtnToggle>

				<template v-if="questionView === 'answers' || questionView === 'mail'">
				<VAlert type="info" variant="tonal" class="mb-5">
					<template v-if="questionView === 'mail'">
						每一列是機器人為一封來信走的問答。信件內容、寄送結果與回信統計請到
						<RouterLink to="/admin/mail-bot" class="font-weight-bold">自動回信</RouterLink>。<br />
					</template>
					每一列代表一次問答。開啟完整內容會留下調閱稽核，但稽核不會記錄問題、回答或引用原文。
				</VAlert>

				<div class="question-filters mb-5">
					<FilterSearchField
						v-model="questionKeyword"
						label="搜尋問答紀錄"
						placeholder="問題、回答、姓名、Email 或 Request ID"
					/>
					<VSelect v-model="questionUserFilter" :items="questionUserOptions" :label="questionView === 'mail' ? '寄件者' : '使用者'" hide-details />
					<VSelect
						v-model="questionDepartmentFilter"
						:items="questionDepartmentOptions"
						label="部門"
						hide-details
					/>
					<VSelect v-model="questionStatusFilter" :items="questionStatusOptions" label="狀態" hide-details />
					<VSelect
						v-model="questionTimeRangeFilter"
						:items="timeRangeOptions"
						label="時間範圍"
						hide-details
					/>
				</div>

				<VSkeletonLoader v-if="questionLoading" type="table-heading, table-row@5" />
				<StatePanel
					v-else-if="questionLoadError"
					icon="mdi-cloud-alert-outline"
					title="問答紀錄載入失敗"
					:description="questionLoadError"
					action-label="重新載入"
					@action="loadQuestionRecords"
				/>
				<VCard
					v-else-if="filteredQuestionRecords.length > 0"
					class="surface-border overflow-hidden"
					data-testid="admin-question-table"
				>
					<VDataTable
						:headers="questionHeaders"
						:items="filteredQuestionRecords"
						:items-per-page="ITEMS_PER_PAGE"
						:items-per-page-options="itemsPerPageOptions"
						:sort-by="questionSortBy"
						item-value="id"
						hover
					>
						<template #item.askedAt="{ item }">
							{{ formatNotificationTimestamp(item.askedAt) }}
						</template>
						<template #item.userName="{ item }">
							<div class="py-2">
								<p class="font-weight-bold">{{ item.userName }}</p>
								<p class="text-caption text-medium-emphasis">{{ item.userEmail }}</p>
								<p class="text-caption text-medium-emphasis">{{ item.department }}</p>
							</div>
						</template>
						<template #item.question="{ item }">
							<p class="question-summary py-2">{{ questionSummary(item.question) }}</p>
						</template>
						<template #item.knowledgeScopeLabel="{ item }">
							<div class="py-2">
								<p>{{ item.knowledgeScopeLabel }}</p>
								<p class="text-caption text-medium-emphasis mt-1">{{ item.modelLabel }}</p>
								<VChip
									v-if="item.source !== 'mail'"
									:color="item.scopedDocuments.length > 0 ? 'primary' : undefined"
									:prepend-icon="item.scopedDocuments.length > 0 ? 'mdi-file-check-outline' : 'mdi-earth'"
									size="x-small"
									variant="tonal"
									class="mt-2"
									:data-scoped-documents="item.scopedDocuments.length"
								>
									{{ scopedDocumentLabel(item) }}
								</VChip>
							</div>
						</template>
						<template #item.status="{ item }">
							<VChip :color="statusMeta[item.status].color" size="small" variant="tonal">
								{{ statusMeta[item.status].label }}
							</VChip>
						</template>
						<template #item.durationMs="{ item }">{{ formatDuration(item.durationMs) }}</template>
						<template #item.tokenUsage.totalTokens="{ item }">
							<span class="tabular" data-testid="question-token-total">
								{{ formatNumber(item.tokenUsage?.totalTokens) }}
							</span>
						</template>
						<template #item.actions="{ item }">
							<VBtn
								:to="{ path: '/admin/logs', query: { tab: 'questions', questionId: item.id } }"
								:data-question-trigger-id="item.id"
								variant="text"
								size="small"
								@click.capture="captureDrawerTrigger(item.id)"
							>
								查看詳情
							</VBtn>
						</template>
					</VDataTable>
				</VCard>
				<StatePanel
					v-else
					icon="mdi-message-question-outline"
					:title="hasQuestionFilters ? '找不到符合條件的問答' : '目前沒有 AI 問答紀錄'"
					:description="hasQuestionFilters ? '請調整搜尋字詞或篩選條件。' : '有問答產生後會顯示在這裡。'"
					:action-label="hasQuestionFilters ? '清除篩選' : undefined"
					@action="resetQuestionFilters"
				/>
				</template>

				<template v-else>
					<VAlert type="info" variant="tonal" class="mb-5">
						管理者在後台使用 AI 小幫手的對話。清單只列對話摘要；開啟完整內容會留下調閱稽核。
						此紀錄目前僅保存在本瀏覽器頁籤，關閉後即清除。
					</VAlert>
					<VCard
						v-if="assistantSessions.length > 0"
						class="surface-border overflow-hidden"
						data-testid="assistant-session-table"
					>
						<VDataTable
							:headers="assistantHeaders"
							:items="assistantSessions"
							:items-per-page="ITEMS_PER_PAGE"
							:items-per-page-options="itemsPerPageOptions"
							:sort-by="assistantSortBy"
							item-value="id"
							hover
						>
							<template #item.startedAt="{ item }">{{ formatNotificationTimestamp(item.startedAt) }}</template>
							<template #item.userName="{ item }">
								<div class="py-2">
									<p class="font-weight-bold">{{ item.userName }}</p>
									<p class="text-caption text-medium-emphasis">{{ item.department }}</p>
								</div>
							</template>
							<template #item.status="{ item }">{{ assistantSessionStatusLabel(item) }}</template>
							<template #item.endReason="{ item }">{{ assistantSessionEndReasonLabel(item) }}</template>
							<template #item.actions="{ item }">
								<VBtn variant="text" size="small" @click="openAssistantSession(item.id)">查看對話</VBtn>
							</template>
						</VDataTable>
					</VCard>
					<StatePanel
						v-else
						icon="mdi-robot-off-outline"
						title="目前沒有小幫手對話紀錄"
						description="管理者在後台開啟 AI 小幫手並提問後，對話摘要會出現在這裡。"
					/>
				</template>
			</VWindowItem>

			<VWindowItem value="events">
				<VAlert type="info" variant="tonal" class="mb-5">
					系統事件只收登入登出與排程工作，點選列尾的箭頭可展開詳情。
					通知請至「通知管理 → 發送紀錄」，告警請至「營運監控 → 告警紀錄」，服務原始日誌請至「營運監控 → 日誌查詢」。
				</VAlert>
				<div class="event-filters mb-5">
					<FilterSearchField
						v-model="eventKeyword"
						label="搜尋系統事件"
						placeholder="事件、帳號、IP 或排程名稱"
					/>
					<VSelect v-model="categoryFilter" :items="categoryOptions" label="事件類別" hide-details />
					<VSelect v-model="levelFilter" :items="levelOptions" label="等級" hide-details />
					<VSelect v-model="eventTimeRangeFilter" :items="timeRangeOptions" label="時間範圍" hide-details />
				</div>
				<div class="records-toolbar mb-3">
					<p class="text-caption text-medium-emphasis">共 {{ eventRecords.length }} 筆符合條件</p>
					<VBtn
						:disabled="eventRecords.length === 0"
						prepend-icon="mdi-tray-arrow-down"
						variant="tonal"
						size="small"
						data-testid="export-system-events"
						@click="exportEventRecords"
					>
						匯出 CSV
					</VBtn>
				</div>
				<VCard
					v-if="eventRecords.length > 0"
					class="surface-border overflow-hidden"
					data-testid="system-event-table"
				>
					<VDataTable
						:headers="eventHeaders"
						:items="eventRecords"
						:items-per-page="ITEMS_PER_PAGE"
						:items-per-page-options="itemsPerPageOptions"
						:sort-by="eventSortBy"
						item-value="id"
						show-expand
						hover
					>
						<template #item.occurredAt="{ item }">
							{{ formatNotificationTimestamp(item.occurredAt) }}
						</template>
						<template #item.category="{ item }">
							<VChip
								:color="systemRecordCategoryPalette[appStore.themeMode][item.category]"
								size="small"
								variant="tonal"
								:data-event-category="item.category"
							>
								<VIcon :icon="categoryMeta[item.category].icon" start size="18" aria-hidden="true" />
								{{ categoryMeta[item.category].label }}
							</VChip>
						</template>
						<template #item.title="{ item }">
							<div class="py-2">
								<p class="font-weight-bold">{{ item.title }}</p>
								<p class="text-caption text-medium-emphasis mt-1">{{ item.summary }}</p>
							</div>
						</template>
						<template #item.statusLabel="{ item }">
							<VChip :color="levelMeta[item.level].color" size="small" variant="outlined">
								{{ item.statusLabel }}
							</VChip>
						</template>
						<template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
							<VBtn
								:icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
								:aria-label="`${isExpanded(internalItem) ? '收合' : '展開'}「${internalItem.raw.title}」詳情`"
								:aria-expanded="isExpanded(internalItem)"
								variant="text"
								size="small"
								@click="toggleExpand(internalItem)"
							/>
						</template>
						<template #expanded-row="{ columns, item }">
							<tr class="expanded-detail-row">
								<td :colspan="columns.length">
									<dl class="event-detail" data-testid="system-event-detail">
										<div v-for="detail in item.details ?? []" :key="detail.label">
											<dt>{{ detail.label }}</dt>
											<dd>{{ detail.value }}</dd>
										</div>
										<div v-if="item.requestId">
											<dt>Request ID</dt>
											<dd>
												<VBtn
													:to="logQueryLink(item.requestId)"
													variant="text"
													size="small"
													class="request-id-link"
													append-icon="mdi-open-in-new"
												>
													{{ item.requestId }}
												</VBtn>
											</dd>
										</div>
										<p v-if="!item.details?.length && !item.requestId" class="text-medium-emphasis">
											這筆事件沒有額外詳情。
										</p>
									</dl>
								</td>
							</tr>
						</template>
					</VDataTable>
				</VCard>
				<StatePanel
					v-else
					icon="mdi-text-search"
					title="找不到符合條件的系統事件"
					description="請調整搜尋字詞或篩選條件。"
					action-label="清除所有篩選"
					@action="resetEventFilters"
				/>
			</VWindowItem>

			<VWindowItem value="audit">
				<VAlert type="info" variant="tonal" class="mb-5">
					記錄受管制的特權操作，包含操作者帳號與來源 IP、操作項目、操作對象與結果，不保存被調閱的內容。
					各 API 呼叫的逐筆結果屬於服務日誌，點選 Request ID 可查看該次請求的完整日誌。
				</VAlert>
				<div class="audit-filters mb-5">
					<FilterSearchField
						v-model="auditKeyword"
						label="搜尋操作稽核"
						placeholder="操作者、資源、操作範圍、Request ID 或狀態"
					/>
					<VSelect v-model="auditActorFilter" :items="auditActorOptions" label="操作者" hide-details />
					<VSelect v-model="auditTimeRangeFilter" :items="timeRangeOptions" label="時間範圍" hide-details />
				</div>
				<div class="records-toolbar mb-3">
					<p class="text-caption text-medium-emphasis">共 {{ auditRecords.length }} 筆符合條件</p>
					<VBtn
						:disabled="auditRecords.length === 0"
						prepend-icon="mdi-tray-arrow-down"
						variant="tonal"
						size="small"
						data-testid="export-audit-records"
						@click="exportAuditRecords"
					>
						匯出 CSV
					</VBtn>
				</div>
				<VCard v-if="auditRecords.length > 0" class="surface-border overflow-hidden" data-testid="audit-record-table">
					<VDataTable
						:headers="auditHeaders"
						:items="auditRecords"
						:items-per-page="ITEMS_PER_PAGE"
						:items-per-page-options="itemsPerPageOptions"
						:sort-by="auditSortBy"
						item-value="id"
						hover
					>
						<template #item.occurredAt="{ item }">
							{{ formatNotificationTimestamp(item.occurredAt) }}
						</template>
						<template #item.actorLabel="{ item }">
							<div class="py-2">
								<p class="font-weight-bold">{{ item.actorLabel ?? '—' }}</p>
								<p v-if="item.actorAccount" class="text-caption text-medium-emphasis">{{ item.actorAccount }}</p>
								<p v-if="item.actorIp" class="text-caption text-medium-emphasis">來源 IP {{ item.actorIp }}</p>
							</div>
						</template>
						<template #item.operationLabel="{ item }">
							<div class="py-2">
								<p class="font-weight-medium">{{ item.operationLabel ?? item.title }}</p>
								<p v-if="item.operationScope" class="text-caption text-medium-emphasis mono-hint">
									{{ item.operationScope }}
								</p>
							</div>
						</template>
						<template #item.resourceName="{ item }">
							<div class="py-2">
								<p>{{ item.resourceName ?? item.resourceLabel ?? item.sourceId ?? '—' }}</p>
								<p v-if="item.resourceLabel" class="text-caption text-medium-emphasis mono-hint">
									{{ item.resourceLabel }}
								</p>
							</div>
						</template>
						<template #item.requestId="{ item }">
							<VBtn
								v-if="item.requestId"
								:to="logQueryLink(item.requestId)"
								variant="text"
								size="small"
								class="request-id-link"
								append-icon="mdi-open-in-new"
								data-testid="audit-request-id-link"
							>
								{{ item.requestId }}
							</VBtn>
							<span v-else class="text-caption text-medium-emphasis">—</span>
						</template>
						<template #item.statusLabel="{ item }">
							<VChip :color="levelMeta[item.level].color" size="small" variant="outlined">
								{{ item.statusLabel }}
							</VChip>
						</template>
					</VDataTable>
				</VCard>
				<StatePanel
					v-else
					icon="mdi-clipboard-text-search-outline"
					:title="hasAuditFilters ? '找不到符合條件的操作稽核' : '目前沒有操作稽核'"
					:description="
						hasAuditFilters ? '請調整搜尋字詞或篩選條件。' : '管理者執行受控操作後，稽核紀錄會顯示在這裡。'
					"
					:action-label="hasAuditFilters ? '清除篩選' : undefined"
					@action="resetAuditFilters"
				/>
			</VWindowItem>
		</VWindow>

		<VNavigationDrawer
			:model-value="questionDrawerOpen"
			location="end"
			temporary
			disable-route-watcher
			:width="640"
			class="question-drawer"
			data-testid="admin-question-drawer"
			@update:model-value="handleDrawerModel"
		>
			<template v-if="selectedQuestion">
				<div class="drawer-header px-5 py-4">
					<div>
						<p class="drawer-kicker text-overline font-weight-bold">AI 問答詳情</p>
						<h2 class="text-h6">{{ selectedQuestion.userName }}的提問</h2>
					</div>
					<VBtn icon="mdi-close" variant="text" aria-label="關閉問答詳情" @click="closeQuestionDrawer()" />
				</div>

				<div class="drawer-content pa-5">
					<div class="detail-grid mb-6">
						<div><span>提問時間</span><strong>{{ formatNotificationTimestamp(selectedQuestion.askedAt) }}</strong></div>
						<div><span>使用者</span><strong>{{ selectedQuestion.userEmail }}</strong></div>
						<div><span>部門</span><strong>{{ selectedQuestion.department }}</strong></div>
						<div>
							<span>來源</span>
							<strong v-if="selectedQuestion.source === 'mail' && selectedQuestion.mailId">
								自動回信 ·
								<RouterLink :to="{ path: '/admin/mail-bot', query: { mail: selectedQuestion.mailId } }" data-testid="question-mail-link">查看原始信件</RouterLink>
							</strong>
							<strong v-else>前台提問</strong>
						</div>
						<div><span>狀態</span><strong>{{ statusMeta[selectedQuestion.status].label }}</strong></div>
						<div><span>知識範圍</span><strong>{{ selectedQuestion.knowledgeScopeLabel }}</strong></div>
						<div><span>模型</span><strong>{{ selectedQuestion.modelLabel }}</strong></div>
						<div><span>限定文件</span><strong>{{ scopedDocumentLabel(selectedQuestion) }}</strong></div>
						<div>
							<span>Tokens</span>
							<strong>{{ formatNumber(selectedQuestion.tokenUsage?.totalTokens) }}</strong>
						</div>
					</div>

					<section v-if="selectedQuestion.scopedDocuments.length > 0" class="detail-section">
						<h3>限定文件</h3>
						<p class="text-caption text-medium-emphasis mb-2">
							這次提問只在以下文件範圍內檢索；答案不完整時請先確認範圍是否過窄。
						</p>
						<div class="scoped-document-list" data-testid="question-scoped-documents">
							<VChip
								v-for="document in selectedQuestion.scopedDocuments"
								:key="document.id"
								:to="`/admin/documents/${document.id}/manage`"
								prepend-icon="mdi-file-document-outline"
								size="small"
								variant="outlined"
							>
								{{ document.title }}
							</VChip>
						</div>
					</section>

					<section v-if="selectedQuestion.tokenUsage" class="detail-section">
						<h3>Token 用量</h3>
						<dl class="token-usage" data-testid="question-token-usage">
							<div><dt>提問（prompt）</dt><dd>{{ formatNumber(selectedQuestion.tokenUsage.promptTokens) }}</dd></div>
							<div><dt>回答（completion）</dt><dd>{{ formatNumber(selectedQuestion.tokenUsage.completionTokens) }}</dd></div>
							<div><dt>向量化（embedding）</dt><dd>{{ formatNumber(selectedQuestion.tokenUsage.embeddingTokens) }}</dd></div>
							<div><dt>合計</dt><dd class="font-weight-bold">{{ formatNumber(selectedQuestion.tokenUsage.totalTokens) }}</dd></div>
						</dl>
					</section>

					<section class="detail-section">
						<h3>完整問題</h3>
						<p class="content-block">{{ selectedQuestion.question }}</p>
					</section>
					<section class="detail-section">
						<h3>完整回答</h3>
						<p class="content-block">{{ selectedQuestion.answer || '此筆失敗紀錄沒有回答內容。' }}</p>
					</section>

					<section class="detail-section">
						<h3>引用來源</h3>
						<div v-if="selectedQuestion.citations.length > 0" class="citation-list">
							<VCard v-for="citation in selectedQuestion.citations" :key="citation.id" variant="outlined" class="pa-4">
								<p class="font-weight-bold">{{ citation.title }}</p>
								<p class="text-caption text-medium-emphasis mt-1">{{ citation.section }}</p>
								<p class="content-block mt-3">{{ citation.excerpt }}</p>
							</VCard>
						</div>
						<p v-else class="text-medium-emphasis">此筆問答沒有引用來源。</p>
					</section>

					<section class="detail-section">
						<h3>回答處理階段</h3>
						<div v-if="selectedQuestion.trace" class="trace-list">
							<div v-for="stage in selectedQuestion.trace.stages" :key="stage.id" class="trace-row">
								<VIcon icon="mdi-check-circle-outline" color="success" size="20" aria-hidden="true" />
								<div>
									<p class="font-weight-medium">{{ stage.label }} · {{ formatDuration(stage.elapsedMs) }}</p>
									<p v-if="stage.modelLabel" class="text-caption text-medium-emphasis">
										{{ stage.modelLabel }} · {{ formatNumber(stage.tokens) }} tokens
									</p>
									<p class="text-caption text-medium-emphasis">{{ stage.detail }}</p>
								</div>
							</div>
							<p class="text-caption text-medium-emphasis mt-3">總耗時 {{ formatDuration(selectedQuestion.durationMs) }}</p>
						</div>
						<p v-else class="text-medium-emphasis">此筆問答沒有處理軌跡。</p>
					</section>

					<section v-if="conversationQuestions.length > 1" class="detail-section">
						<h3>同一對話的其他問答</h3>
						<VList class="conversation-list" lines="two">
							<VListItem
								v-for="record in conversationQuestions"
								:key="record.id"
								:title="questionSummary(record.question)"
								:subtitle="formatNotificationTimestamp(record.askedAt)"
								:active="record.id === selectedQuestion.id"
								@click="selectConversationQuestion(record)"
							/>
						</VList>
					</section>

					<section class="detail-section identifiers">
						<h3>識別資訊</h3>
						<dl>
							<div><dt>Conversation ID</dt><dd>{{ selectedQuestion.conversationId }}</dd></div>
							<div><dt>Question ID</dt><dd>{{ selectedQuestion.id }}</dd></div>
							<div>
								<dt>Request ID</dt>
								<dd>
									<VBtn
										:to="logQueryLink(selectedQuestion.requestId)"
										variant="text"
										size="small"
										class="request-id-link"
										append-icon="mdi-open-in-new"
										data-testid="question-request-id-link"
									>
										{{ selectedQuestion.requestId }}
									</VBtn>
									<span class="text-caption text-medium-emphasis d-block">在營運監控查這次請求的完整日誌</span>
								</dd>
							</div>
						</dl>
					</section>
				</div>
			</template>
		</VNavigationDrawer>

		<VDialog
			:model-value="assistantDetailOpen"
			max-width="760"
			scrollable
			data-testid="assistant-audit-detail"
			@update:model-value="handleAssistantDetailModel"
		>
			<VCard v-if="selectedAssistantSession">
				<VCardTitle class="assistant-detail-header">
					<div>
						<p class="text-overline text-medium-emphasis">後台 AI 小幫手對話</p>
						<h2 class="text-h6">{{ selectedAssistantSession.userName }}的短效 Session</h2>
					</div>
					<VBtn icon="mdi-close" variant="text" aria-label="關閉小幫手稽核詳情" @click="closeAssistantDetail" />
				</VCardTitle>
				<VCardText>
					<VAlert type="info" variant="tonal" density="compact" class="mb-5">
						此紀錄僅保存在目前瀏覽器頁籤；明確的密碼、API Key 與 Token 已強制遮蔽。
					</VAlert>
					<div class="detail-grid mb-6">
						<div><span>Session ID</span><strong>{{ selectedAssistantSession.id }}</strong></div>
						<div><span>使用者</span><strong>{{ selectedAssistantSession.userName }} · {{ selectedAssistantSession.department }}</strong></div>
						<div><span>開始時間</span><strong>{{ formatNotificationTimestamp(selectedAssistantSession.startedAt) }}</strong></div>
						<div><span>結束時間</span><strong>{{ selectedAssistantSession.endedAt ? formatNotificationTimestamp(selectedAssistantSession.endedAt) : '進行中' }}</strong></div>
						<div><span>狀態</span><strong>{{ assistantSessionStatusLabel(selectedAssistantSession) }}</strong></div>
						<div><span>結束原因</span><strong>{{ assistantSessionEndReasonLabel(selectedAssistantSession) }}</strong></div>
						<div><span>模型</span><strong>{{ selectedAssistantSession.modelLabel }}</strong></div>
						<div><span>總耗時</span><strong>{{ formatDuration(selectedAssistantSession.durationMs) }}</strong></div>
					</div>

					<section class="detail-section">
						<h3>完整問答</h3>
						<div class="assistant-audit-messages">
							<article v-for="message in selectedAssistantSession.messages" :key="message.id" class="assistant-audit-message">
								<div class="assistant-audit-message-meta">
									<VChip :color="message.role === 'user' ? 'primary' : 'secondary'" size="small" variant="tonal">
										{{ message.role === 'user' ? '使用者提問' : 'AI 回答' }}
									</VChip>
									<span>{{ formatNotificationTimestamp(message.createdAt) }}</span>
								</div>
								<p class="content-block">{{ message.content }}</p>
								<dl class="assistant-message-context">
									<div><dt>後台頁面</dt><dd>{{ message.pageTitle }}（{{ message.routePath }}）</dd></div>
									<div><dt>知識來源</dt><dd>{{ message.sourceLabel }} · {{ message.sourceKind }}</dd></div>
									<div><dt>網路搜尋</dt><dd>{{ message.webSearchEnabled ? '啟用' : '停用' }}</dd></div>
									<div><dt>Request ID</dt><dd>{{ message.requestId }}</dd></div>
								</dl>
								<VAlert v-if="message.redactedFields.length" type="warning" variant="tonal" density="compact" class="mt-3">
									已遮蔽：{{ message.redactedFields.join('、') }}
								</VAlert>
							</article>
						</div>
					</section>
				</VCardText>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.question-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(4, minmax(150px, 0.65fr));
	gap: var(--space-sm);
}

.event-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(150px, 0.65fr));
	gap: var(--space-sm);
}

.audit-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(2, minmax(150px, 0.65fr));
	gap: var(--space-sm);
}

.expanded-detail-row td {
	background: rgb(var(--v-theme-surface-variant), 0.35);
}

.event-detail {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-sm) var(--space-lg);
	padding: var(--space-md) var(--space-sm);
}

.event-detail div {
	display: grid;
	gap: 2px;
}

.event-detail dt {
	font-size: 0.75rem;
	color: rgb(var(--v-theme-on-surface-variant));
}

.event-detail dd {
	overflow-wrap: anywhere;
}

.mono-hint {
	font-family: var(--font-mono);
	font-size: 0.72rem;
}

.request-id-link {
	padding-inline: 4px;
	font-family: var(--font-mono);
	font-size: 0.78rem;
	text-transform: none;
}

.scoped-document-list {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-xs);
}

.token-usage {
	display: grid;
	gap: 6px;
}

.token-usage div {
	display: grid;
	grid-template-columns: 200px minmax(0, 1fr);
	gap: var(--space-sm);
}

.token-usage dt {
	color: rgb(var(--v-theme-on-surface-variant));
	font-size: 0.8rem;
}

.token-usage dd {
	font-variant-numeric: tabular-nums;
}

.records-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
}

:deep(.v-data-table table) {
	min-width: 920px;
}

.question-summary,
.content-block {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.drawer-header {
	position: sticky;
	top: 0;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
	background: rgb(var(--v-theme-surface));
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.drawer-content {
	padding-bottom: 48px !important;
}

.detail-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-sm);
}

.detail-grid div {
	display: grid;
	gap: 4px;
}

.detail-grid span,
.identifiers dt {
	font-size: 0.75rem;
	font-weight: 600;
	color: rgb(var(--v-theme-on-surface));
}

.drawer-kicker {
	color: rgb(var(--v-theme-on-surface));
}

.detail-section + .detail-section {
	margin-top: 28px;
}

.detail-section h3 {
	margin-bottom: 10px;
	font-size: 0.95rem;
}

.citation-list,
.trace-list,
.identifiers dl {
	display: grid;
	gap: var(--space-sm);
}

.trace-row {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 10px;
}

.conversation-list {
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 12px;
}

.identifiers dl div {
	display: grid;
	grid-template-columns: 140px minmax(0, 1fr);
	gap: var(--space-sm);
}

.identifiers dd {
	overflow-wrap: anywhere;
}

.assistant-detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
	padding: 18px 24px;
}

.assistant-audit-messages {
	display: grid;
	gap: var(--space-md);
}

.assistant-audit-message {
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 12px;
}

.assistant-audit-message-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
	margin-bottom: var(--space-sm);
	color: rgb(var(--v-theme-on-surface-variant));
	font-size: 0.75rem;
}

.assistant-message-context {
	display: grid;
	gap: 6px;
	margin-top: var(--space-sm);
	font-size: 0.78rem;
}

.assistant-message-context div {
	display: grid;
	grid-template-columns: 88px minmax(0, 1fr);
	gap: var(--space-sm);
}

.assistant-message-context dt {
	color: rgb(var(--v-theme-on-surface-variant));
}

.assistant-message-context dd {
	overflow-wrap: anywhere;
}

@media (max-width: 1100px) {
	.question-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 900px) {
	.event-filters,
	.audit-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.question-filters,
	.event-filters,
	.audit-filters,
	.event-detail,
	.detail-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.identifiers dl div {
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
	}
}
</style>
