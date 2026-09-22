<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AlertHistoryPanel from '@/components/AlertHistoryPanel.vue'
import FilterSearchField from '@/components/FilterSearchField.vue'
import AnimatedNumber from '@/components/AnimatedNumber.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MetricSparkline from '@/components/MetricSparkline.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import {
	fetchLogEntries,
	fetchServiceHealth,
	fetchServiceMetrics,
} from '@/repositories/monitoring.repository'
import { useAsyncData } from '@/composables/useAsyncData'
import { useMonitoringStore } from '@/stores/monitoring'
import { useNotificationsStore } from '@/stores/notifications'
import type {
	AlertComparison,
	AlertEvent,
	AlertRule,
	AlertSeverity,
	LogEntry,
	LogLevel,
	MetricStatus,
	ServiceHealth,
	ServiceMetric,
} from '@/types'
import {
	ALERT_EVENT_STATUS_META,
	ALERT_SEVERITY_META,
	ALL_FILTER,
	countLogLevels,
	describeAlertDeliverySnapshot,
	describeAlertRule,
	filterLogEntries,
	isUnresolvedAlert,
	summarizeAlertEvents,
} from '@/utils/monitoring'
import { useToastStore } from '@/stores/toast'

type TimeRange = '最近 1 小時' | '最近 6 小時' | '最近 24 小時' | '最近 7 天'
type FeedbackTone = 'success' | 'error'

const route = useRoute()
const monitoringStore = useMonitoringStore()
const notificationsStore = useNotificationsStore()
const { rules, events } = storeToRefs(monitoringStore)

// > 指標與服務健康一起刷新；日誌另外載入，即時追蹤時不重取
const {
	data: overview,
	isLoading: isLoadingOverview,
	errorMessage: overviewError,
	reload: reloadOverview,
} = useAsyncData(async () => {
	const [metrics, services] = await Promise.all([fetchServiceMetrics(), fetchServiceHealth()])
	return { metrics, services }
}, {
	initialValue: { metrics: [] as ServiceMetric[], services: [] as ServiceHealth[] },
	errorMessage: () => '目前無法載入服務指標，請稍後再試。',
})
const metrics = computed(() => overview.value.metrics)
const services = computed(() => overview.value.services)

const {
	data: logs,
	isLoading: isLoadingLogs,
	errorMessage: logsError,
	reload: reloadLogs,
} = useAsyncData(fetchLogEntries, {
	initialValue: [] as LogEntry[],
	errorMessage: () => '目前無法載入服務日誌，請稍後再試。',
})
// @ 送達對象由通知管理維護，這裡只讀來顯示，避免兩邊各有一套收件人

const activeTab = ref('overview')
const focusedEventId = computed(() => typeof route.query.eventId === 'string' ? route.query.eventId : null)

watch(
	() => route.query.tab,
	(tab) => {
		// > 目前告警已併入系統概況；舊連結的 tab=alerts 仍要能用
		if (tab === 'alerts') activeTab.value = 'overview'
		else if (['overview', 'alert-history', 'rules', 'metrics', 'logs'].includes(String(tab))) activeTab.value = String(tab)
	},
	{ immediate: true },
)


// @ 狀態一律同時給顏色、圖示與文字，符合 DESIGN.md 的 Meaning Before Color Rule
const statusMeta: Record<MetricStatus, { color: string; icon: string; label: string }> = {
	good: { color: 'success', icon: 'mdi-check-circle-outline', label: '正常' },
	warning: { color: 'warning', icon: 'mdi-alert-outline', label: '注意' },
	critical: { color: 'error', icon: 'mdi-alert-circle-outline', label: '嚴重' },
}

const logLevelMeta: Record<LogLevel, { color: string; label: string }> = {
	error: { color: 'error', label: 'ERROR' },
	warn: { color: 'warning', label: 'WARN' },
	info: { color: 'info', label: 'INFO' },
	debug: { color: 'secondary', label: 'DEBUG' },
}

// @ 正常指標用品牌靛藍，異常才換成警示色，避免整頁都是紅黃
const sparklineTone: Record<MetricStatus, 'primary' | 'warning' | 'error'> = {
	good: 'primary',
	warning: 'warning',
	critical: 'error',
}

const toastStore = useToastStore()
function notify(message: string, tone: FeedbackTone = 'success'): void {
	toastStore.show(message, tone)
}

// > 服務指標
const timeRangeOptions: TimeRange[] = ['最近 1 小時', '最近 6 小時', '最近 24 小時', '最近 7 天']
const timeRange = ref<TimeRange>('最近 24 小時')
const isAutoRefresh = ref(false)
const lastUpdatedAt = ref(new Date())
let refreshTimer = 0

