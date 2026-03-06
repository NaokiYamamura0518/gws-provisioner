// ---------------------
// 経費精算 フロントエンド
// ---------------------

const state = {
  authenticated: false,
  receiptId: null,
  masters: { account_items: [], partners: [], approval_flow_routes: [], taxes: [] },
};

// ===== 初期化 =====
document.addEventListener("DOMContentLoaded", init);

async function init() {
  // 認証チェック: マスタデータ取得を試みて判定
  try {
    const res = await fetch("/api/freee-masters?type=account_items");
    if (res.ok) {
      state.authenticated = true;
      show("main-section");
      hide("login-section");
      await loadMasters();
    } else if (res.status === 401) {
      // トークンリフレッシュを試行
      const refreshRes = await fetch("/api/freee-token-refresh", { method: "POST" });
      if (refreshRes.ok) {
        state.authenticated = true;
        show("main-section");
        hide("login-section");
        await loadMasters();
      } else {
        show("login-section");
        hide("main-section");
      }
    } else {
      show("login-section");
      hide("main-section");
    }
  } catch {
    show("login-section");
    hide("main-section");
  }

  setupUpload();
  setupForm();
  setDefaultDates();
}

// ===== マスタデータ読み込み =====
async function loadMasters() {
  const types = ["account_items", "partners", "approval_flow_routes", "taxes"];
  const results = await Promise.allSettled(
    types.map((t) => fetch(`/api/freee-masters?type=${t}`).then((r) => r.json()))
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      state.masters[types[i]] = r.value[types[i]] || r.value.approval_flow_routes || [];
    }
  });

  populateSelect("pr-partner", state.masters.partners, "id", "name", "（未選択）");
  populateSelect("pr-approval-route", state.masters.approval_flow_routes, "id", "name", "選択してください");
  populateAccountSelects();
  populateTaxSelects();
}

function populateSelect(elementId, items, valueProp, labelProp, placeholder) {
  const sel = document.getElementById(elementId);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  (items || []).forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item[valueProp];
    opt.textContent = item[labelProp];
    sel.appendChild(opt);
  });
}

function populateAccountSelects() {
  document.querySelectorAll(".line-account").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = '<option value="">（未選択）</option>';
    (state.masters.account_items || []).forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  });
}

function populateTaxSelects() {
  document.querySelectorAll(".line-tax").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = '<option value="">（未選択）</option>';
    (state.masters.taxes || []).forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.code;
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  });
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("receipt-date").value = today;
  document.getElementById("pr-issue-date").value = today;
}

// ===== ファイルアップロード =====
function setupUpload() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("receipt-file");
  const btnUpload = document.getElementById("btn-upload");

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
  });

  btnUpload.addEventListener("click", uploadReceipt);
}

function handleFileSelect(file) {
  document.getElementById("btn-upload").disabled = false;
  document.getElementById("preview-name").textContent = file.name;

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById("preview-img").src = e.target.result;
      show("upload-preview");
    };
    reader.readAsDataURL(file);
  } else {
    document.getElementById("preview-img").src = "";
    show("upload-preview");
  }
}

async function uploadReceipt() {
  const fileInput = document.getElementById("receipt-file");
  const file = fileInput.files[0];
  if (!file) return;

  const btn = document.getElementById("btn-upload");
  btn.disabled = true;
  btn.textContent = "アップロード中...";
  setStatus("upload-status", "", "");

  const companyId = await getCompanyId();
  const formData = new FormData();
  formData.append("company_id", companyId);
  formData.append("receipt", file);

  const receiptDate = document.getElementById("receipt-date").value;
  if (receiptDate) formData.append("issue_date", receiptDate);

  const memo = document.getElementById("receipt-memo").value;
  if (memo) formData.append("description", memo);

  try {
    const res = await fetch("/api/upload-receipt", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("upload-status", data.error || "アップロードに失敗しました。", "error");
      btn.disabled = false;
      btn.textContent = "アップロードして次へ";
      return;
    }

    state.receiptId = data.receipt?.id || null;
    setStatus("upload-status", "アップロード完了！", "success");

    // Step 1の日付をStep 2に同期
    if (receiptDate) {
      document.getElementById("pr-issue-date").value = receiptDate;
    }
    // 自動タイトル生成
    const titleInput = document.getElementById("pr-title");
    if (!titleInput.value) {
      titleInput.value = `経費精算 ${memo || file.name} (${receiptDate || "日付未設定"})`;
    }

    goToStep(2);
  } catch (err) {
    setStatus("upload-status", "通信エラーが発生しました。", "error");
    btn.disabled = false;
    btn.textContent = "アップロードして次へ";
  }
}

async function getCompanyId() {
  // 環境変数から取得（サーバー側で設定）
  // ここではfreee APIのユーザー情報から取得を試みる
  try {
    const res = await fetch("/api/freee-masters?type=account_items");
    // company_idはサーバー側で処理
  } catch {}
  return "";
}

