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

let bohmian = false





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
  const x1 = 0, y1 = -d / 2;
  const x2 =  0, y2 = d / 2;


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

function compressVelocity(vx, vy, vmax = 10, vscale = 10) {
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

function velocityAt(x, y, t, d, sigma, k0, eps = 1e-4, vmax = 1000, vscale = 1000) {
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


let paused = true

let d = 2.5
const slitWidth = d / 5
const sigma = 2.525
let k0 = 6
const dt = 1e-2
const L = 10

let firing = false
let fired = 0
window.addEventListener("click", onDown)

function onDown(e) {
  if(paused) return
  if(!firing) {
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  } else {
    onUp(e)
  }
  firing = !firing
}

function onUp(e) {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
}

function onMove(e) {
  fired++
  if(fired == 10) fired = 0
  if (fired > 1) return
  const svg = document.getElementById('trajectory')

  let createdPaths = []

  let strokeWidth, stroke, blurValue, disappears
  const duration = 1.25

  for (let i=0; i<5; i++) {
    switch(i) {
      case 0:
        strokeWidth = 32
        stroke = "#2B536A"
        blurValue = 64
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
        blurValue = 2
        disappears = false
        break
      case 4:
        strokeWidth = 1
        stroke = "#fff"
        blurValue = 0
        disappears = false
        break
    }

    const trajectory = getTrajectory(scaleX(e.clientX), scaleY(e.clientY),0, d, sigma, k0)
    const path = createSVG(trajectory.dString, stroke, strokeWidth, blurValue)
    // const path = getTrajectory(scaleX(e.clientX), .5,0, d, sigma, k0, stroke, strokeWidth, blurValue)
    // const path = getTrajectory(e.clientX, e.clientY,0, d, sigma, k0, "#fff", 8, 0)
    createdPaths.push(path)


    svg.appendChild(path)
    const canvas = document.getElementById("buffer")
    const cnvContext = canvas.getContext('2d')

    const length = path.getTotalLength();
    gsap.set(path, { 
      strokeDasharray: length,
      strokeDashoffset: length 
    });
    
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: duration - 0.5,
      ease: "elastic.in",
      immediateRender: false
    });

    gsap.to(path, {
      opacity: disappears ? 0 : 0.0,
      duration: duration + 0.15,
      ease: "expo.in",
      immediateRender: false,
      onComplete: () => {
        drawPointsToCanvas(cnvContext, trajectory.points, {
          stroke,
          strokeWidth,
          opacity: 0.035,
          blur: blurValue > 0 ? Math.min(blurValue, 16) : 0
        });
        path.remove();
      }
    });


  }

  // setTimeout(() => {
  //   createdPaths.forEach(path => path.remove());
  // }, duration * 1000 + 250);
  setTimeout(() => {
    createdPaths.forEach(path => path.remove());
  }, duration * 1000 + 250);


}


let scaleY = (y) => {
  return -1 * map(y, 0, window.innerHeight, -L, L,)
}

let scaleX = (x) => {
  // const scaledX = x - (window.innerWidth - window.innerHeight)
  return map(x, 0, window.innerHeight, -L, L,)
  // return (x/(window.innerWidth/10) * 2) - 10
}

let pixelValueX = (x) => {
  return (x + L) * (window.innerHeight > window.innerWidth ?  (window.innerWidth/20) : (window.innerHeight/20))
}
let pixelValueY = (y) => {
  return window.innerHeight - (y + L) * (window.innerHeight > window.innerWidth ?  (window.innerWidth/20) : (window.innerHeight/20))
}

function map(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}




let getTrajectory = (x, y, t, d, sigma, k0) => {
  let position = [x,y]
  let dString = ""
  let points = []
  let steps = 0
  const MAX_STEPS = 10000

  while(position[0] < 10 && position[0] > -10 && steps < MAX_STEPS) {
    steps++
    const v1 = velocityAt(position[0], position[1], t, d, sigma, k0);

    const midX = position[0] + 0.5 * dt * v1.vx;
    const midY = position[1] + 0.5 * dt * v1.vy;

    const v2 = velocityAt(midX, midY, t + 0.5 * dt, d, sigma, k0);

    const px = pixelValueX(position[0])
    const py = pixelValueY(position[1])

    if (steps%2 == 0 || steps == 0) {
      dString += (dString == "" ? "M" : "L") + `${px},${py}`
      points.push({x: px, y: py})
    }

    position[0] += v2.vx * dt
    position[1] += v2.vy * dt
    t += dt
  }

  return { dString: dString.trim(), points }
}

