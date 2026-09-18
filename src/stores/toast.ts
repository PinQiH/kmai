import { defineStore } from 'pinia'

/*
 * > 全站操作回饋通知（Toast）
 * @ 用於「新增、刪除、儲存」等操作結果；表單驗證錯誤仍留在欄位旁以 VAlert 呈現。
 * @ 停留時間依嚴重度遞增，error 不自動消失，確保使用者一定看得到失敗。
 */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastAction {
	label: string
	handler: () => void
}

export interface ToastOptions {
	/** 第二行補充說明 */
	detail?: string
	/** 覆寫預設停留毫秒數；0 代表不自動消失 */
	timeout?: number
	/** 單一行動按鈕，例如「復原」 */
	action?: ToastAction
}

export interface ToastItem {
	id: number
	tone: ToastTone
	title: string
	detail?: string
	timeout: number
	action?: ToastAction
	/** 相同訊息重複觸發的次數，用於合併顯示 */
	count: number
	/** 每次重新計時遞增，讓倒數動畫重新開始 */
	revision: number
}

export const TOAST_TIMEOUTS: Record<ToastTone, number> = {
	success: 4000,
	info: 5000,
	warning: 8000,
	error: 0,
}

// @ 同時最多顯示幾則；超過時移除最舊的非錯誤通知
export const MAX_VISIBLE_TOASTS = 4

let nextId = 1

export const useToastStore = defineStore('toast', {
	state: () => ({
		items: [] as ToastItem[],
	}),
	actions: {
		/**
		 * 顯示一則通知；相同語氣與內容的通知仍在畫面上時，合併計數並重新計時。
		 * @param title 主要訊息
		 * @param tone 嚴重度
		 * @param options 補充說明、停留時間與行動按鈕
		 * @returns 通知 id，可用於 dismiss
		 */
		show(title: string, tone: ToastTone = 'success', options: ToastOptions = {}): number {
			const duplicate = this.items.find((item) => item.tone === tone && item.title === title && item.detail === options.detail)
			if (duplicate) {
				duplicate.count += 1
				duplicate.revision += 1
				duplicate.action = options.action ?? duplicate.action
				return duplicate.id
			}
			const item: ToastItem = {
				id: nextId++,
				tone,
				title,
				detail: options.detail,
				timeout: options.timeout ?? TOAST_TIMEOUTS[tone],
				action: options.action,
				count: 1,
				revision: 0,
			}
			this.items.unshift(item)
			while (this.items.length > MAX_VISIBLE_TOASTS) {
				const index = this.items.findLastIndex((toast) => toast.tone !== 'error')
				this.items.splice(index === -1 ? this.items.length - 1 : index, 1)
			}
			return item.id
		},
		success(title: string, options?: ToastOptions): number { return this.show(title, 'success', options) },
		info(title: string, options?: ToastOptions): number { return this.show(title, 'info', options) },
		warning(title: string, options?: ToastOptions): number { return this.show(title, 'warning', options) },
		error(title: string, options?: ToastOptions): number { return this.show(title, 'error', options) },
		dismiss(id: number): void {
			this.items = this.items.filter((item) => item.id !== id)
		},
		clear(): void {
			this.items = []
		},
	},
})
