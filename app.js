const apiAvailable = window.location.protocol !== "file:";

const orderForm = document.querySelector("#orderForm");
const fileInput = document.querySelector("#prescriptionFile");
const fileStatus = document.querySelector("#fileStatus");
const orderResult = document.querySelector("#orderResult");
const trackingInput = document.querySelector("#trackingInput");
const timeline = document.querySelector("#timeline");
const approvalList = document.querySelector("#approvalList");
const refreshOrders = document.querySelector("#refreshOrders");
const metricPending = document.querySelector("#metricPending");
const metricReady = document.querySelector("#metricReady");
const metricInvoices = document.querySelector("#metricInvoices");
const metricWhatsApp = document.querySelector("#metricWhatsApp");
const adminPin = document.querySelector("#adminPin");

function toBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function statusLabel(status) {
  const labels = {
    pending: "Waiting for pharmacist approval",
    approved: "Approved - invoice and payment next",
    rejected: "Needs pharmacist clarification",
    ready: "Ready for pickup or dispatch",
    delivered: "Completed"
  };
  return labels[status] || status;
}

function renderTimeline(order) {
  const status = order.status || "pending";
  timeline.innerHTML = `
    <li class="done">${order.id}: Request received</li>
    <li class="${["approved", "ready", "delivered"].includes(status) ? "done" : status === "rejected" ? "active" : ""}">${status === "rejected" ? "Pharmacist requested clarification" : "Pharmacist approval"}</li>
    <li class="${["ready", "delivered"].includes(status) ? "done" : status === "approved" ? "active" : ""}">GST invoice and packing</li>
    <li class="${status === "delivered" ? "done" : status === "ready" ? "active" : ""}">Out for delivery / ready for pickup</li>`;
}

async function createOrder(event) {
  event.preventDefault();

  const form = new FormData(orderForm);
  const file = fileInput.files[0] || null;
  const order = {
    name: form.get("name"),
    phone: form.get("phone"),
    notes: form.get("notes"),
    fulfillment: form.get("fulfillment"),
    payment: form.get("payment"),
    address: form.get("address"),
    prescription: file
      ? {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          contentBase64: await toBase64(file)
        }
      : null
  };

  if (!apiAvailable) {
    orderResult.textContent = "Backend is ready, but this page is opened as a file. Use the localhost link to submit real orders.";
    return;
  }

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order)
  });

  const saved = await response.json();
  orderResult.textContent = `Order ${saved.id} received. It is now waiting for pharmacist approval.`;
  trackingInput.value = saved.id;
  renderTimeline(saved);
  orderForm.reset();
  fileStatus.textContent = "Encrypted storage ready. JPG, PNG, or PDF accepted.";
  loadOrders();
}

async function trackOrder() {
  const id = trackingInput.value.trim();
  if (!id) return;

  if (!apiAvailable) {
    timeline.innerHTML = `
      <li class="done">${id}: Request received</li>
      <li class="active">Open the localhost backend link for live tracking</li>`;
    return;
  }

  const response = await fetch(`/api/orders/${encodeURIComponent(id)}`);
  if (!response.ok) {
    timeline.innerHTML = `<li class="active">No order found for ${id}</li>`;
    return;
  }

  renderTimeline(await response.json());
}

function renderOrderCards(orders) {
  if (!orders.length) {
    approvalList.innerHTML = "<p>No customer orders yet. New prescription requests will appear here.</p>";
    return;
  }

  approvalList.innerHTML = orders
    .map(
      (order) => `
      <article class="order-admin-card">
        <div>
          <div class="order-card-head">
            <strong>${order.id}</strong>
            <span class="status-pill ${order.status}">${statusLabel(order.status)}</span>
          </div>
          <p><b>${order.name}</b> | ${order.phone} | ${order.fulfillment} | ${order.payment}</p>
          <p>${order.notes || "Prescription-only order"}</p>
          <p>${order.address || "Pickup from Raj Medicals"}</p>
          <small>${order.prescriptionName ? `Prescription stored: ${order.prescriptionName}` : "No prescription file attached"}</small>
        </div>
        <div class="admin-actions">
          <button class="mini-button" type="button" data-status="approved" data-id="${order.id}">Approve</button>
          <button class="mini-button neutral" type="button" data-status="ready" data-id="${order.id}">Mark ready</button>
          <button class="mini-button danger" type="button" data-status="rejected" data-id="${order.id}">Clarify</button>
        </div>
      </article>`
    )
    .join("");
}

function updateMetrics(orders) {
  metricPending.textContent = orders.filter((order) => order.status === "pending").length;
  metricReady.textContent = orders.filter((order) => order.status === "ready").length;
  metricInvoices.textContent = orders.filter((order) => ["approved", "ready", "delivered"].includes(order.status)).length;
  metricWhatsApp.textContent = orders.length;
}

async function loadOrders() {
  if (!apiAvailable) {
    approvalList.innerHTML = "<p>Open the localhost backend link to receive and approve live orders.</p>";
    return;
  }

  const response = await fetch("/api/orders", {
    headers: { "X-Admin-Pin": adminPin.value.trim() }
  });
  if (response.status === 401) {
    approvalList.innerHTML = "<p>Enter the pharmacist PIN to view live customer orders.</p>";
    updateMetrics([]);
    return;
  }

  const orders = await response.json();
  renderOrderCards(orders);
  updateMetrics(orders);
}

async function updateOrderStatus(id, status) {
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Pin": adminPin.value.trim()
    },
    body: JSON.stringify({ status })
  });

  if (response.ok) {
    const updated = await response.json();
    trackingInput.value = updated.id;
    renderTimeline(updated);
    loadOrders();
  }
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  fileStatus.textContent = file
    ? `${file.name} selected. It will be stored securely for pharmacist review.`
    : "Encrypted storage ready. JPG, PNG, or PDF accepted.";
});

orderForm.addEventListener("submit", createOrder);
document.querySelector("#trackButton").addEventListener("click", trackOrder);
document.querySelector("#privacyToggle").addEventListener("click", (event) => {
  const secure = event.target.textContent.includes("Secure");
  event.target.textContent = secure ? "Storage: Consent-only" : "Storage: Secure";
});

approvalList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  updateOrderStatus(button.dataset.id, button.dataset.status);
});

refreshOrders.addEventListener("click", loadOrders);
adminPin.addEventListener("input", () => {
  if (adminPin.value.trim().length >= 4) {
    loadOrders();
  }
});
loadOrders();
