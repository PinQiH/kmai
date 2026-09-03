<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import type { DocumentVersionEntry } from '@/types'

interface ComponentProps {
	modelValue: string
	versions: DocumentVersionEntry[]
}

interface VersionSelectItem {
	title: string
	value: string
}

const DEFAULT_VISIBLE_VERSION_COUNT = 5

const props = defineProps<ComponentProps>()
const emit = defineEmits<{
	'update:modelValue': [version: string]
}>()

const componentId = useId()
const versionSelectId = `document-version-select-${componentId}`
const versionLabelId = `document-version-label-${componentId}`
const historyId = `document-version-history-${componentId}`
const historyHeadingId = `document-version-history-heading-${componentId}`
const historyListId = `document-version-history-list-${componentId}`
const isHistoryExpanded = ref(false)
const isShowingAllVersions = ref(false)

const orderedVersions = computed(() => (
	props.versions
		.map((version, originalIndex) => ({ originalIndex, version }))
		.sort((left, right) => {
			if (left.version.isCurrent !== right.version.isCurrent) {
				return left.version.isCurrent ? -1 : 1
			}

			const leftTime = Date.parse(left.version.date)
			const rightTime = Date.parse(right.version.date)
			if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
				return rightTime - leftTime
			}

			return left.originalIndex - right.originalIndex
		})
		.map(({ version }) => version)
))

const selectedVersionIndex = computed(() => (
	orderedVersions.value.findIndex((version) => version.version === props.modelValue)
))
const selectedPosition = computed(() => (
	selectedVersionIndex.value >= 0 ? selectedVersionIndex.value + 1 : 0
))
const versionSelectItems = computed<VersionSelectItem[]>(() => (
	orderedVersions.value.map((version) => ({
		title: `第 ${version.version} 版${version.isCurrent ? '（目前）' : ''} · ${version.date}`,
		value: version.version,
	}))
))
const visibleVersions = computed(() => (
	isShowingAllVersions.value
		? orderedVersions.value
		: orderedVersions.value.slice(0, DEFAULT_VISIBLE_VERSION_COUNT)
))
const canSelectNewerVersion = computed(() => selectedVersionIndex.value > 0)
const canSelectOlderVersion = computed(() => (
	selectedVersionIndex.value >= 0
	&& selectedVersionIndex.value < orderedVersions.value.length - 1
))
const hasMoreVersions = computed(() => (
	orderedVersions.value.length > DEFAULT_VISIBLE_VERSION_COUNT
))

watch(
	() => props.versions,
	() => {
		isHistoryExpanded.value = false
		isShowingAllVersions.value = false
	},
)

function selectVersion(version: string | null): void {
	if (!version || !orderedVersions.value.some((item) => item.version === version)) return

	emit('update:modelValue', version)
	if (isHistoryExpanded.value && orderedVersions.value.findIndex((item) => item.version === version) >= DEFAULT_VISIBLE_VERSION_COUNT) {
		isShowingAllVersions.value = true
	}
}

function selectVersionByOffset(offset: -1 | 1): void {
	const targetVersion = orderedVersions.value[selectedVersionIndex.value + offset]
	if (targetVersion) selectVersion(targetVersion.version)
}

function toggleHistory(): void {
	isHistoryExpanded.value = !isHistoryExpanded.value
	if (isHistoryExpanded.value && selectedVersionIndex.value >= DEFAULT_VISIBLE_VERSION_COUNT) {
		isShowingAllVersions.value = true
	}
}
</script>

<template>
	<section class="version-navigator" aria-label="文件版本">
		<div v-if="orderedVersions.length" class="version-toolbar surface-border">
			<div class="version-field">
				<label :id="versionLabelId" :for="versionSelectId">文件版本</label>
				<VAutocomplete
					:id="versionSelectId"
					:model-value="modelValue"
					:items="versionSelectItems"
					:aria-labelledby="versionLabelId"
					variant="outlined"
					density="compact"
					hide-details
					auto-select-first
					data-testid="version-select"
					@update:model-value="selectVersion"
				/>
			</div>

			<div class="version-step-actions" role="group" aria-label="依序切換文件版本">
				<VBtn
					variant="outlined"
					:disabled="!canSelectNewerVersion"
					data-testid="version-newer"
					@click="selectVersionByOffset(-1)"
				>
					較新版本
				</VBtn>
				<VBtn
					variant="outlined"
					:disabled="!canSelectOlderVersion"
					data-testid="version-older"
					@click="selectVersionByOffset(1)"
				>
					較舊版本
				</VBtn>
			</div>

			<p class="version-position">
				<span class="sr-only">目前位於第</span>{{ selectedPosition }} / {{ orderedVersions.length }}<span class="sr-only">個版本</span>
			</p>

			<VBtn
				variant="text"
				class="history-toggle"
				:append-icon="isHistoryExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
				:aria-expanded="isHistoryExpanded"
				:aria-controls="historyId"
				data-testid="version-history-toggle"
				@click="toggleHistory"
			>
				{{ isHistoryExpanded ? '收合版本紀錄' : `查看全部 ${orderedVersions.length} 個版本紀錄` }}
			</VBtn>
		</div>

		<div v-else class="version-empty surface-border" role="status">
			<h2>文件版本</h2>
			<p>尚無可供閱讀的版本紀錄。</p>
		</div>

		<section v-if="isHistoryExpanded" :id="historyId" class="version-history surface-border" :aria-labelledby="historyHeadingId">
			<header class="version-history-header">
				<div>
					<h2 :id="historyHeadingId">版本紀錄</h2>
					<p>依發布時間排列，選擇版本後會更新下方全文與 AI 摘要。</p>
				</div>
				<span>{{ orderedVersions.length }} 個版本</span>
			</header>

			<div class="version-history-columns" aria-hidden="true">
				<span>版本</span>
				<span>日期</span>
				<span>作者</span>
				<span>版本摘要</span>
			</div>
			<ol :id="historyListId" class="version-history-list">
				<li v-for="version in visibleVersions" :key="`${version.version}-${version.date}`">
					<button
						type="button"
						class="version-history-row"
						:class="{ 'is-selected': version.version === modelValue }"
						:aria-current="version.version === modelValue ? 'true' : undefined"
						:aria-label="`第 ${version.version} 版${version.isCurrent ? '，目前版本' : ''}，日期 ${version.date}，作者 ${version.author}，版本摘要：${version.summary}`"
						:data-testid="`version-history-${version.version}`"
						@click="selectVersion(version.version)"
					>
						<span class="version-history-name">
							<strong>第 {{ version.version }} 版</strong>
							<VChip v-if="version.isCurrent" color="primary" variant="tonal" size="x-small">目前版本</VChip>
						</span>
						<time :datetime="version.date">{{ version.date }}</time>
						<span class="version-history-author">{{ version.author }}</span>
						<span class="version-history-summary">{{ version.summary }}</span>
					</button>
				</li>
			</ol>

			<div v-if="hasMoreVersions" class="version-history-more">
				<VBtn
					variant="text"
					:append-icon="isShowingAllVersions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
					:aria-expanded="isShowingAllVersions"
					:aria-controls="historyListId"
					data-testid="version-history-more"
					@click="isShowingAllVersions = !isShowingAllVersions"
				>
					{{ isShowingAllVersions ? '收合較舊版本' : `顯示其餘 ${orderedVersions.length - DEFAULT_VISIBLE_VERSION_COUNT} 個版本` }}
				</VBtn>
			</div>
		</section>
	</section>
