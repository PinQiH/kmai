# 實作交接

## Mock 資料與 API 串接待辦

目前前端以記憶體 Mock 完成可操作流程。串接後端時依下列邊界替換，不要讓頁面直接呼叫 HTTP：

- `src/repositories/knowledge.repository.ts`：替換文件搜尋與文件詳情，保留員工端發布狀態與 ACL 防線。
- `src/stores/conversation.ts`：AI 串流回答與歷史訊息目前都保存在 Pinia 記憶體；從搜尋結果或歷史清單開啟對話時會還原已保存的問答、引用與搜尋步驟，但不重新執行檢索。正式串接時需分別替換回答串流與歷史對話查詢，並保留 `try/finally`、引用資料與錯誤狀態。
- `src/views/LoginView.vue`、`ChangePasswordView.vue`：串接登入與首次密碼變更，從 API 回傳建立使用者角色。
- `src/views/AccountView.vue`：串接個人資料與問題回報。
- `src/views/admin/AdminUploadView.vue`：串接單筆／批次上傳與逐檔處理結果。
- `src/stores/notifications.ts`：目前以 Pinia 記憶體同步後台發送、排程時間、事件觸發、未讀狀態與逐人查看／點擊時間；正式串接時由通知 API 回傳收件人快照，並以後端時間記錄首次與最近查看／點擊。
- `src/stores/monitoring.ts`：集中保存告警規則與告警事件，讓營運監控及系統紀錄共用同一份頁籤內狀態。
- `src/mocks/data.ts`：API 全面接妥後移除 Mock 文件、健康度與活動資料。

## 通知 Mock 邊界

- 後台「通知管理」只建立站內 Mock，不會寄送 Email、執行後端排程或跨裝置同步；指定時間只建立目前頁籤內的預定紀錄，重新整理後還原。
- 人工通知與自動規則可依全體、部門、角色或指定使用者建立收件人快照。
- 自動通知規則提供文件完成、文件失敗、文件待審、文件到期、筆記本分享、筆記本提及、取得權限與系統維護 8 種固定事件；透過「模擬事件發生」觸發，不代表現有流程已接上事件來源。
- `readAt` 控制未讀提示；「全部標示已讀」只更新此欄位，不會灌入查看成效。
- 「查看」定義為使用者開啟通知內容；展開工具列鈴鐺不計入查看。
- `firstViewedAt` 保留首次查看時間，`lastViewedAt` 與 `viewCount` 記錄後續開啟；重新整理後全部還原為 `src/mocks/notifications.ts` 的初始資料。
- `firstActionClickedAt`、`lastActionClickedAt` 與 `actionClickCount` 記錄行動按鈕成效；點擊不會增加查看次數。
- 自訂行動目標只接受單一 `/` 開頭的站內路徑，或 `http://`、`https://` 外部網址。
- 時間以 ISO 8601 保存，畫面固定轉成 `Asia/Taipei` 並顯示到秒。

## 系統紀錄與管理頁分工

- 「系統紀錄」分成 AI 問答紀錄、系統事件與操作稽核。只有 `system-admin` 可查看全員單次問答與完整內容；`knowledge-admin` 只能查看系統事件及操作稽核。
- 全員問答使用 `src/mocks/adminQuestions.ts` 的獨立管理端 Mock，不共用目前使用者的 `conversation` store。正式串接時必須由後端驗證權限、分頁查詢並保存不可竄改的調閱稽核。
- 每次開啟完整問答只記錄操作者、Question ID、`ai_question_content.inspect`、狀態與 Request ID；不得將問題、回答、引用、提示詞或文件原文寫入稽核。
- 「文件處理」負責待介入工作、完整處理佇列與全域預設策略；個別文件覆蓋及切塊內容編輯仍由文件管理負責。
- 「營運監控」只負責系統健康、目前告警、服務指標、技術日誌與告警門檻；「通知管理」負責發送紀錄、業務事件通知、收件人群組、寄件管道及通知策略。
- 系統事件中的通知與告警列只作為統一索引並連回來源管理頁；資料由同一份 Pinia 狀態轉換，不複製管理操作或維護第二份領域紀錄。

## 後台短效 AI 小幫手 Mock 邊界

- 小幫手只在管理後台顯示；頭貼位置、對話內容及稽核副本都只存在目前頁籤的 Pinia 記憶體，不使用 `localStorage`、`sessionStorage` 或後端 API。
- 使用者第一次送出問題才建立 session；AI 回答完成後起算 15 分鐘，剩餘 60 秒提示，回答進行中不逾時。
- 手動結束、閒置逾時、離開管理後台或登出會清除使用者可見內容；未重新整理前，系統紀錄仍可依 Session ID 查看稽核副本。
- 稽核保留一般問答原文，但 `sanitizeAuditContent` 會遮蔽明確的密碼、API Key、Access Token 與 Bearer Token；介面只用 Vue 文字插值，不使用 `v-html`。
- 目前權限、保存期限與稽核完整性皆為 UI 示範，不構成安全邊界。正式版必須由後端驗證管理者權限、保存不可竄改稽核、執行遮蔽並支援跨裝置查詢。

## 前台 AI 問答來源與引用檢視

- 員工前台 `/ask` 不提供過度寬泛的「全公司知識」，預設使用「公司制度」；知識來源彈窗只顯示可選來源名稱，選取後立即套用並關閉。後台短效 AI 小幫手仍沿用自己的來源選項，不受此限制。
- 回答中的引用角標第一次點擊只展開引用清單、定位並聚焦對應項目；使用者再次點擊引用項目後，才會開啟右側資料來源欄。
- `Citation.chunkId` 是前台顯示檢索片段識別碼的選填欄位；正式 API 應提供穩定且可追蹤的 CHUNK ID、文件 ID、章節、引用內容與關聯度。
- `src/mocks/documentContent.ts` 是文件詳情頁與引用來源欄共用的全文 Mock。正式串接時應改由具備員工文件 ACL 驗證的全文 API 載入，不可只依前端 `documentId` 直接回傳內容。
- 寬螢幕以並排欄位顯示資料來源；窄螢幕改為右側覆蓋面板。關閉後焦點會回到原引用項目，並支援 Escape 關閉。
- 問答工具列的「設定」以錨定式輕量選單提供回答風格與 LLM；選項暫存在 conversation Pinia store，不使用 LocalStorage。選單採草稿後套用，取消、Escape 或點擊外部不會改變目前設定。
- 回答風格與 LLM 目前皆為前端 Mock 設定，尚未送入模型請求。LLM 預設使用 `gpt-4.1-mini`，另提供 `llama3.1:8b`，不提供自動選擇。正式串接時應由回答設定 API 提供可用選項，並保留基準選項作為空資料 fallback。

## 安全邊界

- API Key、Token 與密碼不得保存於前端 store、localStorage、Mock 或 log。
- 員工端文件 ACL 必須由後端再次執行；前端過濾只用於介面防呆，不是安全邊界。
- 破壞性管理操作需由後端再次驗證權限並保留稽核紀錄。

## 後續測試

- 後端接妥後新增 API contract tests 與錯誤狀態測試。
- 通知 API 接妥後補發送失敗、重試、權限、分頁、事件防重複與跨裝置已讀同步測試。
- 瀏覽器執行環境可用後，補 Playwright：登入、搜尋到問答、引用焦點、文件上傳、刪除確認與 375px responsive smoke tests。