const lastUpdatedLabel = computed(() => lastUpdatedAt.value.toLocaleTimeString('zh-TW', { hour12: false }))

async function refreshSnapshot(): Promise<void> {
	// @ 即時追蹤中不要重取日誌，否則會把追蹤到的新訊息洗掉
	await Promise.all([reloadOverview(), isLiveTail.value ? Promise.resolve() : reloadLogs()])
	lastUpdatedAt.value = new Date()
}

// - 指標值可能帶小數；AnimatedNumber 對 number 型別一律取整，需轉成字串保留位數
function metricDisplayValue(metric: ServiceMetric): string {
	return String(metric.value)
}

// - 指標卡右上角的變化幅度：中性指標不判好壞，只呈現方向
function deltaLabel(metric: ServiceMetric): string {
	return `${metric.deltaPercent >= 0 ? '↑' : '↓'} ${Math.abs(metric.deltaPercent).toFixed(1)}%`
}

function deltaClass(metric: ServiceMetric): string {
	if (!metric.higherIsWorse) return 'text-medium-emphasis'
	return metric.deltaPercent >= 0 ? 'text-error' : 'text-success'
}

watch(isAutoRefresh, (isEnabled) => {
	window.clearInterval(refreshTimer)
	// @ 展示環境沒有真實資料來源，自動更新只是重新取一次快照並更新時間戳
	if (isEnabled) refreshTimer = window.setInterval(refreshSnapshot, 30_000)
})

// > 日誌查詢
const LIVE_TAIL_INTERVAL_MS = 4000
const LIVE_TAIL_LIMIT = 60
// @ 開啟追蹤時擷取當下的日誌當樣板，避免把追蹤產生的訊息又當成樣板
let liveTailTemplates: LogEntry[] = []

const logService = ref(ALL_FILTER)
const logLevel = ref(ALL_FILTER)
const logKeyword = ref('')
// > 系統紀錄的 Request ID 以 ?keyword= 帶入，讓稽核可一路追到該次請求的服務日誌
watch(
	() => route.query.keyword,
	(keyword) => {
		if (typeof keyword === 'string' && keyword.trim()) logKeyword.value = keyword.trim()
	},
	{ immediate: true },
)
const isLiveTail = ref(false)
const selectedLog = ref<LogEntry | null>(null)
let liveTailTimer = 0
let liveTailCursor = 0

const levelOptions = [
	{ title: '全部等級', value: ALL_FILTER },
	{ title: '錯誤 error', value: 'error' },
	{ title: '警告 warn', value: 'warn' },
	{ title: '一般 info', value: 'info' },
	{ title: '除錯 debug', value: 'debug' },
]

const serviceOptions = computed(() => [ALL_FILTER, ...Array.from(new Set(logs.value.map((entry) => entry.service)))])
const filteredLogs = computed(() =>
	filterLogEntries(logs.value, { service: logService.value, level: logLevel.value, keyword: logKeyword.value }),
)
// @ 等級統計刻意忽略等級篩選本身，否則點了「錯誤」之後其他等級全變成 0，看不出比例
const levelScopedLogs = computed(() =>
	filterLogEntries(logs.value, { service: logService.value, level: ALL_FILTER, keyword: logKeyword.value }),
)
const logLevelCounts = computed(() => countLogLevels(levelScopedLogs.value))
const logLevels: LogLevel[] = ['error', 'warn', 'info', 'debug']

function toggleLogLevel(level: LogLevel): void {
	logLevel.value = logLevel.value === level ? ALL_FILTER : level
}
const hasLogFilter = computed(
	() => logService.value !== ALL_FILTER || logLevel.value !== ALL_FILTER || logKeyword.value.trim().length > 0,
)

function resetLogFilter(): void {
	logService.value = ALL_FILTER
	logLevel.value = ALL_FILTER
	logKeyword.value = ''
}

function appendLiveLog(): void {
	const template = liveTailTemplates[liveTailCursor % liveTailTemplates.length]
	liveTailCursor += 1
	if (!template) return

	const now = new Date()
	const entry: LogEntry = {
		...template,
		id: `live-${now.getTime()}`,
		timestamp: now.toLocaleTimeString('zh-TW', { hour12: false }),
		fields: { ...template.fields },
	}
	logs.value = [entry, ...logs.value].slice(0, LIVE_TAIL_LIMIT)
}

