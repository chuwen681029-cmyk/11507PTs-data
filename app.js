// ============================================
// 115-07 學生資料管理系統 - 主程式
// 全部用 fetch + OAuth token，不依賴 gapi.client
// ============================================

let tokenClient;
let accessToken = null;
let currentUser = null;
let isAdmin = false;
let activePeriod = "initial";
let sheetDataCache = { initial: null, final: null };
let gapiReady = false;

// ----------------------------------------------------
// 初始化
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  renderLoginGate();
});

function gapiLoaded() {
  // 不需要 gapi.client，只用 fetch
  gapiReady = true;
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

  try {
    const userInfo = await fetchUserInfo();
    currentUser = userInfo;
    isAdmin = CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase().trim())
      .includes(userInfo.email.toLowerCase().trim());

    showToast("登入成功，載入資料中...", "");
    await loadAllSheetData();
    renderMainApp();
  } catch(e) {
    console.error("Auth error:", e);
    showToast("載入失敗：" + e.message, "error");
  }
}

function handleLogout() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  currentUser = null;
  isAdmin = false;
  sheetDataCache = { initial: null, final: null };
  renderLoginGate();
}

async function fetchUserInfo() {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!res.ok) throw new Error("無法取得使用者資訊");
  return await res.json();
}

// ----------------------------------------------------
// Sheets API (純 fetch)
// ----------------------------------------------------
async function sheetsGet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function sheetsUpdate(range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function sheetsAppend(range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function sheetsGetMeta() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function sheetsBatchUpdate(requests) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

// ----------------------------------------------------
// Drive API (純 fetch)
// ----------------------------------------------------
async function driveListFiles(q) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function driveCreateFolder(name, parentId) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  return await res.json();
}

async function driveSetPermission(fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role: "reader", type: "anyone" })
  });
}

// ----------------------------------------------------
// 資料夾快取
// ----------------------------------------------------
let driveFolderCache = {};

