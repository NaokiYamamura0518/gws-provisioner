// ---------------------
// freee OAuth2 認証開始
// ---------------------
export default function handler(req, res) {
  const clientId = process.env.FREEE_CLIENT_ID;
  const redirectUri = process.env.FREEE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "freee OAuth2の環境変数が未設定です。" });
  }

  const authUrl = new URL("https://accounts.secure.freee.co.jp/public_api/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "login");

  return res.redirect(302, authUrl.toString());
}
