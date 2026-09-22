<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { describeProfile, getAssignedProfile, getConnection, getProfilesByKind, getUsage } from '@/repositories/systemResources.repository'
import { hasEditedChunks, processingStages, type ProcessingStageId } from '@/repositories/documents.repository'
import { getVersionCount, reprocessAllVersions } from '@/repositories/documents.repository'
import {
	chunkOptionsError,
	describeOptions,
	documentOverrideEnabled,
	documentStrategyOverrides,
	fileTypeOverrideEnabled,
	fileTypeStrategyOverrides,
	getDocumentFileTypeId,
	getEarliestPendingStage,
	getFileTypeName,
	getStrategyUsage,
	markStrategyChanged,
	pendingStrategyStages,
	removeStageOverride,
	resolveInheritedStrategy,
	resolveStageProfile,
	resolveStrategy,
	saveStrategy,
	strategySourceLabels,
	type ResolvedStage,
	type StrategyOptions,
	type StrategySource,
} from '@/repositories/documents.repository'

interface ComponentProps {
	/** 編輯單一文件的策略；優先於 fileTypeId。 */
	documentId?: string
	/** 編輯某檔案類型的策略；兩者都省略代表編輯全域策略。 */
	fileTypeId?: string
}

const props = defineProps<ComponentProps>()

const emit = defineEmits<{
	/** 文件已依新策略排入重新處理。 */
	reprocessed: [fromStageId: ProcessingStageId]
}>()

interface DraftStage {
	stageId: string
	strategyId: string
	options: StrategyOptions
}

const overrideEnabled = ref(false)
const drafts = ref<Record<string, DraftStage>>({})
const optionsTarget = ref<string | null>(null)
const optionsError = ref('')
const feedback = ref('')

const scope = computed<StrategySource>(() => (props.documentId ? 'document' : props.fileTypeId ? 'fileType' : 'global'))
const scopeLabel = computed(() => strategySourceLabels[scope.value])
const resolved = computed(() => resolveStrategy(props.documentId, props.documentId ? undefined : props.fileTypeId))
const inherited = computed(() => resolveInheritedStrategy(props.documentId))
const isLocked = computed(() => scope.value !== 'global' && !overrideEnabled.value)
const fileTypeName = computed(() => getFileTypeName(props.fileTypeId))
const documentFileTypeId = computed(() => (props.documentId ? getDocumentFileTypeId(props.documentId) : undefined))
const storedOverrideEnabled = computed(() => {
	if (props.documentId) return Boolean(documentOverrideEnabled[props.documentId])
	if (props.fileTypeId) return Boolean(fileTypeOverrideEnabled[props.fileTypeId])
	return true
})

/** 取得某步驟目前畫面上的設定（含尚未儲存的變更）。 */
function currentStage(stageId: string): DraftStage {
	const draft = drafts.value[stageId]
	if (draft) return draft
	const stage = resolved.value.find((entry) => entry.stageId === stageId)!
	return { stageId, strategyId: stage.strategyId, options: { ...stage.options } }
}

function getSource(stageId: string): StrategySource {
	if (drafts.value[stageId]) return scope.value
	return resolved.value.find((entry) => entry.stageId === stageId)?.source ?? 'global'
}

/** 這一步是否由目前編輯的層級覆寫；是的話才能「恢復沿用上層」。 */
function isOwnOverride(stageId: string): boolean {
	return scope.value !== 'global' && !drafts.value[stageId] && getSource(stageId) === scope.value
}

function getInheritedLabel(stageId: string): string {
	return strategySourceLabels[inherited.value.find((entry) => entry.stageId === stageId)?.source ?? 'global']
}

function getStrategyMeta(stageId: string, strategyId: string) {
	return processingStages.find((stage) => stage.id === stageId)?.strategies.find((strategy) => strategy.id === strategyId)
}

/** 只有切段與摘要還有步驟專屬參數；模型與解析參數改由系統資源設定檔提供。 */
function hasStageParams(stageId: string): boolean {
	const stage = currentStage(stageId)
	return (stageId === 'chunk' || stageId === 'summarize') && Boolean(getStrategyMeta(stageId, stage.strategyId)?.hasOptions)
}

