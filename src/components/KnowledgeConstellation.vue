<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'

import { GRAPH_CLUSTERS, graphNodes } from '@/mocks/graph'

// > 知識星圖：首頁 hero 的可互動 3D 背景
// @ 不引入 three.js，用 Canvas 2D 自行做透視投影；bundle 已接近 500KB 警告線
// @ Canvas 為裝飾層（aria-hidden），節點互動屬 progressive enhancement，
//   等價功能在 /graph 頁有完整的鍵盤可操作版本

const emit = defineEmits<{ select: [label: string] }>()

interface ClusterSeed {
	label: string
	leaves: string[]
}

interface SceneNode {
	label: string
	isHub: boolean
	// > 單位球上的原始座標
	x: number
	y: number
	z: number
	// > 每幀更新的投影結果
	sx: number
	sy: number
	scale: number
	depth: number
	radius: number
	// > 距 hero 文字區的淡出係數，0 為完全隱藏
	fade: number
}

interface SceneEdge {
	from: number
	to: number
}

interface Pulse {
	edge: number
	t: number
	speed: number
}

/*
 * > 主題叢集：與 /graph 圖譜頁共用 `mocks/graph.ts` 的同一份資料
 * @ 只取每個叢集的前幾個非「制度」節點當周邊點；背景放進全部 32 個節點會太吵，
 *   而制度類節點的名稱較長，放在背景不易讀。
 */
const CLUSTERS: ClusterSeed[] = GRAPH_CLUSTERS.map((cluster) => ({
	label: cluster,
	leaves: graphNodes
		.filter((node) => node.cluster === cluster && node.type !== '制度')
		.slice(0, 4)
		.map((node) => node.label),
}))

const FOV = 3.2
const MIN_SCALE = FOV / (FOV + 1)
const MAX_SCALE = FOV / (FOV - 1)
const MAX_PULSES = 3

const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hasHover = ref(false)

const theme = useTheme()

let ctx: CanvasRenderingContext2D | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let viewObserver: IntersectionObserver | null = null
let motionQuery: MediaQueryList | null = null

let width = 0
let height = 0
let nodes: SceneNode[] = []
let edges: SceneEdge[] = []
let pulses: Pulse[] = []
let order: number[] = []

// > 中央鏤空的半徑（px），對齊 hero 內容區寬度 900px
const CLEAR_X = 430
const CLEAR_Y = 250

let spin = 0
let tiltX = 0
let tiltY = 0
let targetTiltX = 0
let targetTiltY = 0
let hovered = -1
let pulseTimer = 0
let inView = true
let reduceMotion = false

// > 主題色以 RGB 三元組快取，避免每幀重複解析 hex
let inkRgb = '32, 36, 40'
let primaryRgb = '49, 92, 145'
let surfaceRgb = '255, 255, 255'

// - 將 Vuetify 主題的 hex 轉為 canvas 可用的 rgb 字串
function toRgb(hex: string, fallback: string): string {
	const value = hex.replace('#', '')
	if (value.length !== 6) return fallback
	const int = Number.parseInt(value, 16)
	if (Number.isNaN(int)) return fallback
	return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
}

// - 讀取當前主題色，供繪製使用
function syncPalette(): void {
	const colors = theme.current.value.colors
	primaryRgb = toRgb(colors.primary ?? '', primaryRgb)
	inkRgb = toRgb(colors['on-surface'] ?? '', inkRgb)
	surfaceRgb = toRgb(colors.surface ?? '', surfaceRgb)
}

// - 以黃金角在單位球面均勻取點，得到叢集中心方向
function hubDirection(index: number, total: number): [number, number, number] {
	const y = 1 - (index / Math.max(total - 1, 1)) * 2
	const radius = Math.sqrt(Math.max(1 - y * y, 0))
	const angle = index * 2.399963229728653
	return [Math.cos(angle) * radius, y * 0.72, Math.sin(angle) * radius]
}

