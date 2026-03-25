import * as THREE from "three";
import { moveCamera } from './cameraControls.js'
import { getTopViewQuaternion } from './cameraControls.js'
import { loadQFieldCSV, loadForceFieldCSV, cropNaNBorder, cropNaNBorderForceField } from "./loadFromCSV.js";
import { initParticle, updatePosition, initTrajectories } from "./particle.js";
import { findLocalMidpoint, addHelpers, makeLineFromVector2, getRandomV0, lineFromTo } from "./geometryHelpers.js";
import { setUpScene } from "./setUpScene.js";


const {scene, camera, renderer, controls, dir1, dir2, point, point2} = setUpScene()



function initSurface(N, d, sigma, k0, real, squared) {
  const size = N * N;

  const L = 1000;
  const dx = L / (N - 1);

  const r1x = -d / 2;
  const r2x =  d / 2;
  const r1y = 0;
  const r2y = 0;

  const norm = 1 / (Math.sqrt(Math.PI) * sigma);

  const height = new Float32Array(size);      // Z values
  const complex = new Float32Array(size * 2); // [Re, Im]

  let i = 0;

  for (let iy = 0; iy < N; iy++) {
    const y = (iy / (N - 1) - 0.5) * L;

    for (let ix = 0; ix < N; ix++, i++) {
      const x = (ix / (N - 1) - 0.5) * L;

      // --- packet 1 ---
      const dx1 = x - r1x;
      const dy1 = y - r1y;
      const r1sq = dx1 * dx1 + dy1 * dy1;

      const amp1 = norm * Math.exp(-r1sq / (2 * sigma * sigma));
      const phase1 = k0 * dx1;

      const re1 = amp1 * Math.cos(phase1);
      const im1 = amp1 * Math.sin(phase1);

      // --- packet 2 ---
      const dx2 = x - r2x;
      const dy2 = y - r2y;
      const r2sq = dx2 * dx2 + dy2 * dy2;

      const amp2 = norm * Math.exp(-r2sq / (2 * sigma * sigma));
      const phase2 = -k0 * dx2;

      const re2 = amp2 * Math.cos(phase2);
      const im2 = amp2 * Math.sin(phase2);

      // superposition (normalized)
      const re = (re1 + re2) * Math.SQRT1_2;
      const im = (im1 + im2) * Math.SQRT1_2;

      complex[2 * i] = re;
      complex[2 * i + 1] = im;

      // choose what you want to visualize:

      // OPTION A: real part (wave oscillation)
      if(real) {
          height[i] = re;
        } else {
          height[i] = im;
      }

      if(squared) {
          height[i] = re * re + im * im;
      }

      // OPTION B (recommended): probability density
    }
  }

  return { height, complex, N, L };
}

function createSurfaceMesh(surfaceData, color) {
  const { height, N, L } = surfaceData;

  const geometry = new THREE.PlaneGeometry(
    L, L,
    N - 1, N - 1
  );

  const pos = geometry.attributes.position;

  // IMPORTANT: PlaneGeometry is XY plane by default
  // so Z is height already (perfect for you)

  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, height[i]);
  }

  pos.needsUpdate = true;

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    // color: 0x6699ff,
    color: color,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return { mesh, geometry };
}

function updateSurface(N, d, sigma, k0, t) {
  const size = N * N;
  const L = 10;

  const height = new Float32Array(size);
  const complex = new Float32Array(size * 2);

  // centers
  const x1 = -d / 2, y1 = 0;
  const x2 =  d / 2, y2 = 0;

  // choose whether the second packet moves oppositely
  const k1 =  k0;
  const k2 = k0;

  let i = 0;

  for (let iy = 0; iy < N; iy++) {
    const y = (iy / (N - 1) - 0.5) * L;

    for (let ix = 0; ix < N; ix++, i++) {
      const x = (ix / (N - 1) - 0.5) * L;

      const [re1, im1] = evolvedPacket(x, y, t, x1, y1, sigma, k1);
      const [re2, im2] = evolvedPacket(x, y, t, x2, y2, sigma, k2);

      // normalized 2-packet superposition
      const re = (re1 + re2) * Math.SQRT1_2;
      const im = (im1 + im2) * Math.SQRT1_2;

      complex[2 * i] = re;
      complex[2 * i + 1] = im;

      // Z-height choice:
      // real part:
      // height[i] = re;

      // probability density:
    //   height[i] = (re * re + im * im)*10000;
      height[i] = im*4000;
    }
  }

  return { height, complex, N, L };
}