let createSVG = (dString, stroke, strokeWidth, blurValue) => {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", dString.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("opacity", ".9");
  path.setAttribute("stroke-width", strokeWidth);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.style.filter = `blur(${blurValue}px)`

  return path;
}

function velocityRaw(x, y, t, d, sigma, k0, eps = 1e-2) {
  const p = psiAndGradAt(x, y, t, d, sigma, k0);
  const denom = p.re*p.re + p.im*p.im + eps;

  return {
    vx: (p.dxIm * p.re - p.dxRe * p.im) / denom,
    vy: (p.dyIm * p.re - p.dyRe * p.im) / denom
  };
}


let boundaryFlux = (x, y, t, d, sigma, k0, edge) => {
  const p = psiAndGradAt(x, y, t, d, sigma, k0)
  const rho = p.re * p.re + p.im * p.im

  const v = velocityRaw(x, y, t, d, sigma, k0)

  switch (edge) {
    case "right":
      return Math.max(0, rho * v.vx)

    case "left":
      return Math.max(0, -rho * v.vx)

    case "top":
      return Math.max(0, rho * v.vy)

    case "bottom":
      return Math.max(0, -rho * v.vy)

    default:
      return 0
  }
};

let getDetectionEvent = ({L, tMin, tMax, tSteps, yMin, yMax, ySteps, d, sigma, k0}) => {
  const dt = (tMax - tMin) / (tSteps - 1)
  const dy = (yMax - yMin) / (ySteps - 1)
  const dx = dy

  const weights = []
  let total = 0

  for (let i = 0; i < tSteps; i++) {
    const t = tMin + i * dt

    for (let j = 0; j < ySteps; j++) {
      const y = yMin + j * dy
      const x = L

      const w = boundaryFlux(x, y, t, d, sigma, k0, 'right')
      weights.push({x, y, t, w })

      total += w
    }

    for(let k=0; k < ySteps/2; k++) {
      const y = L
      const x = k*dx

      const w = boundaryFlux(x, y, t, d, sigma, k0, 'top') / 2
      weights.push({x, y, t, w })

      total += w
    }

    for(let l=0; l < ySteps/2; l++) {
      const y = -L
      const x = l*dx

      const w = boundaryFlux(x, y, t, d, sigma, k0, 'bottom') / 2
      weights.push({x, y, t, w })

      total += w
    }
  }

  let r = Math.random() * total

  for (const item of weights) {
    r -= item.w
    if (r <= 0) {
      return { x: item.x, y: item.y, t: item.t }
    }
  }

  return weights[weights.length - 1]
}


let getBackwardTrajectory = (x, y, t, d, sigma, k0, xStop = 0) => {
  let position = [x, y]
  let dString = ""
  let points = []
  let steps = 0
  const MAX_STEPS = 10000

  // d = d + (Math.random() -.5) * 2 * slitWidth

  const h = -1 * dt

  while (
    position[0] <= 10 &&
    position[0] >= -10 &&
    position[1] <= 10 &&
    position[1] >= -10 &&
    // t > 0 &&
    position[0] > xStop &&
    steps < MAX_STEPS
  ) {
    steps++

    const px = pixelValueX(position[0])
    const py = pixelValueY(position[1])

    if (steps % 2 === 0 || steps === 1) {
      dString += (dString === "" ? "M" : "L") + `${px},${py}`
      points.push({x: px, y: py})
    }

    const v1 = velocityAt(position[0], position[1], t, d, sigma, k0)

    const midX = position[0] + 0.5 * h * v1.vx
    const midY = position[1] + 0.5 * h * v1.vy

    const v2 = velocityAt(midX, midY, t + 0.5 * h, d, sigma, k0)

    position[0] += v2.vx * h
    position[1] += v2.vy * h
    t += h
  }

  if (dString === "") return null

  // const finalPx = 0
  // const finalPy = pixelValueY(position[1])

  // dString += `L${finalPx},${finalPy}`
  // points.push({ x: finalPx, y: finalPy })

  return { dString: dString.trim(), points }
}