// - 建立節點與連線；leaf 圍繞所屬 hub 形成叢集，hub 之間串成環
function buildScene(): void {
	nodes = []
	edges = []
	pulses = []

	const hubIndexes: number[] = []

	CLUSTERS.forEach((cluster, clusterIndex) => {
		const [hx, hy, hz] = hubDirection(clusterIndex, CLUSTERS.length)
		hubIndexes.push(nodes.length)
		nodes.push(createNode(cluster.label, true, hx * 0.78, hy * 0.78, hz * 0.78))

		const hubIndex = nodes.length - 1
		cluster.leaves.forEach((leaf, leafIndex) => {
			const spread = 0.62
			const angle = (leafIndex / cluster.leaves.length) * Math.PI * 2 + clusterIndex
			const jitterX = Math.cos(angle) * spread + Math.sin(angle * 2.7) * 0.18
			const jitterY = Math.sin(angle) * spread * 0.8 + Math.cos(angle * 1.9) * 0.16
			const jitterZ = Math.cos(angle * 1.4) * spread * 0.7

			const length = Math.hypot(hx + jitterX, hy + jitterY, hz + jitterZ) || 1
			const shell = 0.9 + ((leafIndex * 37) % 11) / 100
			nodes.push(createNode(
				leaf,
				false,
				((hx + jitterX) / length) * shell,
				((hy + jitterY) / length) * shell * 0.82,
				((hz + jitterZ) / length) * shell,
			))
			edges.push({ from: hubIndex, to: nodes.length - 1 })
		})
	})

	// @ hub 串成環形，讓背景讀起來是「一張圖」而不是五團互不相干的點
	hubIndexes.forEach((hubIndex, i) => {
		edges.push({ from: hubIndex, to: hubIndexes[(i + 1) % hubIndexes.length] })
	})

	order = nodes.map((_, index) => index)
}

function createNode(label: string, isHub: boolean, x: number, y: number, z: number): SceneNode {
	return { label, isHub, x, y, z, sx: 0, sy: 0, scale: 1, depth: 0.5, radius: 0, fade: 1 }
}

/*
 * - 中央淡出：越靠近 hero 文字區越透明
 * !! 這件事原本靠 CSS mask-composite 做，但該屬性在舊 Safari 會退回預設的
 *    疊加模式，鏤空失效時背景會直接壓在標題上。改成在繪製時算，不依賴瀏覽器支援度。
 */
function centerFade(sx: number, sy: number, cx: number, cy: number): number {
	const distance = Math.hypot((sx - cx) / CLEAR_X, (sy - cy) / CLEAR_Y)
	const t = (distance - 0.3) / 0.75
	if (t <= 0) return 0
	if (t >= 1) return 1
	// @ smoothstep，避免邊界出現生硬的圓形切線
	return t * t * (3 - 2 * t)
}

// - 依容器尺寸重設 canvas 的實際像素（含 DPR）
function resize(): void {
	const element = host.value
	const surface = canvas.value
	if (!element || !surface) return

	width = element.clientWidth
	height = element.clientHeight
	if (width === 0 || height === 0) return

	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	surface.width = Math.round(width * dpr)
	surface.height = Math.round(height * dpr)
	surface.style.width = `${width}px`
	surface.style.height = `${height}px`

	ctx = surface.getContext('2d')
	ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

	if (reduceMotion) render()
}

// - 依當前旋轉角把每個節點投影到螢幕座標
function project(): void {
	const cx = width / 2
	const cy = height * 0.46
	// @ x/y 分開擴散成扁橢球：hero 是寬扁區塊，等比例球會整團擠在中央被遮罩吃掉
	const spreadX = Math.max(width * 0.44, 400)
	const spreadY = Math.max(height * 0.9, 300)

	const cosSpin = Math.cos(spin + tiltY)
	const sinSpin = Math.sin(spin + tiltY)
	const cosTilt = Math.cos(tiltX)
	const sinTilt = Math.sin(tiltX)

	for (const node of nodes) {
		const x1 = node.x * cosSpin - node.z * sinSpin
		const z1 = node.x * sinSpin + node.z * cosSpin
		const y1 = node.y * cosTilt - z1 * sinTilt
		const z2 = node.y * sinTilt + z1 * cosTilt

		const scale = FOV / (FOV + z2)
		node.scale = scale
		node.depth = (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)
		node.sx = cx + x1 * spreadX * scale
		node.sy = cy + y1 * spreadY * scale
		node.radius = (node.isHub ? 3.6 : 2) * scale
		node.fade = centerFade(node.sx, node.sy, cx, cy)
	}

	order.sort((a, b) => nodes[a].scale - nodes[b].scale)
}

