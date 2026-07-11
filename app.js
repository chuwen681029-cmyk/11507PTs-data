// ============================================
// 115-07 學生資料管理系統 - 主程式
// ============================================

let tokenClient;
let accessToken = null;
let currentUser = null; // { email, name, picture }
let isAdmin = false;
let activePeriod = "initial"; // 'initial' | 'final'
let sheetDataCache = { initial: null, final: null };
let driveFolderCache = {}; // studentId -> folderId, periodFolderId

// ----------------------------------------------------
// 初始化
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  renderLoginGate();
  checkConfig();
});

function checkConfig() {
  const placeholderHit =
    CONFIG.CLIENT_ID.includes("請填入") ||
    CONFIG.API_KEY.includes("請填入") ||
    CONFIG.SPREADSHEET_ID.includes("請填入") ||
    CONFIG.ROOT_FOLDER_ID.includes("請填入");

  if (placeholderHit) {
    const banner = document.getElementById("configBanner");
    if (banner) banner.style.display = "block";
  }
}

// ----------------------------------------------------
// Google Identity Services - 登入流程
// ----------------------------------------------------
function gapiLoaded() {
  gapi.load("client", initializeGapiClient);
}

// 確保 gapi client 已完整載入（含 discovery docs）
let gapiReady = false;

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: [
        "https://sheets.googleapis.com/$discovery/rest?version=v4",
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
      ],
    });
    gapiReady = true;
    console.log("GAPI client initialized OK");
  } catch(e) {
    console.error("GAPI init error:", e);
    showToast("Google API 初始化失敗，請重新整理頁面", "error");
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ].join(" "),
    callback: handleAuthResponse,
    error_callback: (err) => {
      console.warn("token client error", err);
      showToast("登入視窗被阻擋，請允許彈出視窗後再試", "error");
    }
  });
}

function handleLoginClick() {
  if (!tokenClient) {
    showToast("Google API 尚未載入完成，請稍後再試", "error");
    return;
  }
  tokenClient.requestAccessToken({ prompt: "select_account" });
}

async function handleAuthResponse(resp) {
  if (resp.error) {
    showToast("登入失敗：" + resp.error, "error");
    return;
  }
  accessToken = resp.access_token;

  // 確保 token 正確設定到 gapi client
  gapi.client.setToken({ access_token: accessToken });

  // 等待 gapi client 完全初始化後再繼續
  await new Promise(resolve => {
    const check = () => {
      if (gapiReady && gapi.client.sheets && gapi.client.drive) {
        resolve();
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });

  // 取得使用者資訊
  const userInfo = await fetchUserInfo();
  currentUser = userInfo;

  // 判斷是否為管理者
  isAdmin = CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase().trim())
    .includes(userInfo.email.toLowerCase().trim());

  showToast("登入成功，載入資料中...", "");
  await loadAllSheetData();
  renderMainApp();
}

async function fetchUserInfo() {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

function handleLogout() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  currentUser = null;
  isAdmin = false;
  sheetDataCache = { initial: null, final: null };
  renderLoginGate();
}

// ----------------------------------------------------
// 登入畫面
// ----------------------------------------------------
function renderLoginGate() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="site-header">
      <p class="header-eyebrow">CLINICAL ROTATION RECORDS · 115學年第07組</p>
      <h1 class="header-title">115-07 學生實習資料夾</h1>
      <p class="header-sub">期初／期末文件上傳與審核總表</p>
    </header>
    <div class="container">
      <div id="configBanner" class="setup-banner" style="display:none;">
        ⚠️ 系統尚未完成設定。請依照 <code>setup-guide.md</code> 的步驟，於 <code>config.js</code>
        填入 Client ID、API Key、試算表ID 與資料夾ID 後，重新整理本頁。
      </div>
      <div class="login-gate">
        <div class="stamp-icon">證</div>
        <h1>請使用 Google 帳號登入</h1>
        <p>
          系統將以您的 Google 帳號識別身份。<br>
          學生：請使用本人 Gmail 登入，系統將自動比對姓名/學校建立您的個人資料夾。<br>
          管理者：使用已設定於管理名單中的 Google 帳號登入即可進入後台總表。
        </p>
        <button class="btn btn-primary" onclick="handleLoginClick()">使用 Google 帳號登入</button>
      </div>
    </div>
  `;
  checkConfig();
}

// ----------------------------------------------------
// 主畫面
// ----------------------------------------------------
function renderMainApp() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="site-header">
      <p class="header-eyebrow">CLINICAL ROTATION RECORDS · 115學年第07組</p>
      <h1 class="header-title">115-07 學生實習資料夾</h1>
      <p class="header-sub">期初／期末文件上傳與審核總表 ${isAdmin ? "· 管理者模式" : ""}</p>
      <div class="header-account">
        <img src="${currentUser.picture}" alt="${currentUser.name}">
        <div>
          <div><strong>${escapeHtml(currentUser.name)}</strong></div>
          <div style="opacity:.7;font-size:11px;">${escapeHtml(currentUser.email)}</div>
        </div>
        <button class="btn btn-light btn-sm" onclick="handleLogout()">登出</button>
      </div>
    </header>
    <div class="container">
      <div class="period-tabs">
        <div class="period-tab ${activePeriod === 'initial' ? 'active' : ''}" onclick="switchPeriod('initial')">
          期初資料
          <span class="tab-meta">體檢・保險・識別證・TMS・站別・MAC</span>
        </div>
        <div class="period-tab ${activePeriod === 'final' ? 'active' : ''}" onclick="switchPeriod('final')">
          期末資料
          <span class="tab-meta">學習護照・實習證明・實習成績・其它</span>
        </div>
      </div>
      <div class="panel" id="panel"></div>
      <div class="detail-section" id="detailSection"></div>
    </div>
    <div id="toast" class="toast"></div>
  `;
  renderPanel();
}

