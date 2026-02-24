import { getAdminClient } from "./google-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const admin = await getAdminClient(["https://www.googleapis.com/auth/admin.directory.orgunit.readonly"]);
    const response = await admin.orgunits.list({
      customerId: "my_customer",
      type: "all",
    });

    const orgunits = response.data.organizationUnits || [];
    const ouList = orgunits.map((ou) => ({
      name: ou.name,
      orgUnitPath: ou.orgUnitPath,
    }));

    // ルートOU "/" も選択肢に含める
    ouList.unshift({ name: "（ルート）", orgUnitPath: "/" });

    return res.status(200).json({
      domain: process.env.GOOGLE_DOMAIN,
      ouList,
    });
  } catch (err) {
    console.error("Failed to list OUs:", err);
    return res.status(500).json({
      error: err?.errors?.[0]?.message || err.message || "OU一覧の取得に失敗",
    });
  }
}