watch(isLiveTail, (isEnabled) => {
	window.clearInterval(liveTailTimer)
	if (!isEnabled) return
	liveTailTemplates = [...logs.value]
	liveTailTimer = window.setInterval(appendLiveLog, LIVE_TAIL_INTERVAL_MS)
})

// > 告警規則
const comparisonOptions: AlertComparison[] = ['>', '>=', '<', '<=']
const severityOptions: Array<{ title: string; value: AlertSeverity }> = [
	{ title: '嚴重', value: 'critical' },
	{ title: '警告', value: 'warning' },
	{ title: '資訊', value: 'info' },
]

const metricOptions = computed(() => metrics.value.map((metric) => ({ title: metric.label, value: metric.id })))

const ruleDraft = ref<AlertRule | null>(null)
const isNewRule = ref(false)
const deleteTarget = ref<AlertRule | null>(null)

function routingLabel(severity: AlertSeverity): string {
	return notificationsStore.describeAlertDelivery(severity)
}

function openNewRule(): void {
	const metric = metrics.value[0]
	isNewRule.value = true
	ruleDraft.value = {
		id: `rule-${Date.now()}`,
		name: '',
		metricId: metric.id,
		metricLabel: metric.label,
		comparison: '>',
		threshold: metric.value,
		unit: metric.unit,
		durationMinutes: 5,
		severity: 'warning',
		isEnabled: true,
	}
}

function openEditRule(rule: AlertRule): void {
	isNewRule.value = false
	ruleDraft.value = { ...rule }
}

// - 換監控指標時同步帶入單位，避免規則描述出現「積壓 > 4 秒」這種錯配
function syncDraftMetric(metricId: string): void {
	const metric = metrics.value.find((item) => item.id === metricId)
	if (!ruleDraft.value || !metric) return

	ruleDraft.value.metricId = metric.id
	ruleDraft.value.metricLabel = metric.label
	ruleDraft.value.unit = metric.unit
}

const isRuleDraftValid = computed(() => {
	const draft = ruleDraft.value
	if (!draft) return false
	return draft.name.trim().length > 0 && draft.durationMinutes > 0 && Number.isFinite(draft.threshold)
})

function saveRule(): void {
	const draft = ruleDraft.value
	if (!draft || !isRuleDraftValid.value) return

	if (isNewRule.value) monitoringStore.addRule(draft)
	else monitoringStore.updateRule(draft)
	ruleDraft.value = null
	notify(`已儲存規則「${draft.name}」，${ALERT_SEVERITY_META[draft.severity].label}告警會通知 ${routingLabel(draft.severity)}。`)
}

function toggleRule(rule: AlertRule, isEnabled: boolean | null): void {
	const nextEnabled = Boolean(isEnabled)
	monitoringStore.setRuleEnabled(rule.id, nextEnabled)
	notify(`規則「${rule.name}」已${nextEnabled ? '啟用' : '停用'}。`)
}

function confirmDeleteRule(): void {
	const target = deleteTarget.value
	if (!target) return

	monitoringStore.deleteRule(target.id)
	deleteTarget.value = null
	notify(`已刪除規則「${target.name}」。`)
}

function testRule(rule: AlertRule): void {
	const result = notificationsStore.notifyAlert({
		ruleName: rule.name,
		severity: rule.severity,
		observed: '測試通知，未實際觸發門檻',
		status: 'test',
	})
	const parts = [
		result.inAppRecipientCount ? `站內通知 ${result.inAppRecipientCount} 人` : '',
		result.emailRecipientCount ? `Email ${result.emailRecipientCount} 位` : '',
	].filter(Boolean)
	if (!parts.length) {
		notify('這個嚴重度目前沒有對應的通知規則，請到通知管理的「自動通知」新增系統告警規則。', 'error')
		return
	}
	notify(`已依「${result.matchedRuleNames.join('、')}」送出測試通知：${parts.join('、')}。站內通知可在通知管理的發送紀錄查看。`)
}

// > 目前告警：只放尚未解除、仍需處理的；已解除的歷史移到告警紀錄
const alertSummary = computed(() => summarizeAlertEvents(events.value))
const unresolvedEvents = computed(() =>
	events.value
		.filter(isUnresolvedAlert)
		.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)),
)

/**
 * 切到系統概況並捲動到指定元素。
 * @param elementId 目標元素 id；未指定時捲到目前告警區塊。
 */
