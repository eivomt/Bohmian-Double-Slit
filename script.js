import * as THREE from "three";
import { moveCamera } from './cameraControls.js'
import { getTopViewQuaternion } from './cameraControls.js'
import { loadQFieldCSV, loadForceFieldCSV, cropNaNBorder, cropNaNBorderForceField } from "./loadFromCSV.js";
import { initParticle, updatePosition } from "./particle.js";
import { findLocalMidpoint, addHelpers, makeLineFromVector2, getRandomV0 } from "./geometryHelpers.js";
import { setUpScene } from "./setUpScene.js";


const {scene, camera, renderer, controls, dir1, dir2, point, point2} = setUpScene()


// -----------------------------
// CSV loading + grid rebuild
// Expects rows: x,y,Q
// -----------------------------


// -----------------------------
// Simple colormap
// -----------------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorMap(t) {
  t = Math.max(0, Math.min(1, t));

  // light blue -> steel -> dark charcoal
  const stops = [
    // { t: 0.00, c: [0.169, 0.325, 0.416] },
    { t: 0.00, c: [0.047, 0.109, 0.207] },
    { t: 1.00, c: [0.082, 0.145, 0.259] }
    // { t: 1.00, c: [0.047, 0.149, 0.263] }
  ];

  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let k = 0; k < stops.length - 1; k++) {
    if (t >= stops[k].t && t <= stops[k + 1].t) {
      a = stops[k];
      b = stops[k + 1];
      break;
    }
  }

  const u = (t - a.t) / (b.t - a.t || 1);
  return new THREE.Color(
    lerp(a.c[0], b.c[0], u),
    lerp(a.c[1], b.c[1], u),
    lerp(a.c[2], b.c[2], u)
  );
}

// Gradient of Q

const raycaster = new THREE.Raycaster();

function getGradient(mesh, x, z) {
  raycaster.set(
    new THREE.Vector3(x, 10, z),
    new THREE.Vector3(0, -1, 0)
  );

  const hits = raycaster.intersectObject(mesh);
  if (hits.length === 0) return null;

  const normal = hits[0].face.normal.clone().transformDirection(mesh.matrixWorld);

  if (Math.abs(normal.y) < 1e-6) return null;

  return new THREE.Vector2(
    -normal.x / normal.y,
    -normal.z / normal.y
  );
}

// -----------------------------
// Build surface mesh
// -----------------------------
function buildSurfaceMesh(x1d, y1d, Q, zScale = 1.0) {
  const nx = x1d.length;
  const ny = y1d.length;

  const width = x1d[nx - 1] - x1d[0];
  const height = y1d[ny - 1] - y1d[0];

  const geom = new THREE.PlaneGeometry(width, height, nx - 1, ny - 1);

  // Put plane in XY with Z up
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  let qMin = Infinity;
  let qMax = -Infinity;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const q = Q[j][i];
      if (Number.isFinite(q)) {
        if (q < qMin) qMin = q;
        if (q > qMax) qMax = q;
      }
    }
  }

  if (!Number.isFinite(qMin) || !Number.isFinite(qMax)) {
    throw new Error("No finite Q values found.");
  }

  const qRange = (qMax - qMin) || 1.0;

  // PlaneGeometry vertex order is row-major from top row to bottom row.
  // We map carefully so y increases upward in world coordinates.
  let idx = 0;
  for (let row = 0; row < ny; row++) {
    const j = ny - 1 - row; // flip to match geometry layout
    for (let i = 0; i < nx; i++) {
      let q = Q[j][i];
      if (!Number.isFinite(q)) q = qMin;

      const z = zScale * q;
      pos.setY(idx, z);

      const t = (q - qMin) / qRange;
      const c = colorMap(t);
      colors[3 * idx + 0] = c.r;
      colors[3 * idx + 1] = c.g;
      colors[3 * idx + 2] = c.b;

      idx++;
    }
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  pos.needsUpdate = true;
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.0
  });

  const mesh = new THREE.Mesh(geom, mat);

  // Center the mesh in x,y according to actual grid midpoint
  const xMid = 0.5 * (x1d[0] + x1d[nx - 1]);
  const yMid = 0.5 * (y1d[0] + y1d[ny - 1]);
  mesh.position.set(xMid, 0, yMid);

  return { mesh, qMin, qMax };
}