async function getOrCreateFolder(name, parentId) {
  const cacheKey = parentId + "::" + name;
  if (driveFolderCache[cacheKey]) return driveFolderCache[cacheKey];
  const q = `'${parentId}' in parents and name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const data = await driveListFiles(q);
  let folderId;
  if (data.files && data.files.length > 0) {
    folderId = data.files[0].id;
  } else {
    const created = await driveCreateFolder(name, parentId);
    folderId = created.id;
  }
  driveFolderCache[cacheKey] = folderId;
  return folderId;
}

async function getStudentPeriodFolder(student, period) {
  const studentFolderName = `${student.school}-${student.name}`;
  const studentFolderId = await getOrCreateFolder(studentFolderName, CONFIG.ROOT_FOLDER_ID);
  const periodFolderName = period === "initial" ? "期初" : "期末";
  return await getOrCreateFolder(periodFolderName, studentFolderId);
}

async function uploadFileToDrive(file, student, period, docLabel) {
  const folderId = await getStudentPeriodFolder(student, period);
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  const fileName = `${student.school}-${student.name}_${docLabel}${ext}`;
  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    { method: "POST", headers: { Authorization: "Bearer " + accessToken }, body: form }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || res.statusText);
  }
  const data = await res.json();
  await driveSetPermission(data.id);
  return data.webViewLink;
}

// ----------------------------------------------------
// Sheet 結構
// ----------------------------------------------------
function getDocColumns(period) { return period === "initial" ? INITIAL_DOCS : FINAL_DOCS; }
function getFieldColumns(period) { return period === "initial" ? INITIAL_FIELDS : []; }
function getSheetHeaderRow(period) {
  const docs = getDocColumns(period).map(d => d.label);
  const fields = getFieldColumns(period).map(f => f.label);
  return ["學號", "學校", "姓名", ...docs, ...fields];
}

async function loadAllSheetData() {
  await ensureSheetExists("initial");
  await ensureSheetExists("final");
  sheetDataCache.initial = await readSheet("initial");
  sheetDataCache.final = await readSheet("final");
}

async function ensureSheetExists(period) {
  // 分頁已手動建立，直接跳過檢查
  // 若分頁內沒有表頭，自動寫入
  const sheetName = CONFIG.SHEET_NAMES[period];
  try {
    const res = await sheetsGet(`${sheetName}!A1:A1`);
    const firstCell = (res.values && res.values[0] && res.values[0][0]) || "";
    if (firstCell !== "學號") {
      // 寫入表頭與學生初始列
      const header = getSheetHeaderRow(period);
      const rows = STUDENTS.map(s => [s.id, s.school, s.name, ...header.slice(3).map(() => "")]);
      await sheetsUpdate(`${sheetName}!A1`, [header, ...rows]);
      console.log(`${sheetName} 表頭已建立`);
    }
  } catch(e) {
    console.error("ensureSheetExists error", e.message);
    showToast("試算表存取失敗：" + e.message, "error");
  }
}

async function readSheet(period) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  try {
    const res = await sheetsGet(`${sheetName}!A1:Z100`);
    const values = res.values || [];
    const header = values[0] || getSheetHeaderRow(period);
    const map = {};
    values.slice(1).forEach(row => {
      const id = row[0];
      if (!id) return;
      const obj = {};
      header.forEach((col, i) => { obj[col] = row[i] || ""; });
      map[id] = obj;
    });
    STUDENTS.forEach(s => {
      if (!map[s.id]) {
        const obj = { 學號: s.id, 學校: s.school, 姓名: s.name };
        getSheetHeaderRow(period).slice(3).forEach(col => obj[col] = "");
        map[s.id] = obj;
      }
    });
    return { header, map };
  } catch(e) {
    console.error("readSheet error", e);
    showToast("讀取資料失敗：" + e.message, "error");
    return { header: getSheetHeaderRow(period), map: {} };
  }
}

async function findRowNumber(period, studentId) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  const res = await sheetsGet(`${sheetName}!A:A`);
  const col = res.values || [];
  for (let i = 0; i < col.length; i++) {
    if (col[i][0] === studentId) return i + 1;
  }
  return null;
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

async function updateCell(period, studentId, columnName, value) {
  const sheetName = CONFIG.SHEET_NAMES[period];
  const header = getSheetHeaderRow(period);
  const colIndex = header.indexOf(columnName);
  if (colIndex === -1) { showToast("找不到欄位：" + columnName, "error"); return; }
  let rowNum = await findRowNumber(period, studentId);
  if (!rowNum) {
    const student = STUDENTS.find(s => s.id === studentId);
    const newRow = header.map((col, i) => i === 0 ? student.id : i === 1 ? student.school : i === 2 ? student.name : "");
    await sheetsAppend(`${sheetName}!A1`, [newRow]);
    rowNum = await findRowNumber(period, studentId);
  }
  const colLetter = numberToColumnLetter(colIndex + 1);
  await sheetsUpdate(`${sheetName}!${colLetter}${rowNum}`, [[value]]);
  if (!sheetDataCache[period].map[studentId]) sheetDataCache[period].map[studentId] = {};
  sheetDataCache[period].map[studentId][columnName] = value;
}

// ----------------------------------------------------
// UI
// ----------------------------------------------------
function renderLoginGate() {
  document.getElementById("app").innerHTML = `
    <header class="site-header">
      <p class="header-eyebrow">CLINICAL ROTATION RECORDS · 115學年第07組</p>
      <h1 class="header-title">115-07 學生實習資料夾</h1>
      <p class="header-sub">期初／期末文件上傳與審核總表</p>
    </header>
    <div class="container">
      <div class="login-gate">
        <div class="stamp-icon">證</div>
        <h1>請使用 Google 帳號登入</h1>
        <p>學生：請使用本人 Gmail 登入，系統將自動對應您的個人資料夾。<br>
        管理者：使用管理者 Google 帳號登入即可進入後台總表。</p>
        <button class="btn btn-primary" onclick="handleLoginClick()">使用 Google 帳號登入</button>
      </div>
    </div>
    <div id="toast" class="toast"></div>
  `;
}

function renderMainApp() {
  document.getElementById("app").innerHTML = `
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
        <div class="period-tab ${activePeriod==='initial'?'active':''}" onclick="switchPeriod('initial')">
          期初資料<span class="tab-meta">體檢・保險・識別證・TMS・站別・MAC</span>
        </div>
        <div class="period-tab ${activePeriod==='final'?'active':''}" onclick="switchPeriod('final')">
          期末資料<span class="tab-meta">學習護照・實習證明・實習成績・其它</span>
        </div>
      </div>
      <div class="panel" id="panel"></div>
      <div class="detail-section" id="detailSection"></div>
    </div>
    <div id="toast" class="toast"></div>
  `;
  renderPanel();
  if (!isAdmin) {
    const myId = getMyStudentId();
    if (myId) renderStudentDetail(myId);
    else document.getElementById("detailSection").innerHTML = `<div class="setup-banner">找不到與您 Google 帳號對應的學生資料。請聯絡管理者確認您的 Email 是否已登錄。</div>`;
  }
}

function switchPeriod(period) {
  activePeriod = period;
  document.getElementById("detailSection").innerHTML = "";
  renderMainApp();
}

function renderPanel() {
  const docs = getDocColumns(activePeriod);
  const fields = getFieldColumns(activePeriod);
  const data = sheetDataCache[activePeriod];
  const visibleStudents = isAdmin ? STUDENTS : STUDENTS.filter(s => s.id === getMyStudentId());
  document.getElementById("panel").innerHTML = `
    <div class="panel-toolbar">
      <div class="search-box">
        ${isAdmin ? `<input type="text" id="searchInput" placeholder="搜尋學生姓名或學校..." oninput="filterTable()">` : ""}
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot dot-done"></span>已上傳/已填寫</span>
        <span class="legend-item"><span class="legend-dot dot-missing"></span>尚未提供</span>
      </div>
    </div>
    <div class="table-scroll">
      <table class="summary" id="summaryTable">
        <thead><tr>
          <th>學校</th><th>姓名</th><th>完成度</th>
          ${docs.map(d=>`<th>${d.label}</th>`).join("")}
          ${fields.map(f=>`<th>${f.label}</th>`).join("")}
          <th>操作</th>
        </tr></thead>
        <tbody id="summaryBody">
          ${visibleStudents.map(s=>renderSummaryRow(s,docs,fields,data)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSummaryRow(student, docs, fields, data) {
  const row = (data && data.map[student.id]) || {};
  let doneCount = 0;
  const total = docs.length + fields.length;
  const docCells = docs.map(d => {
    const val = row[d.label] || "";
    if (val) doneCount++;
    return `<td><button class="status-chip ${val?'status-done':'status-missing'}"
      onclick="${val?`window.open('${val}','_blank')`:`selectStudent('${student.id}')`}"
      title="${val?'已上傳，點擊查看':'尚未上傳'}">${val?'✓':'–'}</button></td>`;
  }).join("");
  const fieldCells = fields.map(f => {
    const val = row[f.label] || "";
    if (val) doneCount++;
    return `<td>${val?`<span class="field-value">${escapeHtml(val)}</span>`:`<span class="field-empty">–</span>`}</td>`;
  }).join("");
  const pct = total > 0 ? Math.round(doneCount/total*100) : 0;
  return `<tr data-name="${escapeHtml(student.name)}" data-school="${escapeHtml(student.school)}">
    <td class="school-cell">${escapeHtml(student.school)}</td>
    <td class="name-cell">${escapeHtml(student.name)}</td>
    <td class="progress-cell" style="color:${pct===100?'var(--stamp-green)':pct===0?'var(--stamp-red)':'var(--stamp-amber)'}">
      ${doneCount}/${total} (${pct}%)</td>
    ${docCells}${fieldCells}
    <td><button class="btn btn-outline btn-sm" onclick="selectStudent('${student.id}')">${isAdmin?'查看':'前往上傳'}</button></td>
  </tr>`;
}

function filterTable() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  document.querySelectorAll("#summaryBody tr").forEach(tr => {
    tr.style.display = (tr.dataset.name.toLowerCase().includes(q) || tr.dataset.school.toLowerCase().includes(q)) ? "" : "none";
  });
}

function selectStudent(studentId) {
  renderStudentDetail(studentId);
  document.getElementById("detailSection").scrollIntoView({ behavior: "smooth" });
}

function renderStudentDetail(studentId) {
  const student = STUDENTS.find(s => s.id === studentId);
  if (!student) return;
  const docs = getDocColumns(activePeriod);
  const fields = getFieldColumns(activePeriod);
  const data = sheetDataCache[activePeriod];
  const row = (data && data.map[studentId]) || {};
  const canEdit = isAdmin || studentId === getMyStudentId();
  document.getElementById("detailSection").innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(student.name)} 的${activePeriod==='initial'?'期初':'期末'}資料</h2>
      <span class="detail-school">${escapeHtml(student.school)} · 學號 ${student.id}</span>
    </div>
    <p class="section-label">文件上傳</p>
    <div class="doc-grid">${docs.map(d=>renderDocCard(student,d,row,canEdit)).join("")}</div>
    ${fields.length>0?`<p class="section-label">登打資料</p><div class="field-grid">${fields.map(f=>renderFieldCard(student,f,row,canEdit)).join("")}</div>`:''}
  `;
}

function renderDocCard(student, doc, row, canEdit) {
  const val = row[doc.label] || "";
  return `<div class="doc-card ${val?'is-done':''}">
    <div class="doc-card-title">
      <span>${doc.label}</span>
      <span class="doc-card-status ${val?'ok':'no'}">${val?'✓ 已上傳':'尚未上傳'}</span>
    </div>
    ${val?`<a href="${val}" target="_blank" class="doc-card-filename">📎 點擊查看已上傳檔案</a>`:`<span class="doc-card-filename">尚無檔案</span>`}
    ${canEdit?`<div class="file-input-wrap">
      <span class="file-input-label" id="label-${student.id}-${doc.key}">${val?'重新上傳 / 取代檔案':'選擇檔案上傳'}</span>
      <input type="file" onchange="handleFileUpload(event,'${student.id}','${doc.key}','${doc.label}')">
    </div>`:''}
  </div>`;
}

function renderFieldCard(student, field, row, canEdit) {
  const val = row[field.label] || "";
  let inputHtml = field.type === "select"
    ? `<select id="field-${student.id}-${field.key}" ${canEdit?'':'disabled'} onchange="handleFieldChange('${student.id}','${field.key}','${field.label}')">
        <option value="">-- 請選擇 --</option>
        ${field.options.map(opt=>`<option value="${opt}" ${val===opt?'selected':''}>${opt}</option>`).join("")}
       </select>`
    : `<input type="text" id="field-${student.id}-${field.key}" value="${escapeHtml(val)}"
        placeholder="請輸入${field.label}" ${canEdit?'':'disabled'}
        onblur="handleFieldChange('${student.id}','${field.key}','${field.label}')">`;
  return `<div class="field-card ${val?'is-filled':''}">
    <label>${field.label} ${val?'<span style="color:var(--stamp-green)">✓</span>':''}</label>
    ${inputHtml}
  </div>`;
}

async function handleFileUpload(event, studentId, docKey, docLabel) {
  const file = event.target.files[0];
  if (!file) return;
  const student = STUDENTS.find(s => s.id === studentId);
  const labelEl = document.getElementById(`label-${studentId}-${docKey}`);
  if (labelEl) labelEl.textContent = "上傳中...";
  try {
    const link = await uploadFileToDrive(file, student, activePeriod, docLabel);
    await updateCell(activePeriod, studentId, docLabel, link);
    showToast(`「${docLabel}」上傳成功！`, "success");
    await loadAllSheetData();
    renderPanel();
    renderStudentDetail(studentId);
  } catch(e) {
    console.error(e);
    showToast("上傳失敗：" + e.message, "error");
    if (labelEl) labelEl.textContent = "選擇檔案上傳";
  }
}

async function handleFieldChange(studentId, fieldKey, fieldLabel) {
  const el = document.getElementById(`field-${studentId}-${fieldKey}`);
  const value = el.value.trim();
  try {
    await updateCell(activePeriod, studentId, fieldLabel, value);
    showToast(`「${fieldLabel}」已更新`, "success");
    renderPanel();
    renderStudentDetail(studentId);
  } catch(e) {
    showToast("更新失敗：" + e.message, "error");
  }
}

function getMyStudentId() {
  if (!currentUser) return null;
  const myEmail = (currentUser.email || "").toLowerCase().trim();
  let found = STUDENTS.find(s => s.email && s.email.toLowerCase().trim() === myEmail);
  if (!found) {
    const myName = (currentUser.name || "").replace(/\s/g, "");
    found = STUDENTS.find(s => s.name.replace(/\s/g, "") === myName);
  }
  return found ? found.id : null;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

let toastTimer;
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast " + type; }, 3200);
}
