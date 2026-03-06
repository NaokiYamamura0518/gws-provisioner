// ---------------------
// 支払依頼の作成
// ---------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const accessToken = getAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: "未認証です。freeeにログインしてください。" });
  }

  const {
    title,
    application_date,
    issue_date,
    due_date,
    partner_id,
    description,
    approval_flow_route_id,
    payment_request_lines,
    receipt_ids,
    draft,
  } = req.body;

  const companyId = Number(process.env.FREEE_COMPANY_ID);

  if (!title || !payment_request_lines?.length) {
    return res.status(400).json({ error: "タイトルと明細は必須です。" });
  }

  try {
    const requestBody = {
      company_id: companyId,
      title,
      application_date: application_date || new Date().toISOString().slice(0, 10),
      payment_request_lines: payment_request_lines.map((line) => ({
        line_type: line.line_type || "not_line_item",
        description: line.description || "",
        amount: Number(line.amount),
        account_item_id: line.account_item_id ? Number(line.account_item_id) : undefined,
        tax_code: line.tax_code ? Number(line.tax_code) : undefined,
      })),
    };

    if (issue_date) requestBody.issue_date = issue_date;
    if (due_date) requestBody.due_date = due_date;
    if (partner_id) requestBody.partner_id = Number(partner_id);
    if (description) requestBody.description = description;
    if (approval_flow_route_id) requestBody.approval_flow_route_id = Number(approval_flow_route_id);
    if (receipt_ids?.length) requestBody.receipt_ids = receipt_ids.map(Number);
    if (draft !== undefined) requestBody.draft = draft;

    const freeeRes = await fetch("https://api.freee.co.jp/api/1/payment_requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await freeeRes.json();

    if (!freeeRes.ok) {
      console.error("freee payment request error:", data);
      return res.status(freeeRes.status).json({
        error: data.errors?.[0]?.messages?.[0] || data.message || "支払依頼の作成に失敗しました。",
      });
    }

    // Slack通知
    await notifySlack(
      `:receipt: *支払依頼を作成しました*\nタイトル: ${title}\n金額: ¥${payment_request_lines.reduce((s, l) => s + Number(l.amount), 0).toLocaleString()}`
    );

    return res.status(200).json(data);
  } catch (err) {
    console.error("Payment request creation error:", err);
    return res.status(500).json({ error: "支払依頼の作成中にエラーが発生しました。" });
  }
}

function getAccessToken(req) {
  const cookies = (req.headers.cookie || "").split(";").reduce((acc, c) => {
    const [key, ...val] = c.trim().split("=");
    if (key) acc[key] = val.join("=");
    return acc;
  }, {});
  return cookies.freee_access_token || null;
}

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
