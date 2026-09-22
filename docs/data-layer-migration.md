# 資料層遷移（mocks → repository → 後端 API）

前端目前所有資料都來自 `src/mocks`。這份文件記錄已經改好的部分、要沿用的寫法，以及剩下的批次。

## 已完成

### 共用基礎
- `src/services/httpClient.ts`：`request()` 收斂 base URL（`VITE_API_BASE_URL`，預設 `/api/v2`）、15 秒逾時、信封解析、錯誤訊息，以及 401 時登出並導回登入頁（保留原目標路徑）。
- `src/composables/useAsyncData.ts`：載入中、錯誤訊息、重新載入三態，並自動忽略過期請求的結果。

### 資料存取邊界
`src/views`、`src/components`、`src/stores` 已不再直接 import `@/mocks`，一律經 `src/repositories`。
串接後端時只需改 repository 這一層，不必再動頁面。

### 已改為非同步（有載入與錯誤狀態）
| 頁面 | repository 函式 |
|---|---|
| 首頁、知識庫 | `fetchEmployeeDocuments` |
| 管理總覽 | `fetchHealthMetrics`、`fetchRecentActivities` |
| 系統紀錄（AI 問答紀錄） | `fetchAdminQuestionRecords` |
| 營運監控 | `fetchServiceMetrics`、`fetchServiceHealth`、`fetchLogEntries` |
| 文件管理 | `fetchAdminDocuments` |

### 已收斂的寫入操作
`createAdminDocument`、`createDocumentVersion`、`addDocumentAttachments`、
`removeDocumentAttachment`、`createProcessingJob`、`deleteAdminDocument`、`publishAdminDocuments`。
頁面不再直接修改 mock 陣列。

### 仍為同步轉接的 repository
`documents`、`graph`、`feedback`、`access`、`aiSettings`、`systemResources`、`mailBot`、
`systemRecords`、`settings`、`conversation`、`notifications` 目前是 `export *` 的轉接層，
把 mock 原樣轉出。**這是刻意的中繼狀態**：邊界已經就位，接後端時逐一把函式改成
`fetchXxx(): Promise<T>` 並在頁面補三態即可，不需要再改 import。

## 要沿用的寫法

1. repository 匯出 `fetchXxx(): Promise<T>`，內部保留同步的 `readXxx()` 供其他尚未轉換的呼叫端使用，並標 `TODO(api-integration)`。
2. 頁面用 `useAsyncData` 取得 `data / isLoading / errorMessage / reload`，錯誤訊息用該頁的說法（例如「目前無法載入服務指標，請稍後再試。」）。
3. 畫面三態：錯誤用 `StatePanel` 搭配「重新載入」；載入中用 `VSkeletonLoader`，骨架數量比照實際版面；空狀態維持原本的 `StatePanel`。
4. 假資料延遲固定 320 毫秒，讓載入狀態在展示環境看得見。

### 容易踩到的地方
- **深連結**：以網址參數開啟特定資料（例如 `?questionId=`）的 watcher，要把資料本身加入監聽來源，並在 `isLoading` 時先跳過「找不到」的判定，否則會誤報。
- **測試**：原本同步斷言的測試要改用 `vi.waitFor`，或等骨架消失後再斷言。
- **會被就地修改的資料**：頁面若直接對 mock 陣列做 `splice`／`push`（例如文件管理的刪除），必須先補上 repository 的寫入函式，不能只把讀取改成非同步。

## 剩餘工作

邊界已經建立，剩下的是把各轉接層真正接上後端，建議依頁面分批：

1. 把 repository 的同步函式改成 `fetchXxx(): Promise<T>`，內部改呼叫 `request()`。
2. 對應頁面改用 `useAsyncData`，補上載入骨架與錯誤重試。
3. 寫入操作比照 `admin.repository` 的寫法，回傳後重新載入清單。
4. 逐一比對前端 `src/types` 與後端 schema 的欄位（見下方待確認）。

## 後端合約（來源：`D:\_Work\KM\src\kmai`，`apps/api`）

後端是 Express，路由掛在 `/api/v2`，`httpClient` 已依此調整。

- **驗證**：session cookie（express-session），所以請求一律帶 `credentials: 'include'`；不需要自己加 Authorization header。
- **權限**：middleware 以 capability 判斷（例如 `km.admin.users`、`km.admin.kb.edit`），權限不足回 403、未登入回 401。capability 代碼與前端 `mocks/access.ts` 的同一套。
- **回應信封**：一律為

  ```json
  { "success": true, "data": {}, "meta": { "trace_id": "..." }, "error": null }
  ```

  失敗時 `data` 為 null，`error` 為 `{ code, message, trace_id }`。`request()` 會拆出 `data`，並把 `error.code`／`trace_id` 帶進 `HttpError`。
- **清單分頁**：query 用 `page`（預設 1）與 `pageSize`（預設 20、上限 100），另有 `keyword` 與各自的篩選欄位。`request()` 的 `query` 參數可直接帶。

### 主要掛載點

`/auth`、`/collections`、`/portal`、`/system`、`/issue-reports`，以及 `/admin/` 底下的
`users`、`groups`、`documents`、`ingestion-jobs`、`ingestion-strategies`、`knowledge-graph`、
`audit-logs`、`login-logs`、`chat-logs`、`schedule-logs`、`model-settings`、
`feedback/portal-answers`、`issue-reports`、`notebooks`、`collections`、`privacy-policy`、
`release-notes`、`branding`、`mail`。

實際的路徑、參數與回應欄位以各 `apps/api/src/routes/v2/*.ts` 與對應的 `schemas/*.ts` 為準。

## 待確認
- 前端目前的資料結構（`src/types`）是照 mock 設計的，與後端 entity 欄位命名尚未逐一比對；每批轉換時需要一份對應表或轉換層。
