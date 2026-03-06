// ---------------------
// freee トークンリフレッシュ
// ---------------------
export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const refreshToken = cookies.freee_refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: "リフレッシュトークンがありません。再ログインしてください。" });
  }

  try {
    const tokenRes = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.FREEE_CLIENT_ID,
        client_secret: process.env.FREEE_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });

    if (!tokenRes.ok) {
      return res.status(401).json({ error: "トークンの更新に失敗しました。再ログインしてください。" });
    }

    const tokenData = await tokenRes.json();
    const maxAge = tokenData.expires_in || 86400;

    res.setHeader("Set-Cookie", [
      `freee_access_token=${tokenData.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
      `freee_refresh_token=${tokenData.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Token refresh error:", err);
    return res.status(500).json({ error: "トークン更新中にエラーが発生しました。" });
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(";").forEach((c) => {
    const [key, ...val] = c.trim().split("=");
    if (key) cookies[key] = val.join("=");
  });
  return cookies;
}