</template>

<style scoped>
.version-navigator {
	display: grid;
	gap: var(--space-sm);
	margin-block: var(--space-lg);
}

.version-toolbar {
	display: flex;
	align-items: flex-end;
	gap: var(--space-sm);
	padding: var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
}

.version-field {
	display: grid;
	flex: 1 1 300px;
	gap: var(--space-xs);
	max-width: 420px;
}

.version-field label {
	color: var(--ink-muted);
	font-size: 0.78rem;
	font-weight: 700;
}

.version-step-actions {
	display: flex;
	gap: var(--space-sm);
}

.version-step-actions :deep(.v-btn),
.history-toggle {
	min-height: 44px;
}

.version-position {
	display: flex;
	min-width: 58px;
	min-height: 44px;
	align-items: center;
	justify-content: center;
	margin: 0;
	color: var(--ink-muted);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.history-toggle {
	margin-left: auto;
}

.version-history {
	overflow: hidden;
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
}

.version-history-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-lg);
	padding: var(--space-md) var(--space-lg);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.version-history-header h2,
.version-empty h2 {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.version-history-header p,
.version-empty p {
	margin: var(--space-xs) 0 0;
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.5;
}

.version-history-header > span {
	flex: 0 0 auto;
	color: var(--ink-muted);
	font-family: var(--font-mono);
	font-size: 0.74rem;
}

.version-history-columns,
.version-history-row {
	display: grid;
	grid-template-columns: minmax(110px, 0.7fr) 110px minmax(120px, 0.8fr) minmax(240px, 2fr);
	gap: var(--space-md);
	align-items: center;
}

.version-history-columns {
	padding: 10px var(--space-lg);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
	color: var(--ink-muted);
	font-size: 0.74rem;
	font-weight: 700;
}

.version-history-list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.version-history-list li + li {
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.version-history-row {
	width: 100%;
	min-height: 56px;
	padding: 10px var(--space-lg);
	border: 0;
	background: transparent;
	color: var(--ink-strong);
	cursor: pointer;
	font: inherit;
	text-align: left;
	transition: background-color var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out);
}

.version-history-row:hover {
	background: var(--tint-hover);
}

.version-history-row.is-selected {
	background: var(--tint-active);
	box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.version-history-row:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: -3px;
}

.version-history-name {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-xs);
}

.version-history-name strong {
	font-size: 0.9rem;
}

.version-history-row time,
.version-history-author {
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.version-history-summary {
	min-width: 0;
	font-size: 0.84rem;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.version-history-more {
	display: flex;
	justify-content: center;
	padding: var(--space-xs);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.version-empty {
	padding: var(--space-lg);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
	text-align: center;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 1200px) {
	.version-toolbar {
		flex-wrap: wrap;
	}

	.version-field {
		max-width: none;
	}

	.history-toggle {
		margin-left: 0;
	}

	.version-history-columns {
		display: none;
	}

	.version-history-row {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-xs) var(--space-md);
	}

	.version-history-author {
		grid-column: 1;
	}

	.version-history-summary {
		grid-column: 1 / -1;
	}
}

@media (max-width: 600px) {
	.version-field {
		flex-basis: 100%;
	}

	.version-step-actions {
		flex: 1 1 auto;
	}

	.version-step-actions :deep(.v-btn) {
		flex: 1 1 0;
	}

	.version-position {
		margin-left: auto;
	}

	.history-toggle {
		width: 100%;
	}

	.version-history-header {
		padding-inline: var(--space-md);
	}

	.version-history-row {
		padding-inline: var(--space-md);
	}
}

@media (prefers-reduced-motion: reduce) {
	.version-history-row {
		transition: none;
	}
}
</style>
