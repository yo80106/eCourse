const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const admin = require('firebase-admin');

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const REQUIRED_ENV_VARS = [
  'GDRIVE_FOLDER_ID',
  'GDRIVE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
];

function fail(message) {
  console.error(`\n[config] 錯誤：${message}\n`);
  process.exit(1);
}

function assertEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    fail(
      `缺少環境變數：${missing.join(', ')}\n` +
        '請複製 .env.example 為 .env 並填入對應值。'
    );
  }
}

function assertKeyFile(envVarName) {
  const filePath = path.resolve(__dirname, process.env[envVarName]);
  if (!fs.existsSync(filePath)) {
    fail(
      `${envVarName} 指向的檔案不存在：${filePath}\n` +
        '請確認金鑰檔已放到指定路徑（此檔案不可 commit 到 git）。'
    );
  }
  return filePath;
}

assertEnv();
const driveKeyPath = assertKeyFile('GDRIVE_SERVICE_ACCOUNT_PATH');
const firebaseKeyPath = assertKeyFile('FIREBASE_SERVICE_ACCOUNT_PATH');

// Google Drive：僅需列出檔案中繼資料，用最窄的唯讀 scope
const driveAuth = new google.auth.GoogleAuth({
  keyFile: driveKeyPath,
  scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

// Firebase Admin：僅初始化 Firestore，不使用 Storage
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(firebaseKeyPath)),
  });
}
const db = admin.firestore();

module.exports = {
  GDRIVE_FOLDER_ID: process.env.GDRIVE_FOLDER_ID,
  drive,
  db,
};
