<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { getProcessingStageIndex, getProcessingStageName, hasEditedChunks, processingStages, reprocessJob, type ProcessingStageId, type ReprocessScope } from '@/repositories/documents.repository'
import { clearStrategyChanged, getEarliestPendingStage, pendingStrategyStages } from '@/repositories/documents.repository'
import { getVersionCount } from '@/repositories/documents.repository'
import { workspaceDocuments } from '@/repositories/documents.repository'
import type { DocumentProcessingRecord } from '@/types'

interface ComponentProps {
	record?: DocumentProcessingRecord
	/** 顯示在標題的文件名稱。 */
	title: string
	/** 開啟時預先選好的範圍；省略時為整份文件。 */
	initialScope?: ReprocessScope
}

const props = withDefaults(defineProps<ComponentProps>(), { record: undefined, initialScope: 'all' })
const isOpen = defineModel<boolean>({ default: false })
const emit = defineEmits<{
	/** 已排入重新處理，帶回給使用者看的訊息。 */
	done: [message: string]
}>()

const scope = ref<ReprocessScope>('all')
const fromStage = ref<ProcessingStageId>('parse')

const files = computed(() => props.record?.files ?? [])
const attachments = computed(() => files.value.filter((file) => file.role === '附件'))
const selectedAttachment = computed(() => attachments.value.find((file) => file.id === scope.value))
const pendingStages = computed(() => (props.record ? pendingStrategyStages[props.record.documentId] ?? [] : []))
const effectiveVersion = computed(() => workspaceDocuments.find((item) => item.id === props.record?.documentId)?.version)
const version = computed(() => props.record?.version ?? effectiveVersion.value)
const isEffectiveVersion = computed(() => !version.value || version.value === effectiveVersion.value)
// @ 問答與檢索會用到歷史版本；文件有多個版本時，只重跑其中一版不算策略已套用
const otherVersionCount = computed(() => (props.record ? Math.max(0, getVersionCount(props.record.documentId) - 1) : 0))
const canClearPending = computed(() => otherVersionCount.value === 0)

const scopeItems = computed(() => [
	{ title: `整份文件（主文件＋${attachments.value.length} 個附件）`, value: 'all' },
	{ title: '只有主文件', value: 'main' },
	...attachments.value.map((file) => ({ title: `附件：${file.name}`, value: file.id, props: { subtitle: `${file.state} · ${file.stage}` } })),
])

const stageItems = computed(() => processingStages.map((stage, index) => ({
	title: `${index + 1}. ${stage.name}`,
	value: stage.id,
	props: { subtitle: pendingStages.value.includes(stage.id) && !selectedAttachment.value ? '策略已變更' : undefined },
})))

/**
 * 預設起跑點：附件從它第一個未完成的步驟；整份文件依序看失敗步驟、最早變更策略的步驟，
 * 只改過切塊的從向量化開始，避免蓋掉人工切塊。
 */
function getDefaultStage(): ProcessingStageId {
	const record = props.record
	if (!record) return 'parse'
	if (selectedAttachment.value) {
		const steps = selectedAttachment.value.steps ?? []
		return (steps.find((step) => step.state !== '已完成')?.id as ProcessingStageId | undefined) ?? 'parse'
	}
	const failed = record.steps.find((step) => step.state === '失敗')
	if (failed) return failed.id as ProcessingStageId
	const pending = getEarliestPendingStage(record.documentId)
	if (pending) return pending
	if (hasEditedChunks(record.documentId, version.value)) return 'embed'
	return 'parse'
}

watch(isOpen, (open) => {
	if (!open) return
	scope.value = files.value.some((file) => file.id === props.initialScope) || props.initialScope === 'main' ? props.initialScope : 'all'
	fromStage.value = getDefaultStage()
})
watch(scope, () => { if (isOpen.value) fromStage.value = getDefaultStage() })

