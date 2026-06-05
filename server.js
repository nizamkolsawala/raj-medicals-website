const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
let DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "backend-data");
let PRESCRIPTION_DIR = path.join(DATA_DIR, "prescriptions");
let ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".pdf": "application/pdf"
};

function ensureStore() {
  try {
    fs.mkdirSync(PRESCRIPTION_DIR, { recursive: true });
  } catch (error) {
    if (process.env.DATA_DIR && (error.code === "EACCES" || error.code === "EPERM")) {
      DATA_DIR = path.join(ROOT, "backend-data");
      PRESCRIPTION_DIR = path.join(DATA_DIR, "prescriptions");
      ORDERS_FILE = path.join(DATA_DIR, "orders.json");
      fs.mkdirSync(PRESCRIPTION_DIR, { recursive: true });
      console.warn(`DATA_DIR was not writable. Using temporary app storage at ${DATA_DIR}. Add a persistent disk at the DATA_DIR mount path for production.`);
    } else {
      throw error;
    }
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
  }
}

function readOrders() {
  ensureStore();
  return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
}

function writeOrders(orders) {
  ensureStore();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isAdmin(request) {
  return request.headers["x-admin-pin"] === ADMIN_PIN;
}

function requireAdmin(request, response) {
  if (isAdmin(request)) {
    return true;
  }

  sendJson(response, 401, { error: "Admin PIN required" });
  return false;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error("Request too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function safeFileName(name) {
  return String(name || "prescription").replace(/[^a-z0-9._-]/gi, "_");
}

function publicOrder(order) {
  const { prescriptionPath, ...safeOrder } = order;
  return safeOrder;
}

async function createOrder(request, response) {
  try {
    const payload = JSON.parse(await readBody(request) || "{}");
    const orders = readOrders();
    const id = `RM-${new Date().getFullYear()}-${String(1001 + orders.length).padStart(4, "0")}`;
    let prescriptionPath = null;
    let prescriptionName = "";

    if (payload.prescription && payload.prescription.contentBase64) {
      prescriptionName = safeFileName(payload.prescription.name);
      prescriptionPath = path.join(PRESCRIPTION_DIR, `${id}-${prescriptionName}`);
      fs.writeFileSync(prescriptionPath, Buffer.from(payload.prescription.contentBase64, "base64"));
    }

    const order = {
      id,
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim(),
      notes: String(payload.notes || "").trim(),
      fulfillment: String(payload.fulfillment || "Delivery"),
      payment: String(payload.payment || "UPI after approval"),
      address: String(payload.address || "").trim(),
      status: "pending",
      prescriptionName,
      prescriptionPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    orders.unshift(order);
    writeOrders(orders);
    sendJson(response, 201, publicOrder(order));
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Could not create order" });
  }
}

async function updateStatus(request, response, id) {
  try {
    const payload = JSON.parse(await readBody(request) || "{}");
    const allowed = new Set(["pending", "approved", "rejected", "ready", "delivered"]);
    if (!allowed.has(payload.status)) {
      sendJson(response, 400, { error: "Invalid order status" });
      return;
    }

    const orders = readOrders();
    const order = orders.find((item) => item.id === id);
    if (!order) {
      sendJson(response, 404, { error: "Order not found" });
      return;
    }

    order.status = payload.status;
    order.updatedAt = new Date().toISOString();
    writeOrders(orders);
    sendJson(response, 200, publicOrder(order));
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Could not update order" });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT) || filePath.startsWith(DATA_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/orders" && request.method === "GET") {
    if (!requireAdmin(request, response)) return;
    sendJson(response, 200, readOrders().map(publicOrder));
    return;
  }

  if (url.pathname === "/api/orders" && request.method === "POST") {
    await createOrder(request, response);
    return;
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && request.method === "GET") {
    const order = readOrders().find((item) => item.id === decodeURIComponent(orderMatch[1]));
    sendJson(response, order ? 200 : 404, order ? publicOrder(order) : { error: "Order not found" });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    if (!requireAdmin(request, response)) return;
    await updateStatus(request, response, decodeURIComponent(statusMatch[1]));
    return;
  }

  serveStatic(request, response);
});

ensureStore();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Raj Medicals backend running at http://localhost:${PORT}`);
});
