<script setup lang="ts">
import { computed, ref } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import StatePanel from '@/components/StatePanel.vue'
import { baseSystemRecords } from '@/mocks/systemRecords'
import { useAppStore } from '@/stores/app'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotificationsStore } from '@/stores/notifications'
import { systemRecordCategoryPalette } from '@/theme'
import type { SystemRecordCategory, SystemRecordEntry, SystemRecordLevel } from '@/types'
import { buildCsvFileName, downloadCsvFile, toCsvContent, type CsvColumn } from '@/utils/csv'
import { formatNotificationTimestamp } from '@/utils/notifications'
import {
	buildLogQueryLink,
	buildSystemEventRecords,
	getSystemRecordTimeCutoff,
	SYSTEM_EVENT_CATEGORIES,
	SYSTEM_RECORD_LEVEL_META,
	SYSTEM_RECORD_PAGE_SIZE,
	SYSTEM_RECORD_PAGE_SIZE_OPTIONS,
	SYSTEM_RECORD_TIME_RANGE_OPTIONS,
	type SystemRecordTimeRange,
} from '@/utils/systemRecords'

// > 系統紀錄頁的「系統事件」分頁：登入登出與排程工作，可篩選、展開詳情並匯出 CSV

type CategoryFilter = SystemRecordCategory | 'all'
type LevelFilter = SystemRecordLevel | 'all'

const appStore = useAppStore()
const assistantAuditStore = useAssistantAuditStore()
const notificationsStore = useNotificationsStore()

const keyword = ref('')
const categoryFilter = ref<CategoryFilter>('all')
const levelFilter = ref<LevelFilter>('all')
const timeRangeFilter = ref<SystemRecordTimeRange>('all')

const sortBy = [{ key: 'occurredAt', order: 'desc' as const }]
const headers = [
	{ title: '發生時間', key: 'occurredAt', width: 180 },
	{ title: '類別', key: 'category', width: 130 },
	{ title: '事件', key: 'title', minWidth: 320 },
	{ title: '狀態', key: 'statusLabel', width: 120 },
	{ title: '', key: 'data-table-expand', width: 56 },
]
const categoryMeta: Record<SystemRecordCategory, { label: string; icon: string }> = {
	auth: { label: '登入登出', icon: 'mdi-login-variant' },
	ai: { label: 'AI 問答', icon: 'mdi-creation-outline' },
	job: { label: '排程工作', icon: 'mdi-calendar-clock-outline' },
	audit: { label: '操作稽核', icon: 'mdi-clipboard-text-search-outline' },
	notification: { label: '通知', icon: 'mdi-bell-outline' },
	alert: { label: '告警', icon: 'mdi-alert-outline' },
}
const categoryOptions = [
	{ title: '全部類別', value: 'all' },
	...SYSTEM_EVENT_CATEGORIES.map((category) => ({ title: categoryMeta[category].label, value: category })),
]
const levelOptions = [
	{ title: '全部等級', value: 'all' },
	...Object.entries(SYSTEM_RECORD_LEVEL_META).map(([value, meta]) => ({ title: meta.label, value })),
]

const allRecords = computed(() => buildSystemEventRecords(baseSystemRecords))
const records = computed(() => {
	const normalizedKeyword = keyword.value.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(timeRangeFilter.value, notificationsStore.deliveryClock)

	return allRecords.value.filter((record) => {
		const matchesCategory = categoryFilter.value === 'all' || record.category === categoryFilter.value
		const matchesLevel = levelFilter.value === 'all' || record.level === levelFilter.value
		const matchesTime = Date.parse(record.occurredAt) >= cutoff
		// > 詳情也要搜得到，否則展開後才看得到的帳號、IP、排程名稱會找不到
		const detailText = (record.details ?? []).map((detail) => detail.value).join(' ')
		const searchableText = `${record.title} ${record.summary} ${record.statusLabel} ${detailText}`.toLocaleLowerCase('zh-TW')
		return matchesCategory && matchesLevel && matchesTime && (!normalizedKeyword || searchableText.includes(normalizedKeyword))
	})
})

function resetFilters(): void {
	keyword.value = ''
	categoryFilter.value = 'all'
	levelFilter.value = 'all'
	timeRangeFilter.value = 'all'
}

const csvColumns: CsvColumn<SystemRecordEntry>[] = [
	{ label: '時間', value: (record) => formatNotificationTimestamp(record.occurredAt) },
	{ label: '類別', value: (record) => categoryMeta[record.category].label },
	{ label: '事件', value: (record) => record.title },
	{ label: '摘要', value: (record) => record.summary },
	{ label: '狀態', value: (record) => record.statusLabel },
	{ label: '詳情', value: (record) => (record.details ?? []).map((detail) => `${detail.label}：${detail.value}`).join('；') },
	{ label: 'Request ID', value: (record) => record.requestId ?? '' },
]

function exportRecords(): void {
	if (records.value.length === 0) return
	downloadCsvFile(buildCsvFileName('system-events'), toCsvContent(csvColumns, records.value))
	assistantAuditStore.recordRecordExport({ scope: 'system_event.export', rowCount: records.value.length })
}
</script>

<template>
	<div>
		<VAlert type="info" variant="tonal" class="mb-5">
			系統事件只收登入登出與排程工作，點選列尾的箭頭可展開詳情。
			通知請至「通知管理 → 發送紀錄」，告警請至「營運監控 → 告警紀錄」，服務原始日誌請至「營運監控 → 日誌查詢」。
		</VAlert>
		<div class="event-filters mb-5">
			<FilterSearchField
				v-model="keyword"
				label="搜尋系統事件"
				placeholder="事件、帳號、IP 或排程名稱"
			/>
			<VSelect v-model="categoryFilter" :items="categoryOptions" label="事件類別" hide-details />
			<VSelect v-model="levelFilter" :items="levelOptions" label="等級" hide-details />
			<VSelect v-model="timeRangeFilter" :items="SYSTEM_RECORD_TIME_RANGE_OPTIONS" label="時間範圍" hide-details />
		</div>
		<div class="records-toolbar mb-3">
			<p class="text-caption text-medium-emphasis">共 {{ records.length }} 筆符合條件</p>
			<VBtn
				:disabled="records.length === 0"
				prepend-icon="mdi-tray-arrow-down"
				variant="tonal"
				size="small"
				data-testid="export-system-events"
				@click="exportRecords"
			>
				匯出 CSV
			</VBtn>
		</div>
		<VCard
			v-if="records.length > 0"
			class="surface-border overflow-hidden"
			data-testid="system-event-table"
		>
			<VDataTable
				:headers="headers"
				:items="records"
				:items-per-page="SYSTEM_RECORD_PAGE_SIZE"
				:items-per-page-options="SYSTEM_RECORD_PAGE_SIZE_OPTIONS"
				:sort-by="sortBy"
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
					<VChip :color="SYSTEM_RECORD_LEVEL_META[item.level].color" size="small" variant="outlined">
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
											:to="buildLogQueryLink(item.requestId)"
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
			@action="resetFilters"
		/>
	</div>
</template>

<style scoped>
.event-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(150px, 0.65fr));
	gap: var(--space-sm);
}

.records-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
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

.request-id-link {
	padding-inline: 4px;
	font-family: var(--font-mono);
	font-size: 0.78rem;
	text-transform: none;
}

:deep(.v-data-table table) {
	min-width: 920px;
}

@media (max-width: 900px) {
	.event-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.event-filters,
	.event-detail {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