function getResourceItems(stageId: string) {
	const usageId = getStrategyUsage(currentStage(stageId).strategyId)
	if (!usageId) return []
	const profiles = getProfilesByKind(getUsage(usageId).kind).map((profile) => ({ title: profile.name, subtitle: describeProfile(profile), value: profile.id as string | null }))
	// @ 全域是最上層，必須明確選一個設定檔；檔案類型與文件層才有「沿用上層」
	if (scope.value === 'global') return profiles
	const parentStage = inherited.value.find((entry) => entry.stageId === stageId)
	const parentProfile = parentStage && getStrategyUsage(parentStage.strategyId) === usageId
		? resolveStageProfile(parentStage.strategyId, parentStage.options)
		: getAssignedProfile(usageId)
	return [
		{ title: `沿用${getInheritedLabel(stageId)}：${parentProfile?.name ?? '尚未指定'}`, subtitle: describeProfile(parentProfile), value: null },
		...profiles,
	]
}

/** 全域層沒有「沿用」選項，未指定時顯示系統預設的設定檔。 */
function getResourceValue(stageId: string): string | null {
	const stage = currentStage(stageId)
	if (scope.value !== 'global') return stage.options.resourceProfileId
	return resolveStageProfile(stage.strategyId, stage.options)?.id ?? null
}

function getResourceWarning(stageId: string): string {
	const stage = currentStage(stageId)
	const usageId = getStrategyUsage(stage.strategyId)
	if (!usageId) return ''
	const profile = resolveStageProfile(stage.strategyId, stage.options)
	if (!profile) return '這個用途尚未指派設定檔，處理時會失敗。'
	const connection = getConnection(profile.connectionId)
	return connection?.status === 'error' ? `「${connection.name}」目前連線異常，處理可能失敗。` : ''
}

function selectResource(stageId: string, profileId: string | null): void {
	const stage = currentStage(stageId)
	drafts.value = { ...drafts.value, [stageId]: { ...stage, options: { ...stage.options, resourceProfileId: profileId } } }
	feedback.value = ''
}

function getOptionSummary(stageId: string): string {
	const stage = currentStage(stageId)
	return describeOptions(stageId, stage.strategyId, stage.options).join(' · ')
}

const dirtyCount = computed(() => Object.keys(drafts.value).length)
const optionsStage = computed(() => (optionsTarget.value ? currentStage(optionsTarget.value) : undefined))
const optionsStageName = computed(() => processingStages.find((stage) => stage.id === optionsTarget.value)?.name ?? '')
const optionsStrategyName = computed(() => (optionsStage.value ? getStrategyMeta(optionsStage.value.stageId, optionsStage.value.strategyId)?.name ?? '' : ''))
const optionsDraft = ref<StrategyOptions | null>(null)

const scopeNote = computed(() => {
	if (scope.value === 'global') return '全域策略是最終預設：檔案類型與文件都沒有另外設定的步驟，才會使用這裡的策略。'
	if (scope.value === 'fileType') {
		return overrideEnabled.value
			? `以下設定套用於所有「${fileTypeName.value}」；未調整的步驟沿用全域策略，個別文件仍可再覆寫。`
			: `目前「${fileTypeName.value}」整組沿用全域策略，開啟後才能逐步驟調整。`
	}
	const parent = documentFileTypeId.value ? `「${getFileTypeName(documentFileTypeId.value)}」檔案類型或全域` : '全域'
	return overrideEnabled.value
		? `以下設定只套用於這份文件；未調整的步驟沿用${parent}策略。`
		: `目前整份文件沿用${parent}策略，開啟後才能逐步驟調整。`
})

// > 策略變更後的重跑提示（只有文件層）
const pendingStages = computed(() => (props.documentId ? pendingStrategyStages[props.documentId] ?? [] : []))
const pendingStartStage = computed(() => (props.documentId ? getEarliestPendingStage(props.documentId) : undefined))
const pendingStartName = computed(() => processingStages.find((stage) => stage.id === pendingStartStage.value)?.name ?? '')
const pendingStageNames = computed(() => pendingStages.value.map((id) => processingStages.find((stage) => stage.id === id)?.name ?? id).join('、'))
const versionCount = computed(() => (props.documentId ? getVersionCount(props.documentId) : 0))
const willOverwriteEditedChunks = computed(() => {
	if (!props.documentId || !pendingStartStage.value) return false
	const startIndex = processingStages.findIndex((stage) => stage.id === pendingStartStage.value)
	const chunkIndex = processingStages.findIndex((stage) => stage.id === 'chunk')
	return startIndex <= chunkIndex && hasEditedChunks(props.documentId)
})

function reset(): void {
	drafts.value = {}
	feedback.value = ''
	optionsError.value = ''
	overrideEnabled.value = storedOverrideEnabled.value
}

watch(() => [props.documentId, props.fileTypeId], reset, { immediate: true })