// figureCanvas = document.create ..
// resizeFigureCanvas = (canvas) => {
    // canvas.width = 100vw - 100vh
    // canvas.height = 100vh
    // canvas.clearRect
// }

// window.addEventListener('resize', () => {
//   resizeFigureCanvas()
// })

// const fig1 = document.getElementById('fig1-btn')
// fig1.addEventListiner('click', (){
  // drawDetectionDistributionCanvas(figureCanvas, 500, d, k0, sigma)
// })

// ---------- canvas setup ----------
const figureCanvas = document.createElement("canvas")
figureCanvas.style.position = "fixed"
figureCanvas.style.top = "0"
figureCanvas.style.right = "0"
figureCanvas.style.zIndex = "1000"
// figureCanvas.style.borderLeft = "8px solid white"
figureCanvas.style.background = "black"

document.body.appendChild(figureCanvas)

function resizeFigureCanvas() {
  const size = window.innerHeight

  figureCanvas.width = Math.max(200, window.innerWidth - size)
  figureCanvas.height = size

  const ctx = figureCanvas.getContext("2d")
  ctx.clearRect(0, 0, figureCanvas.width, figureCanvas.height)
}

resizeFigureCanvas()

let activeFigure = 2
figureCanvas.style.display = "none"

window.addEventListener("resize", () => {
  resizeFigureCanvas()
});

// ---------- draw wrapper ----------
function renderFig1() {
  drawDetectionDistributionCanvas({
    canvas: figureCanvas,
    timeResolution: 1400,
    d,
    k0,
    sigma,
    tMin: 0,
    tMax: 5,
    L: 10
  })
}

function renderFig2() {
  drawTimeIndependentYDistribution({
    canvas: figureCanvas,
    resolution: 1400,
    d,
    k0,
    sigma,
    tMin: 0,
    tMax: 5,
    L: 10
  })
}

// ---------- button ----------
const fig1 = document.getElementById("fig1-btn")

fig1.addEventListener("click", () => {
  figureCanvas.style.display = "block"
  const graph = document.getElementById('probability-graph')
  if(graph !== null) {
    graph.remove()
  }
  const activeBtn = document.querySelector('.active-btn')
  activeBtn.classList.remove('active-btn')
  fig1.classList.add('active-btn')
  renderFig1()
  activeFigure = 1
})

const fig2 = document.getElementById("fig2-btn")

fig2.addEventListener("click", () => {
  figureCanvas.style.display = "block"
  const activeBtn = document.querySelector('.active-btn')
  activeBtn.classList.remove('active-btn')
  fig2.classList.add('active-btn')
  renderFig2()
  activeFigure = 2
})

const fig3 = document.getElementById("fig3-btn")

fig3.addEventListener("click", () => {
  figureCanvas.style.display = "none"
  const graph = document.getElementById('probability-graph')
  if(graph !== null) {
    graph.remove()
  }
  const activeBtn = document.querySelector('.active-btn')
  activeBtn.classList.remove('active-btn')
  fig3.classList.add('active-btn')
  // renderFig3()
  activeFigure = 3
})

