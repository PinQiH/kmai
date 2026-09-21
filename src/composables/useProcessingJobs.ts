import { computed, type ComputedRef } from 'vue'

import {
	getDocumentProcessingRecords,
	type ProcessingStageId,
} from '@/mocks/documentProcessing'
import { pendingStrategyStages } from '@/mocks/documentStrategies'
import { workspaceDocuments } from '@/mocks/documentWorkspace'
import type { DocumentProcessingFile } from '@/types'

export type ProcessingStatus = '已完成' | '處理中' | '部分失敗' | '失敗' | '等待中' | '已取消'

export interface ProcessingJob {
	id: string
	documentId: string
	version: string
	title: string
	status: ProcessingStatus
	progress: number
	stage: string
	note: string
	lastUpdatedAt: string
	failureReason: string | null
	/** 顯示在「需要處理」列上的原因。 */
	attentionReason: string
	needsAttention: boolean
	files: DocumentProcessingFile[]
	attachmentCount: number
	failedAttachmentCount: number
	/** 文件層策略已變更、尚未重跑的步驟。 */
	pendingStages: string[]
	failedStepId?: ProcessingStageId
}

/**
 * 把處理紀錄整理成畫面用的工作清單。
 * 文件管理頁與處理面板共用同一份定義，避免「需要處理」的判斷兩邊各算一次而不一致。
 */
export function useProcessingJobs(): {
	jobs: ComputedRef<ProcessingJob[]>
	attentionJobs: ComputedRef<ProcessingJob[]>
} {
	const jobs = computed<ProcessingJob[]>(() => getDocumentProcessingRecords().map((record) => {
		const document = workspaceDocuments.find((item) => item.id === record.documentId)
		const active = record.steps.find((step) => step.state === '進行中' || step.state === '失敗')
		const failedStep = record.steps.find((step) => step.state === '失敗')
		const files = record.files ?? []
		const attachments = files.filter((file) => file.role === '附件')
		const failedAttachments = attachments.filter((file) => file.state === '失敗')
		const runningAttachment = attachments.some((file) => file.state === '進行中' || file.state === '等待中')
		const pendingStages = pendingStrategyStages[record.documentId] ?? []
		const mainDone = record.progress === 100
		// @ 主文件成功但有附件失敗 = 部分失敗；主文件完成但附件還在跑 = 處理中，不能提早顯示已完成
		const status: ProcessingStatus = record.cancelled
			? '已取消'
			: record.failureReason
				? '失敗'
				: mainDone && failedAttachments.length
					? '部分失敗'
					: mainDone && !runningAttachment
						? '已完成'
						: active || (mainDone && runningAttachment)
							? '處理中'
							: '等待中'
		const isStale = status === '等待中' && Boolean(record.reviewNote?.includes('等待 2 小時'))
		const attentionReason = record.failureReason
			|| (failedAttachments.length ? `${failedAttachments.length} 個附件處理失敗：${failedAttachments[0]!.note ?? failedAttachments[0]!.name}` : '')
			|| (isStale ? record.reviewNote ?? '' : '')
			|| (pendingStages.length ? '處理策略已變更，需重新處理才會生效。' : '')
		return {
			id: record.jobId,
			documentId: record.documentId,
			version: record.version ?? document?.version ?? '',
			title: document?.title ?? record.documentId,
			status,
			progress: record.progress,
			stage: active?.name ?? (status === '已完成' || status === '部分失敗' ? '全部步驟完成' : '等待處理'),
			note: record.reviewNote ?? '',
			lastUpdatedAt: record.lastUpdatedAt,
			failureReason: record.failureReason,
			attentionReason,
			needsAttention: status === '失敗' || status === '部分失敗' || isStale || pendingStages.length > 0,
			files,
			attachmentCount: attachments.length,
			failedAttachmentCount: failedAttachments.length,
			pendingStages,
			failedStepId: failedStep?.id as ProcessingStageId | undefined,
		}
	}))

	const attentionJobs = computed(() => jobs.value.filter((job) => job.needsAttention))

	return { jobs, attentionJobs }
}
