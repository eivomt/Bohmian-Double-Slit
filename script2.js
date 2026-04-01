import * as THREE from "three";
import { moveCamera } from './cameraControls.js'
import { getTopViewQuaternion } from './cameraControls.js'
import { loadQFieldCSV, loadForceFieldCSV, cropNaNBorder, cropNaNBorderForceField } from "./loadFromCSV.js";
import { initParticle, updatePosition, initTrajectories } from "./particle.js";
import { findLocalMidpoint, addHelpers, makeLineFromVector2, getRandomV0, lineFromTo } from "./geometryHelpers.js";
import { setUpScene } from "./setUpScene.js";
import { getPsiAndGrad } from "./getPsi.js";
import { makeVelocityTexture, makeScalarTexture, createFlowParticles, writeVelocityToTexture, writeScalarToTexture, getDisplayedHeight } from "./vectorField.js";


const {scene, camera, renderer, controls, dir1, dir2, point, point2} = setUpScene()








function slitContribution(x, y, t, x0, y0, sigma, k, omega, v) {
  const dx = x - x0;
  const dy = y - y0;

  const r = Math.hypot(dx, dy);
  const safeR = Math.max(r, 1e-6);

  const phase = k * r - omega * t;
  const cos = Math.cos(phase);
  const sin = Math.sin(phase);

  // envelope
  const dr = r - v * t;
  const env = Math.exp(-(dr * dr) / (2 * sigma * sigma));
//   const env = Math.exp(-(dr * dr) / (2 * (sigma * 5)**2));
//   const env = 1;
//   const env = exp(-(r^2)/(2sigma^2));

  const re = env * cos;
  const im = env * sin;

  // --- gradient components ---

  // envelope derivative dA/dr
  const dAdr = -(dr) / (sigma * sigma);

  // radial unit vector
  const rx = dx / safeR;
  const ry = dy / safeR;

  // total log-derivative:
  // (dAdr + i k)
  const C_re = dAdr;
  const C_im = k;

  // ∂Ψ/∂x = (C * Ψ) * (x/r)
  const dxRe = (C_re * re - C_im * im) * rx;
  const dxIm = (C_re * im + C_im * re) * rx;

  // ∂Ψ/∂y
  const dyRe = (C_re * re - C_im * im) * ry;
  const dyIm = (C_re * im + C_im * re) * ry;

  return { re, im, dxRe, dxIm, dyRe, dyIm };
}

function psiAndGradAt(x, y, t, d, sigma, k0) {
  const x1 = -d / 2, y1 = 0;
  const x2 =  d / 2, y2 = 0;


  const omega = k0 * k0;
  const v = k0;

  const p1 = slitContribution(x, y, t, x1, y1, sigma, k0, omega, v);
  const p2 = slitContribution(x, y, t, x2, y2, sigma, k0, omega, v);


  return {
    re: p1.re + p2.re,
    im: p1.im + p2.im,

    dxRe: p1.dxRe + p2.dxRe,
    dxIm: p1.dxIm + p2.dxIm,

    dyRe: p1.dyRe + p2.dyRe,
    dyIm: p1.dyIm + p2.dyIm
  };
}

function compressVelocity(vx, vy, vmax = 20000, vscale = 20000) {
  const mag = Math.hypot(vx, vy);

  if (mag < 1e-12) {
    return { vx: 0, vy: 0 };
  }

  const compressedMag = vmax * Math.tanh(mag / vscale);
  const s = compressedMag / mag;

  return {
    vx: vx * s,
    vy: vy * s
  };
}

function velocityAt(x, y, t, d, sigma, k0, eps = 1e-8, vmax = 2000, vscale = 2000) {
  const p = psiAndGradAt(x, y, t, d, sigma, k0);

  const denom = p.re * p.re + p.im * p.im + eps;

  let vx = (p.dxIm * p.re - p.dxRe * p.im) / denom;
  let vy = (p.dyIm * p.re - p.dyRe * p.im) / denom;

    // let vx = (p.re * (-p.dxIm) + p.im * p.dxRe) / denom
    // let vy = (p.re * (-p.dyIm) + p.im * p.dyRe) / denom
    //   let vx = p.dxIm *p.re / denom;
    //   let vy = p.dyIm *p.re / denom;

  return compressVelocity(vx, vy);
}


let paused = false

const N = 256
const d = 4
const sigma = 2.525
const k0 = 10
const dt = 1e-2
const numParticles = 100


window.addEventListener("pointerdown", onDown)

function onDown(e) {
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
}

function onUp(e) {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
}

function onMove(e) {
  const svg = document.getElementById('trajectory')

  let strokeWidth, stroke, blurValue, disappears
  const duration = .5

  for (let i=0; i<5; i++) {
    switch(i) {
      case 0:
        strokeWidth = 128
        stroke = "#2B536A"
        blurValue = 128
        disappears = true
        break
      case 1:
        strokeWidth = 16
        stroke = "#6D92A6"
        blurValue = 32
        disappears = true
        break
      case 2:
        strokeWidth = 8
        stroke = "#88ABBE"
        blurValue = 8
        disappears = true
        break
      case 3:
        strokeWidth = 2
        stroke = "#94abc1"
        blurValue = 0
        disappears = false
        break
      case 4:
        strokeWidth = 1
        stroke = "#fff"
        blurValue = 0
        disappears = false
        break
    }

    const path = getTrajectory(scaleX(e.clientX), scaleY(e.clientY),0, d, sigma, k0, stroke, strokeWidth, blurValue)
    // const path = getTrajectory(e.clientX, e.clientY,0, d, sigma, k0, "#fff", 8, 0)
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    svg.appendChild(path)

    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(path, { strokeDashoffset: 0, duration: duration, ease: "elastic.in"});
    gsap.to(path, {
      filter: "blur(1px)",
      duration: duration + .15,
      ease: "elastic.in"
    });
    if (disappears) {
      gsap.to(path, {
        opacity: 0,
        duration: duration + .15,
        ease: "expo.in"
      });
    } else {
      gsap.to(path, {
        opacity: 0.0,
        duration: duration + .15,
        ease: "expo.in"
      });
    }
  }


}

// console.log(window.innerHeight)
// console.log(window.innerWidth)

// const w = window.innerWidth

let scaleY = (y) => {
  return (-y/(window.innerHeight/10) * 2) + 10
}

let scaleX = (x) => {
  return (x/(window.innerWidth/10) * 2) - 10
}

let pixelValueX = (x) => {
  return (x + 10) * (window.innerWidth/20)
}
let pixelValueY = (y) => {
  return window.innerHeight - (y + 10) * (window.innerHeight/20)
}

console.log(window.innerHeight)



let getTrajectory = (x,y,t,d,sigma,k0,stroke,strokeWidth,blurValue) => {
  console.log(y)
  console.log(pixelValueY(y))

  let position = [x,y]
  let dString = ""

  while(position[0] < 10 && position[0] > -10) {
    const v1 = velocityAt(position[0], position[1], t, d, sigma, k0);

    const midX = position[0] + 0.5 * dt * v1.vx;
    const midY = position[1] + 0.5 * dt * v1.vy;

    const v2 = velocityAt(midX, midY, t + 0.5 * dt, d, sigma, k0);

    const px = pixelValueX(position[0])
    const py = pixelValueY(position[1])

    dString += (dString == "" ? "M" : "L") + `${px},${py} `

    position[0] += v2.vx * dt
    position[1] += v2.vy * dt
    t += dt
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", dString.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("opacity", ".9");
  path.setAttribute("stroke-width", strokeWidth);
  path.style.filter = `blur(${blurValue}px)`

  return path;

}