const reusedNames = computed(() => processingStages.slice(0, getProcessingStageIndex(fromStage.value)).map((stage) => stage.name).join('、'))
// @ 策略變更屬於整份文件；只跑附件或起跑點晚於變更步驟時，變更都還不算生效
const skipsPending = computed(() => pendingStages.value.length > 0 && scope.value === 'all' && getProcessingStageIndex(fromStage.value) > getProcessingStageIndex(pendingStages.value[0]))
const partialPending = computed(() => pendingStages.value.length > 0 && (scope.value !== 'all' || !canClearPending.value))
const overwritesChunks = computed(() => {
	const record = props.record
	if (!record || getProcessingStageIndex(fromStage.value) > getProcessingStageIndex('chunk')) return false
	if (selectedAttachment.value) return hasEditedChunks(record.documentId, version.value, selectedAttachment.value.id)
	return hasEditedChunks(record.documentId, version.value)
		|| (scope.value === 'all' && attachments.value.some((file) => hasEditedChunks(record.documentId, version.value, file.id)))
})

function confirm(): void {
	const record = props.record
	if (!record) return
	reprocessJob(record.jobId, fromStage.value, undefined, scope.value)
	if (canClearPending.value && scope.value === 'all' && !skipsPending.value) clearStrategyChanged(record.documentId)
	const target = selectedAttachment.value ? `附件「${selectedAttachment.value.name}」` : scope.value === 'main' ? `「${props.title}」主文件` : `「${props.title}」`
	emit('done', `${target}第 ${version.value} 版已從「${getProcessingStageName(fromStage.value)}」重新排入示範佇列，尚未執行後端處理。`)
	isOpen.value = false
}
</script>

<template>
	<VDialog v-model="isOpen" max-width="540">
		<VCard v-if="record">
			<VCardTitle class="pa-6 pb-2">重新處理「{{ title }}」第 {{ version }} 版</VCardTitle>
			<VCardText class="pa-6 pt-2">
				<VAlert v-if="!isEffectiveVersion" type="info" variant="tonal" density="compact" class="mb-4" data-testid="reprocess-non-effective">
					這不是目前有效版本（第 {{ effectiveVersion }} 版），但問答與檢索仍會引用這個版本的內容。
				</VAlert>
				<p class="text-body-2 mb-4">依目前生效的策略重跑。選擇範圍與起始步驟，起始步驟之前的結果沿用上次，以節省時間。</p>
				<VSelect
					v-if="attachments.length"
					v-model="scope"
					:items="scopeItems"
					label="處理範圍"
					density="comfortable"
					data-testid="reprocess-scope"
				/>
				<VSelect
					v-model="fromStage"
					:items="stageItems"
					label="從哪一步開始"
					density="comfortable"
					data-testid="reprocess-from-stage"
				/>
				<p class="text-caption text-medium-emphasis">
					{{ reusedNames ? `沿用上次結果：${reusedNames}` : '所有步驟都會重跑。' }}
				</p>
				<VAlert v-if="skipsPending" type="warning" variant="tonal" density="compact" class="mt-3">
					「{{ getProcessingStageName(pendingStages[0]) }}」的策略已變更但不在重跑範圍內，這項變更仍不會生效。
				</VAlert>
				<VAlert v-else-if="partialPending" type="info" variant="tonal" density="compact" class="mt-3">
					<template v-if="!canClearPending">
						策略變更套用於所有版本；這份文件還有 {{ otherVersionCount }} 個其他版本也會被問答與檢索使用，請到「處理策略」分頁用「立即重新處理」一次重跑所有版本。
					</template>
					<template v-else>策略變更套用於整份文件；這次只重跑部分檔案，其餘檔案仍需重新處理才會套用新策略。</template>
				</VAlert>
				<VAlert v-if="overwritesChunks" type="error" variant="tonal" density="compact" class="mt-3">
					這個範圍內有人工修改過的切塊，從「切段」或更早的步驟重跑會覆蓋那些修改。
				</VAlert>
			</VCardText>
			<VCardActions class="pa-5">
				<VSpacer />
				<VBtn @click="isOpen = false">取消</VBtn>
				<VBtn color="primary" variant="flat" data-testid="reprocess-confirm" @click="confirm">開始重新處理</VBtn>
			</VCardActions>
		</VCard>
	</VDialog>
</template>