function switchPeriod(period) {
  activePeriod = period;
  document.getElementById("detailSection").innerHTML = "";
  renderMainApp();
}

// ----------------------------------------------------
// 試算表資料結構
// ----------------------------------------------------
// 每個 period 的 sheet 結構（直接對應 Google Sheet 欄位）：
//   期初: 學號 | 學校 | 姓名 | 體檢報告 | 保險證明 | 識別證 | TMS教育訓練完成證明 | 站別勾選 | MacAddress | <檔案連結欄位...>
//   期末: 學號 | 學校 | 姓名 | 學習護照 | 實習證明 | 實習成績 | 其它
//
// 每個文件欄位儲存：若已上傳則存「Drive檔案連結URL」，否則為空字串
// 站別/MacAddress 欄位直接存文字值

function getDocColumns(period) {
  return period === "initial" ? INITIAL_DOCS : FINAL_DOCS;
}

function getFieldColumns(period) {
  return period === "initial" ? INITIAL_FIELDS : [];
}

function getSheetHeaderRow(period) {
  const docs = getDocColumns(period).map(d => d.label);
  const fields = getFieldColumns(period).map(f => f.label);
  return ["學號", "學校", "姓名", ...docs, ...fields];
}

// ----------------------------------------------------
// 載入 Google Sheet 資料（自動建立分頁/表頭如果不存在）
// ----------------------------------------------------
async function loadAllSheetData() {
  await ensureSheetExists("initial");
  await ensureSheetExists("final");
  sheetDataCache.initial = await readSheet("initial");
  sheetDataCache.final = await readSheet("final");
}

async function ensureSheetExists(period) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID
    });
    const exists = meta.result.sheets.some(s => s.properties.title === sheetName);
    if (!exists) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: sheetName } } }]
        }
      });
      // 寫入表頭與所有學生初始列
      const header = getSheetHeaderRow(period);
      const rows = STUDENTS.map(s => [s.id, s.school, s.name, ...header.slice(3).map(() => "")]);
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        resource: { values: [header, ...rows] }
      });
    }
  } catch (e) {
    console.error("ensureSheetExists error", e);
    showToast("無法存取試算表，請確認設定與權限：" + (e.result?.error?.message || e.message), "error");
  }
}

async function readSheet(period) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A1:Z100`
    });
    const values = res.result.values || [];
    const header = values[0] || getSheetHeaderRow(period);
    const rows = values.slice(1);

    // 轉成以學號為 key 的物件
    const map = {};
    rows.forEach(row => {
      const id = row[0];
      if (!id) return;
      const obj = {};
      header.forEach((colName, i) => { obj[colName] = row[i] || ""; });
      map[id] = obj;
    });

    // 確保每位學生都有資料（即使試算表中缺列）
    STUDENTS.forEach(s => {
      if (!map[s.id]) {
        const obj = { 學號: s.id, 學校: s.school, 姓名: s.name };
        getSheetHeaderRow(period).slice(3).forEach(col => obj[col] = "");
        map[s.id] = obj;
      }
    });

    return { header, map };
  } catch (e) {
    console.error("readSheet error", e);
    showToast("讀取資料失敗：" + (e.result?.error?.message || e.message), "error");
    return { header: getSheetHeaderRow(period), map: {} };
  }
}

// 找出某學號在試算表中的列號（1-indexed，含表頭）
async function findRowNumber(period, studentId) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${sheetName}!A:A`
  });
  const col = res.result.values || [];
  for (let i = 0; i < col.length; i++) {
    if (col[i][0] === studentId) return i + 1;
  }
  return null;
}

