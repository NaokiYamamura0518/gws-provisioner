document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("accountForm");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const emailInput = document.getElementById("email");
  const ouSelect = document.getElementById("ou");
  const submitBtn = document.getElementById("submitBtn");
  const resultDiv = document.getElementById("result");

  let emailManuallyEdited = false;
  let domain = "";

  // OU一覧を取得
  loadOUList();

  // 姓名の入力時にメールアドレスを自動生成
  firstNameInput.addEventListener("input", generateEmail);
  lastNameInput.addEventListener("input", generateEmail);

  // メール欄を手動編集したらフラグを立てる
  emailInput.addEventListener("input", () => {
    emailManuallyEdited = true;
  });

  // 姓名欄にフォーカスが戻ったら自動生成を再開
  firstNameInput.addEventListener("focus", () => { emailManuallyEdited = false; });
  lastNameInput.addEventListener("focus", () => { emailManuallyEdited = false; });

  function generateEmail() {
    if (emailManuallyEdited) return;
    const first = firstNameInput.value.trim().toLowerCase();
    const last = lastNameInput.value.trim().toLowerCase();
    if (first && last && domain) {
      emailInput.value = `${first}.${last}@${domain}`;
    }
  }

  async function loadOUList() {
    try {
      const res = await fetch("/api/ou-list");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OU一覧の取得に失敗");

      domain = data.domain || "";
      ouSelect.innerHTML = '<option value="">-- 選択してください --</option>';
      data.ouList.forEach((ou) => {
        const opt = document.createElement("option");
        opt.value = ou.orgUnitPath;
        opt.textContent = ou.name + "  (" + ou.orgUnitPath + ")";
        ouSelect.appendChild(opt);
      });
    } catch (err) {
      ouSelect.innerHTML = '<option value="">取得失敗</option>';
      console.error(err);
    }
  }

  // フォーム送信
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultDiv.hidden = true;

    const payload = {
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      email: emailInput.value.trim(),
      orgUnitPath: ouSelect.value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "作成中...";

    try {
      const res = await fetch("/api/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      resultDiv.hidden = false;
      if (res.ok) {
        resultDiv.className = "result success";
        resultDiv.textContent = `アカウントを作成しました: ${data.email}`;
        form.reset();
        emailManuallyEdited = false;
      } else {
        resultDiv.className = "result error";
        resultDiv.textContent = `エラー: ${data.error}`;
      }
    } catch (err) {
      resultDiv.hidden = false;
      resultDiv.className = "result error";
      resultDiv.textContent = `通信エラー: ${err.message}`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "アカウントを作成";
    }
  });
});