function evolvedPacket(x, y, t, x0, y0, sigma, k) {
  // a = 1 + i t/sigma^2
  const ai_re = 1.0;
  const ai_im = t / (sigma * sigma);

  // 1 / a
  const denomA = ai_re * ai_re + ai_im * ai_im;
  const invA_re = ai_re / denomA;
  const invA_im = -ai_im / denomA;

  // prefactor = 1 / (sqrt(pi) sigma a)
  const pref_re = (1 / (Math.sqrt(Math.PI) * sigma)) * invA_re;
  const pref_im = (1 / (Math.sqrt(Math.PI) * sigma)) * invA_im;

  // shifted coordinates from your screenshot
//   const dx = x - x0 - k * t;
  const dy = y - y0 - k * t;
  const dx = x - x0;
//   const dy = y - y0;
  const r2 = dx * dx + dy * dy;
//   const r2 = dx * dx;

  // gaussian exponent:
  // - r2 / (2 sigma^2 a)
  const c = -r2 / (2 * sigma * sigma);
  const gaussExp_re = c * invA_re;
  const gaussExp_im = c * invA_im;

  const gaussMag = Math.exp(gaussExp_re);
  const gauss_re = gaussMag * Math.cos(gaussExp_im);
  const gauss_im = gaussMag * Math.sin(gaussExp_im);

  // phase exponent from screenshot:
  // i k ((x-x0) + (y-y0)) - i k^2 t

  const r = Math.sqrt((x - x0)**2 + (y - y0)**2)

//   const theta = k * ((x - x0) + (y - y0)) - k * k * t;
  const theta = k*r;
  const phase_re = Math.cos(theta);
  const phase_im = Math.sin(theta);

  // multiply: pref * gauss * phase
  const pg_re = pref_re * gauss_re - pref_im * gauss_im;
  const pg_im = pref_re * gauss_im + pref_im * gauss_re;

  const re = pg_re * phase_re - pg_im * phase_im;
  const im = pg_re * phase_im + pg_im * phase_re;

  return [re, im];
}


function applySurfaceToMesh(mesh, surfaceData) {
  const { height } = surfaceData;
  const pos = mesh.geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, height[i]);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}


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
    // light blue -> steel -> dark charcoal
    const stops = [
      // { t: 0.00, c: [0.169, 0.325, 0.416] },
      { t: 0.00, c: [0.047, 0.109, 0.207] },
      { t: 1.00, c: [0.082, 0.145, 0.259] }
      // { t: 1.00, c: [0.047, 0.149, 0.263] }
    ];
  t = Math.max(0, Math.min(1, t));


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
// let mesh = null
let realMesh = null
let imaginaryMesh = null
let qField = null
const clock = new THREE.Clock()

let paused = false

const N = 512
const d = 1
const sigma = 0.125
const k0 = .5

const surface = initSurface(N, d, sigma, k0, true);
const { mesh } = createSurfaceMesh(surface, 0xfc4120);

scene.add(mesh);

async function main() {
  try {
    let { x1d, y1d, Q } = await loadQFieldCSV("./data/Q.csv");
    ({ x1d, y1d, Q } = cropNaNBorder(x1d, y1d, Q));
    qField = { x1d, y1d, Q}

    // Adjust this if your z range is too dramatic
    const zScale = 1.0;

    // const surface = initSurface(N, d, sigma, k0, true);
    // const { mesh } = createSurfaceMesh(surface);

    // scene.add(mesh);


    
    // const realSurface = initSurface(N, d, sigma, k0, true, false);
    // const { mesh: realMesh } = createSurfaceMesh(realSurface, 0xfc4120);

    // scene.add(realMesh);

    // const imaginarySurface = initSurface(N, d, sigma, k0, false, false);
    // const { mesh: imaginaryMesh } = createSurfaceMesh(imaginarySurface, 0x2073e8);

    // scene.add(imaginaryMesh);

    // const squaredSurface = initSurface(N, d, sigma, k0, false, true);
    // const { mesh: squaredMesh } = createSurfaceMesh(squaredSurface, 0x24f337);

    // scene.add(squaredMesh);


    
    
    const span = 500
    

    



    // addAxes(0.35 * span);

    // camera.position.set(0, span, 0);
    controls.target.set(
      0.5 * (x1d[0] + x1d[x1d.length - 1]),
      0,
      0.5 * (y1d[0] + y1d[y1d.length - 1])
    );
    controls.update();

    scene.updateMatrixWorld(true)
    mesh.updateMatrixWorld(true)

  } catch (err) {
    console.error(err);
  }
}




main();

// -----------------------------
// Render loop
// -----------------------------
function animate(timeMs) {

    let t=0
    if(!paused) {
        t = timeMs * 0.0001;
    }
    const surface = updateSurface(N, d, sigma, k0, t);
    console.log(surface)
    applySurfaceToMesh(mesh, surface)
    renderer.render(scene, camera);
    requestAnimationFrame(animate);

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

document.addEventListener('keydown', function(event){
    console.log(event.key)
    if(event.key==='Enter') {
        paused = !paused
    }
})