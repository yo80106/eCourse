const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

function fail(message) {
  console.error(`\n[config] 錯誤：${message}\n`);
  process.exit(1);
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  fail(
    '缺少環境變數：FIREBASE_SERVICE_ACCOUNT_PATH\n' +
      '請複製 .env.example 為 .env 並填入對應值。'
  );
}

const firebaseKeyPath = path.resolve(
  __dirname,
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH
);
if (!fs.existsSync(firebaseKeyPath)) {
  fail(
    `FIREBASE_SERVICE_ACCOUNT_PATH 指向的檔案不存在：${firebaseKeyPath}\n` +
      '請確認金鑰檔已放到指定路徑（此檔案不可 commit 到 git）。\n' +
      '（可直接沿用 scripts/gdrive-sync/service-account-firebase.json 複製一份過來）'
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(firebaseKeyPath)),
  });
}
const db = admin.firestore();

module.exports = { db };
