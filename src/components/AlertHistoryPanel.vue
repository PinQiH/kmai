<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useMonitoringStore } from '@/stores/monitoring'
import { useNotificationsStore } from '@/stores/notifications'
import type { AlertEvent, AlertEventStatus, AlertSeverity } from '@/types'
import {
	ALERT_EVENT_STATUS_META,
	ALERT_SEVERITY_META,
	ALL_FILTER,
	describeAlertDeliverySnapshot,
	filterAlertEvents,
} from '@/utils/monitoring'
import { formatNotificationTimestamp } from '@/utils/notifications'
import { SYSTEM_RECORD_TIME_RANGE_OPTIONS, type SystemRecordTimeRange } from '@/utils/systemRecords'

// > 告警紀錄：觸發、靜音、解除的完整歷史，供事後追溯

const route = useRoute()
const monitoringStore = useMonitoringStore()
const notificationsStore = useNotificationsStore()
const { events } = storeToRefs(monitoringStore)

const status = ref<AlertEventStatus | typeof ALL_FILTER>(ALL_FILTER)
const severity = ref<AlertSeverity | typeof ALL_FILTER>(ALL_FILTER)
const keyword = ref('')
const timeRange = ref<SystemRecordTimeRange>('all')
const expandedIds = ref<string[]>([])

const statusOptions = [
	{ title: '全部狀態', value: ALL_FILTER },
	{ title: '觸發中', value: 'firing' },
	{ title: '已靜音', value: 'silenced' },
	{ title: '已解除', value: 'resolved' },
]
const severityOptions = [
	{ title: '全部嚴重度', value: ALL_FILTER },
	{ title: '嚴重', value: 'critical' },
	{ title: '警告', value: 'warning' },
	{ title: '資訊', value: 'info' },
]
const headers = [
	{ title: '發生時間', key: 'occurredAt', width: 180 },
	{ title: '告警規則', key: 'ruleName', minWidth: 220 },
	{ title: '嚴重度', key: 'severity', width: 110 },
	{ title: '狀態', key: 'status', width: 110 },
	{ title: '觀測值', key: 'observed', minWidth: 180, sortable: false },
	{ title: '', key: 'data-table-expand', width: 56 },
]
const sortBy = [{ key: 'occurredAt', order: 'desc' as const }]

const focusedEventId = computed(() => (typeof route.query.eventId === 'string' ? route.query.eventId : null))
const alertHistory = computed(() =>
	filterAlertEvents(events.value, {
		status: status.value,
		severity: severity.value,
		keyword: keyword.value,
		timeRange: timeRange.value,
		now: notificationsStore.deliveryClock,
	}),
)
const hasFilters = computed(
	() =>
		status.value !== ALL_FILTER ||
		severity.value !== ALL_FILTER ||
		keyword.value.trim().length > 0 ||
		timeRange.value !== 'all',
)

function resetFilters(): void {
	status.value = ALL_FILTER
	severity.value = ALL_FILTER
	keyword.value = ''
	timeRange.value = 'all'
}

// > 從通知點進來的已解除告警會帶 eventId；清掉篩選確保該筆可見，並直接展開
watch(
	focusedEventId,
	(eventId) => {
		if (!eventId || !events.value.some((event) => event.id === eventId)) return
		resetFilters()
		expandedIds.value = [eventId]
	},
	{ immediate: true },
)

function rowProps({ item }: { item: AlertEvent }): Record<string, unknown> {
	return item.id === focusedEventId.value ? { class: 'focused-history-row' } : {}
}
</script>