async function scrollToCurrentAlerts(elementId = 'current-alerts'): Promise<void> {
	activeTab.value = 'overview'
	await nextTick()
	// > 等 VWindow 切換後的第一個畫格，元素才有正確位置
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
	const target = document.getElementById(elementId)
	// ! VTimelineItem 外層是 display: contents，沒有版面框，捲動要對準內部的 body
	const scrollTarget = target?.querySelector<HTMLElement>('.v-timeline-item__body') ?? target
	scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// > 從告警觸發通知點進來會帶 eventId；未解除的告警在系統概況，直接捲到該筆
watch(
	() => [route.query.tab, focusedEventId.value] as const,
	([tab, eventId]) => {
		if (!eventId || tab === 'alert-history') return
		if (!unresolvedEvents.value.some((event) => event.id === eventId)) return
		void scrollToCurrentAlerts(`alert-event-${eventId}`)
	},
	{ immediate: true },
)

const healthyServiceCount = computed(() => services.value.filter((service) => service.status === 'good').length)
const recentErrorCount = computed(() => logs.value.filter((entry) => entry.level === 'error').length)

function silenceEvent(event: AlertEvent): void {
	monitoringStore.silenceEvent(event.id)
	notify(`已靜音「${event.ruleName}」1 小時，期間不再寄送通知。`)
}

onBeforeUnmount(() => {
	window.clearInterval(refreshTimer)
	window.clearInterval(liveTailTimer)
})
</script>

<template>
	<div class="page-shell">
		<PageHeader
			eyebrow="營運可觀測性"
			title="營運監控"
			description="以指標、日誌與告警三個視角掌握系統狀態，判斷什麼情況算異常；通知誰與怎麼送，由通知管理依嚴重度決定。"
		>
			<template #actions>
				<VBtn variant="outlined" prepend-icon="mdi-refresh" @click="refreshSnapshot(); notify('已重新取得監控資料。')">
					重新整理
				</VBtn>
			</template>
		</PageHeader>

		<VAlert
			v-if="alertSummary.firing > 0"
			:type="alertSummary.criticalFiring > 0 ? 'error' : 'warning'"
			variant="tonal"
			class="mb-6"
			:title="`有 ${alertSummary.firing} 個告警正在觸發`"
		>
			其中 {{ alertSummary.criticalFiring }} 個為嚴重等級。通知對象與管道依「通知管理 → 自動通知」的規則決定。
			<template #append>
				<VBtn variant="text" @click="scrollToCurrentAlerts()">處理目前告警</VBtn>
			</template>
		</VAlert>


		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="overview">系統概況</VTab>
			<VTab value="alert-history">告警紀錄</VTab>
			<VTab value="rules">告警規則</VTab>
			<VTab value="metrics">服務指標</VTab>
			<VTab value="logs">日誌查詢</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="monitoring-window">
			<!-- > 系統概況：先回答現在是否需要處理，再引導到對應診斷頁籤 -->
			<VWindowItem value="overview">
				<VRow class="mb-6">
					<VCol cols="12" md="4">
						<VCard class="surface-border pa-5 h-100">
							<p class="text-body-2 text-medium-emphasis">健康服務</p>
							<p class="metric-value mt-2">{{ healthyServiceCount }} / {{ services.length }}</p>
							<VBtn class="mt-3" variant="text" size="small" @click="activeTab = 'metrics'">查看服務指標</VBtn>
						</VCard>
					</VCol>
					<VCol cols="12" md="4">
						<VCard class="surface-border pa-5 h-100">
							<p class="text-body-2 text-medium-emphasis">目前告警</p>
							<p class="metric-value mt-2">{{ alertSummary.firing }}</p>
							<VBtn class="mt-3" variant="text" size="small" @click="scrollToCurrentAlerts()">查看目前告警</VBtn>
						</VCard>
					</VCol>
					<VCol cols="12" md="4">
						<VCard class="surface-border pa-5 h-100">
							<p class="text-body-2 text-medium-emphasis">目前快照錯誤日誌</p>
							<p class="metric-value mt-2">{{ recentErrorCount }}</p>
							<VBtn class="mt-3" variant="text" size="small" @click="activeTab = 'logs'; logLevel = 'error'">查詢日誌</VBtn>
						</VCard>
					</VCol>
				</VRow>

				<!-- > 目前告警：只放尚未解除、仍需處理的告警，已解除的在告警紀錄 -->
				<section id="current-alerts" aria-labelledby="current-alerts-title" class="current-alerts mb-6" data-testid="current-alerts">
				<div class="d-flex flex-wrap align-center ga-2 mb-4">
					<h2 id="current-alerts-title" class="section-heading mr-2">目前告警</h2>
					<VChip color="error" variant="tonal" size="small">觸發中 {{ alertSummary.firing }}</VChip>
					<VChip color="secondary" variant="tonal" size="small">已靜音 {{ alertSummary.silenced }}</VChip>
					<VSpacer />
					<VBtn variant="text" size="small" append-icon="mdi-arrow-right" @click="activeTab = 'alert-history'">
						查看已解除的告警紀錄
					</VBtn>
				</div>

				<StatePanel
					v-if="unresolvedEvents.length === 0"
					icon="mdi-bell-check-outline"
					title="目前沒有需要處理的告警"
					description="所有告警都已解除。過去的觸發與處理過程可在「告警紀錄」查看。"
					action-label="查看告警紀錄"
					@action="activeTab = 'alert-history'"
				/>
				<VCard v-else class="surface-border pa-5">
					<VTimeline side="end" density="compact" truncate-line="both">
						<VTimelineItem
							v-for="event in unresolvedEvents"
							:key="event.id"
							:id="`alert-event-${event.id}`"
							:class="{ 'focused-alert-event': event.id === focusedEventId }"
							:dot-color="ALERT_EVENT_STATUS_META[event.status].color"
							size="small"
						>
							<div class="d-flex flex-wrap align-center ga-2">
								<p class="font-weight-bold">{{ event.ruleName }}</p>
								<VChip :color="ALERT_EVENT_STATUS_META[event.status].color" size="x-small" variant="tonal">
									<VIcon :icon="ALERT_EVENT_STATUS_META[event.status].icon" start size="12" aria-hidden="true" />
									{{ ALERT_EVENT_STATUS_META[event.status].label }}
								</VChip>
								<VChip size="x-small" variant="tonal">{{ ALERT_SEVERITY_META[event.severity].label }}</VChip>
							</div>
							<p class="text-caption text-medium-emphasis mt-1">
								觀測值 {{ event.observed }} · {{ event.startedAt }} · {{ event.durationLabel }}
							</p>
							<p class="text-caption text-medium-emphasis mt-1">
								{{ describeAlertDeliverySnapshot(event.delivery) }}
							</p>
							<VBtn
								v-if="event.status === 'firing'"
								class="mt-2"
								size="small"
								variant="outlined"
								prepend-icon="mdi-bell-sleep-outline"
								@click="silenceEvent(event)"
							>
								靜音 1 小時
							</VBtn>
						</VTimelineItem>
					</VTimeline>
				</VCard>
				</section>

				<VAlert type="info" variant="tonal">
					營運監控負責偵測：指標、告警門檻與技術日誌。通知誰、走站內或 Email，以及發送紀錄，都在「通知管理 → 自動通知」的系統告警規則。
				</VAlert>
			</VWindowItem>

			<!-- > 告警紀錄：觸發、靜音、解除的完整歷史，供事後追溯 -->
			<VWindowItem value="alert-history">
				<AlertHistoryPanel />
			</VWindowItem>

			<!-- > 告警規則：只判定什麼情況算異常；通知誰在通知管理設定 -->
			<VWindowItem value="rules">
				<div class="d-flex flex-wrap align-center ga-3 mb-5">
					<p class="text-body-2 text-medium-emphasis">
						規則以指標門檻加上持續時間判斷，避免瞬間尖峰造成誤報；通知誰由嚴重度決定。
					</p>
					<VSpacer />
					<VBtn color="primary" prepend-icon="mdi-plus" @click="openNewRule">新增規則</VBtn>
				</div>

				<VCard class="surface-border pa-4 mb-5">
					<div class="d-flex flex-wrap align-center ga-3">
						<div>
							<p class="text-body-2 font-weight-bold mb-1">各嚴重度的通知對象</p>
							<p class="text-caption text-medium-emphasis">嚴重：{{ routingLabel('critical') }}</p>
							<p class="text-caption text-medium-emphasis">警告：{{ routingLabel('warning') }}</p>
							<p class="text-caption text-medium-emphasis">資訊：{{ routingLabel('info') }}</p>
						</div>
						<VSpacer />
						<VBtn variant="text" size="small" append-icon="mdi-arrow-right" to="/admin/notifications?tab=rules">在通知管理調整</VBtn>
					</div>
				</VCard>

				<VCard class="surface-border">
					<VList lines="two">
						<template v-for="(rule, index) in rules" :key="rule.id">
							<VListItem class="py-3">
								<template #prepend>
									<VIcon
										:icon="ALERT_SEVERITY_META[rule.severity].icon"
										:color="rule.isEnabled ? ALERT_SEVERITY_META[rule.severity].color : 'secondary'"
										aria-hidden="true"
									/>
								</template>
								<VListItemTitle class="font-weight-bold">
									{{ rule.name }}
									<VChip size="x-small" variant="tonal" class="ml-2">{{ ALERT_SEVERITY_META[rule.severity].label }}</VChip>
								</VListItemTitle>
								<VListItemSubtitle>
									{{ describeAlertRule(rule) }} · 通知 {{ routingLabel(rule.severity) }}
								</VListItemSubtitle>
								<template #append>
									<div class="d-flex align-center ga-2">
										<VSwitch
											:model-value="rule.isEnabled"
											color="primary"
											density="compact"
											hide-details
											:aria-label="`啟用規則 ${rule.name}`"
											@update:model-value="toggleRule(rule, $event)"
										/>
										<VBtn variant="text" size="small" @click="testRule(rule)">測試通知</VBtn>
										<VBtn variant="text" size="small" @click="openEditRule(rule)">編輯</VBtn>
										<VBtn variant="text" size="small" color="error" @click="deleteTarget = rule">刪除</VBtn>
									</div>
								</template>
							</VListItem>
							<VDivider v-if="index < rules.length - 1" />
						</template>
					</VList>
				</VCard>
			</VWindowItem>

			<!-- > 服務指標：流量、延遲、錯誤、飽和度四個訊號 + 各服務健康度 -->
			<VWindowItem value="metrics">
				<div class="monitoring-toolbar mb-5">
					<VSelect v-model="timeRange" :items="timeRangeOptions" label="時間範圍" hide-details max-width="200" />
					<VSwitch v-model="isAutoRefresh" color="primary" label="每 30 秒自動更新" hide-details density="compact" />
					<VSpacer />
					<p class="text-caption text-medium-emphasis">最後更新 {{ lastUpdatedLabel }}</p>
				</div>

				<StatePanel
					v-if="overviewError"
					icon="mdi-cloud-alert-outline"
					title="無法載入服務指標"
					:description="overviewError"
					action-label="重新載入"
					@action="reloadOverview"
				/>
				<section v-else aria-labelledby="signal-title" class="mb-8">
					<h2 id="signal-title" class="section-heading mb-4">核心訊號</h2>
					<VRow v-if="isLoadingOverview">
						<VCol v-for="placeholder in 4" :key="placeholder" cols="12" sm="6" lg="3">
							<VSkeletonLoader type="article" class="surface-border rounded-lg" />
						</VCol>
					</VRow>
					<VRow v-else>
						<VCol v-for="(metric, index) in metrics" :key="metric.id" cols="12" sm="6" lg="3">
							<VCard class="surface-border pa-5 h-100 rise-in" :style="{ '--rise-index': index }">
								<div class="d-flex align-center ga-2">
									<p class="text-body-2 text-medium-emphasis">{{ metric.label }}</p>
									<VSpacer />
									<VIcon
										:icon="statusMeta[metric.status].icon"
										:color="statusMeta[metric.status].color"
										size="16"
										aria-hidden="true"
									/>
									<span class="text-caption">{{ statusMeta[metric.status].label }}</span>
								</div>
								<div class="d-flex align-baseline ga-2 mt-3">
									<p class="metric-value"><AnimatedNumber :value="metricDisplayValue(metric)" :duration-ms="900" /></p>
									<span class="text-caption text-medium-emphasis">{{ metric.unit }}</span>
									<VSpacer />
									<span class="text-caption tabular" :class="deltaClass(metric)">{{ deltaLabel(metric) }}</span>
								</div>
								<MetricSparkline
									class="mt-3"
									:values="metric.series"
									:tone="sparklineTone[metric.status]"
									:label="`${metric.label} 的趨勢圖，${timeRange}，目前 ${metric.value} ${metric.unit}`"
								/>
								<p class="text-caption text-medium-emphasis mt-3">{{ metric.detail }}</p>
							</VCard>
						</VCol>
					</VRow>
				</section>

				<section aria-labelledby="health-title">
					<h2 id="health-title" class="section-heading mb-4">服務健康度</h2>
					<VCard class="surface-border">
						<VTable>
							<thead>
								<tr>
									<th>服務</th>
									<th>狀態</th>
									<th class="text-right">延遲</th>
									<th class="text-right">成功率</th>
									<th>最後檢查</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="service in services" :key="service.id">
									<td>
										<p class="font-weight-bold">{{ service.name }}</p>
										<p class="text-caption text-medium-emphasis">{{ service.component }}</p>
									</td>
									<td>
										<VChip :color="statusMeta[service.status].color" size="small" variant="tonal">
											<VIcon :icon="statusMeta[service.status].icon" start size="14" aria-hidden="true" />
											{{ statusMeta[service.status].label }}
										</VChip>
									</td>
									<td class="text-right mono">{{ service.latencyMs > 0 ? `${service.latencyMs} ms` : '無回應' }}</td>
									<td class="text-right mono">{{ service.successRate.toFixed(1) }}%</td>
									<td>
										<p class="text-caption">{{ service.checkedAt }}</p>
										<p class="text-caption text-medium-emphasis">{{ service.note }}</p>
									</td>
								</tr>
							</tbody>
						</VTable>
					</VCard>
				</section>
			</VWindowItem>

			<!-- > 日誌查詢：標籤篩選 + 關鍵字 + 即時追蹤 -->
			<VWindowItem value="logs">
				<div class="monitoring-toolbar mb-4">
					<VSelect v-model="logService" :items="serviceOptions" label="服務" hide-details max-width="220" />
					<VSelect v-model="logLevel" :items="levelOptions" label="等級" hide-details max-width="180" />
					<FilterSearchField
						v-model="logKeyword"
						label="關鍵字或 Trace ID"
					/>
					<VSwitch v-model="isLiveTail" color="primary" label="即時追蹤" hide-details density="compact" />
				</div>

				<div class="d-flex flex-wrap align-center ga-2 mb-4">
					<VBtn
						v-for="level in logLevels"
						:key="level"
						:color="logLevelMeta[level].color"
						:variant="logLevel === level ? 'flat' : 'tonal'"
						:aria-pressed="logLevel === level"
						size="small"
						@click="toggleLogLevel(level)"
					>
						{{ logLevelMeta[level].label }} {{ logLevelCounts[level] }}
					</VBtn>
					<VSpacer />
					<p class="text-caption text-medium-emphasis">共 {{ filteredLogs.length }} 筆</p>
					<VBtn v-if="hasLogFilter" variant="text" size="small" @click="resetLogFilter">清除條件</VBtn>
				</div>

				<StatePanel
					v-if="logsError"
					icon="mdi-cloud-alert-outline"
					title="無法載入服務日誌"
					:description="logsError"
					action-label="重新載入"
					@action="reloadLogs"
				/>
				<VSkeletonLoader v-else-if="isLoadingLogs" type="list-item-two-line@5" class="surface-border rounded-lg" />
				<VCard v-else-if="filteredLogs.length > 0" class="surface-border log-panel">
					<button
						v-for="entry in filteredLogs"
						:key="entry.id"
						type="button"
						class="log-row"
						@click="selectedLog = entry"
					>
						<span class="log-time mono">{{ entry.timestamp }}</span>
						<VChip :color="logLevelMeta[entry.level].color" size="x-small" variant="tonal" class="log-level">
							{{ logLevelMeta[entry.level].label }}
						</VChip>
						<span class="log-service mono">{{ entry.service }}</span>
						<span class="log-message">{{ entry.message }}</span>
					</button>
				</VCard>
				<StatePanel
					v-else
					icon="mdi-text-search"
					title="這個條件下沒有日誌"
					description="可以放寬服務或等級條件，或改用 Trace ID 查詢同一次請求的完整紀錄。"
					action-label="清除條件"
					@action="resetLogFilter"
				/>
			</VWindowItem>
		</VWindow>

		<VAlert type="info" variant="tonal" class="mt-6">
			展示環境的指標、日誌與告警皆為模擬資料，儲存與寄送操作只會更新前端狀態。
		</VAlert>

		<!-- > 日誌詳情 -->
		<VDialog :model-value="Boolean(selectedLog)" max-width="640" @update:model-value="selectedLog = null">
			<VCard v-if="selectedLog">
				<VCardTitle class="pa-6 pb-2">日誌詳情</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<div class="d-flex align-center ga-2 mb-3">
						<VChip :color="logLevelMeta[selectedLog.level].color" size="small" variant="tonal">
							{{ logLevelMeta[selectedLog.level].label }}
						</VChip>
						<span class="mono text-caption">{{ selectedLog.timestamp }}</span>
						<span class="mono text-caption text-medium-emphasis">{{ selectedLog.service }}</span>
					</div>
					<p class="mb-4">{{ selectedLog.message }}</p>
					<VTable density="compact">
						<tbody>
							<tr>
								<td class="field-key">traceId</td>
								<td class="mono">{{ selectedLog.traceId }}</td>
							</tr>
							<tr v-for="(value, key) in selectedLog.fields" :key="key">
								<td class="field-key">{{ key }}</td>
								<td class="mono">{{ value }}</td>
							</tr>
						</tbody>
					</VTable>
				</VCardText>
				<VCardActions class="pa-5">
					<VBtn
						variant="tonal"
						prepend-icon="mdi-filter-variant"
						@click="logKeyword = selectedLog.traceId; selectedLog = null"
					>
						查詢同一次請求
					</VBtn>
					<VSpacer />
					<VBtn @click="selectedLog = null">關閉</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<!-- > 新增或編輯告警規則 -->
		<VDialog :model-value="Boolean(ruleDraft)" max-width="620" @update:model-value="ruleDraft = null">
			<VCard v-if="ruleDraft">
				<VCardTitle class="pa-6 pb-2">{{ isNewRule ? '新增告警規則' : '編輯告警規則' }}</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<VTextField v-model="ruleDraft.name" label="規則名稱" placeholder="例如：回答延遲過高" />
					<VSelect
						:model-value="ruleDraft.metricId"
						:items="metricOptions"
						label="監控指標"
						@update:model-value="syncDraftMetric($event)"
					/>
					<div class="rule-condition">
						<VSelect v-model="ruleDraft.comparison" :items="comparisonOptions" label="條件" />
						<VTextField v-model.number="ruleDraft.threshold" label="門檻值" type="number" :suffix="ruleDraft.unit" />
						<VTextField v-model.number="ruleDraft.durationMinutes" label="持續時間" type="number" suffix="分鐘" />
					</div>
					<VSelect v-model="ruleDraft.severity" :items="severityOptions" label="嚴重度" />
					<VAlert type="info" variant="tonal" density="compact">
						觸發條件：{{ describeAlertRule(ruleDraft) }}<br />
						通知對象（依嚴重度）：{{ routingLabel(ruleDraft.severity) }}
					</VAlert>
				</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="ruleDraft = null">取消</VBtn>
					<VBtn color="primary" :disabled="!isRuleDraftValid" @click="saveRule">儲存規則</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<!-- > 刪除規則確認 -->
		<ConfirmDialog
			:model-value="Boolean(deleteTarget)"
			title="刪除告警規則？"
			:description="`刪除「${deleteTarget?.name ?? ''}」後，這個條件不再產生告警，也不會再寄送通知。已發生的告警紀錄會保留。`"
			@update:model-value="deleteTarget = null"
			@confirm="confirmDeleteRule"
		/>
	</div>
</template>

<style scoped>

.monitoring-window {
	overflow: visible;
}

.monitoring-toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-md);
}

