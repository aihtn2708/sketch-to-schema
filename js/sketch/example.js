// The example shown on first use: a hand-drawn shop schema on a whiteboard, and the draft read from it.

export const EXAMPLE_DRAFT = {
  tables: [
    { name: "customers", columns: [
      { name: "id", type: "integer", type_guessed: true, pk: true },
      { name: "name", type: "varchar(255)", type_guessed: true, nullable: false },
      { name: "email", type: "varchar(255)", type_guessed: true, unique: true, nullable: false },
      { name: "created_at", type: "timestamp", type_guessed: true, nullable: false } ] },
    { name: "orders", columns: [
      { name: "id", type: "integer", type_guessed: true, pk: true },
      { name: "customer_id", type: "integer", type_guessed: true, nullable: false, references: "customers.id" },
      { name: "status", type: "varchar(50)", type_guessed: true, nullable: false },
      { name: "total", type: "numeric(10,2)", type_guessed: true, nullable: false },
      { name: "ordered_at", type: "timestamp", type_guessed: true, nullable: false,
        flags: [{ field: "name", note: "Last word could read \"ordered_on\". If it's a date, change the type to date." }] } ] },
    { name: "order_items", columns: [
      { name: "order_id", type: "integer", type_guessed: true, pk: true, references: "orders.id",
        flags: [{ field: "pk", note: "Both order_id and product_id are underlined, so this reads as a composite key." }] },
      { name: "product_id", type: "integer", type_guessed: true, pk: true, references: "products.id",
        flags: [{ field: "references", note: "The line end at products is scribbled. Assumed many order items per product." }] },
      { name: "qty", type: "integer", type_guessed: true, nullable: false,
        flags: [{ field: "name", note: "Handwriting could also read \"oty\"." }] },
      { name: "unit_price", type: "numeric(10,2)", type_guessed: true, nullable: false } ] },
    { name: "products", columns: [
      { name: "id", type: "integer", type_guessed: true, pk: true },
      { name: "sku", type: "varchar(255)", type_guessed: true, unique: true, nullable: false },
      { name: "name", type: "varchar(255)", type_guessed: true, nullable: false },
      { name: "price", type: "numeric(10,2)", type_guessed: true, nullable: false } ] }
  ],
  warnings: ["The red note \"soft delete?\" next to customers wasn't turned into a column. Add deleted_at if you want it."]
};

// Seeded randomness so the "hand-drawn" wobble looks the same every time.
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawExample(cv, x) {
  cv.width = 1200; cv.height = 760;
  const r = mulberry(7), j = (n) => (r() - 0.5) * n;
  x.fillStyle = "#f6f7f4"; x.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 6; i++) { x.fillStyle = "rgba(90,100,110,0.035)"; x.beginPath(); x.ellipse(r() * 1200, r() * 760, 160 + r() * 200, 50 + r() * 70, r() * 3, 0, 7); x.fill(); }
  x.lineCap = "round"; x.lineJoin = "round";
  const line = (x1, y1, x2, y2, col = "#1e3a8a", w = 3) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x1 + j(3), y1 + j(3)); x.quadraticCurveTo((x1 + x2) / 2 + j(8), (y1 + y2) / 2 + j(8), x2 + j(3), y2 + j(3)); x.stroke(); };
  const text = (s, tx, ty, size = 32, bold = false, col = "#1f2328", rot = 0) => { x.save(); x.translate(tx, ty); x.rotate(rot + j(0.03)); x.fillStyle = col; x.font = `${bold ? "700 " : ""}${size}px Kalam, "Comic Sans MS", cursive`; x.fillText(s, 0, 0); x.restore(); };
  const crow = (px, py, fx, fy, col = "#1e3a8a") => { const dx = px - fx, dy = py - fy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, bx = px - ux * 26, by = py - uy * 26; for (const s of [-1, 0, 1]) line(bx, by, px - uy * 14 * s, py + ux * 14 * s, col, 2.6); };
  const B = {
    customers: { x: 60, y: 70, w: 300, rows: ["id", "name", "email (unique)", "created_at"], pk: [0] },
    orders: { x: 470, y: 70, w: 300, rows: ["id", "customer_id", "status", "total", "ordered_at"], pk: [0] },
    order_items: { x: 470, y: 440, w: 320, rows: ["order_id", "product_id", "qty", "unit_price"], pk: [0, 1] },
    products: { x: 885, y: 440, w: 265, rows: ["id", "sku", "name", "price"], pk: [0] }
  };
  const rowY = (b, i) => b.y + 70 + i * 44 + 24;
  for (const [name, b] of Object.entries(B)) {
    const h = 82 + b.rows.length * 44;
    line(b.x, b.y, b.x + b.w, b.y); line(b.x + b.w, b.y, b.x + b.w, b.y + h); line(b.x + b.w, b.y + h, b.x, b.y + h); line(b.x, b.y + h, b.x, b.y);
    line(b.x + 6, b.y + 62, b.x + b.w - 8, b.y + 62, "#1e3a8a", 2);
    text(name, b.x + 18, b.y + 44, 34, true);
    b.rows.forEach((s, i) => {
      text(s, b.x + 22, rowY(b, i), 30);
      if (b.pk.includes(i)) { x.font = "30px Kalam, cursive"; const wdt = x.measureText(s).width; line(b.x + 20, rowY(b, i) + 7, b.x + 24 + wdt, rowY(b, i) + 9, "#1f2328", 2.2); }
    });
  }
  line(B.customers.x + B.customers.w, rowY(B.customers, 0) - 10, B.orders.x, rowY(B.orders, 1) - 10);
  crow(B.orders.x, rowY(B.orders, 1) - 10, B.customers.x + B.customers.w, rowY(B.customers, 0) - 10);
  const oy = B.orders.y + 82 + 5 * 44;
  line(560, oy, 560, B.order_items.y); crow(560, B.order_items.y, 560, oy);
  const py0 = rowY(B.order_items, 1) - 10, py1 = rowY(B.products, 0) - 10;
  line(B.order_items.x + B.order_items.w, py0, B.products.x - 4, py1);
  x.strokeStyle = "#1e3a8a"; x.lineWidth = 2.4; x.beginPath();
  for (let i = 0; i < 7; i++) x.lineTo(B.products.x - 30 + i * 4 + j(6), py1 - 12 + (i % 2) * 22 + j(4));
  x.stroke();
  text("soft delete?", 92, 470, 30, false, "#b42318", -0.06);
  line(170, 440, 190, 362, "#b42318", 2.4); line(190, 362, 178, 378, "#b42318", 2.4); line(190, 362, 200, 379, "#b42318", 2.4);
  text("shop v1 · 3/11", 960, 60, 24, false, "#5b6470", 0.02);
}
