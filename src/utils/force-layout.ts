// > 力導向佈局
// @ 不引入 d3-force：節點量在數十個等級，斥力的 O(n²) 成本遠低於多帶一個相依
// !! 核心設計是「收斂後停止」。alpha 衰減到 alphaMin 就不再更新，
//    穩態下 CPU 為零；只有拖曳、篩選或視窗改變尺寸才 reheat。

export interface ForceNode {
	id: string
	x: number
	y: number
	vx: number
	vy: number
	/** 被拖曳中的節點固定位置，不受力影響 */
	pinned: boolean
}

export interface ForceLink {
	source: number
	target: number
}

export interface ForceLayoutOptions {
	width: number
	height: number
	/** 節點兩兩相斥的強度 */
	repulsion?: number
	/** 連線的理想長度 */
	linkDistance?: number
	/** 連線拉回理想長度的強度 */
	linkStrength?: number
	/** 拉向畫布中心的強度，避免離群節點飄出畫面 */
	gravity?: number
	/** 速度衰減，越小越快靜止 */
	damping?: number
	/** 節點不重疊的最小間距 */
	minDistance?: number
}

/*
 * @ 這組值配合「節點大小依關聯數（半徑 8~16）＋節點下方掛標籤」調過：
 *   節點之間要留得下一行 12px 的中文標籤，圖才不會擠成一團。
 *   調小 minDistance 會直接讓標籤碰撞避讓丟掉大量標籤。
 *
 * !! repulsion 決定整張圖的「尺度」，不只是節點間距。
 *    平衡半徑約 (n · repulsion / gravity)^(1/3)——先前 3800 配 0.018 算出來只有 188，
 *    圖因此縮在畫布正中央一小團、四周全是空白，而且不隨畫布變大。
 */
const DEFAULTS = {
	repulsion: 10000,
	linkDistance: 92,
	linkStrength: 0.055,
	gravity: 0.018,
	damping: 0.78,
	minDistance: 62,
}

/*
 * - 依畫布長寬比把重力拆成 x／y 兩個方向
 * @ 重力各向同性時圖必然是圓團，寬螢幕上左右會空掉一大片。
 *   讓水平重力弱、垂直重力強，圖就會拉成貼合畫布的橢圓。
 *   指數用 1.2 而非嚴格的 1.5，避免極端長寬比把圖壓成一條線。
 */
function gravityBias(width: number, height: number): number {
	const aspect = Math.min(Math.max(width / height, 0.8), 2)
	return Math.pow(aspect, 1.2)
}

/** DEFAULTS 是在這個尺寸的畫布上調出來的 */
const REFERENCE_SIZE = Math.sqrt(960 * 620)

/*
 * - 畫布尺度係數
 * !! 少了這個，同一組參數在手機尺寸會把圖撐爆——節點全撞在邊界上並互相重疊。
 * @ 長度（linkDistance、minDistance）∝ s，而斥力 ∝ s³：
 *   平衡半徑約 (n · repulsion / gravity)^(1/3)，要讓半徑隨畫布等比放大就得三次方。
 */
function sizeScale(width: number, height: number): number {
	const scale = Math.sqrt(width * height) / REFERENCE_SIZE
	return Math.min(Math.max(scale, 0.45), 1.6)
}

const ALPHA_DECAY = 0.965
const ALPHA_MIN = 0.005
const MARGIN = 48

/*
 * - 確定性的擾動值
 * @ 不用 Math.random：每次重整都得到同一張圖，使用者才能對圖形建立空間記憶，
 *   回報「某個節點位置怪怪的」時也才重現得出來。
 */
function jitter(seed: number): number {
	const value = Math.sin(seed * 127.1) * 43758.5453
	return value - Math.floor(value) - 0.5
}

export class ForceLayout {
	nodes: ForceNode[] = []
	links: ForceLink[] = []
	alpha = 1

	private width: number
	private height: number
	private bias: number
	private scale: number
	private options: Required<Omit<ForceLayoutOptions, 'width' | 'height'>>

	constructor({ ids, links, clusterIndexes, options }: {
		ids: string[]
		links: ForceLink[]
		/** 每個節點所屬群組的序號，用來決定初始擺放的方位 */
		clusterIndexes: number[]
		options: ForceLayoutOptions
	}) {
		this.width = options.width
		this.height = options.height
		this.bias = gravityBias(this.width, this.height)
		this.scale = sizeScale(this.width, this.height)
		this.options = { ...DEFAULTS, ...options }
		this.links = links

		const clusterCount = Math.max(...clusterIndexes, 0) + 1
		const radius = Math.min(this.width, this.height) * 0.3

		this.nodes = ids.map((id, index) => {
			// @ 依群組先擺成環狀再讓力去鬆開，比全隨機起點收斂得快也穩定
			const angle = (clusterIndexes[index] / clusterCount) * Math.PI * 2
			return {
				id,
				x: this.width / 2 + Math.cos(angle) * radius + jitter(index + 1) * 90,
				y: this.height / 2 + Math.sin(angle) * radius + jitter(index + 51) * 90,
				vx: 0,
				vy: 0,
				pinned: false,
			}
		})
	}

