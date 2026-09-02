import type { AnswerModelId, AnswerStyleId } from '@/types'

interface AnswerStyleOption {
	id: AnswerStyleId
	label: string
	description: string
	icon: string
}

interface AnswerModelOption {
	id: AnswerModelId
	label: string
	shortLabel: string
	description: string
	badge: string
}

export const DEFAULT_ANSWER_STYLE_ID: AnswerStyleId = 'balanced'
export const DEFAULT_ANSWER_MODEL_ID: AnswerModelId = 'gpt-4.1-mini'

export const ANSWER_STYLE_OPTIONS: readonly AnswerStyleOption[] = [
	{
		id: 'balanced',
		label: '標準',
		description: '兼顧結論、必要說明與引用依據。',
		icon: 'mdi-text-box-check-outline',
	},
	{
		id: 'concise',
		label: '精簡',
		description: '優先提供重點與結論，減少延伸說明。',
		icon: 'mdi-format-list-bulleted-square',
	},
	{
		id: 'step-by-step',
		label: '步驟式',
		description: '以條列與操作步驟整理回答。',
		icon: 'mdi-format-list-numbered',
	},
]

export const ANSWER_MODEL_OPTIONS: readonly AnswerModelOption[] = [
	{
		id: 'gpt-4.1-mini',
		label: 'gpt-4.1-mini',
		shortLabel: 'gpt-4.1-mini',
		description: '適合一般問答與快速整理。',
		badge: '主要',
	},
	{
		id: 'llama3.1:8b',
		label: 'llama3.1:8b',
		shortLabel: 'llama3.1:8b',
		description: '使用內部環境的本機備援模型。',
		badge: '本機',
	},
]

export function getAnswerStyleLabel(answerStyleId: AnswerStyleId): string {
	return ANSWER_STYLE_OPTIONS.find((option) => option.id === answerStyleId)?.label ?? '標準'
}

export function getAnswerModelLabel(answerModelId: AnswerModelId, useShortLabel = false): string {
	const option = ANSWER_MODEL_OPTIONS.find((item) => item.id === answerModelId)
	if (!option) return 'gpt-4.1-mini'
	return useShortLabel ? option.shortLabel : option.label
}