.metric-value {
	font-size: 2rem;
	font-weight: 700;
	letter-spacing: -0.04em;
	line-height: 1.1;
}

.log-panel {
	overflow: hidden;
}

.log-row {
	display: grid;
	grid-template-columns: 84px 68px 148px minmax(0, 1fr);
	align-items: center;
	gap: var(--space-md);
	width: 100%;
	padding: 10px var(--space-lg);
	border: 0;
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color var(--motion-fast) var(--ease-standard);
}

.log-row:last-child {
	border-bottom: 0;
}

.log-row:hover {
	background: var(--tint-hover);
}

.log-time,
.log-service {
	color: var(--ink-subtle);
	font-size: 0.78rem;
}

.log-service {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.log-level {
	justify-self: start;
}

.log-message {
	overflow: hidden;
	font-size: 0.9rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.rule-condition {
	display: grid;
	grid-template-columns: 110px minmax(0, 1fr) minmax(0, 1fr);
	gap: var(--space-sm);
}

.field-key {
	width: 160px;
	color: var(--ink-subtle);
	font-size: 0.82rem;
}

.current-alerts {
	scroll-margin-top: 88px;
}

/* ! VTimelineItem 外層是 display: contents，樣式要套在內部 body 才看得到 */
:deep(.focused-alert-event > .v-timeline-item__body) {
	padding: var(--space-sm);
	border-radius: var(--radius-md);
	background: var(--tint-hover);
}

@media (max-width: 860px) {
	.log-row {
		grid-template-columns: 84px 68px minmax(0, 1fr);
		row-gap: var(--space-xs);
	}

	.log-service {
		display: none;
	}

	.log-message {
		grid-column: 1 / -1;
		white-space: normal;
	}
}

@media (max-width: 700px) {

	.monitoring-toolbar > .v-input {
		max-width: none !important;
		width: 100%;
	}

	.rule-condition {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
