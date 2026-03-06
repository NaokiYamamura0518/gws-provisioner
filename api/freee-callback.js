// ---------------------
// freee OAuth2 コールバック
// ---------------------
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "認可コードがありません。" });
  }

  try {
    const tokenRes = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.FREEE_CLIENT_ID,
        client_secret: process.env.FREEE_CLIENT_SECRET,
        code,
        redirect_uri: process.env.FREEE_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("freee token error:", err);
      return res.status(401).json({ error: "freee認証に失敗しました。" });
    }

    const tokenData = await tokenRes.json();

    // アクセストークンをHttpOnly Cookieに保存
    const maxAge = tokenData.expires_in || 86400;
    res.setHeader("Set-Cookie", [
      `freee_access_token=${tokenData.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
      `freee_refresh_token=${tokenData.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    ]);

    return res.redirect(302, "/expense.html");
  } catch (err) {
    console.error("freee callback error:", err);
    return res.status(500).json({ error: "認証処理中にエラーが発生しました。" });
  }
}