function drawDetectionDistributionCanvas({
  canvas,
  timeResolution,   // tSteps
  d,
  k0,
  sigma = 1,
  tMin = 0,
  tMax = 20,
  L = 10,
  ySteps = timeResolution
}) {
  const ctx = canvas.getContext("2d")

  const width = canvas.width
  const height = canvas.height

  const tSteps = timeResolution
  const dt = (tMax - tMin) / (tSteps - 1)
  const yMin = -L
  const yMax = L
  const dy = (yMax - yMin) / (ySteps - 1)

  const grid = new Array(tSteps * ySteps)
  let maxW = 0

  // Beregn fluks gjennom høyre rand x = L
  for (let i = 0; i < tSteps; i++) {
    const t = tMin + i * dt

    for (let j = 0; j < ySteps; j++) {
      const y = yMin + j * dy
      const x = L

      const w = boundaryFlux(x, y, t, d, sigma, k0, "right")

      grid[i * ySteps + j] = w
      if (w > maxW) maxW = w
    }
  }

  const image = ctx.createImageData(width, height)
  const data = image.data

  for (let px = 0; px < width; px++) {
    const i = Math.floor((px / (width - 1)) * (tSteps - 1))

    for (let py = 0; py < height; py++) {
      const j = Math.floor(((height - 1 - py) / (height - 1)) * (ySteps - 1))

      const w = grid[i * ySteps + j]

      // Gråskala: svart = lav sannsynlighet, hvit = høy
      const intensity = maxW > 0
        ? Math.floor(255 * Math.sqrt(w / maxW))
        : 0;

      const idx = 4 * (py * width + px)
      data[idx + 0] = intensity
      data[idx + 1] = intensity
      data[idx + 2] = intensity
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
}


function getYDistributionFromDetectionFlux({
  resolution,
  d,
  k0,
  sigma = 1,
  tMin = 0,
  tMax = 20,
  L = 10,
  ySteps = 300
}) {
  const tSteps = resolution
  const dt = (tMax - tMin) / (tSteps - 1)

  const yMin = -L
  const yMax = L
  const dy = (yMax - yMin) / (ySteps - 1)

  const yDistribution = new Array(ySteps).fill(0)

  // Sum over time for each y
  for (let j = 0; j < ySteps; j++) {
    const y = yMin + j * dy
    const x = L

    let sum = 0

    for (let i = 0; i < tSteps; i++) {
      const t = tMin + i * dt
      sum += boundaryFlux(x, y, t, d, sigma, k0, "right")
    }

    yDistribution[j] = sum
  }

  // Normalize so sum = 1
  const total = yDistribution.reduce((a, b) => a + b, 0);

  if (total > 0) {
    for (let j = 0; j < ySteps; j++) {
      yDistribution[j] /= total
    }
  }

  return yDistribution
}

function drawTimeIndependentYDistribution({
  canvas,
  resolution,
  d,
  k0,
  sigma = 1,
  tMin = 0,
  tMax = 20,
  L = 10,
  ySteps = resolution
}) {

  
  const ctx = canvas.getContext("2d")
  const width = canvas.width
  const height = canvas.height

  // const ySteps = Math.floor(resolution * (height/width))

  ctx.clearRect(0, 0, width, height)

  const dist = getYDistributionFromDetectionFlux({
    resolution,
    d,
    k0,
    sigma,
    tMin,
    tMax,
    L,
    ySteps
  });

  const maxP = Math.max(...dist)

  const image = ctx.createImageData(width, height)
  const data = image.data

  // start: #050B14
  // const r1 = 5,  g1 = 11,  b1 = 20
  const r1 = 0,  g1 = 0,  b1 = 0
  // end:   #88ABBE
  // const r2 = 5, g2 = 27, b2 = 48
  const r2 = 255, g2 = 255, b2 = 255


  for (let py = 0; py < height; py++) {
    const j = Math.floor(((height - 1 - py) / (height - 1)) * (ySteps - 1))
    const p = dist[j]

    const t = maxP > 0 ? Math.sqrt(p / maxP) : 0  // 0 → 1

    const r = Math.floor(r1 + (r2 - r1) * t)
    const g = Math.floor(g1 + (g2 - g1) * t)
    const b = Math.floor(b1 + (b2 - b1) * t)

    for (let px = 0; px < width; px++) {
      const idx = 4 * (py * width + px)

      data[idx + 0] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)

  // Optional curve overlay
  // ctx.beginPath()
  // ctx.strokeStyle = "white"
  // ctx.lineWidth = 2

  // for (let j = 0; j < ySteps; j++) {
  //   const p = dist[j]

  //   const x = maxP > 0
  //     ? (p / maxP) * (width - 10)
  //     : 0;

  //   const y = height - 1 - (j / (ySteps - 1)) * (height - 1)

  //   if (j === 0) ctx.moveTo(x, y)
  //   else ctx.lineTo(x, y)
  // }

  // ctx.stroke()

  const svgNS = "http://www.w3.org/2000/svg"

  // create <svg>
  const svg = document.createElementNS(svgNS, "svg")
  const prevGraph = document.getElementById('probability-graph')
  if(prevGraph !== null) {
    prevGraph.remove()
  }
  svg.id = 'probability-graph'
  svg.setAttribute("width", width)
  svg.setAttribute("height", height)
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  // svg.style.mixBlendMode = "difference"
  // svg.style.opacity = ".25"
  // svg.style.opacity = ".75"

  // create <polyline>
  const centerIndex = Math.floor((ySteps - 1) / 2)

  const topPoints = []
  const bottomPoints = []

  for (let j = 0; j < ySteps; j++) {
    const p = dist[j]

    const x = maxP > 0 ? (p / maxP) * (width - 10) * .95 + 8 : 0
    const y = height - 1 - (j / (ySteps - 1)) * (height - 1)

    if (j <= centerIndex) {
      topPoints.push(`${x},${y}`)
    } else {
      bottomPoints.push(`${x},${y}`)
    }
  }

  // reverse top so it starts at center and draws upward
  topPoints.reverse()

  function makePolyline(points) {
    const polyline = document.createElementNS(svgNS, "polyline")
    polyline.setAttribute("points", points.join(" "))
    polyline.setAttribute("fill", "none")
    polyline.setAttribute("stroke", "white")
    polyline.setAttribute("stroke-width", "4")
    polyline.setAttribute("stroke-linecap", "round")
    polyline.setAttribute("stroke-linejoin", "round")
    return polyline
  }

  const polylineTop = makePolyline(topPoints)
  const polylineBottom = makePolyline(bottomPoints)

  svg.appendChild(polylineTop)
  svg.appendChild(polylineBottom)

  document.querySelector(".display").appendChild(svg)

  for (const line of [polylineTop, polylineBottom]) {
    const length = line.getTotalLength()

    gsap.set(line, {
      strokeDasharray: length,
      strokeDashoffset: length,
    })

    gsap.to(line, {
      strokeDashoffset: 0,
      duration: .75,
      ease: "power1.inOut",
    })
  }

  return dist
}







async function burst(N) {
  return new Promise((resolve) => {
    let paths=[]



    for (let i = 0; i<N; i++) {
      const event = getDetectionEvent({
        L: L,
        tMin: -2 * sigma,
        // tMin: 0,
        tMax: (L + 4*sigma) / k0,
        tSteps: 100,
        ySteps: 600,
        yMin: -L,
        yMax: L,
        d: d,
        sigma: sigma,
        k0: k0
      })

      let strokeWidth, stroke, blurValue, disappears
        const path = getBackwardTrajectory(
          event.x,
          event.y,
          event.t,
          d,
          sigma,
          k0,
          0
        )
        if (!path) continue

        // if(event.x == L) {detectElectron(100 - ((event.y+10) * 100 / 20))}

        path.detectionY =
          event.x === L
            ? 100 - ((event.y + 10) * 100 / 20)
            : null

        
        paths.push(path)
    }
    resolve(paths)
  })
}

let stagger = (paths, bohmian=true) => {
  const svg = document.getElementById('trajectory')
  const delay = .25
  const duration = .95

  if(!bohmian) {
    for (const [pathIndex, trajectory] of paths.entries()) {
      // console.log(trajectory)
      if(trajectory.detectionY !== null) {
        detectElectron(trajectory.detectionY)
      }
      // sleep(.1)
    }

    return
  }

  for (const [pathIndex, trajectory] of paths.entries()) {
    let detected = false

    for (let i = 4; i < 5; i++ ) {
      

      let strokeWidth, stroke, blurValue, disappears

      switch(i) {
      case 0:
        strokeWidth = 32
        stroke = "#2B536A"
        blurValue = 64
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
        blurValue = 2
        disappears = true
        break
      case 4:
        strokeWidth = 1
        stroke = "#fff"
        blurValue = 0
        disappears = false
        break
      }


      const path = createSVG(trajectory.dString, stroke, strokeWidth, blurValue)
      svg.appendChild(path)
      svg.style.zIndex = "100"
      svg.style.pointerEvents = "none"
      

      const canvas = document.getElementById("buffer")
      const cnvContext = canvas.getContext('2d')

      const length = path.getTotalLength();
      gsap.set(path, { 
        strokeDasharray: length,
        strokeDashoffset: length 
      })

      const groupDelay = delay * pathIndex
      
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: duration - 0.5,
        ease: "elastic.in",
        delay: groupDelay,
        immediateRender: false,

        onUpdate: function() {
          if (!detected && trajectory.detectionY !== null && this.progress() > 0.85) {
            detected = true
            detectElectron(trajectory.detectionY)
          }
        }
      })


      gsap.to(path, {
        opacity: disappears ? 0 : 0.0,
        duration: duration + 0.5,
        delay: groupDelay,
        ease: "expo.in",
        immediateRender: false,
        onComplete: () => {
          drawPointsToCanvas(cnvContext, trajectory.points, {
            stroke,
            strokeWidth,
            opacity:  disappears ? 0 : 0.1,
            blur: blurValue > 0 ? Math.min(blurValue, 16) : 0
          })
          path.remove()
        }
      })
    }
  }

  // coverLeft()
  // drawBarrier(d, slitWidth)
  // drawPlaneWaves(k0, "#fff", "2")
}

let drawStaticDiagram = (stroke, strokeWidth) => {
  const maxRadius = Math.sqrt((window.innerHeight/2 - d/2)**2 + L**2)
  const lambda = 2 * Math.PI / k0
  const maxIterations = Math.ceil(maxRadius/lambda)
  const diagram = document.getElementById("staticDiagram")
  const pixelsPerUnit = window.innerHeight > window.innerWidth ? window.innerWidth / 20 : window.innerHeight / 20

  for (let i=0; i<maxIterations; i++) {
    const radius = pixelsPerUnit * lambda * i
    const cx = window.innerHeight > window.innerWidth ? window.innerWidth/2 : window.innerHeight/2
    const cy1 = d/2 * pixelsPerUnit + window.innerHeight/2 
    const cy2 = -d/2 * pixelsPerUnit + window.innerHeight/2

    const circle1 = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    circle1.setAttribute("cx", cx.toString())
    circle1.setAttribute("cy", cy1.toString())
    circle1.setAttribute("r", radius.toString())
    circle1.setAttribute("fill", "none")
    circle1.setAttribute("stroke", stroke)
    circle1.setAttribute("strokeWidth", strokeWidth)
    circle1.setAttribute("opacity", 0.2)
    diagram.appendChild(circle1)
    // gsap.to(circle1, {
    //   opacity: 0.5,
    //   duration: 1,
    //   ease: "expo.inout",
    //   repeat: -1,
    //   yoyo: true,
    //   repeatDelay: 0,
    //   delay: 0.05 * i
    // })

    const circle2 = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    circle2.setAttribute("cx", cx.toString())
    circle2.setAttribute("cy", cy2.toString())
    circle2.setAttribute("r", radius.toString())
    circle2.setAttribute("fill", "none")
    circle2.setAttribute("stroke", stroke)
    circle2.setAttribute("strokeWidth", strokeWidth)
    circle2.setAttribute("opacity", 0.2)
    diagram.appendChild(circle2)

    // gsap.to(circle2, {
    //   opacity: 0.5,
    //   duration: 1,
    //   ease: "expo.inout",
    //   repeat: -1,
    //   yoyo: true,
    //   repeatDelay: 0,
    //   delay: 0.05 * i
    // })
  }
}



window.addEventListener('keydown', async function(e) {
  if(e.key == 'v') {
    const paths = await burst(100)
    stagger(paths)
  }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'x') {
    const paths = await burst(20)
    stagger(paths)
  }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'c') {
    const paths = await burst(5)
    stagger(paths)
  }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'z') {
    const paths = await burst(1)
    stagger(paths)
  }
})

