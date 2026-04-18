import { useEffect, useRef } from 'react';

/**
 * Finance-themed animated background.
 *
 * Visual vocabulary:
 *   - Faint horizontal chart grid (trading-terminal feel).
 *   - A handful of slow random-walk "stock" lines scrolling left, tinted
 *     green if the visible segment trends up, red if it trends down, with
 *     a subtle area-fill gradient underneath.
 *   - A few sparse candlestick marks rotating in/out at random positions.
 *
 * Runs on a single canvas behind all content (z-index: 0, pointer-events: none).
 */
export default function AnimatedBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const GREEN = '0, 200, 150';
    const RED = '255, 92, 92';
    const GRID_COLOR = 'rgba(255, 255, 255, 0.025)';
    const GRID_STEP = 80;

    // Random-walk line generator
    const makeLine = (width, height, opts = {}) => {
      const pointCount = Math.ceil(width / 4) + 160; // extra tail so it scrolls off-screen
      const centerY = opts.centerY ?? height * (0.25 + Math.random() * 0.5);
      const vrange = opts.vrange ?? height * 0.12;
      const points = new Float32Array(pointCount);

      // seed walk
      let v = centerY + (Math.random() - 0.5) * vrange;
      for (let i = 0; i < pointCount; i++) {
        const drift = (centerY - v) * 0.003; // mean-reverting
        v += (Math.random() - 0.5) * 2.2 + drift;
        // clamp softly within band
        if (v < centerY - vrange) v = centerY - vrange;
        if (v > centerY + vrange) v = centerY + vrange;
        points[i] = v;
      }

      return {
        points,
        offset: -Math.random() * 800, // stagger start
        speed: 0.18 + Math.random() * 0.25,
        stride: 4,
        baseline: centerY + vrange + 10,
      };
    };

    // Candlestick model
    const makeCandle = (width, height) => {
      const up = Math.random() > 0.5;
      const mid = Math.random() * height;
      const bodyH = 10 + Math.random() * 40;
      const wickH = bodyH + 8 + Math.random() * 20;
      return {
        x: Math.random() * width,
        y: mid,
        bodyH,
        wickH,
        up,
        life: 0,
        maxLife: 600 + Math.random() * 800,
      };
    };

    let lines = [];
    let candles = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * DPR;
      canvas.height = height * DPR;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const isMobile = width < 768;
      const lineCount = isMobile ? 3 : 5;
      lines = Array.from({ length: lineCount }, () => makeLine(width, height));
      const candleCount = isMobile ? 5 : 10;
      candles = Array.from({ length: candleCount }, () => makeCandle(width, height));
    };

    resize();

    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const drawGrid = () => {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = GRID_STEP / 2; y < height; y += GRID_STEP) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    };

    const drawLine = (line) => {
      const { points, stride, baseline } = line;
      const start = Math.max(0, Math.floor(line.offset / stride));
      const startX = -((line.offset % stride) + stride) % stride;

      // compute slope over last visible ~240px to decide tint
      const visibleCount = Math.min(points.length - start, Math.ceil(width / stride));
      if (visibleCount < 4) return;
      const slopeSample = Math.min(60, visibleCount - 1);
      const yStart = points[start + visibleCount - 1 - slopeSample];
      const yEnd = points[start + visibleCount - 1];
      const trendColor = yEnd < yStart ? GREEN : RED; // canvas y is inverted

      // area fill underneath
      const grad = ctx.createLinearGradient(0, 0, 0, baseline);
      grad.addColorStop(0, `rgba(${trendColor}, 0.06)`);
      grad.addColorStop(1, `rgba(${trendColor}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(startX, baseline);
      for (let i = 0; i < visibleCount; i++) {
        const x = startX + i * stride;
        ctx.lineTo(x, points[start + i]);
      }
      ctx.lineTo(startX + (visibleCount - 1) * stride, baseline);
      ctx.closePath();
      ctx.fill();

      // stroke on top
      ctx.strokeStyle = `rgba(${trendColor}, 0.18)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < visibleCount; i++) {
        const x = startX + i * stride;
        const y = points[start + i];
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const drawCandle = (c) => {
      // fade in/out around midpoint of life
      const phase = c.life / c.maxLife;
      const alpha =
        phase < 0.2 ? phase / 0.2 :
        phase > 0.8 ? (1 - phase) / 0.2 : 1;
      const color = c.up ? GREEN : RED;

      ctx.strokeStyle = `rgba(${color}, ${0.12 * alpha})`;
      ctx.lineWidth = 1;
      // wick
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - c.wickH / 2);
      ctx.lineTo(c.x, c.y + c.wickH / 2);
      ctx.stroke();

      // body
      ctx.fillStyle = `rgba(${color}, ${0.10 * alpha})`;
      ctx.fillRect(c.x - 3, c.y - c.bodyH / 2, 6, c.bodyH);
      ctx.strokeRect(c.x - 3, c.y - c.bodyH / 2, 6, c.bodyH);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      drawGrid();

      for (const line of lines) {
        line.offset += line.speed;
        drawLine(line);
        // regenerate line when its tail has scrolled far enough
        if (line.offset > line.points.length * line.stride - width - 200) {
          const fresh = makeLine(width, height);
          line.points = fresh.points;
          line.offset = 0;
          line.baseline = fresh.baseline;
        }
      }

      for (let i = 0; i < candles.length; i++) {
        candles[i].life++;
        drawCandle(candles[i]);
        if (candles[i].life > candles[i].maxLife) {
          candles[i] = makeCandle(width, height);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
