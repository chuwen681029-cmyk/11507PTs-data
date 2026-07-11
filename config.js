// ============================================
// Google API 設定檔
// 請依照 setup-guide.md 的步驟取得以下資訊並填入
// ============================================

const CONFIG = {
  // 從 Google Cloud Console 取得的 OAuth Client ID
  // 格式類似: 123456789-abcdefg.apps.googleusercontent.com
  CLIENT_ID: "932064578201-st500rafq9lbd0mab571655is1203nka.apps.googleusercontent.com",

  // 從 Google Cloud Console 取得的 API Key
  API_KEY: "AIzaSyCLr4mORfBF1ozy1FRBp-DERPzle6aCslk",

  // 「115-07 學生資料」試算表的 ID
  // 從試算表網址取得：
  // https://docs.google.com/spreadsheets/d/【這一段就是SPREADSHEET_ID】/edit
  SPREADSHEET_ID: "1OKQO0P0tQr99hU0aPzNdUCABiL4xXKRTGrO6MXnalao",

  // Google Drive 中「115-07 學生資料」資料夾的 ID
  // 從資料夾網址取得：
  // https://drive.google.com/drive/folders/【這一段就是資料夾ID】
  ROOT_FOLDER_ID: "1OtoBoSy00R_lqxgQQLaozhB_KbM_D6rp",

  // 管理者的 Google 帳號 Email（只有這些帳號登入後可看到管理後台與所有人資料）
  // 可填多個，用逗號分隔
  ADMIN_EMAILS: [
    "ylh.115pts@gmail.com","chuwen681029@gmail.com"
  ],

  // 試算表中各分頁名稱
  SHEET_NAMES: {
    initial: "期初",
    final: "期末"
  }
};