// -----------------------------
// Optional axes helper
// -----------------------------
function addAxes(size = 1) {
  const axes = new THREE.AxesHelper(size);
  scene.add(axes);
}


// -----------------------------
// Debug Mode GUI
// -----------------------------
const camButton = document.getElementById('cameraValues')
camButton.addEventListener('click', () => {
    printToConsole(camera)
})

const topViewButton = document.getElementById('topViewBtn')
topViewButton.addEventListener('click', () => {
    moveCamera(camera, getTopViewQuaternion(point.position),point.position.clone().add(new THREE.Vector3(0, 2, 0)))
})

const pointIntensity1 = document.getElementById('pointIntensity1')
pointIntensity1.addEventListener('input', () => {
    point.intensity = pointIntensity1.value
})

const pointIntensity2 = document.getElementById('pointIntensity2')
pointIntensity2.addEventListener('input', () => {
    point2.intensity = pointIntensity2.value
})

const point1Color = document.getElementById('point1Color')
const point2Color = document.getElementById('point2Color')

point1Color.addEventListener('input', () => {
    point.color.set(point1Color.value)
})

point2Color.addEventListener('input', () => {
    point2.color.set(point2Color.value)
})

const directionalIntensity1 = document.getElementById('directionalIntensity1')
directionalIntensity1.addEventListener("input", () => {
    dir1.intensity = directionalIntensity1.value
})

const directionalIntensity2 = document.getElementById('directionalIntensity2')
directionalIntensity2.addEventListener("input", () => {
    dir2.intensity = directionalIntensity2.value
})

const directionalColor1 = document.getElementById('directionalColor1')
directionalColor1.addEventListener('input', () => {
    dir1.color.set(directionalColor1.value)
})

const directionalColor2 = document.getElementById('directionalColor2')
directionalColor2.addEventListener('input', () => {
    dir2.color.set(directionalColor2.value)
})











// -----------------------------
// Main
// -----------------------------
let surfaceMesh = null
let forceField = null
let particle = null
let velocity = null
const clock = new THREE.Clock()

async function main() {
  try {
    let { x1d, y1d, Q } = await loadQFieldCSV("./data/Q.csv");
    ({ x1d, y1d, Q } = cropNaNBorder(x1d, y1d, Q));

    let force = await loadForceFieldCSV("./data/Q_gradient_negative.csv");
    force = cropNaNBorderForceField(force.x1d, force.y1d, force.Fx, force.Fy);
    forceField = force;

    // Adjust this if your z range is too dramatic
    const zScale = 1.0;

    const { mesh, qMin, qMax } = buildSurfaceMesh(x1d, y1d, Q, zScale);
    surfaceMesh = mesh;
    scene.add(surfaceMesh);

    const { s1, s2 } = addHelpers(surfaceMesh, point, point2, scene)


    const xSpan = x1d[x1d.length - 1] - x1d[0];
    const ySpan = y1d[y1d.length - 1] - y1d[0];
    // const span = Math.max(xSpan, ySpan);
    const span = 500

    let v0s1 = getRandomV0()
    let v0s2 = getRandomV0()

    scene.add(makeLineFromVector2(s1.position.clone(), v0s1))
    scene.add(makeLineFromVector2(s2.position.clone(), v0s2))

    particle = initParticle(s1, scene)
    velocity = v0s1.clone()

    // addAxes(0.35 * span);

    camera.position.set(0, span, 0);
    controls.target.set(
      0.5 * (x1d[0] + x1d[x1d.length - 1]),
      0,
      0.5 * (y1d[0] + y1d[y1d.length - 1])
    );
    controls.update();

  } catch (err) {
    console.error(err);
  }
}

main();

// -----------------------------
// Render loop
// -----------------------------
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 1 / 30);
  const substeps = 32;
  const h = dt / substeps;

  if (particle && velocity && surfaceMesh) {
    velocity = updatePosition(velocity, particle, h, 0.5, surfaceMesh, forceField, raycaster)
    velocity = updatePosition(velocity, particle, h, 0.5, surfaceMesh, forceField, raycaster)
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// -----------------------------
// Resize
// -----------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});