// - 繪製一幀
function render(): void {
	if (!ctx || width === 0 || height === 0) return
	project()

	ctx.clearRect(0, 0, width, height)

	// > 連線：靠近觀察者的線較清楚，遠端幾乎消失，形成深度霧化
	ctx.lineWidth = 1
	for (const edge of edges) {
		const from = nodes[edge.from]
		const to = nodes[edge.to]
		const fade = (from.fade + to.fade) / 2
		if (fade <= 0.02) continue
		const depth = (from.depth + to.depth) / 2
		ctx.strokeStyle = `rgba(${primaryRgb}, ${((0.04 + depth * 0.17) * fade).toFixed(3)})`
		ctx.beginPath()
		ctx.moveTo(from.sx, from.sy)
		ctx.lineTo(to.sx, to.sy)
		ctx.stroke()
	}

	// > 沿連線移動的光點，暗示知識之間持續建立關聯
	for (const pulse of pulses) {
		const edge = edges[pulse.edge]
		const from = nodes[edge.from]
		const to = nodes[edge.to]
		const depth = (from.depth + to.depth) / 2
		const px = from.sx + (to.sx - from.sx) * pulse.t
		const py = from.sy + (to.sy - from.sy) * pulse.t
		// @ 頭尾淡入淡出，避免光點在端點突然出現或消失
		const travel = Math.sin(pulse.t * Math.PI)
		const fade = from.fade + (to.fade - from.fade) * pulse.t
		ctx.fillStyle = `rgba(${primaryRgb}, ${(travel * fade * (0.18 + depth * 0.42)).toFixed(3)})`
		ctx.beginPath()
		ctx.arc(px, py, 1.6 + depth * 1.1, 0, Math.PI * 2)
		ctx.fill()
	}

	// > 節點：由遠到近繪製
	for (const index of order) {
		const node = nodes[index]
		if (node.fade <= 0.02) continue
		const isActive = index === hovered
		const alpha = ((node.isHub ? 0.2 : 0.12) + node.depth * 0.46) * node.fade
		ctx.fillStyle = `rgba(${primaryRgb}, ${(isActive ? Math.min(alpha + 0.35, 0.95) : alpha).toFixed(3)})`
		ctx.beginPath()
		ctx.arc(node.sx, node.sy, isActive ? node.radius * 1.9 : node.radius, 0, Math.PI * 2)
		ctx.fill()

		if (isActive) {
			ctx.strokeStyle = `rgba(${primaryRgb}, 0.4)`
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.arc(node.sx, node.sy, node.radius * 3.6, 0, Math.PI * 2)
			ctx.stroke()
		}
	}

	// > 叢集標籤：只有主題節點常駐文字，維持背景的可讀性
	ctx.font = '600 12px "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	for (const index of order) {
		const node = nodes[index]
		if (!node.isHub || index === hovered || node.fade <= 0.1) continue
		ctx.fillStyle = `rgba(${primaryRgb}, ${((0.08 + node.depth * 0.3) * node.fade).toFixed(3)})`
		ctx.fillText(node.label, node.sx, node.sy - node.radius - 10)
	}

	if (hovered >= 0) drawHoverLabel(nodes[hovered])
}

// - hover 的節點畫成實心卡片，確保文字對比不受背景影響
function drawHoverLabel(node: SceneNode): void {
	if (!ctx) return
	const text = node.label
	const paddingX = 10
	const paddingY = 6
	const textWidth = ctx.measureText(text).width
	const boxWidth = textWidth + paddingX * 2
	const boxHeight = 12 + paddingY * 2
	const boxX = node.sx - boxWidth / 2
	const boxY = node.sy - node.radius - boxHeight - 12

	ctx.fillStyle = `rgba(${surfaceRgb}, 0.96)`
	ctx.strokeStyle = `rgba(${primaryRgb}, 0.5)`
	ctx.lineWidth = 1
	ctx.beginPath()
	// @ roundRect 在較舊的 Safari 不存在，缺了會讓整個 rAF 迴圈拋錯中斷
	if (typeof ctx.roundRect === 'function') ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8)
	else ctx.rect(boxX, boxY, boxWidth, boxHeight)
	ctx.fill()
	ctx.stroke()

	ctx.fillStyle = `rgb(${inkRgb})`
	ctx.fillText(text, node.sx, boxY + boxHeight / 2 + 1)
}

// - 每幀推進自轉、視差與光點
function step(): void {
	spin += 0.0014
	tiltX += (targetTiltX - tiltX) * 0.06
	tiltY += (targetTiltY - tiltY) * 0.06

	pulseTimer += 1
	if (pulseTimer > 70 && pulses.length < MAX_PULSES && edges.length > 0) {
		pulseTimer = 0
		pulses.push({
			edge: Math.floor(Math.random() * edges.length),
			t: 0,
			speed: 0.004 + Math.random() * 0.004,
		})
	}

	for (const pulse of pulses) {
		pulse.t += pulse.speed
	}
	pulses = pulses.filter((pulse) => pulse.t < 1)

	render()
	frameId = requestAnimationFrame(step)
}

function start(): void {
	if (reduceMotion || frameId !== 0 || !inView) return
	frameId = requestAnimationFrame(step)
}

function stop(): void {
	if (frameId === 0) return
	cancelAnimationFrame(frameId)
	frameId = 0
}