let fire = false

const sleep = (seconds) =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000))

let fireContinuously = async () => {
  fire = true

  while (fire) {
    const path = await burst(1)
    stagger(path, bohmian)

    await sleep(0.15)
  }
}

let stopFiring = () => {
  fire = false
}

const bohmBtn = document.getElementById('toggleBohmian')
bohmBtn.addEventListener('click', () => {
  if(!bohmian) {
    bohmBtn.classList.remove('bohm-inactive')
  } else {
    bohmBtn.classList.add('bohm-inactive')
  }
  bohmian = !bohmian
})

const fireBtn = document.getElementById("fire")
const stop = document.getElementById("stop")
const play = document.getElementById("play")
fireBtn.addEventListener('click', async function (e) {
      if(!fire) {
      renderFig3()
      fireContinuously(bohmian)
      stop.style.display = "block"
      play.style.display = "none"
    } else {
      stopFiring()
      stop.style.display = "none"
      play.style.display = "block"
    }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'f') {
    if(!fire) {
      fireContinuously()
    } else {
      stopFiring()
    }
  }
})

const detectElectron = (yPercent) => {
  const canvas = document.getElementById("buffer")
  const ctx = canvas.getContext("2d")
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  // x between 100vh and 100vw
  const minX = window.innerHeight + 4
  const maxX = window.innerWidth


  const cssX = minX + Math.random() * (maxX - minX)
  const cssY = (yPercent / 100) * rect.height

  // const x = cssX * dpr
  // const y = cssY * dpr
  const x = cssX
  const y = cssY

  const dot = document.createElement("div")
  dot.classList.add("feedback")
  dot.style.left = x.toString() + "px"
  dot.style.top = yPercent.toString() + "vh"
  document.querySelector("body").appendChild(dot)

  gsap.to(dot, {
    width: "2.5rem",
    height: "2.5rem",
    opacity: .5,
    duration: .2,
    delay: .08,
    ease: "sine.inOut",
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      dot.remove()
    }
  })

  

  const hexToRgb = (hex) => {
  let h = hex.replace("#", "")

  if (h.length === 3) {
    h = h.split("").map(c => c + c).join("")
  }

  const num = parseInt(h, 16)

    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    }
  }

  const rgba = (hex, alpha = 1) => {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const addCurveStops = (gradient, color, curveFn, steps = 24) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const alpha = curveFn(t)
      gradient.addColorStop(t, rgba(color, alpha))
    }
  }

  const drawRadialDot = (radius, color, alpha = 1) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)

    const op = .5 + Math.random() / 2

    ctx.globalCompositeOperation = "screen"

    
    addCurveStops(
      gradient,
      color,
      t => Math.pow(1 - t, 3),   // cubic falloff
      32
    )

    ctx.globalAlpha = alpha * op
    ctx.fillStyle = gradient


    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  setTimeout(() => {
    drawRadialDot(3 * dpr, "#ffffff", .7)
    drawRadialDot(4 * dpr, "#94abc1", .27)
    drawRadialDot(6.5 * dpr, "#88ABBE", 0.15)
    drawRadialDot(24 * dpr, "#6D92A6", 0.009)
    drawRadialDot(248 * dpr, "#2B536A", 0.005)
  }, 100)
}


