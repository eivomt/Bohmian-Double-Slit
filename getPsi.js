export function getPsiAndGrad(N, d, sigma, k0, t) {
  const size = N * N;
  const L = 10;

  // total field
  const psi = new Float32Array(size * 2);   // [Re, Im]

  // total gradient
  const grad = new Float32Array(size * 4);  // [dΨ/dx Re, dΨ/dx Im, dΨ/dy Re, dΨ/dy Im]

  // optional velocity field
  const vel = new Float32Array(size * 2);   // [vx, vy]

  const x1 = -d / 2, y1 = 0;
  const x2 =  d / 2, y2 = 0;

  const k1 = k0;
  const k2 = k0;

  let i = 0;

  for (let iy = 0; iy < N; iy++) {
    const y = (iy / (N - 1) - 0.5) * L;

    for (let ix = 0; ix < N; ix++, i++) {
      const x = (ix / (N - 1) - 0.5) * L;

      const p1 = evolvedPacketWithGrad(x, y, t, x1, y1, sigma, k1);
      const p2 = evolvedPacketWithGrad(x, y, t, x2, y2, sigma, k2);

      // Ψ = (ψ1 + ψ2)/sqrt(2)
      const re   = (p1.re   + p2.re)   * Math.SQRT1_2;
      const im   = (p1.im   + p2.im)   * Math.SQRT1_2;
      const dxRe = (p1.dxRe + p2.dxRe) * Math.SQRT1_2;
      const dxIm = (p1.dxIm + p2.dxIm) * Math.SQRT1_2;
      const dyRe = (p1.dyRe + p2.dyRe) * Math.SQRT1_2;
      const dyIm = (p1.dyIm + p2.dyIm) * Math.SQRT1_2;

      psi[2 * i] = re;
      psi[2 * i + 1] = im;

      grad[4 * i] = dxRe;
      grad[4 * i + 1] = dxIm;
      grad[4 * i + 2] = dyRe;
      grad[4 * i + 3] = dyIm;

      // v = Im(∇Ψ / Ψ)
      const denom = re * re + im * im;

      if (denom > 1e-12) {
        // (dΨ/dx)/Ψ
        const qxRe = (dxRe * re + dxIm * im) / denom;
        const qxIm = (dxIm * re - dxRe * im) / denom;

        // (dΨ/dy)/Ψ
        const qyRe = (dyRe * re + dyIm * im) / denom;
        const qyIm = (dyIm * re - dyRe * im) / denom;

        vel[2 * i] = qxIm;
        vel[2 * i + 1] = qyIm;
      } else {
        vel[2 * i] = 0;
        vel[2 * i + 1] = 0;
      }
    }
  }

  return { psi, grad, vel, N, L };
}

export function evolvedPacketWithGrad(x, y, t, x0, y0, sigma, k) {
  const s2 = sigma * sigma;

  // a = 1 + i t/sigma^2
  const aRe = 1.0;
  const aIm = t / s2;

  const aDen = aRe * aRe + aIm * aIm;
  const invARe = aRe / aDen;
  const invAIm = -aIm / aDen;

  // prefactor = 1 / (sqrt(pi) sigma a)
  const prefScale = 1 / (Math.sqrt(Math.PI) * sigma);
  const prefRe = prefScale * invARe;
  const prefIm = prefScale * invAIm;

  // envelope coordinates
  const X = x - x0;
  const Y = y - y0 - k * t;

  const r2 = X * X + Y * Y;

  // gaussian exponent = -r2 / (2 sigma^2 a)
  const c = -r2 / (2 * s2);
  const gExpRe = c * invARe;
  const gExpIm = c * invAIm;

  const gMag = Math.exp(gExpRe);
  const gRe = gMag * Math.cos(gExpIm);
  const gIm = gMag * Math.sin(gExpIm);

  // phase = exp(i k r), with r from unshifted center
  const RX = x - x0;
  const RY = y - y0;
  const r = Math.hypot(RX, RY);
  const safeR = Math.max(r, 1e-12);

  const theta = k * r;
  const phRe = Math.cos(theta);
  const phIm = Math.sin(theta);

  // psi = pref * gauss * phase
  const pgRe = prefRe * gRe - prefIm * gIm;
  const pgIm = prefRe * gIm + prefIm * gRe;

  const re = pgRe * phRe - pgIm * phIm;
  const im = pgRe * phIm + pgIm * phRe;

  // log-gradient components:
  // Cx = -(x-x0)/(sigma^2 a) + i k (x-x0)/r
  // Cy = -(y-y0-k t)/(sigma^2 a) + i k (y-y0)/r

  const envXRe = -(X / s2) * invARe;
  const envXIm = -(X / s2) * invAIm;

  const envYRe = -(Y / s2) * invARe;
  const envYIm = -(Y / s2) * invAIm;

  const phXRe = 0.0;
  const phXIm = k * RX / safeR;

  const phYRe = 0.0;
  const phYIm = k * RY / safeR;

  const CxRe = envXRe + phXRe;
  const CxIm = envXIm + phXIm;

  const CyRe = envYRe + phYRe;
  const CyIm = envYIm + phYIm;

  // dΨ/dx = Cx * Ψ
  const dxRe = CxRe * re - CxIm * im;
  const dxIm = CxRe * im + CxIm * re;

  // dΨ/dy = Cy * Ψ
  const dyRe = CyRe * re - CyIm * im;
  const dyIm = CyRe * im + CyIm * re;

  return { re, im, dxRe, dxIm, dyRe, dyIm };
}

