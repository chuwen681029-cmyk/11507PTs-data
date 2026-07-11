// 115-07 學生資料 - 學生名單
const STUDENTS = [
  { id: "S01", school: "高醫", name: "朱韋翰",  email: "wayne930331@gmail.com" },
  { id: "S02", school: "高醫", name: "陳玟穎",  email: "chenwenying63@gmail.com" },
  { id: "S03", school: "中山", name: "童蕾蓁",  email: "belinda931026@gmail.com" },
  { id: "S04", school: "慈濟", name: "吳應賢",  email: "" },
  { id: "S05", school: "慈濟", name: "趙晨恩",  email: "justin984324@gmail.com" },
  { id: "S06", school: "亞大", name: "蘇詰凱",  email: "ken93328@gmail.com" },
  { id: "S07", school: "亞大", name: "王佳筠",  email: "j92039768@gmail.com" },
  { id: "S08", school: "義守", name: "羅嘉穎",  email: "gayounglaw13@gmail.com" },
  { id: "S09", school: "義守", name: "吳翊寧",  email: "eva940729@gmail.com" },
  { id: "S10", school: "義守", name: "曾梓謙",  email: "changmartin04@gmail.com" },
  { id: "S11", school: "弘光", name: "楓婕妤",  email: "joyce106002@gmail.com" },
  { id: "S12", school: "弘光", name: "吳孟庭",  email: "p0937505170@gmail.com" },
  { id: "S13", school: "輔英", name: "蔡棋翔",  email: "iamthebest948@gmail.com" },
  { id: "S14", school: "輔英", name: "林孟萱",  email: "ann929828@gmail.com" },
  { id: "S15", school: "慈惠", name: "李侑騏",  email: "abc8323606@gmail.com" },
  { id: "S16", school: "慈惠", name: "莊珮彤",  email: "peitongzhuang@gmail.com" },
  { id: "S17", school: "樹人", name: "陳芊樺",  email: "yanyuqi777@gmail.com" },
];

// 期初上傳檔案類別
const INITIAL_DOCS = [
  { key: "physical_exam", label: "體檢報告" },
  { key: "insurance",     label: "保險證明" },
  { key: "id_card",       label: "識別證" },
  { key: "tms_cert",      label: "TMS教育訓練完成證明" },
];

// 期初登打資料欄位 (非檔案，文字/選項)
const INITIAL_FIELDS = [
  { key: "station",     label: "站別勾選", type: "select", options: ["小兒", "心肺"] },
  { key: "mac_address", label: "Mac Address", type: "text" },
];

// 期末上傳檔案類別
const FINAL_DOCS = [
  { key: "learning_passport", label: "學習護照" },
  { key: "internship_cert",   label: "實習證明" },
  { key: "internship_grade",  label: "實習成績" },
  { key: "other",             label: "其它" },
];