<template>
	<div>
		<div class="history-filters mb-5">
			<FilterSearchField
				v-model="keyword"
				label="搜尋告警紀錄"
				placeholder="告警規則、觀測值或通知結果"
			/>
			<VSelect v-model="severity" :items="severityOptions" label="嚴重度" hide-details />
			<VSelect v-model="status" :items="statusOptions" label="狀態" hide-details />
			<VSelect v-model="timeRange" :items="SYSTEM_RECORD_TIME_RANGE_OPTIONS" label="時間範圍" hide-details />
		</div>
		<p class="text-caption text-medium-emphasis mb-3">共 {{ alertHistory.length }} 筆符合條件</p>

		<VCard v-if="alertHistory.length > 0" class="surface-border overflow-hidden" data-testid="alert-history-table">
			<VDataTable
				v-model:expanded="expandedIds"
				:headers="headers"
				:items="alertHistory"
				:items-per-page="25"
				:sort-by="sortBy"
				:row-props="rowProps"
				item-value="id"
				show-expand
				hover
			>
				<template #item.occurredAt="{ item }">{{ formatNotificationTimestamp(item.occurredAt) }}</template>
				<template #item.ruleName="{ item }">
					<p class="font-weight-bold py-2">{{ item.ruleName }}</p>
				</template>
				<template #item.severity="{ item }">
					<VChip :color="ALERT_SEVERITY_META[item.severity].color" size="small" variant="tonal">
						<VIcon :icon="ALERT_SEVERITY_META[item.severity].icon" start size="14" aria-hidden="true" />
						{{ ALERT_SEVERITY_META[item.severity].label }}
					</VChip>
				</template>
				<template #item.status="{ item }">
					<VChip :color="ALERT_EVENT_STATUS_META[item.status].color" size="small" variant="outlined">
						{{ ALERT_EVENT_STATUS_META[item.status].label }}
					</VChip>
				</template>
				<template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
					<VBtn
						:icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
						:aria-label="`${isExpanded(internalItem) ? '收合' : '展開'}「${internalItem.raw.ruleName}」詳情`"
						:aria-expanded="isExpanded(internalItem)"
						variant="text"
						size="small"
						@click="toggleExpand(internalItem)"
					/>
				</template>
				<template #expanded-row="{ columns, item }">
					<tr class="expanded-detail-row">
						<td :colspan="columns.length">
							<dl class="alert-detail" data-testid="alert-history-detail">
								<div><dt>持續／處理</dt><dd>{{ item.durationLabel }}</dd></div>
								<div>
									<dt>觸發時的通知</dt>
									<dd data-testid="alert-history-delivery">
										<span class="d-block">{{ describeAlertDeliverySnapshot(item.delivery) }}</span>
										<RouterLink
											v-if="item.delivery.outcome === 'notified'"
											to="/admin/notifications?tab=notifications"
											class="delivery-link"
										>
											在通知管理查看發送紀錄
										</RouterLink>
									</dd>
								</div>
							</dl>
						</td>
					</tr>
				</template>
			</VDataTable>
		</VCard>
		<StatePanel
			v-else
			icon="mdi-bell-off-outline"
			:title="hasFilters ? '找不到符合條件的告警紀錄' : '目前沒有告警紀錄'"
			:description="hasFilters ? '請調整搜尋字詞或篩選條件。' : '告警規則觸發後，完整過程會留存在這裡。'"
			:action-label="hasFilters ? '清除篩選' : undefined"
			@action="resetFilters"
		/>
	</div>
</template>

<style scoped>
.history-filters {
	display: grid;
	grid-template-columns: minmax(260px, 1.5fr) repeat(3, minmax(140px, 0.6fr));
	gap: var(--space-sm);
}

.expanded-detail-row td {
	background: rgb(var(--v-theme-surface-variant), 0.35);
}

.alert-detail {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-sm) var(--space-lg);
	padding: var(--space-md) var(--space-sm);
}

.alert-detail div {
	display: grid;
	gap: 2px;
}

.alert-detail dt {
	font-size: 0.75rem;
	color: rgb(var(--v-theme-on-surface-variant));
}

.delivery-link {
	display: inline-block;
	margin-top: 4px;
	font-size: 0.8rem;
	color: rgb(var(--v-theme-primary));
}

:deep(.focused-history-row) > td {
	background: var(--tint-active);
}

:deep(.v-data-table table) {
	min-width: 920px;
}

@media (max-width: 900px) {
	.history-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 700px) {
	.history-filters,
	.alert-detail {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
