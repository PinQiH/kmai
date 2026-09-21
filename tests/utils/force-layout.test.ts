import { describe, expect, it } from 'vitest'

import { graphEdges, graphNodes } from '../src/mocks/graph'
import { ForceLayout, type ForceLink } from '../src/utils/force-layout'

const WIDTH = 960
const HEIGHT = 620

function buildLinks(): ForceLink[] {
	const indexById = new Map(graphNodes.map((node, index) => [node.id, index]))
	return graphEdges.map((edge) => ({
		source: indexById.get(edge.from) ?? 0,
		target: indexById.get(edge.to) ?? 0,
	}))
}

function buildClusterIndexes(): number[] {
	const clusters = [...new Set(graphNodes.map((node) => node.cluster))]
	return graphNodes.map((node) => clusters.indexOf(node.cluster))
}

function createLayout(): ForceLayout {
	return new ForceLayout({
		ids: graphNodes.map((node) => node.id),
		links: buildLinks(),
		clusterIndexes: buildClusterIndexes(),
		options: { width: WIDTH, height: HEIGHT },
	})
}

describe('ForceLayout', () => {
	it('01. settle - 會在合理的時間步內收斂並停止', () => {
		const layout = createLayout()
		expect(layout.isSettled).toBe(false)

		let ticks = 0
		while (!layout.isSettled && ticks < 400) {
			layout.tick()
			ticks += 1
		}

		expect(layout.isSettled).toBe(true)
		// @ 收斂步數綁著 ALPHA_DECAY；若調整衰減速度，這個上界要一併重新評估
		expect(ticks).toBeLessThan(250)
	})

	it('02. tick - 收斂後不再改變任何節點位置', () => {
		const layout = createLayout()
		layout.settle()

		const before = layout.nodes.map((node) => ({ x: node.x, y: node.y }))
		for (let i = 0; i < 30; i += 1) layout.tick()

		layout.nodes.forEach((node, index) => {
			expect(node.x).toBe(before[index].x)
			expect(node.y).toBe(before[index].y)
		})
	})

	it('03. settle - 所有節點都留在畫布邊界內', () => {
		const layout = createLayout()
		layout.settle()

		for (const node of layout.nodes) {
			expect(node.x).toBeGreaterThanOrEqual(0)
			expect(node.x).toBeLessThanOrEqual(WIDTH)
			expect(node.y).toBeGreaterThanOrEqual(0)
			expect(node.y).toBeLessThanOrEqual(HEIGHT)
			expect(Number.isFinite(node.x)).toBe(true)
			expect(Number.isFinite(node.y)).toBe(true)
		}
	})

	it('04. settle - 節點不重疊，兩兩距離大於最小間距的一半', () => {
		const layout = createLayout()
		layout.settle()

		let tooClose = 0
		for (let i = 0; i < layout.nodes.length; i += 1) {
			for (let j = i + 1; j < layout.nodes.length; j += 1) {
				const distance = Math.hypot(
					layout.nodes[j].x - layout.nodes[i].x,
					layout.nodes[j].y - layout.nodes[i].y,
				)
				if (distance < 23) tooClose += 1
			}
		}

		expect(tooClose).toBe(0)
	})

	it('05. settle - 佈局是確定性的，兩次計算結果相同', () => {
		const first = createLayout()
		const second = createLayout()
		first.settle()
		second.settle()

		first.nodes.forEach((node, index) => {
			expect(node.x).toBeCloseTo(second.nodes[index].x, 6)
			expect(node.y).toBeCloseTo(second.nodes[index].y, 6)
		})
	})

	it('06. reheat - 重新加熱後會再次開始移動', () => {
		const layout = createLayout()
		layout.settle()

		layout.reheat(0.5)
		expect(layout.isSettled).toBe(false)

		const before = layout.nodes.map((node) => ({ x: node.x, y: node.y }))
		layout.tick()

		const moved = layout.nodes.some(
			(node, index) => node.x !== before[index].x || node.y !== before[index].y,
		)
		expect(moved).toBe(true)
	})

	it('07. tick - 被釘選的節點不會被力推開', () => {
		const layout = createLayout()
		layout.nodes[0].pinned = true
		layout.nodes[0].x = 120
		layout.nodes[0].y = 140

		for (let i = 0; i < 40; i += 1) layout.tick()

		expect(layout.nodes[0].x).toBe(120)
		expect(layout.nodes[0].y).toBe(140)
	})

	it('08. settle - 佈局會撐開到畫布的合理比例，不縮在中央一小團', () => {
		const layout = createLayout()
		layout.settle()

		const xs = layout.nodes.map((node) => node.x)
		const ys = layout.nodes.map((node) => node.y)
		const spanX = Math.max(...xs) - Math.min(...xs)
		const spanY = Math.max(...ys) - Math.min(...ys)

		/*
		 * !! 這條是視覺回歸的防線。repulsion 決定整張圖的尺度，
		 *    調小會讓圖縮回畫布正中央一小團、四周全空——使用者回報過「好醜」的原因之一。
		 */
		expect(spanX).toBeGreaterThan(WIDTH * 0.5)
		expect(spanY).toBeGreaterThan(HEIGHT * 0.45)
	})

	it('09. settle - 小畫布不會被撐爆，節點不會擠在邊界上', () => {
		const narrow = new ForceLayout({
			ids: graphNodes.map((node) => node.id),
			links: buildLinks(),
			clusterIndexes: buildClusterIndexes(),
			options: { width: 600, height: 440 },
		})
		narrow.settle()

		// @ MARGIN 是 48；貼著邊界代表力把圖推出畫布後被硬夾住
		const atEdge = narrow.nodes.filter(
			(node) => node.x <= 49 || node.x >= 600 - 49 || node.y <= 49 || node.y >= 440 - 49,
		)
		expect(atEdge).toEqual([])

		let minGap = Number.POSITIVE_INFINITY
		for (let i = 0; i < narrow.nodes.length; i += 1) {
			for (let j = i + 1; j < narrow.nodes.length; j += 1) {
				minGap = Math.min(
					minGap,
					Math.hypot(narrow.nodes[j].x - narrow.nodes[i].x, narrow.nodes[j].y - narrow.nodes[i].y),
				)
			}
		}
		// @ 最大節點半徑 16，兩顆相鄰不得重疊
		expect(minGap).toBeGreaterThan(34)
	})

	it('10. 資料完整性 - 每條邊的兩端都存在於節點清單', () => {
		const ids = new Set(graphNodes.map((node) => node.id))
		for (const edge of graphEdges) {
			expect(ids.has(edge.from)).toBe(true)
			expect(ids.has(edge.to)).toBe(true)
		}
	})

	it('11. 資料完整性 - 沒有孤立節點', () => {
		const connected = new Set<string>()
		for (const edge of graphEdges) {
			connected.add(edge.from)
			connected.add(edge.to)
		}

		const isolated = graphNodes.filter((node) => !connected.has(node.id)).map((node) => node.label)
		expect(isolated).toEqual([])
	})
})
