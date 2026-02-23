import { google } from "googleapis";

// ---------------------
// Google Admin SDK client
// ---------------------
function getAdminClient() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(
    keyJson.client_email,
    null,
    keyJson.private_key,
    ["https://www.googleapis.com/auth/admin.directory.user"],
    process.env.GOOGLE_ADMIN_EMAIL // domain-wide delegation: impersonate admin
  );
  return google.admin({ version: "directory_v1", auth });
}

// ---------------------
// Slack notification
// ---------------------
async function notifySlack(message) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("Slack notification failed:", err);
  }
}

// ---------------------
// Validation
// ---------------------
function validate(body) {
  const { firstName, lastName, email, orgUnitPath } = body;
  if (!firstName || !lastName || !email || !orgUnitPath) {
    return "全項目を入力してください。";
  }
  if (!/^[A-Za-z\-]+$/.test(firstName) || !/^[A-Za-z\-]+$/.test(lastName)) {
    return "姓名は半角英字で入力してください。";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "メールアドレスの形式が不正です。";
  }
  return null;
}

// ---------------------
// Handler
// ---------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = req.body;
  const validationError = validate(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { firstName, lastName, email, orgUnitPath } = body;

  try {
    const admin = getAdminClient();

    await admin.users.insert({
      requestBody: {
        primaryEmail: email,
        name: {
          givenName: firstName,
          familyName: lastName,
        },
        password: process.env.INITIAL_PASSWORD,
        changePasswordAtNextLogin: true,
        orgUnitPath: orgUnitPath,
      },
    });

    await notifySlack(
      `:white_check_mark: *GWSアカウント作成成功*\nメール: ${email}\n氏名: ${lastName} ${firstName}\nOU: ${orgUnitPath}`
    );

    return res.status(200).json({ ok: true, email });
  } catch (err) {
    console.error("Account creation failed:", err);

    const detail =
      err?.errors?.[0]?.message || err.message || "不明なエラー";

    await notifySlack(
      `:x: *GWSアカウント作成失敗*\nメール: ${email}\nエラー: ${detail}`
    );

    return res.status(500).json({ error: detail });
  }
}
