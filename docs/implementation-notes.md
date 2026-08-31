# 實作交接

## Mock 資料與 API 串接待辦

目前前端以記憶體 Mock 完成可操作流程。串接後端時依下列邊界替換，不要讓頁面直接呼叫 HTTP：

- `src/repositories/knowledge.repository.ts`：替換文件搜尋與文件詳情，保留員工端發布狀態與 ACL 防線。
- `src/stores/conversation.ts`：替換 AI 串流回答，保留 `try/finally`、引用資料與錯誤狀態。
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

- 「系統紀錄」是唯讀跨類型查詢入口，整合登入、AI、排程、操作稽核、通知與告警事件。
- 「通知管理」保留發送、規則及逐人查看／點擊成效；「營運監控」保留告警規則、靜音與解除等處置，因為這些是領域明細與管理職責。
- 系統紀錄的通知與告警列只作為統一索引並連回來源管理頁；資料由同一份 Pinia 狀態轉換，不複製管理操作或第二份紀錄。

## 安全邊界

- API Key、Token 與密碼不得保存於前端 store、localStorage、Mock 或 log。
- 員工端文件 ACL 必須由後端再次執行；前端過濾只用於介面防呆，不是安全邊界。
- 破壞性管理操作需由後端再次驗證權限並保留稽核紀錄。

## 後續測試

- 後端接妥後新增 API contract tests 與錯誤狀態測試。
- 通知 API 接妥後補發送失敗、重試、權限、分頁、事件防重複與跨裝置已讀同步測試。
- 瀏覽器執行環境可用後，補 Playwright：登入、搜尋到問答、引用焦點、文件上傳、刪除確認與 375px responsive smoke tests。
