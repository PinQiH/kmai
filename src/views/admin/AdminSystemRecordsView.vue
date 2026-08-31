<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { baseSystemRecords } from '@/mocks/systemRecords'
import { getAdminQuestionRecordsSnapshot } from '@/repositories/adminQuestions.repository'
import { useAppStore } from '@/stores/app'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useMonitoringStore } from '@/stores/monitoring'
import { useNotificationsStore } from '@/stores/notifications'
import type {
	AdminQuestionRecord,
	AdminQuestionRecordStatus,
	AssistantAuditSession,
	SystemRecordCategory,
	SystemRecordLevel,
} from '@/types'
import { formatNotificationTimestamp } from '@/utils/notifications'
import {
	buildSystemRecords,
	filterAdminQuestionRecords,
	getSystemRecordTimeCutoff,
	type SystemRecordTimeRange,
} from '@/utils/systemRecords'

type SystemRecordTab = 'questions' | 'events' | 'audit'
type CategoryFilter = SystemRecordCategory | 'all'
type LevelFilter = SystemRecordLevel | 'all'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const assistantAuditStore = useAssistantAuditStore()
const notificationsStore = useNotificationsStore()
const monitoringStore = useMonitoringStore()

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

const questionKeyword = ref('')
const questionUserFilter = ref('all')
const questionDepartmentFilter = ref('all')
const questionStatusFilter = ref<AdminQuestionRecordStatus | 'all'>('all')
const questionTimeRangeFilter = ref<SystemRecordTimeRange>('all')

const eventKeyword = ref('')
const categoryFilter = ref<CategoryFilter>('all')
const levelFilter = ref<LevelFilter>('all')
const eventTimeRangeFilter = ref<SystemRecordTimeRange>('all')

