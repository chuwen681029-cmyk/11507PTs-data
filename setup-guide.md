# 設定教學：取得 Google Client ID / API Key 並完成系統設定

本系統需要連接您的 Google 帳號（Google Sheets + Google Drive），
因此需要在 **Google Cloud Console** 建立一個專案並取得授權資訊。
以下步驟皆使用您一般的個人 Gmail 帳號即可完成，全部免費。

---

## 第一步：建立 Google Cloud 專案

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，使用您的 Gmail 帳號登入。
2. 點選頁面最上方的專案選單 → 「**新增專案**」。
3. 專案名稱輸入，例如：`115-07學生資料系統`，點選「建立」。
4. 建立完成後，確認右上方專案選單已切換到此新專案。

---

## 第二步：啟用所需的 API

1. 左側選單 → 「**API 和服務**」→「**程式庫**」。
2. 搜尋並啟用以下兩個 API（分別搜尋、進入後點「啟用」）：
   - **Google Sheets API**
   - **Google Drive API**

---

## 第三步：設定 OAuth 同意畫面

1. 左側選單 → 「**API 和服務**」→「**OAuth 同意畫面**」。
2. 使用者類型選擇「**外部**」，點選「建立」。
3. 填寫應用程式資訊：
   - 應用程式名稱：`115-07學生實習資料系統`
   - 使用者支援電子郵件：選您的 Gmail
   - 開發人員聯絡資訊：填您的 Gmail
4. 一路「儲存並繼續」到「範圍」頁面，點選「新增或移除範圍」，
   加入以下範圍（可在搜尋框輸入關鍵字找到）：
   - `.../auth/spreadsheets`
   - `.../auth/drive.file`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. 繼續到「測試使用者」頁面，點「新增使用者」，
   **將所有會登入本系統的人（管理者及全部17位學生）的 Gmail 都加入**。

   > ⚠️ 重要：因為應用程式狀態為「測試中」，只有加入此名單的 Google 帳號才能登入成功。
   > 如果學生人數多、不想逐一加入，可在「發布狀態」點「發布應用程式」改為正式版，
   > 但 Google 可能要求驗證（一般內部小型使用，測試模式 100 人額度通常已足夠）。

6. 完成後儲存。

---

## 第四步：建立 OAuth Client ID（給網頁登入用）

1. 左側選單 → 「**API 和服務**」→「**憑證**」。
2. 點選「**建立憑證**」→「**OAuth 用戶端 ID**」。
3. 應用程式類型選擇「**網頁應用程式**」。
4. 名稱輸入，例如：`學生資料系統網頁`。
5. 「**已授權的 JavaScript 來源**」務必新增您將部署網站的網址，例如：
   - 若用 GitHub Pages：`https://你的帳號.github.io`
   - 若本機測試：`http://localhost:8000`（或您使用的本機伺服器網址）
   - 若用其他靜態網站服務，填入該服務提供的網址
   > 不需要填「已授權的重新導向 URI」，本系統使用彈出視窗登入方式。
6. 點選「建立」，會出現一個視窗顯示：
   - **用戶端 ID**（格式類似 `123456789-abc123.apps.googleusercontent.com`）
   - 請複製此 ID，貼到 `config.js` 的 `CLIENT_ID`

---

## 第五步：建立 API 金鑰

1. 同樣在「**憑證**」頁面，點選「**建立憑證**」→「**API 金鑰**」。
2. 會立即產生一串金鑰，請複製貼到 `config.js` 的 `API_KEY`。
3. （建議）點選該金鑰進行「**限制金鑰**」設定：
   - API 限制 → 選擇「限制金鑰」→ 勾選 `Google Sheets API` 與 `Google Drive API`
   - 應用程式限制 → 選擇「HTTP 參照網址」→ 填入您的網站網址
   - 這樣可以防止金鑰被濫用

---

## 第六步：建立 Google Drive 資料夾與試算表

