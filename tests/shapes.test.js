import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanShapes, distToSeg, shapesBounds, hitShape } from "../js/sketch/shapes.js";

// A stand-in for a canvas context: text is 10px wide per character.
const ctx = { font: "", measureText: (t) => ({ width: t.length * 10 }) };

test("cleanShapes keeps valid shapes and drops broken ones", () => {
  const out = cleanShapes([
    { type: "box", x1: 0, y1: 0, x2: 10, y2: 10 },
    { type: "box", x1: 0, y1: "x", x2: 10, y2: 10 },
    { type: "pen", pts: [[1, 2], [3, 4]] },
    { type: "pen", pts: [[1, 2], [3]] },
    { type: "text", x: 1, y: 2, text: "hi", size: 99 },
    { type: "script", x: 1 },
    null
  ]);
  assert.deepEqual(out.map((s) => s.type), ["box", "pen", "text"]);
  assert.equal(out[2].size, 30);
  assert.deepEqual(cleanShapes("nope"), []);
});

test("distToSeg measures to the nearest point of the segment", () => {
  assert.equal(distToSeg(5, 5, 0, 0, 10, 0), 5);
  assert.equal(distToSeg(15, 0, 0, 0, 10, 0), 5);
});

test("shapesBounds covers boxes, lines and text", () => {
  const b = shapesBounds(ctx, [
    { type: "box", x1: 10, y1: 20, x2: 110, y2: 120 },
    { type: "text", x: 200, y: 300, text: "orders", size: 30 }
  ]);
  assert.deepEqual(b, { x0: 10, y0: 20, x1: 260, y1: 308 });
  assert.equal(shapesBounds(ctx, []), null);
});

test("hitShape: box edges hit, box middle doesn't", () => {
  const box = { type: "box", x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.equal(hitShape(ctx, box, 50, 2), true);
  assert.equal(hitShape(ctx, box, 50, 50), false);
});
