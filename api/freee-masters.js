// ---------------------
// freee マスタデータ取得（勘定科目・取引先・申請経路）
// ---------------------
export default async function handler(req, res) {
  const accessToken = getAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: "未認証です。freeeにログインしてください。" });
  }

  const companyId = process.env.FREEE_COMPANY_ID;
  const { type } = req.query;

  const endpoints = {
    account_items: `/api/1/account_items?company_id=${companyId}`,
    partners: `/api/1/partners?company_id=${companyId}`,
    approval_flow_routes: `/api/1/approval_flow_routes?company_id=${companyId}&form_type=payment_request`,
    taxes: `/api/1/taxes/codes?company_id=${companyId}`,
  };

  const path = endpoints[type];
  if (!path) {
    return res.status(400).json({ error: `不正なtypeです: ${type}` });
  }

  try {
    const freeeRes = await fetch(`https://api.freee.co.jp${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await freeeRes.json();

    if (!freeeRes.ok) {
      return res.status(freeeRes.status).json({
        error: data.message || "マスタデータの取得に失敗しました。",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Master data fetch error:", err);
    return res.status(500).json({ error: "マスタデータ取得中にエラーが発生しました。" });
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
