<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import type { AnswerModelId, AnswerSettings, AnswerStyleId } from '@/types'
import {
	ANSWER_MODEL_OPTIONS,
	ANSWER_STYLE_OPTIONS,
	getAnswerModelLabel,
	getAnswerStyleLabel,
} from '@/utils/answerSettings'

interface ComponentProps {
	selectedAnswerStyleId: AnswerStyleId
	selectedAnswerModelId: AnswerModelId
	isResponding?: boolean
}

interface ActivatorSlotProps {
	activatorProps: Record<string, unknown>
	isOpen: boolean
}

const props = withDefaults(defineProps<ComponentProps>(), { isResponding: false })

const emit = defineEmits<{
	apply: [settings: AnswerSettings]
	closed: []
}>()

defineSlots<{
	activator(props: ActivatorSlotProps): unknown
}>()

const isOpen = ref(false)
const draftAnswerStyleId = ref<AnswerStyleId>(props.selectedAnswerStyleId)
const draftAnswerModelId = ref<AnswerModelId>(props.selectedAnswerModelId)

watch(isOpen, (menuIsOpen) => {
	if (!menuIsOpen) return
	draftAnswerStyleId.value = props.selectedAnswerStyleId
	draftAnswerModelId.value = props.selectedAnswerModelId
})

async function closeMenu(): Promise<void> {
	isOpen.value = false
	await nextTick()
	emit('closed')
}

function applySettings(): void {
	emit('apply', {
		answerStyleId: draftAnswerStyleId.value,
		answerModelId: draftAnswerModelId.value,
	})
	void closeMenu()
}
</script>

<template>
	<VMenu
		v-model="isOpen"
		:close-on-content-click="false"
		location="top start"
		:offset="8"
		:transition="false"
		:content-props="{
			role: 'dialog',
			'aria-labelledby': 'answer-settings-title',
			'aria-describedby': 'answer-settings-description',
		}"
	>
		<template #activator="{ props: activatorProps }">
			<slot name="activator" :activator-props="activatorProps" :is-open="isOpen" />
		</template>

		<VCard class="settings-menu" elevation="4">
			<form @submit.prevent="applySettings">
				<header class="settings-header">
					<h2 id="answer-settings-title">回答設定</h2>
					<p id="answer-settings-description">
						{{ getAnswerStyleLabel(draftAnswerStyleId) }} · {{ getAnswerModelLabel(draftAnswerModelId, true) }}
					</p>
				</header>

				<div class="settings-content">
					<fieldset class="settings-section">
						<legend>回答風格</legend>
						<div class="style-options">
							<label
								v-for="option in ANSWER_STYLE_OPTIONS"
								:key="option.id"
								class="style-choice"
								:class="{ 'is-selected': draftAnswerStyleId === option.id }"
							>
								<input v-model="draftAnswerStyleId" type="radio" name="answer-style" :value="option.id" />
								<span>{{ option.label }}</span>
							</label>
						</div>
					</fieldset>

					<fieldset class="settings-section">
						<legend>LLM</legend>
						<div class="model-options">
							<label
								v-for="option in ANSWER_MODEL_OPTIONS"
								:key="option.id"
								class="model-choice"
								:class="{ 'is-selected': draftAnswerModelId === option.id }"
							>
								<input v-model="draftAnswerModelId" type="radio" name="answer-model" :value="option.id" />
								<span class="model-name">{{ option.label }}</span>
								<span class="model-badge">{{ option.badge }}</span>
								<VIcon v-if="draftAnswerModelId === option.id" icon="mdi-check" size="17" class="choice-check" aria-hidden="true" />
							</label>
						</div>
					</fieldset>

					<p v-if="isResponding" class="settings-notice" role="status">
						目前的回答不受影響，新設定會從下一個問題開始套用。
					</p>
				</div>

				<footer class="settings-actions">
					<VBtn data-testid="answer-settings-cancel" type="button" size="small" variant="text" @click="closeMenu">取消</VBtn>
					<VBtn type="submit" size="small" color="primary" variant="flat">套用</VBtn>
				</footer>
			</form>
		</VCard>
	</VMenu>
</template>

<style scoped>
.settings-menu {
	width: min(360px, calc(100vw - var(--space-lg)));
	overflow: hidden;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
}

.settings-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-sm);
	padding: var(--space-sm) var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.settings-header h2 {
	flex: 0 0 auto;
	font-size: 0.92rem;
	font-weight: 650;
	line-height: 1.4;
}

.settings-header p {
	min-width: 0;
	margin: 0;
	overflow: hidden;
	color: var(--ink-muted);
	font-size: 0.72rem;
	line-height: 1.4;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.settings-content {
	display: grid;
	gap: var(--space-md);
	padding: var(--space-sm) var(--space-md);
}

.settings-section {
	display: grid;
	gap: var(--space-sm);
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;
}

.settings-section legend {
	padding: 0;
	color: var(--ink-strong);
	font-size: 0.76rem;
	font-weight: 650;
}

.style-options {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	padding: var(--space-xs);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.style-choice,
.model-choice {
	position: relative;
	cursor: pointer;
}

.style-choice input,
.model-choice input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.style-choice span {
	display: grid;
	place-items: center;
	min-height: 32px;
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
	font-size: 0.76rem;
	font-weight: 600;
	transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}

.style-choice:hover span {
	color: var(--ink-strong);
}

.style-choice.is-selected span {
	background: rgb(var(--v-theme-surface));
	color: rgb(var(--v-theme-primary));
}

.style-choice input:focus-visible + span,
.model-choice input:focus-visible + .model-name {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.model-options {
	display: grid;
	gap: var(--space-xs);
}

.model-choice {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto 20px;
	align-items: center;
	gap: var(--space-sm);
	padding: var(--space-sm);
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
}

.model-choice:hover {
	background: var(--tint-hover);
}

.model-choice.is-selected {
	background: var(--tint-active);
	color: var(--ink-strong);
}

.model-name {
	min-width: 0;
	overflow-wrap: anywhere;
	font-size: 0.8rem;
	font-weight: 600;
}

.model-badge {
	padding: 1px 6px;
	border-radius: 999px;
	background: rgb(var(--v-theme-surface-variant));
	color: var(--ink-muted);
	font-size: 0.64rem;
	font-weight: 650;
}

.choice-check {
	color: rgb(var(--v-theme-primary));
}

.settings-notice {
	padding: var(--space-sm);
	border-radius: var(--radius-sm);
	background: var(--tint-hover);
	color: var(--ink-muted);
	font-size: 0.7rem;
	line-height: 1.5;
}

.settings-actions {
	display: flex;
	justify-content: flex-end;
	gap: var(--space-xs);
	padding: var(--space-sm) var(--space-md);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

@media (max-width: 400px) {
	.settings-menu {
		width: calc(100vw - var(--space-md));
	}
}
</style>
