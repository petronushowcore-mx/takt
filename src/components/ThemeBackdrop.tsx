import { useEffect, useRef } from 'react'

// Drawing algorithm from PETRONUS site, src/components/EchoBackground.tsx at f39b5c7.
export default function ThemeBackdrop({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animId = 0
    let lastFrame = Number.NEGATIVE_INFINITY
    let W = 0, H = 0, cols = 0, rows = 0

    const PN = new Uint8Array(512)
    const G3 = [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]
    const perm = Array.from({ length: 256 }, (_, i) => i)
    let seed = 42
    for (let ii = 255; ii > 0; ii--) { seed = (seed * 16807) % 2147483647; const jj = seed % (ii + 1); const tmp = perm[ii]; perm[ii] = perm[jj]; perm[jj] = tmp }
    for (let ii2 = 0; ii2 < 512; ii2++) PN[ii2] = perm[ii2 & 255]

    const MS: number[][][] = [
      [],[[3,2]],[[2,1]],[[3,1]],[[1,0]],[[1,0],[3,2]],[[2,0]],[[3,0]],
      [[0,3]],[[0,2]],[[0,1],[2,3]],[[0,1]],[[1,3]],[[1,2]],[[2,3]],[]
    ]

    const CS = 4, NL = 18, NS = 0.004, TS = 0.000075, CR = 280, CSTR = 0.55
    const isLight = theme === 'light'
    const GA = isLight ? [140, 110, 30] : [195, 155, 42]
    const GB = isLight ? [170, 135, 40] : [220, 175, 50]
    const bgColor = isLight ? '#FAFAF8' : '#0A0A0A'

    function fd(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
    function n2(x: number, y: number) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
      x = x - Math.floor(x); y = y - Math.floor(y)
      const u = fd(x), v = fd(y)
      function dot(h: number, x2: number, y2: number) { return G3[h][0] * x2 + G3[h][1] * y2 }
      function mix(a: number, b: number, t: number) { return a + t * (b - a) }
      return mix(
        mix(dot(PN[PN[X] + Y] & 7, x, y), dot(PN[PN[X + 1] + Y] & 7, x - 1, y), u),
        mix(dot(PN[PN[X] + Y + 1] & 7, x, y - 1), dot(PN[PN[X + 1] + Y + 1] & 7, x - 1, y - 1), u), v
      )
    }
    function fbm(x: number, y: number, o: number) {
      let v = 0, a = 1, f = 1, m = 0
      for (let i = 0; i < o; i++) { v += n2(x * f, y * f) * a; m += a; a *= 0.5; f *= 2.1 }
      return v / m
    }
    function edgePt(edge: number, i: number, j: number, t01: number, t12: number, t23: number, t30: number) {
      const x = i * CS, y = j * CS
      if (edge === 0) return [x + t01 * CS, y]
      if (edge === 1) return [x + CS, y + t12 * CS]
      if (edge === 2) return [x + (1 - t23) * CS, y + CS]
      if (edge === 3) return [x, y + (1 - t30) * CS]
      return null
    }

    let echoes: Array<{x: number, y: number, t0: number}> = []
    let lastE = 0
    let hBuf: Float32Array | null = null

    function resize() {
      W = window.innerWidth; H = window.innerHeight
      canvas!.width = W; canvas!.height = H
      cols = Math.ceil(W / CS) + 2
      rows = Math.ceil(H / CS) + 2
      hBuf = new Float32Array((cols + 1) * (rows + 1))
    }
    function draw(t: number) {
      ctx!.fillStyle = bgColor
      ctx!.fillRect(0, 0, W, H)
      const mx = motion.matches ? -9999 : mouseRef.current.x
      const my = mouseRef.current.y

      if (mx > -999 && t - lastE > 450) {
        echoes.push({ x: mx, y: my, t0: t })
        lastE = t
        if (echoes.length > 10) echoes.shift()
      }

      const tO = t * TS
      const stride = cols + 1

      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const px = i * CS, py = j * CS
          let h = fbm(px * NS + tO, py * NS + tO * 0.6, 5)
          h += fbm(px * NS * 0.4 - tO * 0.8, py * NS * 0.4 + tO * 0.5, 3) * 0.5
          h += Math.sin(px * 0.002 + t * 0.0003) * Math.cos(py * 0.0018 - t * 0.0002) * 0.15

          // Hero stabilization zone: concentric structure at top-center
          const hcx = W / 2, hcy = 280
          const hd = Math.sqrt((px - hcx) * (px - hcx) + (py - hcy) * (py - hcy))
          const heroR = 340
          if (hd < heroR) {
            const hf = 1 - hd / heroR
            const smooth = hf * hf * (3 - 2 * hf)
            h += Math.sin(hd * 0.035 - t * 0.0003) * smooth * 0.45
            h += Math.sin(t * 0.0005) * 0.06 * smooth
          }

          if (mx > -999) {
            const dx = px - mx, dy = py - my, d = Math.sqrt(dx * dx + dy * dy)
            if (d < CR) { const f2 = 1 - d / CR; h += f2 * f2 * (3 - 2 * f2) * CSTR }
          }

          for (let e = 0; e < echoes.length; e++) {
            const ec = echoes[e], age = t - ec.t0
            if (age > 3000) continue
            const pr = age / 3000, rr = pr * 400, rw = 50 + pr * 90
            const edx = px - ec.x, edy = py - ec.y, ed = Math.sqrt(edx * edx + edy * edy)
            const rd = Math.abs(ed - rr)
            if (rd < rw) { const rf = 1 - rd / rw; h += rf * rf * (1 - pr) * (1 - pr) * 0.35 }
          }

          hBuf![j * stride + i] = h
        }
      }

      for (let ei = echoes.length - 1; ei >= 0; ei--) {
        if (t - echoes[ei].t0 > 3000) echoes.splice(ei, 1)
      }

      const hMin = -1.2, hMax = 1.2
      for (let lv = 0; lv < NL; lv++) {
        const thr = hMin + (hMax - hMin) * (lv + 1) / (NL + 1)
        const ln = lv / (NL - 1)
        const baseA = 0.18 + ln * ln * 0.42
        const cr = Math.round(GA[0] + (GB[0] - GA[0]) * ln * 0.7)
        const cg = Math.round(GA[1] + (GB[1] - GA[1]) * ln * 0.7)
        const cb = Math.round(GA[2] + (GB[2] - GA[2]) * ln * 0.5)
        const thick = lv % 4 === 0 ? 1.2 : 0.6

        ctx!.lineWidth = thick
        ctx!.lineCap = 'round'
        ctx!.beginPath()

        for (let j2 = 0; j2 < rows; j2++) {
          for (let i2 = 0; i2 < cols; i2++) {
            const idx = j2 * stride + i2
            const v0 = hBuf![idx], v1 = hBuf![idx + 1], v2 = hBuf![idx + stride + 1], v3 = hBuf![idx + stride]
            let c = 0
            if (v0 >= thr) c |= 8
            if (v1 >= thr) c |= 4
            if (v2 >= thr) c |= 2
            if (v3 >= thr) c |= 1
            if (c === 0 || c === 15) continue

            const segs = MS[c]
            const t01 = (Math.abs(v1 - v0) < 1e-5) ? 0.5 : (thr - v0) / (v1 - v0)
            const t12 = (Math.abs(v2 - v1) < 1e-5) ? 0.5 : (thr - v1) / (v2 - v1)
            const t23 = (Math.abs(v3 - v2) < 1e-5) ? 0.5 : (thr - v2) / (v3 - v2)
            const t30 = (Math.abs(v0 - v3) < 1e-5) ? 0.5 : (thr - v3) / (v0 - v3)

            for (let s = 0; s < segs.length; s++) {
              const seg = segs[s]
              const p1 = edgePt(seg[0], i2, j2, t01, t12, t23, t30)
              const p2 = edgePt(seg[1], i2, j2, t01, t12, t23, t30)
              if (!p1 || !p2) continue
              ctx!.moveTo(p1[0], p1[1])
              ctx!.lineTo(p2[0], p2[1])
            }
          }
        }

        let alpha = baseA
        if (mx > -999) alpha = baseA * 1.1
        ctx!.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha + ')'
        ctx!.stroke()

        if (mx > -999) {
          ctx!.beginPath()
          for (let j3 = 0; j3 < rows; j3++) {
            for (let i3 = 0; i3 < cols; i3++) {
              const cx2 = i3 * CS + CS / 2, cy2 = j3 * CS + CS / 2
              const dd = Math.sqrt((cx2 - mx) * (cx2 - mx) + (cy2 - my) * (cy2 - my))
              if (dd > CR * 1.2) continue
              const idx2 = j3 * stride + i3
              const w0 = hBuf![idx2], w1 = hBuf![idx2 + 1], w2 = hBuf![idx2 + stride + 1], w3 = hBuf![idx2 + stride]
              let cc = 0
              if (w0 >= thr) cc |= 8; if (w1 >= thr) cc |= 4; if (w2 >= thr) cc |= 2; if (w3 >= thr) cc |= 1
              if (cc === 0 || cc === 15) continue
              const segs2 = MS[cc]
              const u01 = (Math.abs(w1 - w0) < 1e-5) ? 0.5 : (thr - w0) / (w1 - w0)
              const u12 = (Math.abs(w2 - w1) < 1e-5) ? 0.5 : (thr - w1) / (w2 - w1)
              const u23 = (Math.abs(w3 - w2) < 1e-5) ? 0.5 : (thr - w2) / (w3 - w2)
              const u30 = (Math.abs(w0 - w3) < 1e-5) ? 0.5 : (thr - w3) / (w0 - w3)
              for (let s2 = 0; s2 < segs2.length; s2++) {
                const seg2 = segs2[s2]
                const q1 = edgePt(seg2[0], i3, j3, u01, u12, u23, u30)
                const q2 = edgePt(seg2[1], i3, j3, u01, u12, u23, u30)
                if (!q1 || !q2) continue
                ctx!.moveTo(q1[0], q1[1])
                ctx!.lineTo(q2[0], q2[1])
              }
            }
          }
          const proxA = Math.min(0.45, baseA + 0.3 * ln)
          ctx!.strokeStyle = 'rgba(' + GB[0] + ',' + GB[1] + ',' + GB[2] + ',' + proxA + ')'
          ctx!.lineWidth = thick + 0.4
          ctx!.stroke()
        }
      }

      if (mx > -999) {
        const grad = ctx!.createRadialGradient(mx, my, 0, mx, my, 80)
        grad.addColorStop(0, 'rgba(200,150,42,0.04)')
        grad.addColorStop(1, 'rgba(200,150,42,0)')
        ctx!.fillStyle = grad
        ctx!.fillRect(mx - 80, my - 80, 160, 160)
      }
    }

    function frame(t: number) {
      // MCC uses the same low frame cadence for its decorative background.
      if (t - lastFrame >= 40) {
        draw(t)
        lastFrame = t
      }
      animId = requestAnimationFrame(frame)
    }

    function updateMotion() {
      cancelAnimationFrame(animId)
      if (document.hidden) return
      if (motion.matches) {
        echoes = []
        lastE = 0
        draw(0)
      } else {
        lastFrame = Number.NEGATIVE_INFINITY
        animId = requestAnimationFrame(frame)
      }
    }

    function handleResize() {
      resize()
      if (document.hidden) return
      if (motion.matches) draw(0)
      else lastFrame = Number.NEGATIVE_INFINITY
    }

    const handleMouse = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY }
    }
    const handleLeave = () => { mouseRef.current = { x: -9999, y: -9999 } }

    resize()
    updateMotion()
    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouse)
    window.addEventListener('mouseleave', handleLeave)
    document.addEventListener('visibilitychange', updateMotion)
    motion.addEventListener('change', updateMotion)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouse)
      window.removeEventListener('mouseleave', handleLeave)
      document.removeEventListener('visibilitychange', updateMotion)
      motion.removeEventListener('change', updateMotion)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="theme-backdrop" data-testid="theme-backdrop" aria-hidden="true" />
}
