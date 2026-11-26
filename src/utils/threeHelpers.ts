import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function detectSoftwareWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName)) {
        return true;
      }
    }
  } catch {
    // Ignore extension query failures
  }
  return false;
}

export interface ConfiguredRendererResult {
  renderer: THREE.WebGLRenderer;
  isSoftwareGl: boolean;
  pmremTarget: THREE.WebGLRenderTarget;
  dispose: () => void;
}

export function createConfiguredRenderer(
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  width: number,
  height: number
): ConfiguredRendererResult {
  const probeCanvas = document.createElement('canvas');
  const probeGl =
    probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  const isSoftwareGl = probeGl ? detectSoftwareWebGL(probeGl) : false;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSoftwareGl,
    powerPreference: isSoftwareGl ? 'default' : 'high-performance',
    stencil: false,
  });

  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !isSoftwareGl;
  if (!isSoftwareGl) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const pmremTarget = pmrem.fromScene(roomEnv, 0.04);
  scene.environment = pmremTarget.texture;
  scene.environmentIntensity = 0.65;
  roomEnv.dispose();
  pmrem.dispose();

  return {
    renderer,
    isSoftwareGl,
    pmremTarget,
    dispose: () => {
      pmremTarget.dispose();
      renderer.dispose();
    },
  };
}

/**
 * Software-WebGL-safe frame pacing helper (prevents SwiftShader from starving
 * Playwright screenshots or event loop while keeping hardware WebGL at 60Hz).
 */
export function scheduleNextFrame(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  onTick: () => void
): () => void {
  let cancelled = false;
  let rafId = 0;
  let timerId = 0;

  if (!isSoftwareGl) {
    rafId = requestAnimationFrame(() => {
      if (!cancelled) onTick();
    });
  } else {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (sync) {
      gl.flush();
      const poll = () => {
        if (cancelled) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) {
          timerId = window.setTimeout(poll, 16);
        } else {
          gl.deleteSync(sync);
          timerId = window.setTimeout(() => {
            if (!cancelled) onTick();
          }, 65);
        }
      };
      timerId = window.setTimeout(poll, 16);
    } else {
      timerId = window.setTimeout(() => {
        if (!cancelled) onTick();
      }, 80);
    }
  }

  return () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
  };
}

export function makeRadialShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.58)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeAsphaltTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#252932';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const v = 30 + (i % 18);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function makeBuildingFacadeTexture(
  baseHex: string,
  litHex: string,
  maxAniso: number
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  const cols = 8;
  const rows = 12;
  const padX = 6;
  const padY = 5;
  const cellW = 256 / cols;
  const cellH = 256 / rows;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const hash = (r * 31 + col * 17) % 11;
      if (hash < 4) {
        ctx.fillStyle = litHex;
      } else if (hash < 7) {
        ctx.fillStyle = '#1b2638';
      } else {
        ctx.fillStyle = '#0f1622';
      }
      ctx.fillRect(col * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function makeSandstoneTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8b08a';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle masonry block lines & grain
  ctx.strokeStyle = 'rgba(110, 88, 56, 0.28)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 1800; i++) {
    const x = (i * 89) % 256;
    const y = (i * 53) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,245,220,0.09)' : 'rgba(95,72,44,0.09)';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function makeWoodCrateTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9c6f3e';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#634321';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(120, 120);
  ctx.moveTo(120, 8);
  ctx.lineTo(8, 120);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,45,20,0.35)';
  ctx.lineWidth = 2;
  for (let y = 18; y < 114; y += 16) {
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(118, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function makeCourtyardGroundTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c4ab82';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2600; i++) {
    const x = (i * 97) % 256;
    const y = (i * 61) % 256;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,244,218,0.12)' : 'rgba(110,88,58,0.1)';
    ctx.fillRect(x, y, 3, 2);
  }
  ctx.strokeStyle = 'rgba(115,92,62,0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function createSkyDome(
  topColor: string,
  horizonColor: string,
  radius = 360
): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, topColor);
  grad.addColorStop(0.55, topColor);
  grad.addColorStop(0.88, horizonColor);
  grad.addColorStop(1, horizonColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
}

