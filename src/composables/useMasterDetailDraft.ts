import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'

/*
 * > 清單＋編輯區的草稿狀態
 * @ 角色、群組這類「左選清單、右編輯」的面板共用：維護選取項目、草稿、欄位錯誤，
 *   並在有未儲存修改時攔下切換，由頁面顯示確認框後再切過去。
 */

export interface FieldErrorMap {
	[field: string]: string
}

export interface MasterDetailDraftOptions<TDraft extends object> {
	/** 初始選取的項目代號；null 代表新增中。 */
	initialId: string | null
	// @ 以參數傳入代號而非讀取 selectedId，呼叫端才不必在 composable 建立前取用它
	/** 依選取的項目代號產生草稿內容；id 為 null 代表新增，回傳空白草稿。 */
	draftFromSelection: (id: string | null) => TDraft
}

export interface MasterDetailDraft<TDraft extends object> {
	selectedId: Ref<string | null>
	/** 被攔下的切換目標；undefined 代表沒有待確認的切換。 */
	pendingId: Ref<string | null | undefined>
	form: TDraft
	errors: Ref<FieldErrorMap>
	isDirty: ComputedRef<boolean>
	isCreating: ComputedRef<boolean>
	resetForm: () => void
	/** 切換選取項目；有未儲存修改時只記下目標並等待確認。 */
	requestSelect: (id: string | null) => void
	/** 放棄修改並切換到先前被攔下的目標。 */
	discardAndSwitch: () => void
	/** 使用者重新輸入時清掉該欄位與整體錯誤。 */
	clearError: (field: string) => void
}

// @ 陣列欄位（權限代碼、角色代碼）只看內容不看順序
function isSameValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) && Array.isArray(right)) {
		return left.length === right.length && left.every((item) => right.includes(item))
	}
	return left === right
}

/**
 * 建立清單編輯面板的草稿狀態。
 * @param options 初始選取項目與草稿產生方式。
 * @returns 選取、草稿、錯誤與切換控制。
 */
export function useMasterDetailDraft<TDraft extends object>(options: MasterDetailDraftOptions<TDraft>): MasterDetailDraft<TDraft> {
	const selectedId = ref<string | null>(options.initialId)
	const pendingId = ref<string | null | undefined>(undefined)
	const form = reactive(options.draftFromSelection(options.initialId)) as TDraft
	const errors = ref<FieldErrorMap>({})

	const isDirty = computed(() => {
		const base = options.draftFromSelection(selectedId.value)
		return (Object.keys(base) as Array<keyof TDraft>).some((key) => !isSameValue(base[key], form[key]))
	})

	function resetForm(): void {
		Object.assign(form, options.draftFromSelection(selectedId.value))
		errors.value = {}
	}
	watch(selectedId, resetForm, { immediate: true })

	function requestSelect(id: string | null): void {
		if (id === selectedId.value) return
		if (isDirty.value) pendingId.value = id
		else selectedId.value = id
	}

	function discardAndSwitch(): void {
		const next = pendingId.value
		pendingId.value = undefined
		if (next === undefined) return
		if (next === selectedId.value) resetForm()
		else selectedId.value = next
	}

	function clearError(field: string): void {
		if (errors.value[field] || errors.value.form) {
			errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== field && key !== 'form'))
		}
	}

	return {
		selectedId,
		pendingId,
		form,
		errors,
		isDirty,
		isCreating: computed(() => selectedId.value === null),
		resetForm,
		requestSelect,
		discardAndSwitch,
		clearError,
	}
}
