// > 逐行差異：以最長共同子序列（LCS）比對兩段文字，輸出新增／刪除／不變的行
// @ 條款長度有上限（數千字），O(n*m) 足夠，不引入第三方套件

export type DiffLine = { type: 'same' | 'added' | 'removed'; text: string }

export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.replace(/\r\n?/g, '\n').split('\n')
	const b = after.replace(/\r\n?/g, '\n').split('\n')
	const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
		}
	}
	const result: DiffLine[] = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i += 1; j += 1 }
		else if (lcs[i + 1][j] >= lcs[i][j + 1]) { result.push({ type: 'removed', text: a[i] }); i += 1 }
		else { result.push({ type: 'added', text: b[j] }); j += 1 }
	}
	while (i < a.length) { result.push({ type: 'removed', text: a[i] }); i += 1 }
	while (j < b.length) { result.push({ type: 'added', text: b[j] }); j += 1 }
	return result
}