// 更新某學生的某一欄位值
async function updateCell(period, studentId, columnName, value) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  const header = getSheetHeaderRow(period);
  const colIndex = header.indexOf(columnName);
  if (colIndex === -1) {
    showToast("找不到欄位：" + columnName, "error");
    return;
  }
  let rowNum = await findRowNumber(period, studentId);
  if (!rowNum) {
    // 該學生列不存在，新增一列
    const student = STUDENTS.find(s => s.id === studentId);
    const newRow = header.map((col, i) => {
      if (i === 0) return student.id;
      if (i === 1) return student.school;
      if (i === 2) return student.name;
      return "";
    });
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [newRow] }
    });
    rowNum = await findRowNumber(period, studentId);
  }

  const colLetter = numberToColumnLetter(colIndex + 1);
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${sheetName}!${colLetter}${rowNum}`,
    valueInputOption: "RAW",
    resource: { values: [[value]] }
  });

  // 更新本地快取
  if (!sheetDataCache[period].map[studentId]) {
    sheetDataCache[period].map[studentId] = {};
  }
  sheetDataCache[period].map[studentId][columnName] = value;
}

function numberToColumnLetter(num) {
  let letter = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

// ----------------------------------------------------
// Google Drive：建立資料夾結構 & 上傳檔案
// ----------------------------------------------------
// 結構： 115-07 學生資料 (ROOT_FOLDER_ID)
//          └─ 學校-姓名 (學生個人資料夾)
//               ├─ 期初
//               └─ 期末

async function getOrCreateFolder(name, parentId) {
  const cacheKey = parentId + "::" + name;
  if (driveFolderCache[cacheKey]) return driveFolderCache[cacheKey];

  const q = `'${parentId}' in parents and name='${escapeForQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await gapi.client.drive.files.list({ q, fields: "files(id, name)" });

  let folderId;
  if (res.result.files && res.result.files.length > 0) {
    folderId = res.result.files[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      },
      fields: "id"
    });
    folderId = createRes.result.id;
  }
  driveFolderCache[cacheKey] = folderId;
  return folderId;
}

function escapeForQuery(str) {
  return str.replace(/'/g, "\\'");
}

async function getStudentPeriodFolder(student, period) {
  const studentFolderName = `${student.school}-${student.name}`;
  const studentFolderId = await getOrCreateFolder(studentFolderName, CONFIG.ROOT_FOLDER_ID);
  const periodFolderName = period === "initial" ? "期初" : "期末";
  const periodFolderId = await getOrCreateFolder(periodFolderName, studentFolderId);
  return periodFolderId;
}

// 上傳檔案到指定學生的期初/期末資料夾，回傳檔案的 webViewLink
async function uploadFileToDrive(file, student, period, docLabel) {
  const folderId = await getStudentPeriodFolder(student, period);

  // 檔名格式：學校-姓名_文件名稱.副檔名
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const fileName = `${student.school}-${student.name}_${docLabel}${ext}`;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken },
      body: form
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText);
  }

  const data = await res.json();

  // 設定檔案為「知道連結的人可檢視」，方便管理者點擊
  try {
    await gapi.client.drive.permissions.create({
      fileId: data.id,
      resource: { role: "reader", type: "anyone" }
    });
  } catch (e) {
    console.warn("permission setting failed", e);
  }

  return data.webViewLink;
}

