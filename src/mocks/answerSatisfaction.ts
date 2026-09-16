// > 回答滿意度：以「有幫助 ÷ 有評價」計算，供營運監控觀察回答品質趨勢
// @ 倒讚會同時建立回饋案件，因此今天的倒讚數直接取自 feedbackAdmin，按下倒讚後數字會立刻變動
// TODO(api-integration): 改由後端彙總（依知識來源、模型、時間區間），前端只負責顯示
import { feedbackAdminState } from '@/mocks/feedbackAdmin'
import { ANSWER_MODEL_OPTIONS } from '@/utils/answerSettings'
import { COMPANY_KNOWLEDGE_SOURCES } from '@/utils/knowledgeSources'

export interface SatisfactionBucket {
	/** YYYY-MM-DD */
	date: string
	/** 當天的回答數 */
	answered: number
	helpful: number
	unhelpful: number
}

export interface SatisfactionBreakdown {
	id: string
	label: string
	answered: number
	helpful: number
	unhelpful: number
}

export interface SatisfactionSummary {
	answered: number
	rated: number
	helpful: number
	unhelpful: number
	/** 有幫助比例（%），沒有評價時為 null */
	rate: number | null
	/** 評價率（%）：有評價的回答佔所有回答的比例 */
	ratedRate: number
	/** 與前一個等長區間相比的滿意度變化（百分點），資料不足時為 null */
	deltaPoints: number | null
	/** 每日滿意度（%），由舊到新 */
	series: number[]
}

const DAY_MS = 86_400_000
const SEED_DAYS = 28

