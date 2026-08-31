<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AnimatedNumber from '@/components/AnimatedNumber.vue'
import MetricSparkline from '@/components/MetricSparkline.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import {
	getEmailChannelSettingsSnapshot,
	getLogEntriesSnapshot,
	getRecipientGroupsSnapshot,
	getServiceHealthSnapshot,
	getServiceMetricsSnapshot,
} from '@/repositories/monitoring.repository'
import { useMonitoringStore } from '@/stores/monitoring'
import type {
	AlertComparison,
	AlertEvent,
	AlertEventStatus,
	AlertRule,
	AlertSeverity,
	LogEntry,
	LogLevel,
	MetricStatus,
	ServiceMetric,
} from '@/types'
import {
	ALL_FILTER,
	countLogLevels,
	describeAlertRule,
	filterLogEntries,
	isValidEmail,
	parseEmailList,
	summarizeAlertEvents,
} from '@/utils/monitoring'

type TimeRange = '最近 1 小時' | '最近 6 小時' | '最近 24 小時' | '最近 7 天'
type FeedbackTone = 'success' | 'error'

const route = useRoute()
const monitoringStore = useMonitoringStore()
const { rules, events } = storeToRefs(monitoringStore)

const metrics = ref(getServiceMetricsSnapshot())
const services = ref(getServiceHealthSnapshot())
const logs = ref(getLogEntriesSnapshot())
const groups = ref(getRecipientGroupsSnapshot())
const emailSettings = ref(getEmailChannelSettingsSnapshot())

const activeTab = ref('metrics')
const feedbackMessage = ref('')
const feedbackTone = ref<FeedbackTone>('success')
const focusedEventId = computed(() => typeof route.query.eventId === 'string' ? route.query.eventId : null)

watch(
	() => route.query.tab,
	(tab) => {
		if (tab === 'alerts') activeTab.value = 'alerts'
	},
	{ immediate: true },
)

// @ 狀態一律同時給顏色、圖示與文字，符合 DESIGN.md 的 Meaning Before Color Rule
const statusMeta: Record<MetricStatus, { color: string; icon: string; label: string }> = {
	good: { color: 'success', icon: 'mdi-check-circle-outline', label: '正常' },
	warning: { color: 'warning', icon: 'mdi-alert-outline', label: '注意' },
	critical: { color: 'error', icon: 'mdi-alert-circle-outline', label: '嚴重' },
}

const severityMeta: Record<AlertSeverity, { color: string; icon: string; label: string }> = {
	critical: { color: 'error', icon: 'mdi-alert-octagon-outline', label: '嚴重' },
	warning: { color: 'warning', icon: 'mdi-alert-outline', label: '警告' },
	info: { color: 'info', icon: 'mdi-information-outline', label: '資訊' },
}

const eventStatusMeta: Record<AlertEventStatus, { color: string; icon: string; label: string }> = {
	firing: { color: 'error', icon: 'mdi-bell-ring-outline', label: '觸發中' },
	resolved: { color: 'success', icon: 'mdi-bell-check-outline', label: '已解除' },
	silenced: { color: 'secondary', icon: 'mdi-bell-sleep-outline', label: '已靜音' },
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

function notify(message: string, tone: FeedbackTone = 'success'): void {
	feedbackMessage.value = message
	feedbackTone.value = tone
}

// > 服務指標
const timeRangeOptions: TimeRange[] = ['最近 1 小時', '最近 6 小時', '最近 24 小時', '最近 7 天']
const timeRange = ref<TimeRange>('最近 24 小時')
const isAutoRefresh = ref(false)
const lastUpdatedAt = ref(new Date())
let refreshTimer = 0

const lastUpdatedLabel = computed(() => lastUpdatedAt.value.toLocaleTimeString('zh-TW', { hour12: false }))

function refreshSnapshot(): void {
	metrics.value = getServiceMetricsSnapshot()
	services.value = getServiceHealthSnapshot()
	// @ 即時追蹤中不要重取日誌，否則會把追蹤到的新訊息洗掉
	if (!isLiveTail.value) logs.value = getLogEntriesSnapshot()
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
const liveTailTemplates = getLogEntriesSnapshot()

const logService = ref(ALL_FILTER)
const logLevel = ref(ALL_FILTER)
const logKeyword = ref('')
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
	if (isEnabled) liveTailTimer = window.setInterval(appendLiveLog, LIVE_TAIL_INTERVAL_MS)
})