function inPixels(x) {
  return window.innerHeight * x /20
}

const drawBarrier = (d, slitWidth = 1) => {
  const diagram = document.querySelector('#staticDiagram')

  const x = window.innerHeight / 2
  const centerY = window.innerHeight / 2

  const halfGap = inPixels(d / 2)
  const halfSlit = inPixels(slitWidth / 2)

  const topSlitTop = centerY - halfGap - halfSlit
  const topSlitBottom = centerY - halfGap + halfSlit

  const bottomSlitTop = centerY + halfGap - halfSlit
  const bottomSlitBottom = centerY + halfGap + halfSlit

  const makeLine = (x1, y1, x2, y2) => {
    const ns = "http://www.w3.org/2000/svg"
    // const group = document.createElementNS(ns, "g")

    // const border = document.createElementNS(ns, "line")
    // border.setAttribute("x1", x1)
    // border.setAttribute("y1", y1)
    // border.setAttribute("x2", x2)
    // border.setAttribute("y2", y2)
    // border.setAttribute("stroke", "#050B14")
    // border.setAttribute("stroke-width", "10")
    // border.setAttribute("stroke-linecap", "round")

    const line = document.createElementNS(ns, "line")
    line.setAttribute("x1", x1)
    line.setAttribute("y1", y1)
    line.setAttribute("x2", x2)
    line.setAttribute("y2", y2)
    line.setAttribute("stroke", "rgba(255,255,255,1")
    // line.setAttribute("alpha", .1)
    line.setAttribute("stroke-width", "8")
    line.setAttribute("stroke-linecap", "round")
    line.style.zIndex = "1000000000"

    // group.appendChild(border)
    // group.appendChild(line)

    return line
  }

  // top barrier
  diagram.appendChild(
    makeLine(x, 0, x, topSlitTop)
  )

  // middle barrier between the two slits
  diagram.appendChild(
    makeLine(x, topSlitBottom, x, bottomSlitTop)
  )

  // bottom barrier
  diagram.appendChild(
    makeLine(x, bottomSlitBottom, x, window.innerHeight)
  )
}