1. 前往 [Google Drive](https://drive.google.com/)，建立一個資料夾，命名為：
   **「115-07 學生資料」**
2. 在此資料夾內，**手動建立一個 Google 試算表**，命名為：
   **「115-07 學生資料」**（與資料夾同名沒關係）
   - 此試算表將作為系統的「總表」，期初/期末分頁會由系統自動建立。

3. 取得**資料夾 ID**：
   - 打開「115-07 學生資料」資料夾，網址列會顯示：
     `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz`
   - 複製 `folders/` 後面那一長串字串，貼到 `config.js` 的 `ROOT_FOLDER_ID`

4. 取得**試算表 ID**：
   - 打開「115-07 學生資料」試算表，網址列會顯示：
     `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit`
   - 複製 `d/` 與 `/edit` 之間那一長串字串，貼到 `config.js` 的 `SPREADSHEET_ID`

---

## 第七步：設定管理者帳號

打開 `config.js`，在 `ADMIN_EMAILS` 陣列中填入管理者的 Gmail，可填多個：

```javascript
ADMIN_EMAILS: [
  "teacher1@gmail.com",
  "teacher2@gmail.com"
]
```

只有這些帳號登入後，才能看到「全部17位學生」的總表與檢視所有人的上傳檔案。
其他登入者（學生）只會看到並能編輯「自己」的資料
（系統以登入帳號的 Google 顯示姓名比對學生名單中的姓名）。

> ⚠️ 提醒：請請學生確認自己 Google 帳號的「姓名」設定與名單中的姓名完全一致（含全名、無空格差異），
> 否則系統會顯示「找不到對應的學生資料」。如有特殊情況（例如英文名顯示），
> 可請該學生告知管理者，由管理者協助於 `students-data.js` 中調整對應姓名。

---

## 第八步：填寫完整的 config.js

完成以上步驟後，您的 `config.js` 應該類似：

```javascript
const CONFIG = {
  CLIENT_ID: "123456789-abc123xyz.apps.googleusercontent.com",
  API_KEY: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  SPREADSHEET_ID: "1AbCdEfGhIjKlMnOpQrStUvWxYz123456789",
  ROOT_FOLDER_ID: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa987654321",
  ADMIN_EMAILS: ["teacher1@gmail.com"],
  SHEET_NAMES: { initial: "期初", final: "期末" }
};
```

---

## 第九步：部署網站

本系統是純 HTML/CSS/JS 靜態網站，可部署於任何靜態網站服務，例如：

### 方法 A：GitHub Pages（免費，推薦）
1. 在 GitHub 建立一個新的 repository（公開）。
2. 將本資料夾內所有檔案（`index.html`、`style.css`、`app.js`、`config.js`、`students-data.js`）上傳。
3. 進入 repository → Settings → Pages → Source 選擇 `main` 分支，儲存。
4. 等待數分鐘後，會產生網址，例如：`https://你的帳號.github.io/你的repo名稱/`
5. **回到 Google Cloud Console 的 OAuth 用戶端設定**，將此網址補進「已授權的 JavaScript 來源」。

### 方法 B：本機測試
1. 在資料夾內開啟終端機，執行：
   ```
   python3 -m http.server 8000
   ```
2. 開啟瀏覽器至 `http://localhost:8000`
3. 確保 Google Cloud Console 的「已授權的 JavaScript 來源」已加入 `http://localhost:8000`

---

## 完成後的使用方式

1. 開啟網站網址，點選「使用 Google 帳號登入」。
2. **管理者**登入後：可看到全部17位學生的總表（期初/期末分頁），
   點選綠色 ✓ 圖示可直接開啟 Google Drive 中已上傳的檔案；
   點選「查看」可展開該學生的詳細上傳區，並可代為上傳/修改。
3. **學生**登入後：只會看到自己的資料列與詳細上傳區，
   可直接上傳四項期初文件、填寫站別與 MAC Address，
   期末則可上傳四項期末文件。檔案會自動存入
   「115-07 學生資料」資料夾 →「{學校}-{姓名}」→「期初」或「期末」子資料夾，
   並自動將連結記錄到「115-07 學生資料」試算表中對應的分頁。

---

## 常見問題

**Q: 學生登入後顯示「找不到與您 Google 帳號 Email 對應的學生資料」？**
A: 系統以 Google 帳號的「顯示姓名」比對名單。請確認該學生的 Google 帳號姓名
與 `students-data.js` 中的姓名完全相符（去除空格後比對）。
若不同，請管理者修改 `students-data.js` 中對應學生的 `name` 欄位，使其與該生
Google 帳號顯示姓名一致。

**Q: 出現「此應用程式未經 Google 驗證」警告？**
A: 因為 OAuth 應用程式在「測試中」狀態，這是正常的。
點選「進階」→「前往 115-07學生實習資料系統（不安全）」即可繼續（僅對您加入測試名單的帳號顯示）。
若想移除此警告，需在 OAuth 同意畫面將應用程式狀態改為「正式版」並通過 Google 驗證流程。

**Q: 上傳檔案後，總表沒有立即更新？**
A: 上傳完成會自動刷新總表；若沒有，請重新整理頁面（資料直接存於 Google Sheet，重新整理會重新讀取）。

**Q: 可以讓非管理者也看到全部學生的總表嗎（但不能編輯他人資料）？**
A: 目前設計為「學生只見自己」。如需開放唯讀總表給所有人，
可調整 `app.js` 中 `renderPanel()` 內的 `visibleStudents` 邏輯，
改為所有人皆顯示 `STUDENTS`，並在 `renderSummaryRow` 中依 `canEdit` 控制上傳按鈕是否顯示。
