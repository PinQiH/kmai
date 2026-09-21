<script setup lang="ts">
import { computed } from "vue"

import AnimatedNumber from "@/components/AnimatedNumber.vue"
import PageHeader from "@/components/PageHeader.vue"
import StatePanel from "@/components/StatePanel.vue"
import { useAsyncData } from "@/composables/useAsyncData"
import { getOpenCases } from "@/mocks/feedbackAdmin"
import {
  fetchHealthMetrics,
  fetchRecentActivities,
} from "@/repositories/admin.repository"
import type { ActivityItem, HealthMetric } from "@/types"

const {
  data: healthMetrics,
  isLoading: isLoadingMetrics,
  errorMessage: metricsError,
  reload: reloadMetrics,
} = useAsyncData(fetchHealthMetrics, {
  initialValue: [] as HealthMetric[],
  errorMessage: () => "目前無法載入系統健康度，請稍後再試。",
})
const {
  data: recentActivities,
  isLoading: isLoadingActivities,
  errorMessage: activitiesError,
  reload: reloadActivities,
} = useAsyncData(fetchRecentActivities, {
  initialValue: [] as ActivityItem[],
  errorMessage: () => "目前無法載入近期動態，請稍後再試。",
})
const openFeedbackCount = computed(() => getOpenCases().length)

const metricColor = {
  good: "success",
  warning: "warning",
  critical: "error",
} as const
</script>

<template>
  <div class="page-shell">
    <PageHeader
      eyebrow="系統健康度"
      title="管理總覽"
      description="先處理需要人介入的事情，再查看內容與系統趨勢。"
    >
      <template #actions
        ><VBtn
          color="primary"
          prepend-icon="mdi-upload"
          to="/admin/documents/upload"
          >新增文件</VBtn
        ></template
      >
    </PageHeader>

    <VAlert
      type="warning"
      variant="tonal"
      class="mb-7"
      title="有文件處理工作需要介入"
    >
      目前有失敗與等待過久的文件工作，請先確認原因再重新執行或取消。
      <template #append
        ><VBtn variant="text" to="/admin/documents?tab=attention"
          >前往需要處理</VBtn
        ></template
      >
    </VAlert>

    <section aria-labelledby="health-title" class="mb-10">
      <h2 id="health-title" class="section-heading mb-4">內容與系統健康度</h2>
      <StatePanel
        v-if="metricsError"
        icon="mdi-cloud-alert-outline"
        title="無法載入健康度"
        :description="metricsError"
        action-label="重新載入"
        @action="reloadMetrics"
      />
      <VRow v-else-if="isLoadingMetrics">
        <VCol v-for="placeholder in 4" :key="placeholder" cols="12" sm="6" lg="3">
          <VSkeletonLoader type="article" class="surface-border rounded-lg" />
        </VCol>
      </VRow>
      <VRow v-else>
        <VCol
          v-for="(metric, index) in healthMetrics"
          :key="metric.label"
          cols="12"
          sm="6"
          lg="3"
        >
          <VCard
            class="metric surface-border pa-5 h-100 rise-in"
            :style="{ '--rise-index': index }"
          >
            <div class="d-flex align-center">
              <p class="text-body-2 text-medium-emphasis">{{ metric.label }}</p>
              <VSpacer /><VIcon
                icon="mdi-circle"
                :color="metricColor[metric.status]"
                size="10"
                :aria-label="metric.status === 'good' ? '正常' : '需要注意'"
              />
            </div>
            <p class="metric-value mt-3">
              <AnimatedNumber :value="metric.value" :duration-ms="1100" />
            </p>
            <p class="text-caption text-medium-emphasis mt-1">
              {{ metric.detail }}
            </p>
          </VCard>
        </VCol>
      </VRow>
    </section>

    <VRow>
      <VCol cols="12" lg="7">
        <VCard class="surface-border pa-5 h-100">
          <div class="d-flex align-center mb-4">
            <h2 class="section-heading">近期活動</h2>
            <VSpacer /><VBtn
              variant="text"
              size="small"
              to="/admin/logs?tab=events"
              >查看系統事件</VBtn
            >
          </div>
          <StatePanel
            v-if="activitiesError"
            icon="mdi-cloud-alert-outline"
            title="無法載入近期動態"
            :description="activitiesError"
            action-label="重新載入"
            @action="reloadActivities"
          />
          <VSkeletonLoader v-else-if="isLoadingActivities" type="list-item-two-line@3" />
          <VList v-else lines="two">
            <template
              v-for="(activity, index) in recentActivities"
              :key="activity.id"
            >
              <VListItem
                :title="activity.title"
                :subtitle="`${activity.detail} · ${activity.time}`"
                :prepend-icon="
                  activity.type === 'document'
                    ? 'mdi-file-document-outline'
                    : activity.type === 'question'
                      ? 'mdi-message-alert-outline'
                      : 'mdi-cog-sync-outline'
                "
              />
              <VDivider v-if="index < recentActivities.length - 1" />
            </template>
          </VList>
        </VCard>
      </VCol>
      <VCol cols="12" lg="5">
        <VCard class="surface-border pa-5 h-100">
          <h2 class="section-heading mb-4">常用操作</h2>
          <div class="quick-actions">
            <VBtn
              variant="tonal"
              prepend-icon="mdi-file-check-outline"
              to="/admin/documents?status=待審核"
              >審核文件 <VChip class="ml-2" size="x-small">12</VChip></VBtn
            >
            <VBtn
              variant="tonal"
              prepend-icon="mdi-reload-alert"
              to="/admin/documents?tab=attention"
              >重跑失敗工作 <VChip class="ml-2" size="x-small">3</VChip></VBtn
            >
            <VBtn
              variant="tonal"
              prepend-icon="mdi-comment-alert-outline"
              to="/admin/feedback"
              >處理使用者回饋
              <VChip v-if="openFeedbackCount" class="ml-2" size="x-small">{{
                openFeedbackCount
              }}</VChip></VBtn
            >
            <VBtn
              variant="tonal"
              prepend-icon="mdi-bell-ring-outline"
              to="/admin/monitoring?tab=overview"
              >查看營運告警
              <VChip class="ml-2" size="x-small" color="error">2</VChip></VBtn
            >
          </div>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>

<style scoped>
.metric-value {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.quick-actions {
  display: grid;
  gap: 10px;
}
.quick-actions :deep(.v-btn) {
  justify-content: flex-start;
}
</style>
