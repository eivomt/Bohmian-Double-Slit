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


let paused = false

const d = 5
const sigma = 2.525
const k0 = 8
const dt = 1e-2
const L = 10


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

  let createdPaths = []

  let strokeWidth, stroke, blurValue, disappears
  const duration = .75

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
    // const path = getTrajectory(scaleX(e.clientX), .5,0, d, sigma, k0, stroke, strokeWidth, blurValue)
    // const path = getTrajectory(e.clientX, e.clientY,0, d, sigma, k0, "#fff", 8, 0)
    createdPaths.push(path)


    svg.appendChild(path)

    const length = path.getTotalLength();
    gsap.set(path, { 
      strokeDasharray: length,
      strokeDashoffset: length 
    });
    gsap.to(path, { 
      strokeDashoffset: 0, 
      duration: duration, 
      ease: "elastic.in",
      immediateRender: false
    });
    gsap.to(path, {
      filter: "blur(1px)",
      duration: duration + .15,
      ease: "elastic.in",
      immediateRender: false
    });
    if (disappears) {
      gsap.to(path, {
        opacity: 0,
        duration: duration + .15,
        ease: "expo.in",
        immediateRender: false
      });
    } else {
      gsap.to(path, {
        opacity: 0.0,
        duration: duration + .15,
        ease: "expo.in",
        immediateRender: false
      });
    }


  }

  // setTimeout(() => {
  //   createdPaths.forEach(path => path.remove());
  // }, duration * 1000 + 250);
  setTimeout(() => {
    createdPaths.forEach(path => path.remove());
  }, duration * 1000 + 250);


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
  return (x + L) * (window.innerHeight > window.innerWidth ?  (window.innerWidth/20) : (window.innerHeight/20))
}
let pixelValueY = (y) => {
  return window.innerHeight - (y + L) * (window.innerHeight > window.innerWidth ?  (window.innerWidth/20) : (window.innerHeight/20))
}




let getTrajectory = (x,y,t,d,sigma,k0,stroke,strokeWidth,blurValue) => {
  let position = [x,y]
  let dString = ""
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
    }

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

      const w = boundaryFlux(x, y, t, d, sigma, k0, 'top')
      weights.push({x, y, t, w })

      total += w
    }

    for(let l=0; l < ySteps/2; l++) {
      const y = -L
      const x = l*dx

      const w = boundaryFlux(x, y, t, d, sigma, k0, 'bottom')
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


let getBackwardTrajectory = (x, y, t, d, sigma, k0, stroke, strokeWidth, blurValue, xStop = 0) => {
  let position = [x, y]
  let dString = ""
  let steps = 0
  const MAX_STEPS = 10000

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

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", dString.trim())
  path.setAttribute("fill", "none")
  path.setAttribute("stroke", stroke)
  path.setAttribute("opacity", ".9")
  path.setAttribute("stroke-width", strokeWidth)
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.style.filter = `blur(${blurValue}px)`

  return path
};

async function burst(N) {
  return new Promise((resolve) => {
    const svg = document.getElementById('trajectory')
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
      const duration = .5

      for (let j = 4; j<5; j++) {
        switch(j) {
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

        const path = getBackwardTrajectory(
          event.x,
          event.y,
          event.t,
          d,
          sigma,
          k0,
          stroke,
          strokeWidth,
          blurValue,
          0
        )
        if (!path) continue

        svg.appendChild(path)
        paths.push(path)

        const length = path.getTotalLength();
        // gsap.set(path, { 
        //   strokeDasharray: length,
        //   strokeDashoffset: length 
        // });
        // gsap.to(path, { 
        //   strokeDashoffset: 0, 
        //   duration: duration, 
        //   ease: "elastic.in",
        //   immediateRender: false
        // });
        gsap.to(path, {
          filter: "blur(1px)",
          duration: duration + .15,
          ease: "expo.in",
          immediateRender: false
        });
        if (disappears) {
          gsap.to(path, {
            opacity: 0,
            duration: duration + .15,
            ease: "expo.in",
            immediateRender: false
          });
        } else {
          gsap.to(path, {
            opacity: 1.0,
            duration: duration + .15,
            ease: "expo.in",
            immediateRender: false
          });
        }
      }
    }
    resolve(paths)
  })
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

drawStaticDiagram("#fff", "2")

window.addEventListener('keydown', async function(e) {
  if(e.key == 'x') {
    const paths = await burst(20)
  }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'c') {
    const paths = await burst(5)
  }
})

window.addEventListener('keydown', async function(e) {
  if(e.key == 'z') {
    const paths = await burst(1)
  }
})