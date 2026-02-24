import { google } from "googleapis";

function getAdminClient() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(
    keyJson.client_email,
    null,
    keyJson.private_key,
    ["https://www.googleapis.com/auth/admin.directory.orgunit.readonly"],
    process.env.GOOGLE_ADMIN_EMAIL
  );
  const authOptions = {
    scopes: ["https://www.googleapis.com/auth/admin.directory.orgunit.readonly"],
    clientOptions: {
      subject: process.env.GOOGLE_ADMIN_EMAIL, // domain-wide delegation: impersonate admin
    },
  };

  // Vercel等サーバーレス環境向け: 環境変数から認証情報を読み込む
  if (process.env.GOOGLE_CREDENTIALS_CONFIG) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_CONFIG);
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  return google.admin({ version: "directory_v1", auth });
}