function selectStrategy(stageId: string, strategyId: string): void {
	const stage = currentStage(stageId)
	drafts.value = { ...drafts.value, [stageId]: { ...stage, strategyId } }
	feedback.value = ''
}

function openOptions(stageId: string): void {
	optionsTarget.value = stageId
	optionsDraft.value = { ...currentStage(stageId).options }
	optionsError.value = ''
}

function applyOptions(): void {
	const stageId = optionsTarget.value
	const draft = optionsDraft.value
	if (!stageId || !draft) return
	if (stageId === 'chunk') {
		optionsError.value = chunkOptionsError(draft)
		if (optionsError.value) return
	}
	const stage = currentStage(stageId)
	drafts.value = { ...drafts.value, [stageId]: { ...stage, options: { ...draft } } }
	optionsTarget.value = null
	feedback.value = ''
}

function getSignature(stages: ResolvedStage[]): Record<string, string> {
	return Object.fromEntries(stages.map((stage) => [stage.stageId, JSON.stringify([stage.strategyId, stage.options])]))
}

/** 比對變更前後實際生效的策略，記下文件哪些步驟需要重跑；回傳變更的步驟數。 */
function trackDocumentChange(before: Record<string, string>): number {
	if (!props.documentId) return 0
	const after = getSignature(resolveStrategy(props.documentId))
	const changed = Object.keys(after).filter((stageId) => after[stageId] !== before[stageId])
	if (changed.length) markStrategyChanged(props.documentId, changed)
	return changed.length
}

function save(): void {
	const entries = Object.values(drafts.value)
	const before = getSignature(resolveStrategy(props.documentId))
	if (props.documentId) {
		documentOverrideEnabled[props.documentId] = overrideEnabled.value
		if (!overrideEnabled.value) {
			delete documentStrategyOverrides[props.documentId]
			drafts.value = {}
			feedback.value = trackDocumentChange(before) ? '已改回沿用上層策略。' : '已改回沿用上層策略，實際生效的策略沒有變化。'
			return
		}
	} else if (props.fileTypeId) {
		fileTypeOverrideEnabled[props.fileTypeId] = overrideEnabled.value
		if (!overrideEnabled.value) {
			delete fileTypeStrategyOverrides[props.fileTypeId]
			drafts.value = {}
			feedback.value = `「${fileTypeName.value}」已改回沿用全域策略；只對之後處理的文件生效。`
			return
		}
	}
	saveStrategy(entries, props.documentId, props.fileTypeId)
	drafts.value = {}
	if (props.documentId) {
		trackDocumentChange(before)
		feedback.value = `已儲存 ${entries.length} 項文件策略。`
		return
	}
	feedback.value = `已儲存 ${entries.length} 項${scopeLabel.value}策略；只對之後處理的文件生效，既有文件需各自重新處理。`
}

function clearOverride(stageId: string): void {
	if (scope.value === 'global') return
	const before = getSignature(resolveStrategy(props.documentId))
	removeStageOverride(props.documentId, stageId, props.fileTypeId)
	const rest = { ...drafts.value }
	delete rest[stageId]
	drafts.value = rest
	trackDocumentChange(before)
	feedback.value = `這個步驟已恢復沿用${getInheritedLabel(stageId)}策略。`
}

function toggleOverride(value: boolean | null): void {
	overrideEnabled.value = Boolean(value)
	if (!value) drafts.value = {}
}

// @ 問答與檢索會用到歷史版本，文件層策略變更要套用到所有版本，而不只目前有效版本
function reprocessNow(): void {
	const documentId = props.documentId
	const fromStage = pendingStartStage.value
	if (!documentId || !fromStage) return
	const startName = pendingStartName.value || fromStage
	const queued = reprocessAllVersions(documentId, fromStage)
	const skipped = versionCount.value - queued
	feedback.value = `已將 ${queued} 個版本排入重新處理，從「${startName}」開始${skipped ? `；${skipped} 個版本仍在處理中而略過，完成後需再重新處理` : ''}。`
	emit('reprocessed', fromStage)
}

// @ 供父層離開保護判斷
const isDirty = computed(() => dirtyCount.value > 0 || (scope.value !== 'global' && overrideEnabled.value !== storedOverrideEnabled.value))
defineExpose({ isDirty })
</script>