const categoryMeta: Record<SystemRecordCategory, { label: string; color: string; icon: string }> = {
	auth: { label: '登入登出', color: 'primary', icon: 'mdi-login-variant' },
	ai: { label: 'AI 問答', color: 'secondary', icon: 'mdi-creation-outline' },
	job: { label: '排程工作', color: 'info', icon: 'mdi-calendar-clock-outline' },
	audit: { label: '操作稽核', color: 'deep-orange', icon: 'mdi-clipboard-text-search-outline' },
	notification: { label: '通知', color: 'primary', icon: 'mdi-bell-outline' },
	alert: { label: '告警', color: 'error', icon: 'mdi-alert-outline' },
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
	...Object.entries(categoryMeta)
		.filter(([value]) => value !== 'audit')
		.map(([value, meta]) => ({ title: meta.label, value })),
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
const questionHeaders = [
	{ title: '提問時間', key: 'askedAt', width: 180 },
	{ title: '使用者', key: 'userName', width: 210 },
	{ title: '問題摘要', key: 'question', minWidth: 320 },
	{ title: '知識範圍／模型', key: 'knowledgeScopeLabel', width: 220 },
	{ title: '狀態', key: 'status', width: 100 },
	{ title: '耗時', key: 'durationMs', width: 100 },
	{ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 110 },
]
const eventHeaders = [
	{ title: '時間', key: 'occurredAt', width: 180 },
	{ title: '類別', key: 'category', width: 130 },
	{ title: '事件', key: 'title', minWidth: 320 },
	{ title: '狀態', key: 'statusLabel', width: 110 },
	{ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 100 },
]
const auditHeaders = [
	{ title: '調閱時間', key: 'occurredAt', width: 180 },
	{ title: '操作者', key: 'actorLabel', width: 180 },
	{ title: '資源', key: 'resourceLabel', width: 170 },
	{ title: '操作範圍', key: 'operationScope', minWidth: 240 },
	{ title: 'Request ID', key: 'requestId', width: 220 },
	{ title: '狀態', key: 'statusLabel', width: 100 },
]

const questionUserOptions = computed(() => [
	{ title: '全部使用者', value: 'all' },
	...Array.from(
		new Map(
			questionRecords.value.map((record) => [
				record.userId,
				{ title: `${record.userName}（${record.userEmail}）`, value: record.userId },
			]),
		).values(),
	),
])
const questionDepartmentOptions = computed(() => [
	{ title: '全部部門', value: 'all' },
	...Array.from(new Set(questionRecords.value.map((record) => record.department)))
		.sort((left, right) => left.localeCompare(right, 'zh-TW'))
		.map((department) => ({ title: department, value: department })),
])
const filteredQuestionRecords = computed(() =>
	filterAdminQuestionRecords(questionRecords.value, {
		keyword: questionKeyword.value,
		userId: questionUserFilter.value,
		department: questionDepartmentFilter.value,
		status: questionStatusFilter.value,
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

const allSystemRecords = computed(() =>
	buildSystemRecords(
		baseSystemRecords,
		notificationsStore.notifications,
		monitoringStore.events,
		new Date(notificationsStore.deliveryClock),
		assistantAuditStore.sessions,
	),
)
const eventRecords = computed(() => {
	const normalizedKeyword = eventKeyword.value.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(eventTimeRangeFilter.value, notificationsStore.deliveryClock)

	return allSystemRecords.value.filter((record) => {
		if (record.category === 'audit') return false
		const matchesCategory = categoryFilter.value === 'all' || record.category === categoryFilter.value
		const matchesLevel = levelFilter.value === 'all' || record.level === levelFilter.value
		const matchesTime = Date.parse(record.occurredAt) >= cutoff
		const searchableText = `${record.title} ${record.summary} ${record.statusLabel}`.toLocaleLowerCase('zh-TW')
		return matchesCategory && matchesLevel && matchesTime && (!normalizedKeyword || searchableText.includes(normalizedKeyword))
	})
})
const auditRecords = computed(() =>
	[
		...assistantAuditStore.inspectionRecords,
		...allSystemRecords.value.filter((record) => record.category === 'audit'),
	].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)),
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

function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${durationMs} ms`
	return `${(durationMs / 1000).toFixed(1)} 秒`
}

function questionSummary(question: string): string {
	return question.length > 80 ? `${question.slice(0, 80)}…` : question
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

function assistantEndReasonLabel(session: AssistantAuditSession): string {
	if (session.endReason === 'manual_end') return '手動結束'
	if (session.endReason === 'idle_timeout') return '閒置逾時'
	if (session.endReason === 'leave_admin') return '離開管理後台'
	if (session.endReason === 'logout') return '登出'
	return '尚未結束'
}

function assistantStatusLabel(session: AssistantAuditSession): string {
	if (session.status === 'active') return '進行中'
	if (session.status === 'expired') return '已逾時'
	if (session.status === 'cancelled') return '已取消'
	if (session.status === 'failed') return '失敗'
	return '已完成'
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
			showRouteMessage('只有系統管理員可以調閱完整 AI 問答內容，已改為顯示系統事件。', 'error')
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
		activeTab.value = 'events'
		assistantDetailOpen.value = true
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
				<VAlert type="info" variant="tonal" class="mb-5">
					每一列代表一次問答。開啟完整內容會留下調閱稽核，但稽核不會記錄問題、回答或引用原文。
				</VAlert>

				<div class="question-filters mb-5">
					<VTextField
						:model-value="questionKeyword"
						label="搜尋問答紀錄"
						placeholder="問題、回答、姓名、Email 或 Request ID"
						prepend-inner-icon="mdi-magnify"
						clearable
						hide-details
						@update:model-value="questionKeyword = $event ?? ''"
					/>
					<VSelect v-model="questionUserFilter" :items="questionUserOptions" label="使用者" hide-details />
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
					<VDataTable :headers="questionHeaders" :items="filteredQuestionRecords" item-value="id" hover>
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
							<p>{{ item.knowledgeScopeLabel }}</p>
							<p class="text-caption text-medium-emphasis mt-1">{{ item.modelLabel }}</p>
						</template>
						<template #item.status="{ item }">
							<VChip :color="statusMeta[item.status].color" size="small" variant="tonal">
								{{ statusMeta[item.status].label }}
							</VChip>
						</template>
						<template #item.durationMs="{ item }">{{ formatDuration(item.durationMs) }}</template>
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
			</VWindowItem>

			<VWindowItem value="events">
				<VAlert type="info" variant="tonal" class="mb-5">
					此處是結構化、唯讀且可追溯的業務與管理事件。服務原始日誌請至「營運監控 → 日誌查詢」。
				</VAlert>
				<div class="event-filters mb-5">
					<VTextField
						:model-value="eventKeyword"
						label="搜尋系統事件"
						placeholder="輸入事件、摘要或狀態"
						prepend-inner-icon="mdi-magnify"
						clearable
						hide-details
						@update:model-value="eventKeyword = $event ?? ''"
					/>
					<VSelect v-model="categoryFilter" :items="categoryOptions" label="事件類別" hide-details />
					<VSelect v-model="levelFilter" :items="levelOptions" label="等級" hide-details />
					<VSelect v-model="eventTimeRangeFilter" :items="timeRangeOptions" label="時間範圍" hide-details />
				</div>
				<VCard
					v-if="eventRecords.length > 0"
					class="surface-border overflow-hidden"
					data-testid="system-event-table"
				>
					<VDataTable :headers="eventHeaders" :items="eventRecords" item-value="id" hover>
						<template #item.occurredAt="{ item }">
							{{ formatNotificationTimestamp(item.occurredAt) }}
						</template>
						<template #item.category="{ item }">
							<VChip :color="categoryMeta[item.category].color" size="small" variant="tonal">
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
						<template #item.actions="{ item }">
							<VBtn v-if="item.sourceTo" :to="item.sourceTo" variant="text" size="small">前往來源</VBtn>
							<span v-else class="text-caption text-medium-emphasis">—</span>
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
					操作稽核只記錄操作者、資源、操作範圍、狀態與 Request ID，不保存被調閱的內容。
				</VAlert>
				<VCard v-if="auditRecords.length > 0" class="surface-border overflow-hidden" data-testid="audit-record-table">
					<VDataTable :headers="auditHeaders" :items="auditRecords" item-value="id" hover>
						<template #item.occurredAt="{ item }">
							{{ formatNotificationTimestamp(item.occurredAt) }}
						</template>
						<template #item.actorLabel="{ item }">{{ item.actorLabel ?? '—' }}</template>
						<template #item.resourceLabel="{ item }">{{ item.resourceLabel ?? item.sourceId ?? '—' }}</template>
						<template #item.operationScope="{ item }">{{ item.operationScope ?? item.title }}</template>
						<template #item.requestId="{ item }">{{ item.requestId ?? '—' }}</template>
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
					title="目前沒有操作稽核"
					description="管理者執行受控操作後，稽核紀錄會顯示在這裡。"
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
						<p class="text-overline text-medium-emphasis">AI 問答詳情</p>
						<h2 class="text-h6">{{ selectedQuestion.userName }}的提問</h2>
					</div>
					<VBtn icon="mdi-close" variant="text" aria-label="關閉問答詳情" @click="closeQuestionDrawer()" />
				</div>

				<div class="drawer-content pa-5">
					<div class="detail-grid mb-6">
						<div><span>提問時間</span><strong>{{ formatNotificationTimestamp(selectedQuestion.askedAt) }}</strong></div>
						<div><span>使用者</span><strong>{{ selectedQuestion.userEmail }}</strong></div>
						<div><span>部門</span><strong>{{ selectedQuestion.department }}</strong></div>
						<div><span>狀態</span><strong>{{ statusMeta[selectedQuestion.status].label }}</strong></div>
						<div><span>知識範圍</span><strong>{{ selectedQuestion.knowledgeScopeLabel }}</strong></div>
						<div><span>模型</span><strong>{{ selectedQuestion.modelLabel }}</strong></div>
					</div>

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
							<div><dt>Request ID</dt><dd>{{ selectedQuestion.requestId }}</dd></div>
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
						<div><span>狀態</span><strong>{{ assistantStatusLabel(selectedAssistantSession) }}</strong></div>
						<div><span>結束原因</span><strong>{{ assistantEndReasonLabel(selectedAssistantSession) }}</strong></div>
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
	color: rgb(var(--v-theme-on-surface-variant));
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
	.event-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.question-filters,
	.event-filters,
	.detail-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.identifiers dl div {
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
	}
}
</style>
