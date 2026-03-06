// ---------------------
// 領収書アップロード → freee ファイルボックス
// ---------------------
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const accessToken = getAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: "未認証です。freeeにログインしてください。" });
  }

  try {
    // multipart/form-dataをそのまま読み取る
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Content-Typeからboundaryを取得
    const contentType = req.headers["content-type"];

    // freee APIにそのまま転送
    const freeeRes = await fetch("https://api.freee.co.jp/api/1/receipts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body,
    });

    const data = await freeeRes.json();

    if (!freeeRes.ok) {
      console.error("freee receipt upload error:", data);
      return res.status(freeeRes.status).json({
        error: data.errors?.[0]?.messages?.[0] || data.message || "領収書のアップロードに失敗しました。",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Receipt upload error:", err);
    return res.status(500).json({ error: "領収書アップロード中にエラーが発生しました。" });
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