<template>
	<section class="strategy-editor">
		<div v-if="scope !== 'global'" class="override-bar">
			<VSwitch
				:model-value="overrideEnabled"
				color="primary"
				hide-details
				density="compact"
				:label="scope === 'document' ? '為這份文件指定策略組合' : `為「${fileTypeName}」指定策略組合`"
				data-testid="strategy-override-switch"
				@update:model-value="toggleOverride"
			/>
			<p class="editor-note">{{ scopeNote }}</p>
		</div>
		<p v-else class="editor-note mb-4">{{ scopeNote }}</p>

		<VAlert
			v-if="pendingStages.length"
			type="warning"
			variant="tonal"
			density="compact"
			class="mb-4"
			data-testid="strategy-pending-reprocess"
		>
			<p class="font-weight-bold">策略已變更，需重新處理才會生效</p>
			<p class="text-body-2">變更的步驟：{{ pendingStageNames }}。將重跑這份文件的所有版本（{{ versionCount }} 個，含歷史版本），從「{{ pendingStartName }}」開始，之前的步驟沿用上次結果。</p>
			<p v-if="willOverwriteEditedChunks" class="text-body-2 text-error mt-1">這份文件的切塊曾經人工修改，重新切段會覆蓋那些修改。</p>
			<template #append>
				<VBtn color="warning" variant="flat" size="small" data-testid="strategy-reprocess-now" @click="reprocessNow">立即重新處理</VBtn>
			</template>
		</VAlert>

		<ul class="stage-list" :class="{ 'is-locked': isLocked }">
			<li v-for="stage in processingStages" :key="stage.id" class="stage-row">
				<div class="stage-head">
					<strong>{{ stage.name }}</strong>
					<span class="source-badge" :class="`is-${getSource(stage.id)}`">{{ strategySourceLabels[getSource(stage.id)] }}</span>
					<span v-if="drafts[stage.id]" class="pending-badge">未儲存</span>
				</div>
				<p class="stage-description">{{ stage.description }}</p>
				<div class="stage-controls">
					<VSelect
						:model-value="currentStage(stage.id).strategyId"
						:items="stage.strategies"
						item-title="name"
						item-value="id"
						:item-props="(item) => ({ subtitle: item.description, disabled: item.notConfigured })"
						:disabled="isLocked"
						:label="`${stage.name}策略`"
						hide-details
						density="comfortable"
						:data-testid="`strategy-select-${stage.id}`"
						@update:model-value="selectStrategy(stage.id, $event)"
					/>
					<VSelect
						v-if="getStrategyUsage(currentStage(stage.id).strategyId)"
						:model-value="getResourceValue(stage.id)"
						:items="getResourceItems(stage.id)"
						:item-props="(item) => ({ subtitle: item.subtitle })"
						:disabled="isLocked"
						:label="`${stage.name}使用的設定檔`"
						hide-details
						density="comfortable"
						class="resource-select"
						:data-testid="`strategy-resource-${stage.id}`"
						@update:model-value="selectResource(stage.id, $event)"
					/>
					<VBtn
						v-if="hasStageParams(stage.id)"
						variant="outlined"
						size="small"
						prepend-icon="mdi-tune-variant"
						:disabled="isLocked"
						@click="openOptions(stage.id)"
					>
						參數
					</VBtn>
					<VBtn
						v-if="isOwnOverride(stage.id)"
						variant="text"
						size="small"
						color="error"
						:disabled="isLocked"
						:aria-label="`移除 ${stage.name} 的${scopeLabel}層策略`"
						@click="clearOverride(stage.id)"
					>
						恢復沿用{{ getInheritedLabel(stage.id) }}
					</VBtn>
				</div>
				<p v-if="getOptionSummary(stage.id)" class="option-summary">{{ getOptionSummary(stage.id) }}</p>
				<p v-if="getResourceWarning(stage.id)" class="resource-warning" role="note">
					<VIcon icon="mdi-alert-outline" size="14" />
					{{ getResourceWarning(stage.id) }}
					<RouterLink to="/admin/system-resources">查看系統資源</RouterLink>
				</p>
			</li>
		</ul>

		<VAlert v-if="feedback" type="success" variant="tonal" density="compact" class="mt-4" role="status">
			{{ feedback }}
			<template v-if="scope !== 'document'" #append>
				<VBtn
					variant="text"
					size="small"
					:to="{ path: '/admin/documents', query: fileTypeId ? { fileType: fileTypeId } : {} }"
					data-testid="strategy-batch-link"
				>
					到文件管理批次重新處理
				</VBtn>
			</template>
		</VAlert>

		<div v-if="dirtyCount > 0 || (scope !== 'global' && overrideEnabled !== storedOverrideEnabled)" class="save-bar">
			<span>{{ dirtyCount }} 項已修改，尚未儲存</span>
			<VSpacer />
			<VBtn variant="text" size="small" @click="reset">重設</VBtn>
			<VBtn color="primary" size="small" @click="save">儲存策略</VBtn>
		</div>

		<VDialog :model-value="Boolean(optionsTarget)" max-width="560" @update:model-value="optionsTarget = null">
			<VCard v-if="optionsStage && optionsDraft">
				<VCardTitle class="pa-5 pb-1">
					<p class="dialog-kicker">{{ optionsStageName }} / {{ optionsStrategyName }}</p>
					<span>策略參數設定</span>
				</VCardTitle>
				<VCardText class="pa-5 pt-2">
					<template v-if="optionsStage.stageId === 'chunk'">
						<VTextField v-model.number="optionsDraft.maxChunkLength" label="最大段落長度（字元）" type="number" />
						<VTextField v-model.number="optionsDraft.chunkOverlap" label="重疊字數" type="number" />
						<template v-if="optionsStage.strategyId === 'heading_aware'">
							<VTextarea v-model="optionsDraft.customHeadings" label="自訂標題文字（一行一組）" rows="3" hint="採前綴比對：某一行以其中任一組文字開頭，就視為新章節起點。" persistent-hint class="mb-4" />
							<VCheckbox v-model="optionsDraft.splitAtEveryHeading" label="每個標題強制起新段" hide-details />
							<VCheckbox v-model="optionsDraft.useBuiltinHeadings" label="同時套用內建標題規則（Markdown #、第 X 章、數字編號）" hide-details />
						</template>
					</template>
					<template v-else-if="optionsStage.stageId === 'summarize'">
						<VSelect v-model="optionsDraft.summaryLength" label="摘要長度" :items="['簡短（約 150 字）', '中等（約 300 字）', '詳細（約 600 字）']" />
					</template>
					<VAlert v-if="optionsError" type="error" variant="tonal" density="compact" class="mt-3">{{ optionsError }}</VAlert>
					<p class="editor-note mt-3">參數只影響下次處理，不會改動已完成的版本。</p>
				</VCardText>
				<VCardActions class="pa-4">
					<VSpacer />
					<VBtn @click="optionsTarget = null">取消</VBtn>
					<VBtn color="primary" @click="applyOptions">套用</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
	</section>
