import { describe, expect, it } from 'vitest'

import {
	clampAssistantPosition,
	getDefaultAssistantPosition,
	snapAssistantPosition,
} from '../src/utils/assistantPosition'

const viewport = { width: 1200, height: 800 }

describe('assistant launcher position', () => {
	it('should keep the launcher inside its safe viewport bounds', () => {
		expect(clampAssistantPosition({ x: -100, y: 1000 }, viewport)).toEqual({ x: 16, y: 728 })
	})

	it('should snap to the nearest horizontal edge and preserve vertical position', () => {
		expect(snapAssistantPosition({ x: 120, y: 320 }, viewport)).toEqual({ position: { x: 16, y: 320 }, edge: 'left' })
		expect(snapAssistantPosition({ x: 900, y: 420 }, viewport)).toEqual({ position: { x: 1128, y: 420 }, edge: 'right' })
	})

	it('should start at the lower-right safe position', () => {
		expect(getDefaultAssistantPosition(viewport)).toEqual({ x: 1128, y: 728 })
	})
})