// - 依滑鼠位置設定視差目標角，並更新 hover 節點
function handlePointerMove(event: PointerEvent): void {
	if (!host.value) return
	const rect = host.value.getBoundingClientRect()
	const px = event.clientX - rect.left
	const py = event.clientY - rect.top

	// @ 減少動態時不做視差傾斜，但仍保留節點的 hover 與點擊
	if (!reduceMotion) {
		targetTiltY = (px / rect.width - 0.5) * 0.55
		targetTiltX = (py / rect.height - 0.5) * -0.4
	}

	let nearest = -1
	let nearestDistance = Number.POSITIVE_INFINITY
	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index]
		// @ 淡出到看不見的節點不該可點，否則會出現點了空白處卻跳頁
		if (node.fade <= 0.15) continue
		const distance = Math.hypot(node.sx - px, node.sy - py)
		if (distance < node.radius + 12 && distance < nearestDistance) {
			nearest = index
			nearestDistance = distance
		}
	}

	const changed = hovered !== nearest
	hovered = nearest
	hasHover.value = nearest >= 0
	// @ 靜止模式沒有 rAF，hover 變化要自己補一幀
	if (changed && reduceMotion) render()
}

function handlePointerLeave(): void {
	targetTiltX = 0
	targetTiltY = 0
	hovered = -1
	hasHover.value = false
	if (reduceMotion) render()
}

// - 點擊節點時往上送出主題；忽略落在 hero 內容元素上的點擊
function handleClick(event: MouseEvent): void {
	if (hovered < 0) return
	const target = event.target as HTMLElement | null
	if (target?.closest('button, a, input, textarea, [role="button"]')) return
	emit('select', nodes[hovered].label)
}

function handleVisibility(): void {
	if (document.hidden) stop()
	else start()
}

function handleMotionChange(): void {
	reduceMotion = motionQuery?.matches ?? false
	if (reduceMotion) {
		stop()
		tiltX = 0
		tiltY = 0
		hovered = -1
		hasHover.value = false
		render()
		return
	}
	start()
}

onMounted(() => {
	syncPalette()
	buildScene()
	resize()

	motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
	reduceMotion = motionQuery.matches
	motionQuery.addEventListener('change', handleMotionChange)

	if (host.value) {
		resizeObserver = new ResizeObserver(resize)
		resizeObserver.observe(host.value)

		// @ hero 捲出視窗就停掉 rAF，長頁面捲動時不必持續重繪
		viewObserver = new IntersectionObserver((entries) => {
			inView = entries[0]?.isIntersecting ?? true
			if (inView) start()
			else stop()
		}, { threshold: 0 })
		viewObserver.observe(host.value)
	}

	document.addEventListener('visibilitychange', handleVisibility)

	if (reduceMotion) render()
	else start()
})

onBeforeUnmount(() => {
	stop()
	resizeObserver?.disconnect()
	viewObserver?.disconnect()
	motionQuery?.removeEventListener('change', handleMotionChange)
	document.removeEventListener('visibilitychange', handleVisibility)
})

// @ 切換深淺主題時要重讀色票，否則沿用切換前算好的 RGB
watch(() => theme.current.value, () => {
	syncPalette()
	render()
})
</script>

<template>
	<div
		ref="host"
		class="constellation"
		:class="{ 'is-pointing': hasHover }"
		@pointermove="handlePointerMove"
		@pointerleave="handlePointerLeave"
		@click="handleClick"
	>
		<canvas ref="canvas" aria-hidden="true" />
	</div>
</template>

<style scoped>
.constellation {
	position: absolute;
	inset: -60px -20vw -20px;
	z-index: 0;
	overflow: hidden;
}

.constellation.is-pointing {
	cursor: pointer;
}

/*
 * @ 中央鏤空 + 外緣淡出：hero 的標題與搜尋框落在鏤空區，
 *   確保背景永遠不會壓到閱讀對比（DESIGN.md The Reading First Rule）。
 */
/*
 * @ 只保留最外緣的淡出（單層 mask，支援度無虞）；
 *   保護 hero 文字的中央淡出改由 centerFade() 在繪製時處理。
 */
canvas {
	display: block;
	-webkit-mask-image: radial-gradient(ellipse 92% 98% at 50% 46%, #000 46%, transparent 100%);
	mask-image: radial-gradient(ellipse 92% 98% at 50% 46%, #000 46%, transparent 100%);
}

@media (max-width: 900px) {
	/* @ 窄螢幕沒有足夠留白容納星圖，只保留最外圈的一點紋理 */
	.constellation {
		inset: -30px -10vw 0;
		opacity: 0.55;
	}
}
</style>
