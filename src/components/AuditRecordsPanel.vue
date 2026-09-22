<script setup lang="ts">
import { computed, ref } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import StatePanel from '@/components/StatePanel.vue'
import { baseSystemRecords } from '@/repositories/systemRecords.repository'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotificationsStore } from '@/stores/notifications'
import type { SystemRecordEntry } from '@/types'
import { buildCsvFileName, downloadCsvFile, toCsvContent, type CsvColumn } from '@/utils/csv'
import { formatNotificationTimestamp } from '@/utils/notifications'
import {
	buildAuditRecords,
	buildLogQueryLink,
	filterAuditRecords,
	SYSTEM_RECORD_LEVEL_META,
	SYSTEM_RECORD_PAGE_SIZE,
	SYSTEM_RECORD_PAGE_SIZE_OPTIONS,
	SYSTEM_RECORD_TIME_RANGE_OPTIONS,
	type SystemRecordTimeRange,
} from '@/utils/systemRecords'

// > 系統紀錄頁的「操作稽核」分頁：受管制的特權操作，可篩選並匯出 CSV（不含被調閱的內容）

const assistantAuditStore = useAssistantAuditStore()
const notificationsStore = useNotificationsStore()

const keyword = ref('')
const actorFilter = ref('all')
const timeRangeFilter = ref<SystemRecordTimeRange>('all')

const sortBy = [{ key: 'occurredAt', order: 'desc' as const }]
const headers = [
	{ title: '操作時間', key: 'occurredAt', width: 170 },
	{ title: '操作者', key: 'actorLabel', width: 210 },
	{ title: '操作項目', key: 'operationLabel', width: 210 },
	{ title: '操作對象', key: 'resourceName', minWidth: 240 },
	{ title: '結果', key: 'statusLabel', width: 100 },
	{ title: 'Request ID', key: 'requestId', width: 210 },
]

const allRecords = computed(() => buildAuditRecords(baseSystemRecords, assistantAuditStore.inspectionRecords))
const actorOptions = computed(() => [
	{ title: '全部操作者', value: 'all' },
	...Array.from(
		new Set(
			allRecords.value
				.map((record) => record.actorLabel)
				.filter((actorLabel): actorLabel is string => Boolean(actorLabel)),
		),
	)
		.sort((left, right) => left.localeCompare(right, 'zh-TW'))
		.map((actorLabel) => ({ title: actorLabel, value: actorLabel })),
])
const records = computed(() =>
	filterAuditRecords(allRecords.value, {
		keyword: keyword.value,
		actorLabel: actorFilter.value,
		timeRange: timeRangeFilter.value,
		now: notificationsStore.deliveryClock,
	}),
)
const hasFilters = computed(
	() =>
		keyword.value.trim().length > 0 ||
		actorFilter.value !== 'all' ||
		timeRangeFilter.value !== 'all',
)

function resetFilters(): void {
	keyword.value = ''
	actorFilter.value = 'all'
	timeRangeFilter.value = 'all'
}

// ! 稽核匯出只帶欄位摘要，不得加入問題、回答或引用原文
const csvColumns: CsvColumn<SystemRecordEntry>[] = [
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

function exportRecords(): void {
	if (records.value.length === 0) return
	const rowCount = records.value.length
	downloadCsvFile(buildCsvFileName('system-audit'), toCsvContent(csvColumns, records.value))
	assistantAuditStore.recordRecordExport({ scope: 'audit_record.export', rowCount })
}
</script>

<template>
	<div>
		<VAlert type="info" variant="tonal" class="mb-5">
			記錄受管制的特權操作，包含操作者帳號與來源 IP、操作項目、操作對象與結果，不保存被調閱的內容。
			各 API 呼叫的逐筆結果屬於服務日誌，點選 Request ID 可查看該次請求的完整日誌。
		</VAlert>
		<div class="audit-filters mb-5">
			<FilterSearchField
				v-model="keyword"
				label="搜尋操作稽核"
				placeholder="操作者、資源、操作範圍、Request ID 或狀態"
			/>
			<VSelect v-model="actorFilter" :items="actorOptions" label="操作者" hide-details />
			<VSelect v-model="timeRangeFilter" :items="SYSTEM_RECORD_TIME_RANGE_OPTIONS" label="時間範圍" hide-details />
		</div>
		<div class="records-toolbar mb-3">
			<p class="text-caption text-medium-emphasis">共 {{ records.length }} 筆符合條件</p>
			<VBtn
				:disabled="records.length === 0"
				prepend-icon="mdi-tray-arrow-down"
				variant="tonal"
				size="small"
				data-testid="export-audit-records"
				@click="exportRecords"
			>
				匯出 CSV
			</VBtn>
		</div>
		<VCard v-if="records.length > 0" class="surface-border overflow-hidden" data-testid="audit-record-table">
			<VDataTable
				:headers="headers"
				:items="records"
				:items-per-page="SYSTEM_RECORD_PAGE_SIZE"
				:items-per-page-options="SYSTEM_RECORD_PAGE_SIZE_OPTIONS"
				:sort-by="sortBy"
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
						:to="buildLogQueryLink(item.requestId)"
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
					<VChip :color="SYSTEM_RECORD_LEVEL_META[item.level].color" size="small" variant="outlined">
						{{ item.statusLabel }}
					</VChip>
				</template>
			</VDataTable>
		</VCard>
		<StatePanel
			v-else
			icon="mdi-clipboard-text-search-outline"
			:title="hasFilters ? '找不到符合條件的操作稽核' : '目前沒有操作稽核'"
			:description="
				hasFilters ? '請調整搜尋字詞或篩選條件。' : '管理者執行受控操作後，稽核紀錄會顯示在這裡。'
			"
			:action-label="hasFilters ? '清除篩選' : undefined"
			@action="resetFilters"
		/>
	</div>
</template>

<style scoped>
.audit-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(2, minmax(150px, 0.65fr));
	gap: var(--space-sm);
}

.records-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm);
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

:deep(.v-data-table table) {
	min-width: 920px;
}

@media (max-width: 900px) {
	.audit-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.audit-filters {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
