(async () => {
  await tf.ready();
  let backend = 'cpu';
  for (const name of ['webgpu','webgl','wasm','cpu']) { try { if (await tf.setBackend(name)) { backend = name; break; } } catch {} }

  function resizeCanvas() {
      const canvas = document.getElementById('plot')
      const ctx = canvas.getContext('2d')
    
      canvas.style.width = '100vw'
      canvas.style.height = '100vh'
    
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
    
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const Nx = 2048
      const Ny = Math.round(2048 * rect.height / rect.width)
      const Lx = 30
      const Ly = Lx * Ny / Nx


      return{ W: rect.width, H: rect.height}
  }

  let { W, H} = resizeCanvas()
  window.addEventListener("resize", () => ({ W, H} = resizeCanvas()))

  console.log(backend)


  const L = 30
  const N = 2048
  const dx = L/N
  const dt = 0.15

  const x0 = 0
  const y0 = 0

  const sigmaX = 2.25
  const sigmaY = sigmaX

  const canvas = document.getElementById('plot')
  const ctx = canvas.getContext('2d')

  let initializePsi = () => {
    return tf.tidy(() => {
        const x = tf.linspace(-L/2, L/2, N)
        const y = tf.linspace(-L/2, L/2, N)

        const X = x.reshape([1, N]).tile([N,1])
        const Y = y.reshape([N,1]).tile([1,N])

        // psi(x,y,0) =m exp(-((x-x0)/4sigmaX)^2 - ((y-y0)/4sigmaY)^2)
        const gaussianX = X.sub(x0).div(sigmaX).square().mul(0.25)
        const gaussianY = Y.sub(y0).div(sigmaY).square().mul(0.25)

        const psi = gaussianX.add(gaussianY).neg().exp()

        return psi
    })
  }

  let drawPsi = (psi) => {
    const intensity = tf.tidy(() => psi.square())

    const data = intensity.dataSync()
    intensity.dispose()

    let maxValue = 0
    for (let i=0; i < data.length; i++) {
        if(data[i] > maxValue) {
            maxValue = data[i]
        }
    }
    const inverse = maxValue > 0 ? (1 / maxValue) : 1

    const img = ctx.createImageData(N,N)
    const pix = img.data

    for (let i=0; i<data.length; i++) {
        const value = Math.max(0, Math.min(1, data[i] * inverse))
        const color = (value * 255) | 0

        const p = i * 4
        pix[p] = color
        pix[p + 1] = color
        pix[p + 2] = color
        pix[p + 3] = 255
    }

    // ops dette må ryddes opp hvis drawPsi skal kalles flere ganger
    const offScreen = document.createElement('canvas')
    offScreen.width = N
    offScreen.height = N
    const offCtx = offScreen.getContext('2d')
    offCtx.putImageData(img, 0, 0)

    const S = Math.min(W, H)
    const ox = (W-S) * 0.5
    const oy = (H-S) * 0.5

    ctx.save()
    // ctx.setTransform(1,0,0,1,0,0)
    // ctx.imageSmoothingEnabled = false
    ctx.clearRect(0,0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'
    ctx.fillRect(0,0,W,H)
    ctx.drawImage(offScreen,ox,oy,S,S)
    ctx.restore()
  }

  const psi = initializePsi()
  drawPsi(psi)

})()