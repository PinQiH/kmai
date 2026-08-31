import type { AssistantLauncherEdge, AssistantLauncherPosition } from '@/types'

export interface AssistantViewport {
	width: number
	height: number
}

export interface AssistantPositionOptions {
	launcherSize?: number
	margin?: number
	topOffset?: number
	safeArea?: Partial<{ top: number; right: number; bottom: number; left: number }>
}

const DEFAULT_LAUNCHER_SIZE = 56
const DEFAULT_MARGIN = 16
const DEFAULT_TOP_OFFSET = 80

function finiteOrFallback(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback
}

/**
 * 將浮動頭貼限制在目前視窗的安全可視範圍。
 * @param position 預計位置。
 * @param viewport 目前視窗尺寸。
 * @param options 頭貼大小與安全邊距。
 * @returns 經過邊界限制的位置。
 */
export function clampAssistantPosition(
	position: AssistantLauncherPosition,
	viewport: AssistantViewport,
	options: AssistantPositionOptions = {},
): AssistantLauncherPosition {
	const launcherSize = options.launcherSize ?? DEFAULT_LAUNCHER_SIZE
	const margin = options.margin ?? DEFAULT_MARGIN
	const topOffset = options.topOffset ?? DEFAULT_TOP_OFFSET
	const minX = margin + (options.safeArea?.left ?? 0)
	const minY = topOffset + (options.safeArea?.top ?? 0)
	const maxX = Math.max(minX, viewport.width - launcherSize - margin - (options.safeArea?.right ?? 0))
	const maxY = Math.max(minY, viewport.height - launcherSize - margin - (options.safeArea?.bottom ?? 0))
	const x = finiteOrFallback(position.x, maxX)
	const y = finiteOrFallback(position.y, maxY)

	return {
		x: Math.min(maxX, Math.max(minX, x)),
		y: Math.min(maxY, Math.max(minY, y)),
	}
}

/**
 * 將浮動頭貼吸附至最近的視窗側邊。
 * @param position 拖曳結束位置。
 * @param viewport 目前視窗尺寸。
 * @param options 頭貼大小與安全邊距。
 * @returns 吸附後位置與所在側邊。
 */
export function snapAssistantPosition(
	position: AssistantLauncherPosition,
	viewport: AssistantViewport,
	options: AssistantPositionOptions = {},
): { position: AssistantLauncherPosition; edge: AssistantLauncherEdge } {
	const launcherSize = options.launcherSize ?? DEFAULT_LAUNCHER_SIZE
	const margin = options.margin ?? DEFAULT_MARGIN
	const minX = margin + (options.safeArea?.left ?? 0)
	const maxX = Math.max(minX, viewport.width - launcherSize - margin - (options.safeArea?.right ?? 0))
	const clamped = clampAssistantPosition(position, viewport, options)
	const edge: AssistantLauncherEdge = clamped.x + launcherSize / 2 < viewport.width / 2 ? 'left' : 'right'
	return {
		position: {
			x: edge === 'left' ? minX : maxX,
			y: clamped.y,
		},
		edge,
	}
}

/**
 * 取得浮動頭貼預設的右下角位置。
 * @param viewport 目前視窗尺寸。
 * @param options 頭貼大小與安全邊距。
 * @returns 經過邊界限制的右下角位置。
 */
export function getDefaultAssistantPosition(
	viewport: AssistantViewport,
	options: AssistantPositionOptions = {},
): AssistantLauncherPosition {
	return clampAssistantPosition(
		{ x: viewport.width, y: viewport.height },
		viewport,
		options,
	)
}