let drawPlaneWaves = (k0, stroke, strokeWidth) => {
  const makeLine = (x1, y1, x2, y2) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', x1)
    line.setAttribute('y1', y1)
    line.setAttribute('x2', x2)
    line.setAttribute('y2', y2)
    line.setAttribute('stroke', stroke)
    line.setAttribute('stroke-width', strokeWidth)
    line.setAttribute('stroke-linecap', 'round')
    line.setAttribute("opacity", 0.2)
    return line
  }

  let x = window.innerHeight/2
  const lambda = inPixels(2 * Math.PI / k0)
  const diagram = document.querySelector('#staticDiagram')
  let first = true

  while (x > 0) {
    if (first) {
      first = false
      x -= lambda
      continue
    }
    diagram.appendChild(makeLine(x.toString(), "0", x.toString(), window.innerHeight.toString()))
    x -= lambda
  }
}

const coverLeft = () => {
  const svg = document.querySelector('#staticDiagram')
  const body = document.body

  const bg = getComputedStyle(body).backgroundColor

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')

  const h = window.innerHeight


  rect.setAttribute('x', 0)
  rect.setAttribute('y', 0)
  rect.setAttribute('width', h/2)
  rect.setAttribute('height', h)
  rect.setAttribute('fill', bg)

  svg.appendChild(rect)
}