// ===== フォーム =====
function setupForm() {
  const form = document.getElementById("expense-form");
  form.addEventListener("submit", submitPaymentRequest);

  document.getElementById("btn-add-line").addEventListener("click", addLineItem);
  document.getElementById("btn-back-step1").addEventListener("click", () => goToStep(1));
  document.getElementById("btn-new").addEventListener("click", resetAll);

  // 金額変更時に合計更新
  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("line-amount")) updateTotal();
  });
}

function addLineItem() {
  const container = document.getElementById("line-items");
  const index = container.children.length;
  const div = document.createElement("div");
  div.className = "line-item";
  div.dataset.index = index;
  div.innerHTML = `
    <div class="line-item-header">
      <span>明細 ${index + 1}</span>
      <button type="button" class="btn-remove" onclick="this.closest('.line-item').remove(); updateTotal();">✕</button>
    </div>
    <div class="form-row">
      <div class="form-group flex-2">
        <label>摘要 <span class="required">*</span></label>
        <input type="text" class="line-desc" required placeholder="内容の説明" />
      </div>
      <div class="form-group flex-1">
        <label>金額 <span class="required">*</span></label>
        <input type="number" class="line-amount" required min="1" placeholder="0" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group flex-1">
        <label>勘定科目</label>
        <select class="line-account">
          <option value="">（未選択）</option>
        </select>
      </div>
      <div class="form-group flex-1">
        <label>税区分</label>
        <select class="line-tax">
          <option value="">（未選択）</option>
        </select>
      </div>
    </div>
  `;
  container.appendChild(div);
  populateAccountSelects();
  populateTaxSelects();
}

function updateTotal() {
  const amounts = document.querySelectorAll(".line-amount");
  let total = 0;
  amounts.forEach((input) => {
    total += Number(input.value) || 0;
  });
  document.getElementById("total-amount").textContent = `¥${total.toLocaleString()}`;
}

async function submitPaymentRequest(e) {
  e.preventDefault();

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "送信中...";
  setStatus("submit-status", "", "");

  const lines = [];
  document.querySelectorAll(".line-item").forEach((item) => {
    lines.push({
      line_type: "not_line_item",
      description: item.querySelector(".line-desc").value,
      amount: Number(item.querySelector(".line-amount").value),
      account_item_id: item.querySelector(".line-account").value || undefined,
      tax_code: item.querySelector(".line-tax").value || undefined,
    });
  });

  const payload = {
    title: document.getElementById("pr-title").value,
    issue_date: document.getElementById("pr-issue-date").value || undefined,
    due_date: document.getElementById("pr-due-date").value || undefined,
    partner_id: document.getElementById("pr-partner").value || undefined,
    approval_flow_route_id: document.getElementById("pr-approval-route").value || undefined,
    description: document.getElementById("pr-description").value || undefined,
    payment_request_lines: lines,
    receipt_ids: state.receiptId ? [state.receiptId] : [],
  };

  try {
    const res = await fetch("/api/create-payment-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("submit-status", data.error || "支払依頼の作成に失敗しました。", "error");
      btn.disabled = false;
      btn.textContent = "支払依頼を作成";
      return;
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    document.getElementById("result-summary").textContent =
      `「${payload.title}」（¥${total.toLocaleString()}）の支払依頼が作成されました。`;

    goToStep(3);
  } catch {
    setStatus("submit-status", "通信エラーが発生しました。", "error");
    btn.disabled = false;
    btn.textContent = "支払依頼を作成";
  }
}

// ===== ステップ管理 =====
function goToStep(num) {
  document.querySelectorAll(".step-content").forEach((el) => el.classList.remove("active"));
  document.getElementById(`step${num}`).classList.add("active");

  document.querySelectorAll(".steps .step").forEach((el) => {
    const stepNum = Number(el.dataset.step);
    el.classList.toggle("active", stepNum === num);
    el.classList.toggle("completed", stepNum < num);
  });
}

function resetAll() {
  state.receiptId = null;
  document.getElementById("receipt-file").value = "";
  document.getElementById("receipt-memo").value = "";
  document.getElementById("btn-upload").disabled = true;
  document.getElementById("btn-upload").textContent = "アップロードして次へ";
  hide("upload-preview");
  setStatus("upload-status", "", "");
  setStatus("submit-status", "", "");

  document.getElementById("expense-form").reset();
  setDefaultDates();
  updateTotal();

  // 追加した明細行を削除（最初の1行のみ残す）
  const container = document.getElementById("line-items");
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }

  goToStep(1);
}

// ===== ユーティリティ =====
function show(id) {
  document.getElementById(id).style.display = "block";
}
function hide(id) {
  document.getElementById(id).style.display = "none";
}
function setStatus(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `status-msg ${type}`;
}
