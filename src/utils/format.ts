// > 數字與時間長度的顯示格式
// @ 固定使用 zh-TW，避免 toLocaleString() 依瀏覽器語系輸出不同的千分位格式

const numberFormatter = new Intl.NumberFormat('zh-TW')

/**
 * 以千分位顯示數字。
 * @param value 數值；null 或 undefined 代表沒有資料。
 * @param fallback 沒有資料時顯示的文字。
 * @returns 例如 `12,345`。
 */
export function formatNumber(value: number | null | undefined, fallback = '—'): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return fallback
	return numberFormatter.format(value)
}

/**
 * 顯示處理耗時：一秒內用毫秒，其餘用一位小數的秒數。
 * @param durationMs 毫秒數。
 * @returns 例如 `850 ms`、`1.2 秒`。
 */
export function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${durationMs} ms`
	return `${(durationMs / 1000).toFixed(1)} 秒`
}
