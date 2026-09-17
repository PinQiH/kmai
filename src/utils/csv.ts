// > CSV 匯出：供管理端把表格資料交付給資安或審計使用

/** CSV 欄位定義：key 對應資料物件屬性，label 為表頭文字。 */
export interface CsvColumn<TRow> {
	label: string
	value: (row: TRow) => string
}

// ! 以 =、+、-、@ 開頭的欄位會被 Excel／Sheets 當成公式執行，屬於 CSV 注入
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/**
 * 將單一欄位值轉為安全的 CSV 欄位字串。
 * @param value 原始欄位值。
 * @returns 已跳脫雙引號並阻擋公式注入的欄位字串。
 */
export function escapeCsvField(value: string): string {
	const normalized = value ?? ''
	const guarded = FORMULA_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ? `'${normalized}` : normalized
	return `"${guarded.replace(/"/g, '""')}"`
}

/**
 * 依欄位定義把資料列組成 CSV 內容。
 * @param columns 欄位定義。
 * @param rows 資料列。
 * @returns 含表頭、以 CRLF 換行的 CSV 內容。
 */
export function toCsvContent<TRow>(columns: CsvColumn<TRow>[], rows: TRow[]): string {
	const headerLine = columns.map((column) => escapeCsvField(column.label)).join(',')
	const bodyLines = rows.map((row) => columns.map((column) => escapeCsvField(column.value(row))).join(','))
	return [headerLine, ...bodyLines].join('\r\n')
}

/**
 * 產生帶時間戳的匯出檔名。
 * @param prefix 檔名前綴。
 * @param now 產生檔名的時間。
 * @returns 例如 `system-audit-20260917-1430.csv`。
 */
export function buildCsvFileName(prefix: string, now = new Date()): string {
	const pad = (value: number): string => String(value).padStart(2, '0')
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
	return `${prefix}-${stamp}.csv`
}

/**
 * 觸發瀏覽器下載 CSV 檔案。
 * @param fileName 下載檔名。
 * @param content CSV 內容。
 */
export function downloadCsvFile(fileName: string, content: string): void {
	// > 加上 BOM，Excel 才會以 UTF-8 解讀繁體中文
	const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	link.click()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
