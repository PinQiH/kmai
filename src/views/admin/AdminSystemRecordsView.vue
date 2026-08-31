<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { baseSystemRecords } from '@/mocks/systemRecords'
import { useMonitoringStore } from '@/stores/monitoring'
import { useNotificationsStore } from '@/stores/notifications'
import type { SystemRecordCategory, SystemRecordLevel } from '@/types'
import { formatNotificationTimestamp } from '@/utils/notifications'
import {
	buildSystemRecords,
	getSystemRecordTimeCutoff,
	type SystemRecordTimeRange,
} from '@/utils/systemRecords'

type CategoryFilter = SystemRecordCategory | 'all'
type LevelFilter = SystemRecordLevel | 'all'

const notificationsStore = useNotificationsStore()
const monitoringStore = useMonitoringStore()

const keyword = ref('')
const categoryFilter = ref<CategoryFilter>('all')
const levelFilter = ref<LevelFilter>('all')
const timeRangeFilter = ref<SystemRecordTimeRange>('all')

const categoryMeta: Record<SystemRecordCategory, { label: string; color: string; icon: string }> = {
	auth: { label: '登入登出', color: 'primary', icon: 'mdi-login-variant' },
	ai: { label: 'AI 問答', color: 'secondary', icon: 'mdi-creation-outline' },
	job: { label: '排程', color: 'info', icon: 'mdi-calendar-clock-outline' },
	audit: { label: '操作稽核', color: 'deep-orange', icon: 'mdi-clipboard-text-search-outline' },
	notification: { label: '通知', color: 'primary', icon: 'mdi-bell-outline' },
	alert: { label: '告警', color: 'error', icon: 'mdi-alert-outline' },
}
const levelMeta: Record<SystemRecordLevel, { label: string; color: string }> = {
	info: { label: '一般', color: 'info' },
	success: { label: '成功', color: 'success' },
	warning: { label: '注意', color: 'warning' },
	error: { label: '錯誤', color: 'error' },
}
const categoryOptions = [
	{ title: '全部事件', value: 'all' },
	...Object.entries(categoryMeta).map(([value, meta]) => ({ title: meta.label, value })),
]
const levelOptions = [
	{ title: '全部等級', value: 'all' },
	...Object.entries(levelMeta).map(([value, meta]) => ({ title: meta.label, value })),
]
const timeRangeOptions = [
	{ title: '全部時間', value: 'all' },
	{ title: '最近 1 小時', value: '1h' },
	{ title: '最近 24 小時', value: '24h' },
	{ title: '最近 7 天', value: '7d' },
]
const headers = [
	{ title: '時間', key: 'occurredAt', width: 190 },
	{ title: '類型', key: 'category', width: 130 },
	{ title: '事件', key: 'title' },
	{ title: '狀態', key: 'statusLabel', width: 110 },
	{ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 100 },
]

const records = computed(() =>
	buildSystemRecords(
		baseSystemRecords,
		notificationsStore.notifications,
		monitoringStore.events,
		new Date(notificationsStore.deliveryClock),
	),
)
const visibleRecords = computed(() => {
	const normalizedKeyword = keyword.value.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(timeRangeFilter.value, notificationsStore.deliveryClock)

	return records.value.filter((record) => {
		const matchesCategory = categoryFilter.value === 'all' || record.category === categoryFilter.value
		const matchesLevel = levelFilter.value === 'all' || record.level === levelFilter.value
		const matchesTime = Date.parse(record.occurredAt) >= cutoff
		const matchesKeyword = !normalizedKeyword || `${record.title} ${record.summary} ${record.statusLabel}`
			.toLocaleLowerCase('zh-TW')
			.includes(normalizedKeyword)
		return matchesCategory && matchesLevel && matchesTime && matchesKeyword
	})
})

function resetFilters(): void {
	keyword.value = ''
	categoryFilter.value = 'all'
	levelFilter.value = 'all'
	timeRangeFilter.value = 'all'
}
</script>

<template>
	<div class="page-shell">
		<PageHeader
			eyebrow="跨領域追溯"
			title="系統紀錄"
			description="跨類型唯讀查詢與追溯入口；通知成效及告警處置仍在各自管理頁完成。"
		/>

		<VAlert type="info" variant="tonal" class="mb-6">
			此處只提供整合查詢；通知發送與告警處理仍須回到各自的管理頁面操作。
		</VAlert>

		<div class="record-filters mb-5">
			<VTextField
				:model-value="keyword"
				label="搜尋系統紀錄"
				placeholder="輸入事件、狀態或摘要"
				prepend-inner-icon="mdi-magnify"
				clearable
				hide-details
				@update:model-value="keyword = $event ?? ''"
			/>
			<VSelect v-model="categoryFilter" :items="categoryOptions" label="事件類型" hide-details />
			<VSelect v-model="levelFilter" :items="levelOptions" label="等級" hide-details />
			<VSelect v-model="timeRangeFilter" :items="timeRangeOptions" label="時間範圍" hide-details />
		</div>

		<VCard v-if="visibleRecords.length > 0" class="surface-border overflow-hidden" data-testid="system-record-table">
			<VDataTable :headers="headers" :items="visibleRecords" item-value="id" hover class="system-record-table">
				<template #item.occurredAt="{ item }">{{ formatNotificationTimestamp(item.occurredAt) }}</template>
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
					<VChip :color="levelMeta[item.level].color" size="small" variant="outlined">{{ item.statusLabel }}</VChip>
				</template>
				<template #item.actions="{ item }">
					<VBtn v-if="item.sourceTo" :to="item.sourceTo" variant="text" size="small">查看來源</VBtn>
					<span v-else class="text-caption text-medium-emphasis">—</span>
				</template>
			</VDataTable>
		</VCard>
		<StatePanel
			v-else
			icon="mdi-text-search"
			title="找不到符合的系統紀錄"
			description="請放寬事件類型、等級、時間範圍或搜尋文字。"
			action-label="清除所有條件"
			@action="resetFilters"
		/>
	</div>
</template>

<style scoped>
.record-filters {
	display: grid;
	grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(150px, 0.6fr));
	gap: var(--space-sm);
}

.system-record-table :deep(table) {
	min-width: 820px;
}

@media (max-width: 900px) {
	.record-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 600px) {
	.record-filters {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
