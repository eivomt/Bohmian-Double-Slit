export async function loadQFieldCSV(path) {
  const text = await fetch(path).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${path}`);
    return r.text();
  });

  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const rows = [];
  for (const line of lines) {
    const parts = line.split(",").map(s => s.trim());
    if (parts.length < 3) continue;

    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const q = Number(parts[2]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push([x, y, Number.isFinite(q) ? q : NaN]);
  }

  if (rows.length === 0) {
    throw new Error("CSV appears empty or malformed.");
  }

  const xVals = rows.map(r => r[0]);
  const yVals = rows.map(r => r[1]);

  const x1d = [...new Set(xVals)].sort((a, b) => a - b);
  const y1d = [...new Set(yVals)].sort((a, b) => a - b);

  const nx = x1d.length;
  const ny = y1d.length;

  const xIndex = new Map(x1d.map((v, i) => [v, i]));
  const yIndex = new Map(y1d.map((v, i) => [v, i]));

  const Q = Array.from({ length: ny }, () => Array(nx).fill(NaN));

  for (const [x, y, q] of rows) {
    const i = xIndex.get(x);
    const j = yIndex.get(y);
    Q[j][i] = q;
  }

  return { x1d, y1d, Q };
}


// load Forces

export async function loadForceFieldCSV(path) {
  const text = await fetch(path).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${path}`);
    return r.text();
  });

  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const rows = [];
  for (const line of lines) {
    const parts = line.split(",").map(s => s.trim());
    if (parts.length < 4) continue;

    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const fx = Number(parts[2]);
    const fy = Number(parts[3]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    rows.push([
      x,
      y,
      Number.isFinite(fx) ? fx : NaN,
      Number.isFinite(fy) ? fy : NaN
    ]);
  }

  if (rows.length === 0) {
    throw new Error("Force CSV appears empty or malformed.");
  }

  const xVals = rows.map(r => r[0]);
  const yVals = rows.map(r => r[1]);

  const x1d = [...new Set(xVals)].sort((a, b) => a - b);
  const y1d = [...new Set(yVals)].sort((a, b) => a - b);

  const nx = x1d.length;
  const ny = y1d.length;

  const xIndex = new Map(x1d.map((v, i) => [v, i]));
  const yIndex = new Map(y1d.map((v, i) => [v, i]));

  const Fx = Array.from({ length: ny }, () => Array(nx).fill(NaN));
  const Fy = Array.from({ length: ny }, () => Array(nx).fill(NaN));

  for (const [x, y, fx, fy] of rows) {
    const i = xIndex.get(x);
    const j = yIndex.get(y);
    Fx[j][i] = fx;
    Fy[j][i] = fy;
  }

  return { x1d, y1d, Fx, Fy };
}

// -----------------------------
// Crop away full-NaN border rows/cols
// -----------------------------
export function cropNaNBorder(x1d, y1d, Q) {
  const ny = Q.length;
  const nx = Q[0].length;

  const rowAllNaN = Q.map(row => row.every(v => Number.isNaN(v)));
  const colAllNaN = Array.from({ length: nx }, (_, i) =>
    Q.every(row => Number.isNaN(row[i]))
  );

  let top = 0;
  while (top < ny && rowAllNaN[top]) top++;

  let bottom = ny - 1;
  while (bottom >= 0 && rowAllNaN[bottom]) bottom--;

  let left = 0;
  while (left < nx && colAllNaN[left]) left++;

  let right = nx - 1;
  while (right >= 0 && colAllNaN[right]) right--;

  if (top > bottom || left > right) {
    throw new Error("After cropping NaN border, no valid data remains.");
  }

  const xC = x1d.slice(left, right + 1);
  const yC = y1d.slice(top, bottom + 1);
  const QC = Q.slice(top, bottom + 1).map(row => row.slice(left, right + 1));

  return { x1d: xC, y1d: yC, Q: QC };
}

export function cropNaNBorderForceField(x1d, y1d, Fx, Fy) {
  const ny = Fx.length;
  const nx = Fx[0].length;

  const rowAllNaN = Array.from({ length: ny }, (_, j) =>
    Fx[j].every(v => Number.isNaN(v)) &&
    Fy[j].every(v => Number.isNaN(v))
  );

  const colAllNaN = Array.from({ length: nx }, (_, i) =>
    Fx.every(row => Number.isNaN(row[i])) &&
    Fy.every(row => Number.isNaN(row[i]))
  );

  let top = 0;
  while (top < ny && rowAllNaN[top]) top++;

  let bottom = ny - 1;
  while (bottom >= 0 && rowAllNaN[bottom]) bottom--;

  let left = 0;
  while (left < nx && colAllNaN[left]) left++;

  let right = nx - 1;
  while (right >= 0 && colAllNaN[right]) right--;

  if (top > bottom || left > right) {
    throw new Error("After cropping NaN border, no valid force data remains.");
  }

  return {
    x1d: x1d.slice(left, right + 1),
    y1d: y1d.slice(top, bottom + 1),
    Fx: Fx.slice(top, bottom + 1).map(row => row.slice(left, right + 1)),
    Fy: Fy.slice(top, bottom + 1).map(row => row.slice(left, right + 1)),
  };
}