function toDateKey(time: number): string {
	const date = new Date(time)
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/*
 * - 以固定公式產生每日取樣。
 * @ 刻意不用 Math.random：重新整理後圖形要一致，回報「某天掉下去」時才重現得出來
 */
function buildBuckets(): SatisfactionBucket[] {
	const today = Date.now()
	return Array.from({ length: SEED_DAYS }, (_, index) => {
		const offset = SEED_DAYS - 1 - index
		const weekday = new Date(today - offset * DAY_MS).getDay()
		const answered = weekday === 0 || weekday === 6 ? 42 + (offset % 5) * 3 : 180 + Math.round(Math.sin(offset / 2.2) * 26) + (offset % 4) * 7
		const rated = Math.round(answered * 0.34)
		// @ 近 7 天刻意讓倒讚變多，對應「差旅辦法過期」這批回饋，讓趨勢圖看得出轉折
		const unhelpfulRatio = offset <= 6 ? 0.28 + (6 - offset) * 0.012 : 0.16 + Math.abs(Math.cos(offset / 3.1)) * 0.05
		const unhelpful = Math.max(1, Math.round(rated * unhelpfulRatio))
		return { date: toDateKey(today - offset * DAY_MS), answered, helpful: rated - unhelpful, unhelpful }
	})
}

const seedBuckets = buildBuckets()

const sourceSeeds: SatisfactionBreakdown[] = [
	{ id: 'policy', label: '公司制度', answered: 1_642, helpful: 372, unhelpful: 118 },
	{ id: 'benefits', label: '人事流程', answered: 1_208, helpful: 301, unhelpful: 47 },
	{ id: 'information-security', label: '資訊安全', answered: 764, helpful: 188, unhelpful: 39 },
	{ id: 'operations', label: '作業流程', answered: 583, helpful: 143, unhelpful: 21 },
]

const modelSeeds: SatisfactionBreakdown[] = [
	{ id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', answered: 3_284, helpful: 812, unhelpful: 173 },
	{ id: 'llama3.1:8b', label: 'llama3.1:8b', answered: 913, helpful: 192, unhelpful: 52 },
]

/** 今天由使用者實際送出的倒讚（每筆倒讚都會建立一筆 AI 回答回饋案件） */
function todayUnhelpfulCases(): typeof feedbackAdminState.cases {
	const todayKey = toDateKey(Date.now())
	return feedbackAdminState.cases.filter((item) => item.kind === 'answer' && toDateKey(new Date(item.submittedAt).getTime()) === todayKey)
}

function bucketsWithLiveFeedback(): SatisfactionBucket[] {
	const liveUnhelpful = todayUnhelpfulCases().length
	return seedBuckets.map((bucket, index) => (
		index === seedBuckets.length - 1 ? { ...bucket, unhelpful: bucket.unhelpful + liveUnhelpful } : { ...bucket }
	))
}

function rateOf(helpful: number, unhelpful: number): number | null {
	const rated = helpful + unhelpful
	return rated === 0 ? null : Math.round((helpful / rated) * 1000) / 10
}

function sum(buckets: SatisfactionBucket[], key: 'answered' | 'helpful' | 'unhelpful'): number {
	return buckets.reduce((total, bucket) => total + bucket[key], 0)
}

/**
 * 取得指定天數的滿意度彙總。
 * @param days 統計區間天數。
 * @returns 區間內的回答數、評價數、滿意度與每日趨勢。
 */
export function getSatisfactionSummary(days = 7): SatisfactionSummary {
	const buckets = bucketsWithLiveFeedback()
	const current = buckets.slice(-days)
	const previous = buckets.slice(-days * 2, -days)
	const helpful = sum(current, 'helpful')
	const unhelpful = sum(current, 'unhelpful')
	const answered = sum(current, 'answered')
	const rated = helpful + unhelpful
	const rate = rateOf(helpful, unhelpful)
	const previousRate = previous.length ? rateOf(sum(previous, 'helpful'), sum(previous, 'unhelpful')) : null

	return {
		answered,
		rated,
		helpful,
		unhelpful,
		rate,
		ratedRate: answered === 0 ? 0 : Math.round((rated / answered) * 1000) / 10,
		deltaPoints: rate === null || previousRate === null ? null : Math.round((rate - previousRate) * 10) / 10,
		series: current.map((bucket) => rateOf(bucket.helpful, bucket.unhelpful) ?? 0),
	}
}

/** 依知識來源彙總；今天的倒讚依案件當時的知識來源歸戶 */
export function getSatisfactionBySource(): SatisfactionBreakdown[] {
	const live = todayUnhelpfulCases()
	return COMPANY_KNOWLEDGE_SOURCES.filter((source) => source.id !== 'company').map((source) => {
		const seed = sourceSeeds.find((item) => item.id === source.id) ?? { id: source.id, label: source.name, answered: 0, helpful: 0, unhelpful: 0 }
		const extra = live.filter((item) => item.run?.settings.sourceId === source.id).length
		return { ...seed, label: source.name, answered: seed.answered + extra, unhelpful: seed.unhelpful + extra }
	})
}

/** 依回答模型彙總 */
export function getSatisfactionByModel(): SatisfactionBreakdown[] {
	const live = todayUnhelpfulCases()
	return ANSWER_MODEL_OPTIONS.map((option) => {
		const seed = modelSeeds.find((item) => item.id === option.id) ?? { id: option.id, label: option.label, answered: 0, helpful: 0, unhelpful: 0 }
		const extra = live.filter((item) => item.run?.settings.answerModelId === option.id).length
		return { ...seed, label: option.label, answered: seed.answered + extra, unhelpful: seed.unhelpful + extra }
	})
}

/** 單一分組的滿意度（%）；沒有評價時回傳 null */
export function breakdownRate(breakdown: SatisfactionBreakdown): number | null {
	return rateOf(breakdown.helpful, breakdown.unhelpful)
}

export interface ResolutionSatisfaction {
	/** 已結案且回報者已評價的案件數 */
	rated: number
	solved: number
	unsolved: number
	/** 說「已解決」的比例（%）；沒有人評價時為 null */
	rate: number | null
	/** 已結案但回報者還沒評價 */
	awaiting: number
}

/**
 * 處理滿意度：結案後回報者親自確認有沒有解決。
 * @ 這是系統面（不只 AI 回答）唯一有真實訊號的滿意度，不用問卷推估
 */
export function getResolutionSatisfaction(): ResolutionSatisfaction {
	const closed = feedbackAdminState.cases.filter((item) => item.status === 'resolved' || item.status === 'dismissed')
	const rated = closed.filter((item) => item.resolutionRating)
	const solved = rated.filter((item) => item.resolutionRating!.value === 'solved').length
	return {
		rated: rated.length,
		solved,
		unsolved: rated.length - solved,
		rate: rated.length === 0 ? null : Math.round((solved / rated.length) * 1000) / 10,
		awaiting: closed.length - rated.length,
	}
}

export interface IssueMetrics {
	reported: number
	closed: number
	open: number
	/** 已結案案件的平均處理天數；沒有結案案件時為 null */
	averageDaysToClose: number | null
	byCategory: Array<{ label: string; count: number }>
}

/**
 * 問題回報的客觀指標：不需要評分也能看出系統好不好用。
 * @param days 統計區間天數。
 */
export function getIssueMetrics(days = 30): IssueMetrics {
	const since = Date.now() - days * DAY_MS
	const cases = feedbackAdminState.cases.filter((item) => new Date(item.submittedAt).getTime() >= since)
	const closed = cases.filter((item) => item.closedAt)
	const totalDays = closed.reduce((sum, item) => sum + (new Date(item.closedAt!).getTime() - new Date(item.submittedAt).getTime()) / DAY_MS, 0)
	const categories = new Map<string, number>()
	for (const item of cases) {
		const label = item.kind === 'issue' ? item.category ?? '其他' : 'AI 回答'
		categories.set(label, (categories.get(label) ?? 0) + 1)
	}
	return {
		reported: cases.length,
		closed: closed.length,
		open: cases.length - closed.length,
		averageDaysToClose: closed.length === 0 ? null : Math.round((totalDays / closed.length) * 10) / 10,
		byCategory: [...categories.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
	}
}
