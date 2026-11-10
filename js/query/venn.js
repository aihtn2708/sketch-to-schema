// Venn diagrams for set questions ("with / without / both / either"), and the join each one means.
// Pure (returns strings), covered by tests/query.test.js.
import { esc } from "../util.js";

// What a set of shaded regions means in SQL, for two sets A and B.
const JOINS_2 = {
  "a": ["Only in A", "Anti-join: NOT EXISTS, or LEFT JOIN … WHERE B is NULL"],
  "b": ["Only in B", "Anti-join: NOT EXISTS, or LEFT JOIN … WHERE A is NULL"],
  "ab": ["In both A and B", "INNER JOIN, or EXISTS"],
  "a,ab": ["All of A, with B where it matches", "LEFT JOIN"],
  "ab,b": ["All of B, with A where it matches", "RIGHT JOIN (or LEFT JOIN from B)"],
  "a,ab,b": ["In A or B", "FULL OUTER JOIN, or UNION"],
  "a,b": ["In A or B, but not both", "FULL OUTER JOIN … WHERE one side is NULL"]
};

export function joinLabel(venn) {
  if (!venn) return null;
  if (venn.sets.length === 2) {
    const k = [...venn.result].sort().join(",");
    const hit = JOINS_2[k];
    if (hit) return { title: hit[0], sql: hit[1] };
  }
  const name = (r) => r.length === venn.sets.length ? `in all ${r.length}` : r.length === 1 ? `only in ${r.toUpperCase()}` : `in ${r.toUpperCase().split("").join(" and ")} only`;
  return { title: venn.result.map(name).join("; "), sql: "Combine EXISTS / NOT EXISTS conditions for each set" };
}

const LAYOUT = {
  2: { w: 360, h: 210, r: 80, c: [[140, 105], [220, 105]], label: [[95, 105], [265, 105]] },
  3: { w: 360, h: 250, r: 74, c: [[148, 98], [212, 98], [180, 155]], label: [[110, 80], [250, 80], [180, 205]] }
};

// colors: { accent, ink, muted } (CSS colors)
export function vennSvg(venn, colors, idPrefix = "vn") {
  const n = venn.sets.length, L = LAYOUT[n];
  const letters = "abc".slice(0, n).split("");
  const circle = (i, extra = "") => `<circle cx="${L.c[i][0]}" cy="${L.c[i][1]}" r="${L.r}"${extra}/>`;
  let defs = "";
  letters.forEach((l, i) => {
    defs += `<clipPath id="${idPrefix}-in-${l}">${circle(i)}</clipPath>`;
    defs += `<mask id="${idPrefix}-out-${l}"><rect width="${L.w}" height="${L.h}" fill="#fff"/>${circle(i, ' fill="#000"')}</mask>`;
  });
  // Each shaded region: clipped to the sets it's in, masked by the sets it isn't in.
  let shade = "";
  for (const region of venn.result) {
    let el = `<rect width="${L.w}" height="${L.h}" fill="${colors.accent}" fill-opacity="0.45"/>`;
    for (const l of letters.filter((x) => !region.includes(x))) el = `<g mask="url(#${idPrefix}-out-${l})">${el}</g>`;
    for (const l of letters.filter((x) => region.includes(x))) el = `<g clip-path="url(#${idPrefix}-in-${l})">${el}</g>`;
    shade += el;
  }
  const outlines = letters.map((l, i) => circle(i, ` fill="none" stroke="${colors.ink}" stroke-width="1.6"`)).join("");
  const labels = letters.map((l, i) => `<text x="${L.label[i][0]}" y="${L.label[i][1]}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="${colors.ink}">${l.toUpperCase()}</text>`).join("");
  const title = venn.sets.map((s, i) => `${letters[i].toUpperCase()}: ${s.label}`).join("; ");
  return `<svg viewBox="0 0 ${L.w} ${L.h}" role="img" aria-label="${esc("Venn diagram. " + title)}"><defs>${defs}</defs>${shade}${outlines}${labels}</svg>`;
}
