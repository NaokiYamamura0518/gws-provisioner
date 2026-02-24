/**
 * Keyless Google authentication using Workload Identity Federation (WIF).
 *
 * サービスアカウントの秘密鍵（GOOGLE_SERVICE_ACCOUNT_KEY）を使わず、
 * Vercel の OIDC トークンを GCP Workload Identity Federation で交換して認証します。
 *
 * 必要な環境変数:
 *   GOOGLE_WORKLOAD_IDENTITY_AUDIENCE  - WIF プロバイダーのオーディエンス URI
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL       - サービスアカウントのメールアドレス（秘密鍵不要）
 *   GOOGLE_ADMIN_EMAIL                 - ドメインワイド委任で偽装する管理者メール
 *
 * 認証フロー:
 *   1. Vercel OIDC トークン → GCP STS でフェデレーショントークンに交換
 *   2. フェデレーショントークン → サービスアカウントのアクセストークンを取得（SA 偽装）
 *   3. IAM signJwt API でドメインワイド委任用 JWT に署名
 *   4. 署名済み JWT → Admin API 用アクセストークンに交換
 */

import { google } from "googleapis";

async function getAccessTokenForDwD(scopes) {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const audience = process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN が設定されていません。Vercel の OIDC 設定を確認してください。");
  if (!audience) throw new Error("GOOGLE_WORKLOAD_IDENTITY_AUDIENCE が設定されていません。");
  if (!serviceAccountEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL が設定されていません。");
  if (!adminEmail) throw new Error("GOOGLE_ADMIN_EMAIL が設定されていません。");

  // Step 1: Vercel OIDC トークン → GCP STS フェデレーショントークン
  const stsRes = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token: oidcToken,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    }),
  });
  if (!stsRes.ok) {
    const body = await stsRes.text();
    throw new Error(`STS トークン交換に失敗しました: ${body}`);
  }
  const { access_token: federatedToken } = await stsRes.json();

  // Step 2: フェデレーショントークン → サービスアカウントのアクセストークン（SA 偽装）
  const impersonateRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${federatedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/iam"],
      }),
    }
  );
  if (!impersonateRes.ok) {
    const body = await impersonateRes.text();
    throw new Error(`サービスアカウントの偽装に失敗しました: ${body}`);
  }
  const { accessToken: saToken } = await impersonateRes.json();

  // Step 3: IAM signJwt でドメインワイド委任用 JWT に署名（秘密鍵不要）
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: serviceAccountEmail,
    sub: adminEmail, // ドメインワイド委任: 管理者として偽装
    aud: "https://oauth2.googleapis.com/token",
    scope: scopes.join(" "),
    iat: now,
    exp: now + 3600,
  };

  const signRes = await fetch(
    `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:signJwt`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${saToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: JSON.stringify(jwtPayload) }),
    }
  );
  if (!signRes.ok) {
    const body = await signRes.text();
    throw new Error(`JWT 署名に失敗しました: ${body}`);
  }
  const { signedJwt } = await signRes.json();

  // Step 4: 署名済み JWT → Admin API 用アクセストークン（DwD）
  const oauthRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });
  if (!oauthRes.ok) {
    const body = await oauthRes.text();
    throw new Error(`OAuth トークン交換に失敗しました: ${body}`);
  }
  const { access_token } = await oauthRes.json();
  return access_token;
}

export async function getAdminClient(scopes) {
  const accessToken = await getAccessTokenForDwD(scopes);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.admin({ version: "directory_v1", auth });
}