const canvas = document.getElementById("buffer")
const cnvContext = canvas.getContext('2d')

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight

  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)

  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  cnvContext.setTransform(dpr, 0, 0, dpr, 0, 0)

  // important: clear whole canvas back to transparency
  cnvContext.clearRect(0, 0, w, h)

  // fill only x > 100vh
  cnvContext.fillStyle = "#051b30"
  cnvContext.fillRect(h, 0, w - h, h)
}

let drawPointsToCanvas = (ctx, points, {
  stroke = 'fff',
  strokeWidth = 1,
  opacity = 1,
  blur = 0
}) => {
  if(!points.length) return

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = stroke
  ctx.lineWidth = strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (blur > 0) {
    ctx.shadowBlur = blur
    ctx.shadowColor = stroke
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

let drawing = false
const lambdaSlider = document.getElementById("lambdaSlider")
const dSlider = document.getElementById("dSlider")

dSlider.oninput = event => {
  const output = document.getElementById("dN")
  output.innerHTML = event.target.value
  d = parseFloat(event.target.value)
  redraw()
}

lambdaSlider.oninput = event => {
  const output = document.getElementById("lambdaN")
  output.innerHTML = event.target.value
  k0 = 2*Math.PI / event.target.value
  redraw()
}

let renderFig3 = () => {
  const activeBtn = document.querySelector('.active-btn')
  activeBtn.classList.remove('active-btn')
  document.getElementById('fig3-btn').classList.add('active-btn')
  figureCanvas.style.display = "none"
  activeFigure = 3
  const graph = document.getElementById('probability-graph')
    if(graph !== null) {
      graph.remove()
    }
}

lambdaSlider.onchange = () => {
  switch (activeFigure) {
    case 1:
      renderFig1()
      break
    case 2:
      renderFig2()
      break
    case 3:
      renderFig3
      // renderFig3()
      break
  }
}

dSlider.onchange = () => {
  switch (activeFigure) {
    case 1:
      renderFig1()
      break
    case 2:
      renderFig2()
      break
    case 3:
      renderFig3()
      break
  }
}

let redraw = () => {
  if (drawing) return
  fire = false
  drawing = true
  cnvContext.clearRect(0, 0, canvas.width, canvas.height)
  resizeCanvas()

  const circles = document.querySelectorAll("circle")
  const lines = document.querySelectorAll("line")

  for (const circle of circles) {
    circle.remove()
  }
  for (const line of lines) {
    line.remove()
  }

  drawStaticDiagram("#fff", "2")
  coverLeft()
  drawBarrier(d, slitWidth)
  drawPlaneWaves(k0, "#fff", "2")
  

  stop.style.display = "none"
  play.style.display = "block"
  
  drawing = false
}


resizeCanvas()
drawStaticDiagram("#fff", "2")
coverLeft()
drawBarrier(d, slitWidth)
drawPlaneWaves(k0, "#fff", "2")
// resizeFigureCanvas()
figureCanvas.style.display = "block"
renderFig2()

// console.log('lambda: ' + document.getElementById('lambdaSlider').value.toString())
// console.log('d: ' + document.getElementById('dSlider').value.toString())