	get isSettled(): boolean {
		return this.alpha <= ALPHA_MIN
	}

	// - 重新加熱，讓佈局在互動後重新調整
	reheat(value = 0.5): void {
		this.alpha = Math.max(this.alpha, value)
	}

	// - 更新畫布尺寸並重新加熱
	resize({ width, height }: { width: number, height: number }): void {
		if (width <= 0 || height <= 0) return
		// @ ResizeObserver 在 observe 當下就會觸發一次，且捲軸出現／消失也會觸發；
		//   尺寸沒真的變就不重新加熱，否則佈局會無謂地再抖動一次
		if (width === this.width && height === this.height) return
		this.width = width
		this.height = height
		this.bias = gravityBias(width, height)
		this.scale = sizeScale(width, height)
		this.reheat(0.35)
	}

	// - 推進一個時間步；已收斂則不做事
	tick(): void {
		if (this.isSettled) return

		const { linkStrength, gravity, damping } = this.options
		const nodes = this.nodes
		const count = nodes.length

		// @ 長度 ∝ scale、斥力 ∝ scale³，讓整張圖等比貼合當前畫布
		const scale = this.scale
		const repulsion = this.options.repulsion * scale * scale * scale
		const linkDistance = this.options.linkDistance * scale
		const minDistance = this.options.minDistance * scale

		// > 斥力：所有節點兩兩相推
		for (let i = 0; i < count; i += 1) {
			const a = nodes[i]
			for (let j = i + 1; j < count; j += 1) {
				const b = nodes[j]
				let dx = b.x - a.x
				let dy = b.y - a.y
				let distanceSq = dx * dx + dy * dy

				// @ 兩點完全重合時方向無定義，給一個確定性的偏移把它們分開
				if (distanceSq < 0.01) {
					dx = jitter(i * 31 + j) || 0.5
					dy = jitter(j * 17 + i) || 0.5
					distanceSq = dx * dx + dy * dy
				}

				const distance = Math.sqrt(distanceSq)
				let force = repulsion / distanceSq
				// @ 近距離額外加強，取代獨立的碰撞偵測
				if (distance < minDistance) force += (minDistance - distance) * 0.6

				const fx = (dx / distance) * force
				const fy = (dy / distance) * force
				a.vx -= fx
				a.vy -= fy
				b.vx += fx
				b.vy += fy
			}
		}

		// > 彈簧力：有連線的節點拉回理想距離
		for (const link of this.links) {
			const a = nodes[link.source]
			const b = nodes[link.target]
			if (!a || !b) continue

			const dx = b.x - a.x
			const dy = b.y - a.y
			const distance = Math.hypot(dx, dy) || 0.01
			const force = (distance - linkDistance) * linkStrength
			const fx = (dx / distance) * force
			const fy = (dy / distance) * force
			a.vx += fx
			a.vy += fy
			b.vx -= fx
			b.vy -= fy
		}

		// > 重力與積分
		const centerX = this.width / 2
		const centerY = this.height / 2
		const gravityX = gravity / this.bias
		const gravityY = gravity * this.bias
		for (const node of nodes) {
			if (node.pinned) {
				node.vx = 0
				node.vy = 0
				continue
			}

			node.vx += (centerX - node.x) * gravityX
			node.vy += (centerY - node.y) * gravityY
			node.vx *= damping
			node.vy *= damping
			node.x += node.vx * this.alpha
			node.y += node.vy * this.alpha

			node.x = Math.min(Math.max(node.x, MARGIN), this.width - MARGIN)
			node.y = Math.min(Math.max(node.y, MARGIN), this.height - MARGIN)
		}

		this.alpha *= ALPHA_DECAY
		if (this.alpha <= ALPHA_MIN) this.alpha = ALPHA_MIN
	}

	// - 一次跑到收斂，供 prefers-reduced-motion 或測試使用
	settle(maxTicks = 400): void {
		let ticks = 0
		while (!this.isSettled && ticks < maxTicks) {
			this.tick()
			ticks += 1
		}
		this.alpha = ALPHA_MIN
	}
}