// ----------------------------------------------------
// 渲染：總表
// ----------------------------------------------------
function renderPanel() {
  const panel = document.getElementById("panel");
  const docs = getDocColumns(activePeriod);
  const fields = getFieldColumns(activePeriod);
  const data = sheetDataCache[activePeriod];

  const visibleStudents = isAdmin
    ? STUDENTS
    : STUDENTS.filter(s => s.id === getMyStudentId());

  panel.innerHTML = `
    <div class="panel-toolbar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="搜尋學生姓名或學校..." oninput="filterTable()" ${isAdmin ? "" : "style='display:none'"}>
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot dot-done"></span>已上傳/已填寫</span>
        <span class="legend-item"><span class="legend-dot dot-missing"></span>尚未提供</span>
      </div>
    </div>
    <div class="table-scroll">
      <table class="summary" id="summaryTable">
        <thead>
          <tr>
            <th>學校</th>
            <th>姓名</th>
            <th>完成度</th>
            ${docs.map(d => `<th>${d.label}</th>`).join("")}
            ${fields.map(f => `<th>${f.label}</th>`).join("")}
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="summaryBody">
          ${visibleStudents.map(s => renderSummaryRow(s, docs, fields, data)).join("")}
        </tbody>
      </table>
    </div>
  `;

  // 非管理者：直接展開自己的詳細資料
  if (!isAdmin) {
    const myId = getMyStudentId();
    if (myId) {
      renderStudentDetail(myId);
    } else {
      document.getElementById("detailSection").innerHTML = `
        <div class="setup-banner">
          找不到與您 Google 帳號 Email 對應的學生資料。請聯絡管理者，將您的 Email 對應到名單中的學生，
          或請管理者於 <code>students-data.js</code> 補上對應資訊（目前以姓名比對，請確認登入帳號顯示姓名與名單一致）。
        </div>
      `;
    }
  }
}

function renderSummaryRow(student, docs, fields, data) {
  const row = data.map[student.id] || {};
  let doneCount = 0;
  const total = docs.length + fields.length;

  const docCells = docs.map(d => {
    const val = row[d.label] || "";
    const done = !!val;
    if (done) doneCount++;
    return `<td>
      <button class="status-chip ${done ? 'status-done' : 'status-missing'}"
        title="${done ? '已上傳，點擊查看檔案' : '尚未上傳'}"
        onclick="${done ? `window.open('${val}','_blank')` : `selectStudent('${student.id}')`}">
        ${done ? '✓' : '–'}
      </button>
    </td>`;
  }).join("");

  const fieldCells = fields.map(f => {
    const val = row[f.label] || "";
    if (val) doneCount++;
    return `<td>${val ? `<span class="field-value">${escapeHtml(val)}</span>` : `<span class="field-empty">–</span>`}</td>`;
  }).join("");

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return `
    <tr data-name="${escapeHtml(student.name)}" data-school="${escapeHtml(student.school)}">
      <td class="school-cell">${escapeHtml(student.school)}</td>
      <td class="name-cell">${escapeHtml(student.name)}</td>
      <td class="progress-cell" style="color:${pct === 100 ? 'var(--stamp-green)' : pct === 0 ? 'var(--stamp-red)' : 'var(--stamp-amber)'}">
        ${doneCount}/${total} (${pct}%)
      </td>
      ${docCells}
      ${fieldCells}
      <td><button class="btn btn-outline btn-sm" onclick="selectStudent('${student.id}')">${isAdmin ? '查看' : '前往上傳'}</button></td>
    </tr>
  `;
}

function filterTable() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  document.querySelectorAll("#summaryBody tr").forEach(tr => {
    const name = tr.dataset.name.toLowerCase();
    const school = tr.dataset.school.toLowerCase();
    tr.style.display = (name.includes(q) || school.includes(q)) ? "" : "none";
  });
}

// ----------------------------------------------------
// 渲染：學生詳細資料（上傳區）
// ----------------------------------------------------
let selectedStudentId = null;

function selectStudent(studentId) {
  selectedStudentId = studentId;
  renderStudentDetail(studentId);
  document.getElementById("detailSection").scrollIntoView({ behavior: "smooth" });
}

