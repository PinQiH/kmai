<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { type ToastItem, type ToastTone, useToastStore } from '@/stores/toast'

/*
 * > 全站操作回饋通知的呈現層
 * @ 右上角、頂列下方；最新的一則在最上面。
 * @ 自動消失由倒數線的 animationend 驅動，暫停只需暫停動畫，不必另外維護計時器剩餘時間。
 *   滑鼠移入、鍵盤焦點進入、分頁切到背景時都會暫停，避免使用者還沒讀完就消失。
 */
withDefaults(defineProps<{
	/** 距離視窗頂端的像素；有頂列時需避開頂列高度 */
	top?: number
}>(), { top: 16 })

const toastStore = useToastStore()

const toneMeta: Record<ToastTone, { icon: string; label: string }> = {
	success: { icon: 'mdi-check', label: '成功' },
	info: { icon: 'mdi-information-variant', label: '提示' },
	warning: { icon: 'mdi-exclamation', label: '注意' },
	error: { icon: 'mdi-close', label: '錯誤' },
}

const isPageHidden = ref(false)
function syncVisibility(): void {
	isPageHidden.value = document.visibilityState === 'hidden'
}
onMounted(() => {
	syncVisibility()
	document.addEventListener('visibilitychange', syncVisibility)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', syncVisibility))

function runAction(toast: ToastItem): void {
	toast.action?.handler()
	toastStore.dismiss(toast.id)
}

// @ 錯誤用 alert 立即朗讀；其餘用 status 禮貌朗讀，不打斷螢幕閱讀器正在念的內容
function liveRole(tone: ToastTone): 'alert' | 'status' {
	return tone === 'error' ? 'alert' : 'status'
}
</script>

<template>
	<section
		class="app-toaster"
		:class="{ 'is-page-hidden': isPageHidden }"
		:style="{ '--toaster-top': `${top}px` }"
		aria-label="操作通知"
	>
		<TransitionGroup name="toast" tag="ol" class="app-toaster__list">
			<li
				v-for="toast in toastStore.items"
				:key="toast.id"
				class="toast"
				:class="`toast--${toast.tone}`"
				:role="liveRole(toast.tone)"
				aria-atomic="true"
				tabindex="-1"
				data-testid="app-toast"
				@keydown.esc.stop="toastStore.dismiss(toast.id)"
			>
				<span class="toast__stamp" aria-hidden="true">
					<VIcon :icon="toneMeta[toast.tone].icon" size="16" />
				</span>
				<div class="toast__body">
					<p class="toast__title">
						<span class="d-sr-only">{{ toneMeta[toast.tone].label }}：</span>{{ toast.title }}
						<span v-if="toast.count > 1" class="toast__count" :aria-label="`共 ${toast.count} 次`">×{{ toast.count }}</span>
					</p>
					<p v-if="toast.detail" class="toast__detail">{{ toast.detail }}</p>
					<button
						v-if="toast.action"
						type="button"
						class="toast__action"
						@click="runAction(toast)"
					>
						{{ toast.action.label }}
					</button>
				</div>
				<button type="button" class="toast__close" aria-label="關閉通知" @click="toastStore.dismiss(toast.id)">
					<VIcon icon="mdi-close" size="18" />
				</button>
				<span
					v-if="toast.timeout > 0"
					:key="toast.revision"
					class="toast__timer"
					:style="{ animationDuration: `${toast.timeout}ms` }"
					aria-hidden="true"
					@animationend="toastStore.dismiss(toast.id)"
				/>
			</li>
		</TransitionGroup>
	</section>
</template>

<style scoped>
/*
 * !! z-index 刻意高於 Vuetify overlay（對話框約 2400）：在對話框內按下儲存後，
 *    通知必須浮在對話框之上，否則使用者看不到結果。main.css 的 --z-* 只管自訂層，不適用這裡。
 */
.app-toaster {
	position: fixed;
	top: var(--toaster-top);
	right: 16px;
	z-index: 2600;
	width: min(380px, calc(100vw - 32px));
	pointer-events: none;
}

.app-toaster__list {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

/* > 紙卡：白色紙面、1px 細框、帶位移的柔和陰影（浮在內容上的暫時層才用陰影） */
.toast {
	--toast-accent: rgb(var(--v-theme-success));
	--toast-on-accent: rgb(var(--v-theme-on-success));
	position: relative;
	display: grid;
	grid-template-columns: 28px minmax(0, 1fr) 32px;
	column-gap: 12px;
	align-items: start;
	width: 100%;
	padding: 14px 8px 14px 14px;
	overflow: hidden;
	color: var(--ink-strong);
	background: rgb(var(--v-theme-surface));
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	box-shadow:
		0 12px 28px -14px rgba(32, 36, 40, 0.32),
		0 2px 6px -2px rgba(32, 36, 40, 0.1);
	pointer-events: auto;
}

.v-theme--kmaiDark .toast,
.v-theme--kmaiRedDark .toast {
	box-shadow:
		0 14px 32px -12px rgba(0, 0, 0, 0.55),
		0 2px 6px -2px rgba(0, 0, 0, 0.35);
}

.toast:focus-visible {
	outline: 3px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.toast--info {
	--toast-accent: rgb(var(--v-theme-info));
	--toast-on-accent: rgb(var(--v-theme-on-info));
}

.toast--warning {
	--toast-accent: rgb(var(--v-theme-warning));
	--toast-on-accent: rgb(var(--v-theme-on-warning));
}

.toast--error {
	--toast-accent: rgb(var(--v-theme-error));
	--toast-on-accent: rgb(var(--v-theme-on-error));
	/* @ 錯誤不自動消失，改以邊框帶一點狀態色，和成功通知在周邊視覺就能分辨 */
	border-color: color-mix(in srgb, rgb(var(--v-theme-error)) 45%, rgb(var(--v-theme-outline)));
}

/* > 狀態圖章：實心圓＋粗筆畫圖示；形狀與文字標籤並存，不只靠顏色 */
.toast__stamp {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	margin-top: -2px;
	color: var(--toast-on-accent);
	background: var(--toast-accent);
	border-radius: 50%;
}

.toast__body {
	min-width: 0;
	padding-top: 2px;
}

.toast__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
	line-height: 1.45;
	overflow-wrap: anywhere;
	text-wrap: pretty;
}

.toast__count {
	display: inline-block;
	margin-left: 6px;
	padding: 0 6px;
	font-size: 0.78rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	line-height: 1.5;
	color: var(--ink-muted);
	vertical-align: 1px;
	background: rgb(var(--v-theme-surface-variant));
	border-radius: 999px;
}

.toast__detail {
	margin: 2px 0 0;
	font-size: 0.875rem;
	line-height: 1.5;
	color: var(--ink-muted);
	overflow-wrap: anywhere;
	text-wrap: pretty;
}

.toast__action {
	margin: 8px 0 0 -8px;
	padding: 4px 8px;
	font: inherit;
	font-size: 0.875rem;
	font-weight: 600;
	color: rgb(var(--v-theme-primary));
	background: transparent;
	border: 0;
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: background-color 150ms ease-out;
}

.toast__close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	margin-top: -4px;
	color: var(--ink-subtle);
	background: transparent;
	border: 0;
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: background-color 150ms ease-out, color 150ms ease-out;
}

.toast__action:hover,
.toast__close:hover {
	background: var(--tint-hover);
}

.toast__close:hover {
	color: var(--ink-strong);
}

.toast__action:focus-visible,
.toast__close:focus-visible {
	outline: 3px solid rgb(var(--v-theme-primary));
	outline-offset: 1px;
}

/* > 倒數線：貼齊卡片底緣，以狀態色由右往左收；同時是自動消失的計時器 */
.toast__timer {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	height: 2px;
	background: var(--toast-accent);
	opacity: 0.4;
	transform-origin: left center;
	animation: toast-countdown linear forwards;
}

.toast:hover .toast__timer,
.toast:focus-within .toast__timer,
.is-page-hidden .toast__timer {
	animation-play-state: paused;
}

@keyframes toast-countdown {
	from { transform: scaleX(1); }
	to { transform: scaleX(0); }
}

/* > 進場：從頂列方向落下並對焦（模糊轉清晰）；圖章稍晚彈出，是唯一的強調時刻 */
.toast-enter-active {
	transition:
		opacity 240ms cubic-bezier(0.16, 1, 0.3, 1),
		transform 360ms cubic-bezier(0.16, 1, 0.3, 1),
		filter 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-active .toast__stamp {
	animation: toast-stamp 380ms cubic-bezier(0.16, 1, 0.3, 1) 90ms both;
}

.toast-enter-from {
	opacity: 0;
	transform: translateY(-14px) scale(0.97);
	filter: blur(4px);
}

/* > 離場：往右滑出；絕對定位讓下方通知平順補位 */
.toast-leave-active {
	position: absolute;
	transition:
		opacity 180ms ease-in,
		transform 200ms ease-in;
}

.toast-leave-to {
	opacity: 0;
	transform: translateX(28px);
}

.toast-move {
	transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes toast-stamp {
	from { transform: scale(0.55); opacity: 0; }
	to { transform: scale(1); }
}

/* > 減少動態：只保留淡入淡出；倒數線仍需運作（它是計時器），但改為不可見 */
@media (prefers-reduced-motion: reduce) {
	.toast-enter-active,
	.toast-leave-active,
	.toast-move {
		transition: opacity 150ms linear;
	}

	.toast-enter-from,
	.toast-leave-to {
		transform: none;
		filter: none;
	}

	.toast-enter-active .toast__stamp {
		animation: none;
	}

	.toast__timer {
		opacity: 0;
	}
}

@media (max-width: 599px) {
	.app-toaster {
		right: 12px;
		width: calc(100vw - 24px);
	}
}

</style>
