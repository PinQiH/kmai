import { describe, expect, it } from 'vitest'

import { formatDuration, formatNumber } from '@/utils/format'

describe('formatNumber', () => {
	it('should group thousands with the zh-TW format', () => {
		expect(formatNumber(1234567)).toBe('1,234,567')
		expect(formatNumber(0)).toBe('0')
	})

	it('should show the fallback when there is no value', () => {
		expect(formatNumber(null)).toBe('—')
		expect(formatNumber(undefined)).toBe('—')
		expect(formatNumber(Number.NaN, '無資料')).toBe('無資料')
	})
})

describe('formatDuration', () => {
	it('should use milliseconds under one second', () => {
		expect(formatDuration(850)).toBe('850 ms')
	})

	it('should use seconds with one decimal from one second up', () => {
		expect(formatDuration(1000)).toBe('1.0 秒')
		expect(formatDuration(12345)).toBe('12.3 秒')
	})
})