// > 告警規則
const comparisonOptions: AlertComparison[] = ['>', '>=', '<', '<=']
const severityOptions: Array<{ title: string; value: AlertSeverity }> = [
	{ title: '嚴重', value: 'critical' },
	{ title: '警告', value: 'warning' },
	{ title: '資訊', value: 'info' },
]

const metricOptions = computed(() => metrics.value.map((metric) => ({ title: metric.label, value: metric.id })))
const groupOptions = computed(() => groups.value.map((group) => ({ title: group.name, value: group.id })))

const ruleDraft = ref<AlertRule | null>(null)
const isNewRule = ref(false)
const deleteTarget = ref<AlertRule | null>(null)

function groupById(groupId: string) {
	return groups.value.find((group) => group.id === groupId)
}

function groupLabel(groupId: string): string {
	const group = groupById(groupId)
	return group ? `${group.name}（${group.emails.length} 位收件人）` : '尚未指定收件人群組'
}

function openNewRule(): void {
	const metric = metrics.value[0]
	const group = groups.value[0]
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
		recipientGroupId: group.id,
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
	notify(`已儲存規則「${draft.name}」，觸發時以電子郵件通知 ${groupLabel(draft.recipientGroupId)}。`)
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
	notify(`已寄出「${rule.name}」的測試通知給 ${groupLabel(rule.recipientGroupId)}。`)
}

// > 電子郵件通知
const recipientInput = ref<Record<string, string>>({})
const recipientError = ref<Record<string, string>>({})

const totalRecipients = computed(() => groups.value.reduce((total, group) => total + group.emails.length, 0))
const isSenderValid = computed(() => isValidEmail(emailSettings.value.senderAddress))

function addRecipients(groupId: string): void {
	const group = groupById(groupId)
	if (!group) return

	const candidates = parseEmailList(recipientInput.value[groupId] ?? '')
	const invalid = candidates.filter((email) => !isValidEmail(email))

	if (candidates.length === 0 || invalid.length > 0) {
		recipientError.value = {
			...recipientError.value,
			[groupId]: invalid.length > 0 ? `格式不正確：${invalid.join('、')}` : '請先輸入收件人電子郵件。',
		}
		return
	}

	const existing = new Set(group.emails.map((email) => email.toLowerCase()))
	const added = candidates.filter((email) => !existing.has(email.toLowerCase()))
	group.emails = [...group.emails, ...added]
	recipientInput.value = { ...recipientInput.value, [groupId]: '' }
	recipientError.value = { ...recipientError.value, [groupId]: '' }
	notify(added.length > 0 ? `已將 ${added.length} 位收件人加入「${group.name}」。` : '這些收件人已在群組中。')
}

// @ 組字中的 Enter 是選字不是送出；沿用專案既有輸入框的規則
function handleRecipientEnter(groupId: string, event: KeyboardEvent): void {
	if (event.isComposing) return

	event.preventDefault()
	addRecipients(groupId)
}

function removeRecipient(groupId: string, email: string): void {
	const group = groupById(groupId)
	if (!group) return

	group.emails = group.emails.filter((item) => item !== email)
	notify(`已將 ${email} 移出「${group.name}」。`)
}

function updateGroupSeverities(groupId: string, severities: AlertSeverity[]): void {
	const group = groupById(groupId)
	if (!group) return

	group.severities = severities
}

function saveEmailSettings(): void {
	if (!isSenderValid.value) {
		notify('寄件人電子郵件格式不正確，請確認後再儲存。', 'error')
		return
	}
	notify('已更新電子郵件通知設定。')
}

function sendTestEmail(): void {
	notify(`測試告警信已排入寄送佇列，共 ${totalRecipients.value} 位收件人（展示環境不會真的寄出）。`)
}