function renderStudentDetail(studentId) {
  const student = STUDENTS.find(s => s.id === studentId);
  if (!student) return;
  const docs = getDocColumns(activePeriod);
  const fields = getFieldColumns(activePeriod);
  const data = sheetDataCache[activePeriod];
  const row = data.map[studentId] || {};

  const canEdit = isAdmin || studentId === getMyStudentId();

  const detail = document.getElementById("detailSection");
  detail.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(student.name)} 的${activePeriod === 'initial' ? '期初' : '期末'}資料</h2>
      <span class="detail-school">${escapeHtml(student.school)} · 學號 ${student.id}</span>
    </div>

    <p class="section-label">文件上傳</p>
    <div class="doc-grid">
      ${docs.map(d => renderDocCard(student, d, row, canEdit)).join("")}
    </div>

    ${fields.length > 0 ? `
      <p class="section-label">登打資料</p>
      <div class="field-grid">
        ${fields.map(f => renderFieldCard(student, f, row, canEdit)).join("")}
      </div>
    ` : ""}

    ${!canEdit ? `<div class="setup-banner">您僅可檢視此學生資料，無法編輯。</div>` : ""}
  `;
}

function renderDocCard(student, doc, row, canEdit) {
  const val = row[doc.label] || "";
  const done = !!val;
  return `
    <div class="doc-card ${done ? 'is-done' : ''}">
      <div class="doc-card-title">
        <span>${doc.label}</span>
        <span class="doc-card-status ${done ? 'ok' : 'no'}">${done ? '✓ 已上傳' : '尚未上傳'}</span>
      </div>
      ${done ? `<a href="${val}" target="_blank" class="doc-card-filename">📎 點擊查看已上傳檔案</a>` : `<span class="doc-card-filename">尚無檔案</span>`}
      ${canEdit ? `
        <div class="file-input-wrap">
          <span class="file-input-label" id="label-${student.id}-${doc.key}">${done ? '重新上傳 / 取代檔案' : '選擇檔案上傳'}</span>
          <input type="file" onchange="handleFileUpload(event, '${student.id}', '${doc.key}', '${doc.label}')">
        </div>
      ` : ""}
    </div>
  `;
}

function renderFieldCard(student, field, row, canEdit) {
  const val = row[field.label] || "";
  const filled = !!val;

  let inputHtml;
  if (field.type === "select") {
    inputHtml = `
      <select id="field-${student.id}-${field.key}" ${canEdit ? "" : "disabled"} onchange="handleFieldChange('${student.id}', '${field.key}', '${field.label}')">
        <option value="">-- 請選擇 --</option>
        ${field.options.map(opt => `<option value="${opt}" ${val === opt ? "selected" : ""}>${opt}</option>`).join("")}
      </select>
    `;
  } else {
    inputHtml = `
      <input type="text" id="field-${student.id}-${field.key}" value="${escapeHtml(val)}"
        placeholder="請輸入${field.label}" ${canEdit ? "" : "disabled"}
        onblur="handleFieldChange('${student.id}', '${field.key}', '${field.label}')">
    `;
  }

  return `
    <div class="field-card ${filled ? 'is-filled' : ''}">
      <label>${field.label} ${filled ? '<span style="color:var(--stamp-green)">✓</span>' : ''}</label>
      ${inputHtml}
    </div>
  `;
}

// ----------------------------------------------------
// 事件處理：上傳檔案 / 修改欄位
// ----------------------------------------------------
async function handleFileUpload(event, studentId, docKey, docLabel) {
  const file = event.target.files[0];
  if (!file) return;
  const student = STUDENTS.find(s => s.id === studentId);
  const labelEl = document.getElementById(`label-${studentId}-${docKey}`);
  const originalText = labelEl.textContent;
  labelEl.textContent = "上傳中...";

  try {
    const link = await uploadFileToDrive(file, student, activePeriod, docLabel);
    await updateCell(activePeriod, studentId, docLabel, link);
    showToast(`「${docLabel}」上傳成功！`, "success");
    renderPanel();
    selectStudent(studentId);
  } catch (e) {
    console.error(e);
    showToast("上傳失敗：" + e.message, "error");
    labelEl.textContent = originalText;
  }
}

async function handleFieldChange(studentId, fieldKey, fieldLabel) {
  const el = document.getElementById(`field-${studentId}-${fieldKey}`);
  const value = el.value.trim();
  try {
    await updateCell(activePeriod, studentId, fieldLabel, value);
    showToast(`「${fieldLabel}」已更新`, "success");
    renderPanel();
    selectStudent(studentId);
  } catch (e) {
    console.error(e);
    showToast("更新失敗：" + e.message, "error");
  }
}

// ----------------------------------------------------
// 工具函式
// ----------------------------------------------------
function getMyStudentId() {
  if (!currentUser) return null;
  // 優先以 email 比對（最準確）
  const myEmail = (currentUser.email || "").toLowerCase().trim();
  let found = STUDENTS.find(s => s.email && s.email.toLowerCase().trim() === myEmail);
  // 備用：以 Google 顯示姓名比對（移除空白）
  if (!found) {
    const myName = (currentUser.name || "").replace(/\s/g, "");
    found = STUDENTS.find(s => s.name.replace(/\s/g, "") === myName);
  }
  return found ? found.id : null;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer;
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = "toast " + type;
  }, 3200);
}
