import * as THREE from "three";

export function makeVelocityTexture(N) {
  const data = new Float32Array(N * N * 4); // RGBA
  const tex = new THREE.DataTexture(
    data,
    N,
    N,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { data, tex };
}

export function writeVelocityToTexture(vel, texData) {
  const count = vel.length / 2;
  for (let i = 0; i < count; i++) {
    texData[4 * i + 0] = vel[2 * i + 0]; // vx
    texData[4 * i + 1] = vel[2 * i + 1]; // vy
    texData[4 * i + 2] = 0.0;
    texData[4 * i + 3] = 1.0;
  }
}

export function createFlowParticles(count, L, velocityTex, heightTex = null) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  L = 1000

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * L;
    const y = (Math.random() - 0.5) * L;

    positions[3 * i + 0] = x;
    positions[3 * i + 1] = y;
    positions[3 * i + 2] = 0.0;

    // store initial seed in normalized [0,1] domain
    seeds[2 * i + 0] = x / L + 0.5;
    seeds[2 * i + 1] = y / L + 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 2));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uVelocityTex: { value: velocityTex },
      uHeightTex: { value: heightTex },
      uTime: { value: 0 },
      uDomainSize: { value: L },
      uStepScale: { value: 0.0015 },     // tune this
      uLift: { value: 0.05 },          // hover above surface
      uPointSize: { value: 2.5 },
      uUseHeight: { value: heightTex ? 1 : 0 },
    },
    vertexShader: `
      attribute vec2 seed;

      uniform sampler2D uVelocityTex;
      uniform sampler2D uHeightTex;
      uniform float uTime;
      uniform float uDomainSize;
      uniform float uStepScale;
      uniform float uLift;
      uniform float uPointSize;
      uniform int uUseHeight;

      varying float vSpeed;

      vec2 sampleVel(vec2 uv) {
        return texture2D(uVelocityTex, uv).xy;
      }

      float sampleHeight(vec2 uv) {
        return texture2D(uHeightTex, uv).r;
      }

      void main() {
        vec2 uv = seed;

        // Cheap short streamline: a few Euler steps.
        // 4 steps is a good start.
        vec2 p = uv;
        float speed = 0.0;

        for (int i = 0; i < 4; i++) {
          vec2 v = sampleVel(p);
          speed = length(v);
          p += uStepScale * 0.02 * v;
          p = fract(p); // wrap around domain
        }

        vec2 xy = (p - 0.5) * uDomainSize;
        float z = 0.0;

        if (uUseHeight == 1) {
          z = sampleHeight(p) + uLift;
        }

        vSpeed = speed;

        vec4 mvPosition = modelViewMatrix * vec4(xy.x, xy.y, z, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uPointSize;
      }
    `,
    fragmentShader: `
      varying float vSpeed;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c);
        if (r2 > 0.25) discard;

        float a = smoothstep(0.25, 0.0, r2);
        gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6 * a);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

export function makeScalarTexture(N) {
  const data = new Float32Array(N * N * 4);
  const tex = new THREE.DataTexture(
    data,
    N,
    N,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { data, tex };
}

export function writeScalarToTexture(values, texData) {
  for (let i = 0; i < values.length; i++) {
    texData[4 * i + 0] = values[i];
    texData[4 * i + 1] = 0.0;
    texData[4 * i + 2] = 0.0;
    texData[4 * i + 3] = 1.0;
  }
}

export function getDisplayedHeight(surfaceData) {
  const { complex } = surfaceData;
  const size = complex.length / 2;

  const height = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const re = complex[2 * i];
    const im = complex[2 * i + 1];

    // pick your visualization:

    // real part
    // height[i] = re;

    // imaginary part
    height[i] =  im * 400;

    // probability density (physically meaningful)
    // height[i] = (re * re + im * im) * 100;
  }

  return height;
}