// > 告警紀錄
const alertSummary = computed(() => summarizeAlertEvents(events.value))

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
			description="以指標、日誌與告警三個視角掌握系統狀態。規則觸發時，通知一律寄送到指定的電子郵件群組。"
		>
			<template #actions>
				<VBtn variant="outlined" prepend-icon="mdi-refresh" @click="refreshSnapshot(); notify('已重新取得監控資料。')">
					重新整理
				</VBtn>
				<VBtn color="primary" prepend-icon="mdi-email-fast-outline" @click="sendTestEmail">寄送測試告警信</VBtn>
			</template>
		</PageHeader>

		<VAlert
			v-if="alertSummary.firing > 0"
			:type="alertSummary.criticalFiring > 0 ? 'error' : 'warning'"
			variant="tonal"
			class="mb-6"
			:title="`有 ${alertSummary.firing} 個告警正在觸發`"
		>
			其中 {{ alertSummary.criticalFiring }} 個為嚴重等級，通知已寄送給值班收件人。
			<template #append>
				<VBtn variant="text" @click="activeTab = 'alerts'">查看告警紀錄</VBtn>
			</template>
		</VAlert>

		<VAlert
			v-if="feedbackMessage"
			:type="feedbackTone"
			variant="tonal"
			closable
			class="mb-4"
			@click:close="feedbackMessage = ''"
		>
			{{ feedbackMessage }}
		</VAlert>

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="metrics">服務指標</VTab>
			<VTab value="logs">日誌查詢</VTab>
			<VTab value="rules">告警規則</VTab>
			<VTab value="notification">通知設定</VTab>
			<VTab value="alerts">告警紀錄</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="monitoring-window">
			<!-- > 服務指標：流量、延遲、錯誤、飽和度四個訊號 + 各服務健康度 -->
			<VWindowItem value="metrics">
				<div class="monitoring-toolbar mb-5">
					<VSelect v-model="timeRange" :items="timeRangeOptions" label="時間範圍" hide-details max-width="200" />
					<VSwitch v-model="isAutoRefresh" color="primary" label="每 30 秒自動更新" hide-details density="compact" />
					<VSpacer />
					<p class="text-caption text-medium-emphasis">最後更新 {{ lastUpdatedLabel }}</p>
				</div>

				<section aria-labelledby="signal-title" class="mb-8">
					<h2 id="signal-title" class="section-heading mb-4">核心訊號</h2>
					<VRow>
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
					<VTextField
						v-model="logKeyword"
						label="關鍵字或 Trace ID"
						prepend-inner-icon="mdi-magnify"
						hide-details
						clearable
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

				<VCard v-if="filteredLogs.length > 0" class="surface-border log-panel">
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

			<!-- > 告警規則：條件、嚴重度與收件人群組 -->
			<VWindowItem value="rules">
				<div class="d-flex flex-wrap align-center ga-3 mb-5">
					<p class="text-body-2 text-medium-emphasis">
						規則以指標門檻加上持續時間判斷，避免瞬間尖峰造成誤報。
					</p>
					<VSpacer />
					<VBtn color="primary" prepend-icon="mdi-plus" @click="openNewRule">新增規則</VBtn>
				</div>

				<VCard class="surface-border">
					<VList lines="two">
						<template v-for="(rule, index) in rules" :key="rule.id">
							<VListItem class="py-3">
								<template #prepend>
									<VIcon
										:icon="severityMeta[rule.severity].icon"
										:color="rule.isEnabled ? severityMeta[rule.severity].color : 'secondary'"
										aria-hidden="true"
									/>
								</template>
								<VListItemTitle class="font-weight-bold">
									{{ rule.name }}
									<VChip size="x-small" variant="tonal" class="ml-2">{{ severityMeta[rule.severity].label }}</VChip>
								</VListItemTitle>
								<VListItemSubtitle>
									{{ describeAlertRule(rule) }} · 通知 {{ groupLabel(rule.recipientGroupId) }}
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

			<!-- > 通知設定：收件人群組、寄件設定與通知策略 -->
			<VWindowItem value="notification">
				<section aria-labelledby="recipient-title" class="mb-8">
					<h2 id="recipient-title" class="section-heading mb-1">收件人群組</h2>
					<p class="text-body-2 text-medium-emphasis mb-4">
						告警規則指定群組，群組決定實際寄送對象與接收的嚴重度。
					</p>
					<VRow>
						<VCol v-for="group in groups" :key="group.id" cols="12" lg="6">
							<VCard class="surface-border pa-5 h-100">
								<div class="d-flex align-center ga-2">
									<div>
										<p class="font-weight-bold">{{ group.name }}</p>
										<p class="text-caption text-medium-emphasis">{{ group.description }}</p>
									</div>
									<VSpacer />
									<VChip size="small" variant="tonal">{{ group.emails.length }} 位</VChip>
								</div>

								<div class="d-flex flex-wrap ga-2 mt-4">
									<VChip
										v-for="email in group.emails"
										:key="email"
										size="small"
										variant="outlined"
										closable
										:close-label="`移除 ${email}`"
										@click:close="removeRecipient(group.id, email)"
									>
										{{ email }}
									</VChip>
									<p v-if="group.emails.length === 0" class="text-caption text-error">
										尚未設定收件人，這個群組的告警不會送出。
									</p>
								</div>

								<div class="recipient-form mt-4">
									<VTextField
										:model-value="recipientInput[group.id] ?? ''"
										label="新增收件人電子郵件"
										placeholder="可一次貼上多筆，以逗號或空白分隔"
										:error-messages="recipientError[group.id] ? [recipientError[group.id]] : []"
										@update:model-value="recipientInput = { ...recipientInput, [group.id]: $event }"
										@keydown.enter="handleRecipientEnter(group.id, $event)"
									/>
									<VBtn color="primary" variant="tonal" @click="addRecipients(group.id)">加入</VBtn>
								</div>

								<VSelect
									:model-value="group.severities"
									:items="severityOptions"
									label="接收的嚴重度"
									multiple
									chips
									hide-details
									@update:model-value="updateGroupSeverities(group.id, $event)"
								/>
							</VCard>
						</VCol>
					</VRow>
				</section>

				<VRow>
					<VCol cols="12" lg="6">
						<VCard class="surface-border pa-5 h-100">
							<h2 class="section-heading mb-1">寄件設定</h2>
							<p class="text-body-2 text-medium-emphasis mb-4">
								SMTP 帳號與密碼由後端安全保存，不在此介面顯示或編輯。
							</p>
							<VTextField v-model="emailSettings.smtpHost" label="SMTP 主機" />
							<div class="smtp-row">
								<VTextField v-model.number="emailSettings.smtpPort" label="連接埠" type="number" />
								<VSelect v-model="emailSettings.encryption" :items="['TLS', 'SSL', '不加密']" label="加密方式" />
							</div>
							<VTextField v-model="emailSettings.senderName" label="寄件人名稱" />
							<VTextField
								v-model="emailSettings.senderAddress"
								label="寄件人電子郵件"
								type="email"
								:error-messages="isSenderValid ? [] : ['電子郵件格式不正確']"
							/>
							<VBtn color="primary" @click="saveEmailSettings">儲存寄件設定</VBtn>
							<VBtn class="ml-2" variant="outlined" @click="sendTestEmail">寄送測試信</VBtn>
						</VCard>
					</VCol>
					<VCol cols="12" lg="6">
						<VCard class="surface-border pa-5 h-100">
							<h2 class="section-heading mb-1">通知策略</h2>
							<p class="text-body-2 text-medium-emphasis mb-4">
								控制同一個告警重複通知的頻率，以及維護時段是否靜音。
							</p>
							<VSelect
								v-model.number="emailSettings.repeatIntervalMinutes"
								:items="[10, 30, 60, 240]"
								label="重複通知間隔（分鐘）"
							/>
							<VSelect
								v-model.number="emailSettings.groupWindowMinutes"
								:items="[1, 5, 15]"
								label="彙整視窗（分鐘）"
								hint="同一群組在視窗內的告警會合併成一封信"
								persistent-hint
							/>
							<VSwitch
								v-model="emailSettings.notifyOnResolved"
								color="primary"
								label="告警解除時也寄信通知"
								class="mt-3"
							/>
							<VSwitch v-model="emailSettings.isQuietHoursEnabled" color="primary" label="啟用靜音時段" />
							<div v-if="emailSettings.isQuietHoursEnabled" class="smtp-row">
								<VTextField v-model="emailSettings.quietHoursStart" label="靜音開始" type="time" />
								<VTextField v-model="emailSettings.quietHoursEnd" label="靜音結束" type="time" />
							</div>
							<VAlert v-if="emailSettings.isQuietHoursEnabled" type="info" variant="tonal" class="mb-4">
								靜音時段仍會記錄告警，嚴重等級會在時段結束後補送。
							</VAlert>
							<VBtn color="primary" @click="saveEmailSettings">儲存通知策略</VBtn>
						</VCard>
					</VCol>
				</VRow>
			</VWindowItem>

			<!-- > 告警紀錄：觸發、靜音與解除的完整過程 -->
			<VWindowItem value="alerts">
				<div class="d-flex flex-wrap align-center ga-2 mb-5">
					<VChip color="error" variant="tonal" size="small">觸發中 {{ alertSummary.firing }}</VChip>
					<VChip color="secondary" variant="tonal" size="small">已靜音 {{ alertSummary.silenced }}</VChip>
					<VChip color="success" variant="tonal" size="small">已解除 {{ alertSummary.resolved }}</VChip>
				</div>

				<VCard class="surface-border pa-5">
					<VTimeline side="end" density="compact" truncate-line="both">
						<VTimelineItem
							v-for="event in events"
							:key="event.id"
							:id="`alert-event-${event.id}`"
							:class="{ 'focused-alert-event': event.id === focusedEventId }"
							:dot-color="eventStatusMeta[event.status].color"
							size="small"
						>
							<div class="d-flex flex-wrap align-center ga-2">
								<p class="font-weight-bold">{{ event.ruleName }}</p>
								<VChip :color="eventStatusMeta[event.status].color" size="x-small" variant="tonal">
									<VIcon :icon="eventStatusMeta[event.status].icon" start size="12" aria-hidden="true" />
									{{ eventStatusMeta[event.status].label }}
								</VChip>
								<VChip size="x-small" variant="tonal">{{ severityMeta[event.severity].label }}</VChip>
							</div>
							<p class="text-caption text-medium-emphasis mt-1">
								觀測值 {{ event.observed }} · {{ event.startedAt }} · {{ event.durationLabel }}
							</p>
							<p class="text-caption mt-1" :class="event.notifyResult === '寄送失敗' ? 'text-error' : 'text-medium-emphasis'">
								電子郵件通知：{{ event.notifyResult }}<template v-if="event.notifiedCount > 0">（{{ event.notifiedCount }} 位收件人）</template>
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
					<VSelect v-model="ruleDraft.recipientGroupId" :items="groupOptions" label="通知收件人群組" />
					<VAlert type="info" variant="tonal" density="compact">
						觸發條件：{{ describeAlertRule(ruleDraft) }}
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
		<VDialog :model-value="Boolean(deleteTarget)" max-width="460" @update:model-value="deleteTarget = null">
			<VCard v-if="deleteTarget">
				<VCardTitle class="pa-6 pb-2">刪除告警規則？</VCardTitle>
				<VCardText class="pa-6 pt-2">
					刪除「{{ deleteTarget.name }}」後，這個條件不再產生告警，也不會再寄送通知。已發生的告警紀錄會保留。
				</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="deleteTarget = null">返回</VBtn>
					<VBtn color="error" @click="confirmDeleteRule">確認刪除</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
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

.recipient-form {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: var(--space-sm);
	align-items: start;
}

.smtp-row {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-sm);
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

.focused-alert-event {
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

	.rule-condition,
	.recipient-form,
	.smtp-row {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