</template>

<style scoped>
.editor-note {
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.6;
}

.override-bar {
	display: grid;
	gap: 2px;
	margin-bottom: var(--space-lg);
	padding-bottom: var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.stage-list {
	display: grid;
	gap: var(--space-sm);
	margin: 0;
	padding: 0;
	list-style: none;
}

.stage-list.is-locked {
	opacity: 0.7;
}

.stage-row {
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.stage-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
}

.stage-head strong {
	font-size: 0.92rem;
}

.source-badge,
.pending-badge {
	padding: 1px 8px;
	border-radius: 4px;
	font-size: 0.7rem;
	font-weight: 600;
}

.source-badge.is-document {
	background: rgb(var(--v-theme-primary) / 12%);
	color: rgb(var(--v-theme-primary));
}

.source-badge.is-fileType {
	background: rgb(var(--v-theme-info) / 14%);
	color: rgb(var(--v-theme-info));
}

.source-badge.is-global {
	background: rgb(var(--v-theme-on-surface) / 8%);
	color: var(--ink-muted);
}

.pending-badge {
	background: rgb(var(--v-theme-warning) / 16%);
	color: rgb(var(--v-theme-warning));
}

.stage-description {
	margin: 4px 0 var(--space-sm);
	color: var(--ink-muted);
	font-size: 0.78rem;
	line-height: 1.5;
}

.stage-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
}

.stage-controls > :first-child {
	flex: 1 1 260px;
}

.stage-controls > .resource-select {
	flex: 1 1 240px;
}

.resource-warning {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	margin: 6px 0 0;
	color: rgb(var(--v-theme-warning));
	font-size: 0.76rem;
}

.resource-warning a {
	color: rgb(var(--v-theme-primary));
	text-underline-offset: 2px;
}

.option-summary {
	margin: 6px 0 0;
	color: var(--ink-muted);
	font-size: 0.74rem;
	font-variant-numeric: tabular-nums;
}

.save-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
	margin-top: var(--space-md);
	padding: 8px var(--space-md);
	border: 1px solid rgb(var(--v-theme-primary) / 30%);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-primary) / 7%);
	font-size: 0.84rem;
}

.dialog-kicker {
	color: rgb(var(--v-theme-primary));
	font-size: 0.76rem;
	font-weight: 700;
}
</style>
