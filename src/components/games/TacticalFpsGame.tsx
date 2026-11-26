import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ActorState,
  TeamSide,
  WEAPONS,
  WeaponId,
  applyDamageToActor,
  castBulletRay,
  createActor,
  createTacticalMap,
  hasLineOfSight,
  resolveActorMovement,
} from '../../games/tacticalfps/engine';
import {
  createConfiguredRenderer,
  createSkyDome,
  makeCourtyardGroundTexture,
  makeRadialShadowTexture,
  makeSandstoneTexture,
  makeWoodCrateTexture,
  scheduleNextFrame,
} from '../../utils/threeHelpers';
import { soundFX } from '../../utils/sound';

interface TacticalFpsGameProps {
  onRecordUpdate: (stats: {
    killsDelta: number;
    deathsDelta: number;
    headshotsDelta: number;
    roundsWonDelta: number;
  }) => void;
}

interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  killerTeam: TeamSide;
}

interface FpsHudSnapshot {
  phase: 'title' | 'playing' | 'round_end' | 'match_end';
  playerTeam: TeamSide;
  matchMode: '5v5' | '1v5';
  hp: number;
  armor: number;
  money: number;
  weaponId: WeaponId;
  weaponName: string;
  primaryWeapon: WeaponId | null;
  magAmmo: number;
  reserveAmmo: number;
  reloading: boolean;
  scoped: boolean;
  ctScore: number;
  tScore: number;
  roundNumber: number;
  roundTimeLeft: number;
  ctAlive: number;
  tAlive: number;
  bombPlanted: boolean;
  bombTimer: number;
  bombSiteLabel: 'A' | 'B' | null;
  canBombAction: 'plant' | 'defuse' | null;
  bombActionProgress: number;
  buyMenuOpen: boolean;
  scoreboardOpen: boolean;
  pointerLocked: boolean;
  crosshairSpread: number;
  hitmarkerActive: boolean;
  damageFlash: number;
  roundBanner: string | null;
  killFeed: KillFeedItem[];
  scoreboard: {
    name: string;
    team: TeamSide;
    kills: number;
    deaths: number;
    alive: boolean;
    isPlayer: boolean;
  }[];
}

function buildSoldierMesh(team: TeamSide, shadowTex: THREE.Texture) {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  const bodyCol = team === 'ct' ? '#1f3654' : '#6b5b3e';
  const vestCol = team === 'ct' ? '#162336' : '#3a3326';
  const pantsCol = team === 'ct' ? '#1c2536' : '#4a4233';
  const skinCol = '#d8aa8b';

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.72 });
  const vestMat = new THREE.MeshStandardMaterial({ color: vestCol, roughness: 0.65 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsCol, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.62 });
  const gunMat = new THREE.MeshStandardMaterial({ color: '#1b1f26', roughness: 0.4, metalness: 0.7 });

  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.76, 0.22), pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  bodyRoot.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.76, 0.22), pantsMat);
  legR.position.set(0.14, 0.38, 0);
  bodyRoot.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.64, 0.3), bodyMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  bodyRoot.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.34), vestMat);
  vest.position.y = 1.1;
  bodyRoot.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
  head.position.y = 1.56;
  bodyRoot.add(head);

  if (team === 'ct') {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshStandardMaterial({ color: '#1b2838', roughness: 0.5 })
    );
    helmet.position.y = 1.58;
    bodyRoot.add(helmet);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.08, 0.14),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.15, metalness: 0.8 })
    );
    visor.position.set(0, 1.56, 0.14);
    bodyRoot.add(visor);
  } else {
    const bandana = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.195, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.78 })
    );
    bandana.position.y = 1.62;
    bodyRoot.add(bandana);
  }

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), bodyMat);
  armR.position.set(0.35, 1.12, 0.14);
  armR.rotation.x = -0.9;
  bodyRoot.add(armR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), bodyMat);
  armL.position.set(-0.34, 1.1, 0.12);
  armL.rotation.x = -0.7;
  bodyRoot.add(armL);

  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.75), gunMat);
  rifle.position.set(0.26, 1.16, 0.45);
  bodyRoot.add(rifle);

  return { group, bodyRoot, legL, legR, torso, vest };
}

function buildViewModelGroup(): {
  root: THREE.Group;
  weapons: Record<WeaponId, THREE.Group>;
  muzzleFlash: THREE.Mesh;
} {
  const root = new THREE.Group();
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#1e242d', roughness: 0.35, metalness: 0.78 });
  const gunMetal = new THREE.MeshStandardMaterial({ color: '#333c4a', roughness: 0.42, metalness: 0.7 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7c4a24', roughness: 0.68 });
  const oliveMat = new THREE.MeshStandardMaterial({ color: '#2e4733', roughness: 0.58 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.2, metalness: 0.92 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#1c2026', roughness: 0.85 });

  // Right & Left connected tactical forearms + gloved hands
  const sleeveMat = new THREE.MeshStandardMaterial({ color: '#1b2838', roughness: 0.78 });
  const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.28), sleeveMat);
  rightSleeve.position.set(0.24, -0.25, -0.20);
  rightSleeve.rotation.set(0.25, -0.18, 0);

  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.07, 0.14), gloveMat);
  hand.position.set(0.205, -0.205, -0.35);

  const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.074, 0.34), sleeveMat);
  leftSleeve.position.set(0.02, -0.27, -0.32);
  leftSleeve.rotation.set(0.22, -0.44, 0);

  const supportHand = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.065, 0.13), gloveMat);
  supportHand.position.set(0.165, -0.21, -0.46);
  supportHand.rotation.y = -0.22;
  root.add(rightSleeve, hand, leftSleeve, supportHand);

  // Knife
  const knife = new THREE.Group();
  const kHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.14), gloveMat);
  kHandle.position.set(0.2, -0.19, -0.36);
  const kBlade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.22), bladeMat);
  kBlade.position.set(0.2, -0.17, -0.52);
  knife.add(kHandle, kBlade);
  root.add(knife);

  // USP-S with iron sights
  const usp = new THREE.Group();
  const uspSlide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.052, 0.24), darkSteel);
  uspSlide.position.set(0.2, -0.16, -0.42);
  const uspSightRear = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.014), gunMetal);
  uspSightRear.position.set(0.2, -0.13, -0.31);
  const uspSightFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.012, 0.012),
    new THREE.MeshBasicMaterial({ color: '#4ade80' })
  );
  uspSightFront.position.set(0.2, -0.13, -0.52);
  const uspSilencer = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), gunMetal);
  uspSilencer.rotation.x = Math.PI / 2;
  uspSilencer.position.set(0.2, -0.16, -0.62);
  usp.add(uspSlide, uspSightRear, uspSightFront, uspSilencer);
  root.add(usp);

  // AK-47
  const ak47 = new THREE.Group();
  const akBody = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.08, 0.48), darkSteel);
  akBody.position.set(0.21, -0.17, -0.45);
  const akWood = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.07, 0.22), woodMat);
  akWood.position.set(0.21, -0.18, -0.56);
  const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), gunMetal);
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(0.21, -0.15, -0.78);
  const akMag = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.16, 0.065), woodMat);
  akMag.position.set(0.21, -0.27, -0.47);
  akMag.rotation.x = 0.24;
  ak47.add(akBody, akWood, akBarrel, akMag);
  root.add(ak47);

  // M4A1-S with Picatinny Rail & Reflex Sight
  const m4a1 = new THREE.Group();
  const m4Body = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 0.44), darkSteel);
  m4Body.position.set(0.21, -0.17, -0.45);
  const m4Rail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.3), gunMetal);
  m4Rail.position.set(0.21, -0.122, -0.46);
  const m4Holo = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.035, 0.06), darkSteel);
  m4Holo.position.set(0.21, -0.1, -0.44);
  const m4Suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 10), gunMetal);
  m4Suppressor.rotation.x = Math.PI / 2;
  m4Suppressor.position.set(0.21, -0.155, -0.76);
  const m4Mag = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.06), darkSteel);
  m4Mag.position.set(0.21, -0.26, -0.46);
  m4a1.add(m4Body, m4Rail, m4Holo, m4Suppressor, m4Mag);
  root.add(m4a1);

  // AWP with Scope Lens
  const awp = new THREE.Group();
  const awpStock = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.08, 0.56), oliveMat);
  awpStock.position.set(0.21, -0.18, -0.46);
  const awpBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.42, 8), darkSteel);
  awpBarrel.rotation.x = Math.PI / 2;
  awpBarrel.position.set(0.21, -0.15, -0.86);
  const awpScope = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 10), darkSteel);
  awpScope.rotation.x = Math.PI / 2;
  awpScope.position.set(0.21, -0.1, -0.48);
  const awpLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.02, 10),
    new THREE.MeshBasicMaterial({ color: '#38bdf8' })
  );
  awpLens.position.set(0.21, -0.1, -0.358);
  awp.add(awpStock, awpBarrel, awpScope, awpLens);
  root.add(awp);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 6, 6),
    new THREE.MeshBasicMaterial({ color: '#ffd166' })
  );
  muzzleFlash.position.set(0.21, -0.15, -0.82);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);

  return {
    root,
    weapons: { knife, usp, ak47, m4a1, awp },
    muzzleFlash,
  };
}

export const TacticalFpsGame: React.FC<TacticalFpsGameProps> = ({ onRecordUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamSide>('ct');
  const [selectedMode, setSelectedMode] = useState<'5v5' | '1v5'>('5v5');

  const [hud, setHud] = useState<FpsHudSnapshot>(() => ({
    phase:
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1'
        ? 'playing'
        : 'title',
    playerTeam: 'ct',
    matchMode: '5v5',
    hp: 100,
    armor: 0,
    money: 800,
    weaponId: 'usp',
    weaponName: WEAPONS.usp.name,
    primaryWeapon: null,
    magAmmo: 12,
    reserveAmmo: 36,
    reloading: false,
    scoped: false,
    ctScore: 0,
    tScore: 0,
    roundNumber: 1,
    roundTimeLeft: 105,
    ctAlive: 5,
    tAlive: 5,
    bombPlanted: false,
    bombTimer: 0,
    bombSiteLabel: null,
    canBombAction: null,
    bombActionProgress: 0,
    buyMenuOpen: false,
    scoreboardOpen: false,
    pointerLocked: false,
    crosshairSpread: 6,
    hitmarkerActive: false,
    damageFlash: 0,
    roundBanner: null,
    killFeed: [],
    scoreboard: [],
  }));

  const keysRef = useRef<Record<string, boolean>>({});
  const mouseDownRef = useRef(false);
  const dragAimRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const pendingActionRef = useRef<{
    startMatch?: { team: TeamSide; mode: '5v5' | '1v5' };
    buyWeapon?: WeaponId;
    buyArmor?: boolean;
    switchSlot?: 1 | 2 | 3;
    reload?: boolean;
    toggleBuy?: boolean;
    toggleScope?: boolean;
    fireTap?: boolean;
  }>({});

  const startMatch = useCallback((team: TeamSide, mode: '5v5' | '1v5') => {
    soundFX.click();
    pendingActionRef.current.startMatch = { team, mode };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const map = createTacticalMap();
    const params = new URLSearchParams(window.location.search);
    let phase: 'title' | 'playing' | 'round_end' | 'match_end' =
      params.get('autostart') === '1' ? 'playing' : 'title';
    let playerTeam: TeamSide = 'ct';
    let matchMode: '5v5' | '1v5' = '5v5';

    let money = 800;
    let ctScore = 0;
    let tScore = 0;
    let roundNumber = 1;
    let roundTimeLeft = 105;
    let roundEndDelay = 0;
    let bombPlanted = false;
    let bombTimer = 0;
    let bombBeepAccum = 0;
    let bombPos = new THREE.Vector3();
    let bombSiteLabel: 'A' | 'B' | null = null;
    let bombActionProgress = 0;

    let buyMenuOpen = false;
    let scoreboardOpen = false;
    let scoped = false;
    let hitmarkerTimer = 0;
    let damageFlash = 0;
    let muzzleFlashTimer = 0;
    let viewRecoil = 0;
    let punchPitch = 0;
    let swayX = 0;
    let swayY = 0;
    let camRoll = 0;
    let landDip = 0;
    let wasGrounded = true;
    let roundBanner: string | null = null;
    let killIdSeq = 1;
    const killFeed: KillFeedItem[] = [];

    let actors: ActorState[] = [];
    let player!: ActorState;

    const pushKill = (killer: string, victim: string, weapon: string, headshot: boolean, killerTeam: TeamSide) => {
      killFeed.unshift({ id: killIdSeq++, killer, victim, weapon, headshot, killerTeam });
      if (killFeed.length > 4) killFeed.pop();
    };

    const setupActorsForRound = (keepPlayerLoadout: boolean) => {
      const prevPrimary = keepPlayerLoadout && player?.alive ? player.primaryWeapon : null;
      const prevArmor = keepPlayerLoadout && player?.alive ? player.armor : 0;
      const prevKills = player ? player.kills : 0;
      const prevDeaths = player ? player.deaths : 0;

      const list: ActorState[] = [];
      const ctCount = playerTeam === 'ct' ? (matchMode === '5v5' ? 5 : 1) : 5;
      const tCount = playerTeam === 't' ? (matchMode === '5v5' ? 5 : 1) : 5;

      const botNamesCT = ['Falcon', 'Vanguard', 'Atlas', 'Kestrel', 'Specter'];
      const botNamesT = ['Viper', 'Mirage', 'Jackal', 'Cobalt', 'Nomad'];

      const botRiflePool: WeaponId[] = ['ak47', 'm4a1', 'usp'];

      for (let i = 0; i < ctCount; i++) {
        const isPl = playerTeam === 'ct' && i === 0;
        const botPrimary = roundNumber >= 2 ? botRiflePool[(i + roundNumber) % 3] : null;
        const a = createActor(
          `ct_${i}`,
          isPl ? 'Вы' : `CT·${botNamesCT[i]}`,
          'ct',
          isPl,
          map.ctSpawns[i % map.ctSpawns.length],
          isPl ? prevPrimary : botPrimary
        );
        if (isPl) {
          a.armor = prevArmor;
          a.kills = prevKills;
          a.deaths = prevDeaths;
          player = a;
        }
        a.aiTargetWpIdx = (i * 2 + 4) % map.waypoints.length;
        list.push(a);
      }

      for (let i = 0; i < tCount; i++) {
        const isPl = playerTeam === 't' && i === 0;
        const botPrimary = roundNumber >= 2 ? botRiflePool[(i + roundNumber + 1) % 3] : null;
        const a = createActor(
          `t_${i}`,
          isPl ? 'Вы' : `T·${botNamesT[i]}`,
          't',
          isPl,
          map.tSpawns[i % map.tSpawns.length],
          isPl ? prevPrimary : botPrimary
        );
        if (isPl) {
          a.armor = prevArmor;
          a.kills = prevKills;
          a.deaths = prevDeaths;
          player = a;
        }
        a.aiTargetWpIdx = (i * 3 + 5) % map.waypoints.length;
        list.push(a);
      }

      actors = list;
      roundTimeLeft = 105;
      bombPlanted = false;
      bombTimer = 0;
      bombSiteLabel = null;
      bombActionProgress = 0;
      scoped = false;
    };

    setupActorsForRound(false);

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#c8d8e8');
    scene.fog = new THREE.FogExp2('#d2c5ad', 0.0085);

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 960);
    const height = Math.max(240, rect.height || 560);

    const { renderer, isSoftwareGl, dispose: disposeRenderer } = createConfiguredRenderer(
      canvas,
      scene,
      width,
      height
    );
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 360);
    scene.add(camera);

    // Sunlit Mediterranean daylight
    const hemi = new THREE.HemisphereLight('#a9d2ff', '#a88c63', 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff0d1', 2.35);
    sun.position.set(42, 68, 35);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -48;
      sun.shadow.camera.right = 48;
      sun.shadow.camera.top = 48;
      sun.shadow.camera.bottom = -48;
    }
    scene.add(sun);

    const skyDome = createSkyDome('#5a98d8', '#e4d5b7', 210);
    scene.add(skyDome);

    // Sandy Courtyard Ground Floor
    const groundTex = makeCourtyardGroundTexture(maxAniso);
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(map.halfSize * 2 + 12, map.halfSize * 2 + 12),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        color: '#d4be96',
        roughness: 0.92,
      })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Bombsite A & B Ground Zone Pads
    for (const site of map.bombsites) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(site.radius - 0.35, site.radius, 32),
        new THREE.MeshBasicMaterial({
          color: site.id === 'A' ? '#ef4444' : '#f59e0b',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, 0.03, site.z);
      scene.add(ring);

      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(site.radius - 0.35, 32),
        new THREE.MeshBasicMaterial({
          color: site.id === 'A' ? '#7f1d1d' : '#78350f',
          transparent: true,
          opacity: 0.14,
        })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(site.x, 0.02, site.z);
      scene.add(pad);
    }

    // Build Arena Map Geometry from AABBs
    const wallTex = makeSandstoneTexture(maxAniso);
    const crateTex = makeWoodCrateTexture(maxAniso);
    const mats = {
      sandstone: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.88 }),
      arch: new THREE.MeshStandardMaterial({ map: wallTex, color: '#b89f78', roughness: 0.9 }),
      crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.78 }),
      container: new THREE.MeshStandardMaterial({ color: '#7b2d22', roughness: 0.48, metalness: 0.45 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.84, metalness: 0.1 }),
    };

    for (const b of map.boxes) {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const d = b.maxZ - b.minZ;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[b.material]);
      mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Tactical steel barrels around A & B sites for CS2 depth
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.12, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: '#2b4c6f', roughness: 0.45, metalness: 0.6 });
    for (const [bx, bz] of [
      [23.2, -16.5],
      [24.1, -15.9],
      [-23.5, -18.5],
      [-12.2, 6.2],
      [12.2, -6.2],
    ]) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(bx, 0.56, bz);
      barrel.receiveShadow = true;
      scene.add(barrel);
    }

    // Planted C4 Mesh
    const c4Group = new THREE.Group();
    const c4Body = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.12, 0.22),
      new THREE.MeshStandardMaterial({ color: '#3f4a3c', roughness: 0.65 })
    );
    const c4Led = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ef4444' })
    );
    c4Led.position.set(0.06, 0.08, 0);
    c4Group.add(c4Body, c4Led);
    c4Group.visible = false;
    scene.add(c4Group);

    // Viewmodel Weapon attached to Camera
    const viewModel = buildViewModelGroup();
    camera.add(viewModel.root);

    // Tracer pool
    const tracers: { line: THREE.Line; life: number }[] = [];
    const spawnTracer = (
      sx: number,
      sy: number,
      sz: number,
      ex: number,
      ey: number,
      ez: number,
      colorHex: string
    ) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sx, sy, sz),
        new THREE.Vector3(ex, ey, ez),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      tracers.push({ line, life: 0.1 });
    };

    // Soldier meshes map
    const shadowTex = makeRadialShadowTexture();
    const actorMeshes = new Map<string, ReturnType<typeof buildSoldierMesh>>();
    const rebuildActorMeshes = () => {
      actorMeshes.forEach((m) => scene.remove(m.group));
      actorMeshes.clear();
      for (const a of actors) {
        if (a.isPlayer) continue;
        const m = buildSoldierMesh(a.team, shadowTex);
        scene.add(m.group);
        actorMeshes.set(a.id, m);
      }
    };
    rebuildActorMeshes();

    // ResizeObserver
    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(320, r.width);
      const h = Math.max(240, r.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    // Input listeners
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        scoreboardOpen = true;
      }
      if (e.code === 'KeyB' && !e.repeat && phase === 'playing') {
        pendingActionRef.current.toggleBuy = true;
      }
      if (e.code === 'KeyR' && !e.repeat) {
        pendingActionRef.current.reload = true;
      }
      if (e.code === 'Digit1') pendingActionRef.current.switchSlot = 1;
      if (e.code === 'Digit2') pendingActionRef.current.switchSlot = 2;
      if (e.code === 'Digit3') pendingActionRef.current.switchSlot = 3;
      if (e.code === 'KeyZ' && !e.repeat) pendingActionRef.current.toggleScope = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      if (e.code === 'Tab') {
        scoreboardOpen = false;
      }
    };

    let lockEnteredAt = 0;
    const onPointerLockChange = () => {
      if (document.pointerLockElement === canvas) {
        lockEnteredAt = performance.now();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (phase !== 'playing' || buyMenuOpen) return;
      if (document.pointerLockElement === canvas) {
        if (
          performance.now() - lockEnteredAt < 100 ||
          Math.abs(e.movementX) > 120 ||
          Math.abs(e.movementY) > 120
        ) {
          return;
        }
        const sens = scoped ? 0.001 : 0.0022;
        player.yaw -= e.movementX * sens;
        player.pitch = Math.max(
          -1.42,
          Math.min(1.42, player.pitch - e.movementY * sens)
        );
        swayX = Math.max(-0.04, Math.min(0.04, swayX - e.movementX * 0.0005));
        swayY = Math.max(-0.04, Math.min(0.04, swayY + e.movementY * 0.0005));
      } else if (dragAimRef.current.active) {
        const dx = e.clientX - dragAimRef.current.lastX;
        const dy = e.clientY - dragAimRef.current.lastY;
        dragAimRef.current.lastX = e.clientX;
        dragAimRef.current.lastY = e.clientY;
        if (Math.abs(dx) > 120 || Math.abs(dy) > 120) return;
        player.yaw -= dx * 0.0045;
        player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch - dy * 0.0045));
        swayX = Math.max(-0.04, Math.min(0.04, swayX - dx * 0.0008));
        swayY = Math.max(-0.04, Math.min(0.04, swayY + dy * 0.0008));
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== canvas) return;
      if (phase !== 'playing' || buyMenuOpen) return;

      if (e.button === 2) {
        pendingActionRef.current.toggleScope = true;
        return;
      }
      if (e.button === 0) {
        mouseDownRef.current = true;
        pendingActionRef.current.fireTap = true;
        dragAimRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
          try {
            canvas.requestPointerLock();
          } catch {
            // Pointer lock may be unavailable in automated/embedded mode; drag aim still works
          }
        }
      }
    };

    const onMouseUp = () => {
      mouseDownRef.current = false;
      dragAimRef.current.active = false;
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onContextLost = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('webglcontextlost', onContextLost);

    const switchActorWeapon = (actor: ActorState, targetId: WeaponId) => {
      if (actor.weaponId === targetId) return;
      actor.weaponId = targetId;
      actor.reloadingLeft = 0;
      const spec = WEAPONS[targetId];
      actor.magAmmo = spec.magSize;
      actor.reserveAmmo = spec.reserveMax;
      scoped = false;
    };

    const fireWeapon = (shooter: ActorState, aimDirX: number, aimDirY: number, aimDirZ: number) => {
      const spec = WEAPONS[shooter.weaponId];
      if (shooter.fireCooldown > 0 || shooter.reloadingLeft > 0) return;
      if (spec.magSize > 0 && shooter.magAmmo <= 0) {
        if (shooter.reserveAmmo > 0) {
          shooter.reloadingLeft = spec.reloadTime;
          if (shooter.isPlayer) soundFX.reloadClick();
        }
        return;
      }

      shooter.fireCooldown = spec.fireInterval;
      if (spec.magSize > 0) shooter.magAmmo -= 1;

      if (shooter.isPlayer) {
        soundFX.gunshot(shooter.weaponId);
        muzzleFlashTimer = spec.id === 'knife' ? 0 : 0.055;
        viewRecoil = Math.min(0.15, viewRecoil + spec.recoilKick * 1.45);
        punchPitch = Math.min(0.11, punchPitch + spec.recoilKick * 0.95);
      }

      // CS2 speed-based spread (counter-strafing to ~0 velocity gives pinpoint accuracy!)
      const horizSpeed = Math.hypot(shooter.vx, shooter.vz);
      const speedNorm = Math.min(1.25, horizSpeed / Math.max(1, spec.moveSpeed));
      const airPenalty = shooter.grounded ? 0 : 0.065;
      const moveFactor = shooter.isPlayer
        ? (speedNorm > 0.16 ? spec.moveSpread * speedNorm : 0) * (shooter.crouching ? 0.45 : 1) + airPenalty
        : 0.025;
      const totalSpread = spec.baseSpread + shooter.recoilBloom + moveFactor;
      const sx = (Math.random() - 0.5) * 2 * totalSpread;
      const sy = (Math.random() - 0.5) * 2 * totalSpread;
      const sz = (Math.random() - 0.5) * 2 * totalSpread;

      const dLen = Math.hypot(aimDirX + sx, aimDirY + sy, aimDirZ + sz) || 1;
      const dx = (aimDirX + sx) / dLen;
      const dy = (aimDirY + sy) / dLen;
      const dz = (aimDirZ + sz) / dLen;

      shooter.recoilBloom = Math.min(0.09, shooter.recoilBloom + spec.recoilKick);

      const eyeY = shooter.y + (1.58 - shooter.crouchFrac * 0.45);
      const hit = castBulletRay(
        shooter,
        shooter.x,
        eyeY,
        shooter.z,
        dx,
        dy,
        dz,
        spec,
        map,
        actors
      );

      if (spec.id !== 'knife') {
        const startX = shooter.x + dx * 0.6;
        const startY = eyeY - 0.1;
        const startZ = shooter.z + dz * 0.6;
        spawnTracer(
          startX,
          startY,
          startZ,
          hit.hitPoint.x,
          hit.hitPoint.y,
          hit.hitPoint.z,
          shooter.team === 'ct' ? '#bae6fd' : '#fde68a'
        );
      }

      if (hit.hitActor) {
        const victim = hit.hitActor;
        const died = applyDamageToActor(victim, hit.damage);
        if (shooter.isPlayer) {
          hitmarkerTimer = 0.16;
          if (hit.hitZone === 'head') soundFX.headshotPing();
        }
        if (victim.isPlayer) {
          damageFlash = 0.45;
        }
        if (died) {
          shooter.kills += 1;
          pushKill(shooter.name, victim.name, spec.name, hit.hitZone === 'head', shooter.team);
          if (shooter.isPlayer) {
            money = Math.min(16000, money + spec.killReward);
            onRecordUpdate({
              killsDelta: 1,
              deathsDelta: 0,
              headshotsDelta: hit.hitZone === 'head' ? 1 : 0,
              roundsWonDelta: 0,
            });
          } else if (victim.isPlayer) {
            onRecordUpdate({
              killsDelta: 0,
              deathsDelta: 1,
              headshotsDelta: 0,
              roundsWonDelta: 0,
            });
          }
        }
      }
    };

    const endRound = (winner: TeamSide, reason: string) => {
      if (phase !== 'playing') return;
      phase = 'round_end';
      roundEndDelay = 3.2;
      if (winner === 'ct') ctScore += 1;
      else tScore += 1;

      const playerWon = winner === playerTeam;
      money = Math.min(16000, money + (playerWon ? 3250 : 1900));
      if (playerWon) {
        soundFX.winFanfare();
        onRecordUpdate({ killsDelta: 0, deathsDelta: 0, headshotsDelta: 0, roundsWonDelta: 1 });
      } else {
        soundFX.loseTone();
      }
      roundBanner = `${winner === 'ct' ? 'Победа Спецназа (CT)' : 'Победа Террористов (T)'} · ${reason}`;
    };

    let disposed = false;
    let cancelFrame = () => {};
    let lastTime = performance.now();
    let lastHudEmit = 0;

    camera.position.set(player.x, 1.58, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    renderer.render(scene, camera);

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      // Handle UI / key actions
      const act = pendingActionRef.current;
      if (act.startMatch) {
        playerTeam = act.startMatch.team;
        matchMode = act.startMatch.mode;
        ctScore = 0;
        tScore = 0;
        roundNumber = 1;
        money = 800;
        killFeed.length = 0;
        setupActorsForRound(false);
        rebuildActorMeshes();
        phase = 'playing';
        roundBanner = 'Раунд 1 · В бой! Нажмите B для закупки';
        window.setTimeout(() => {
          roundBanner = null;
        }, 2800);
        act.startMatch = undefined;
      }

      if (act.toggleBuy) {
        act.toggleBuy = false;
        buyMenuOpen = !buyMenuOpen;
        if (buyMenuOpen && document.pointerLockElement === canvas) {
          document.exitPointerLock?.();
        }
      }

      if (act.buyWeapon) {
        const w = WEAPONS[act.buyWeapon];
        if (money >= w.price) {
          money -= w.price;
          if (w.slot === 1) {
            player.primaryWeapon = w.id;
            switchActorWeapon(player, w.id);
          } else if (w.slot === 2) {
            player.secondaryWeapon = w.id;
            switchActorWeapon(player, w.id);
          }
          soundFX.click();
          buyMenuOpen = false;
        }
        act.buyWeapon = undefined;
      }

      if (act.buyArmor) {
        act.buyArmor = false;
        if (money >= 650 && player.armor < 100) {
          money -= 650;
          player.armor = 100;
          soundFX.click();
        }
      }

      if (act.switchSlot) {
        const slot = act.switchSlot;
        act.switchSlot = undefined;
        if (slot === 1 && player.primaryWeapon) switchActorWeapon(player, player.primaryWeapon);
        if (slot === 2) switchActorWeapon(player, player.secondaryWeapon);
        if (slot === 3) switchActorWeapon(player, 'knife');
      }

      if (act.reload) {
        act.reload = false;
        const spec = WEAPONS[player.weaponId];
        if (
          player.alive &&
          spec.magSize > 0 &&
          player.magAmmo < spec.magSize &&
          player.reserveAmmo > 0 &&
          player.reloadingLeft <= 0
        ) {
          player.reloadingLeft = spec.reloadTime;
          scoped = false;
          soundFX.reloadClick();
        }
      }

      if (act.toggleScope) {
        act.toggleScope = false;
        if (WEAPONS[player.weaponId].hasScope && player.reloadingLeft <= 0) {
          scoped = !scoped;
        } else {
          scoped = false;
        }
      }

      // Decay timers & CS2 camera spring recovery
      if (hitmarkerTimer > 0) hitmarkerTimer -= dt;
      if (damageFlash > 0) damageFlash = Math.max(0, damageFlash - dt * 1.4);
      if (muzzleFlashTimer > 0) muzzleFlashTimer -= dt;
      viewRecoil = Math.max(0, viewRecoil - dt * 0.45);
      punchPitch *= Math.exp(-12 * dt);
      swayX *= Math.exp(-10 * dt);
      swayY *= Math.exp(-10 * dt);
      landDip *= Math.exp(-11 * dt);

      // Update tracers
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          (tracers[i].line.material as THREE.Material).dispose();
          tracers.splice(i, 1);
        }
      }

      if (phase === 'round_end') {
        roundEndDelay -= dt;
        if (roundEndDelay <= 0) {
          if (ctScore >= 8 || tScore >= 8) {
            phase = 'match_end';
            roundBanner =
              (ctScore >= 8 && playerTeam === 'ct') || (tScore >= 8 && playerTeam === 't')
                ? 'МАТЧ ВЫИГРАН!'
                : 'МАТЧ ЗАВЕРШЁН';
          } else {
            roundNumber += 1;
            roundBanner = `Раунд ${roundNumber}`;
            setupActorsForRound(true);
            rebuildActorMeshes();
            phase = 'playing';
            window.setTimeout(() => {
              if (phase === 'playing') roundBanner = null;
            }, 2200);
          }
        }
      }

      const k = keysRef.current;

      if (phase === 'playing') {
        // Round / Bomb countdown
        if (bombPlanted) {
          bombTimer -= dt;
          bombBeepAccum += dt;
          const beepInterval = bombTimer < 8 ? 0.35 : bombTimer < 18 ? 0.65 : 1.05;
          if (bombBeepAccum >= beepInterval) {
            bombBeepAccum = 0;
            soundFX.bombBeep(bombTimer < 8);
          }
          c4Led.visible = bombBeepAccum < 0.14;
          if (bombTimer <= 0) {
            soundFX.carCrash(1.0);
            endRound('t', 'Бомба C4 взорвана');
          }
        } else {
          roundTimeLeft -= dt;
          if (roundTimeLeft <= 0) {
            endRound('ct', 'Время вышло');
          }
        }

        // Player Movement & Arrow Key Fallback Aim
        if (player.alive && !buyMenuOpen) {
          const arrowYaw =
            (k['ArrowLeft'] ? 1 : 0) - (k['ArrowRight'] ? 1 : 0);
          const arrowPitch =
            (k['ArrowUp'] ? 1 : 0) - (k['ArrowDown'] ? 1 : 0);
          player.yaw += arrowYaw * 2.1 * dt;
          player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch + arrowPitch * 1.4 * dt));

          const fwdIn = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
          const strIn = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
          const sinY = Math.sin(player.yaw);
          const cosY = Math.cos(player.yaw);
          const moveX = -sinY * fwdIn + cosY * strIn;
          const moveZ = -cosY * fwdIn - sinY * strIn;

          resolveActorMovement(
            player,
            moveX,
            moveZ,
            Boolean(k['Space']),
            Boolean(k['ControlLeft'] || k['KeyC']),
            Boolean(k['ShiftLeft']),
            dt,
            map
          );

          // Weapon cooldowns & reload
          player.fireCooldown = Math.max(0, player.fireCooldown - dt);
          player.recoilBloom = Math.max(0, player.recoilBloom - dt * 0.18);
          if (player.reloadingLeft > 0) {
            player.reloadingLeft -= dt;
            if (player.reloadingLeft <= 0) {
              const spec = WEAPONS[player.weaponId];
              const needed = spec.magSize - player.magAmmo;
              const take = Math.min(needed, player.reserveAmmo);
              player.magAmmo += take;
              player.reserveAmmo -= take;
              player.reloadingLeft = 0;
            }
          }

          // Firing
          const spec = WEAPONS[player.weaponId];
          const wantsFire =
            act.fireTap || (spec.automatic && mouseDownRef.current);
          act.fireTap = false;
          if (wantsFire) {
            const aimDir = new THREE.Vector3(0, 0, -1).applyEuler(
              new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')
            );
            fireWeapon(player, aimDir.x, aimDir.y, aimDir.z);
          }

          // Bomb Plant / Defuse (E key)
          const nearSite = map.bombsites.find(
            (s) => Math.hypot(player.x - s.x, player.z - s.z) < s.radius
          );
          const nearC4 =
            bombPlanted && Math.hypot(player.x - bombPos.x, player.z - bombPos.z) < 3.5;

          if (k['KeyE']) {
            if (player.team === 't' && !bombPlanted && nearSite) {
              bombActionProgress += dt / 2.0;
              if (bombActionProgress >= 1) {
                bombPlanted = true;
                bombTimer = 35;
                bombSiteLabel = nearSite.id;
                bombPos.set(player.x, 0.06, player.z);
                c4Group.position.copy(bombPos);
                c4Group.visible = true;
                bombActionProgress = 0;
                roundBanner = `Бомба C4 установлена на точке ${nearSite.id}!`;
                soundFX.bombBeep(true);
              }
            } else if (player.team === 'ct' && nearC4) {
              bombActionProgress += dt / 2.8;
              if (bombActionProgress >= 1) {
                bombPlanted = false;
                c4Group.visible = false;
                bombActionProgress = 0;
                endRound('ct', 'Бомба C4 обезврежена');
              }
            } else {
              bombActionProgress = 0;
            }
          } else {
            bombActionProgress = Math.max(0, bombActionProgress - dt * 2);
          }
        }

        // Bot Tactical AI
        for (const bot of actors) {
          if (bot.isPlayer || !bot.alive) continue;
          bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
          bot.recoilBloom = Math.max(0, bot.recoilBloom - dt * 0.2);
          if (bot.flashHitTimer > 0) bot.flashHitTimer -= dt;

          if (bot.reloadingLeft > 0) {
            bot.reloadingLeft -= dt;
            if (bot.reloadingLeft <= 0) {
              const sp = WEAPONS[bot.weaponId];
              bot.magAmmo = sp.magSize;
              bot.reloadingLeft = 0;
            }
          }

          // Find closest visible enemy
          let targetEnemy: ActorState | null = null;
          let targetDist = 42;
          for (const other of actors) {
            if (!other.alive || other.team === bot.team) continue;
            const d = Math.hypot(other.x - bot.x, other.z - bot.z);
            if (d < targetDist && hasLineOfSight(bot.x, 1.5, bot.z, other.x, 1.45, other.z, map)) {
              targetDist = d;
              targetEnemy = other;
            }
          }

          if (targetEnemy) {
            const dx = targetEnemy.x - bot.x;
            const dz = targetEnemy.z - bot.z;
            const dist = Math.hypot(dx, dz) || 1;
            const desiredYaw = Math.atan2(-dx, -dz);
            bot.yaw = desiredYaw;

            // Strafe & keep comfortable tactical spacing
            const strafe = Math.sin(now * 0.002 + bot.aiTargetWpIdx) * 0.65;
            const fwd = dist > 14 ? 0.5 : dist < 6 ? -0.4 : 0;
            const mx = (-Math.sin(bot.yaw) * fwd + Math.cos(bot.yaw) * strafe) * 0.8;
            const mz = (-Math.cos(bot.yaw) * fwd - Math.sin(bot.yaw) * strafe) * 0.8;
            resolveActorMovement(bot, mx, mz, false, false, false, dt, map);

            if (bot.aiWaitLeft > 0) {
              bot.aiWaitLeft -= dt;
            } else if (bot.fireCooldown <= 0) {
              const aimDx = dx / dist;
              const aimDy = (targetEnemy.y + 1.32 - (bot.y + 1.52)) / dist;
              const aimDz = dz / dist;
              fireWeapon(bot, aimDx, aimDy, aimDz);
              bot.aiWaitLeft = 0.22 + Math.random() * 0.35;
            }
          } else {
            // Patrol toward waypoint (or toward planted bomb if CT!)
            const goal =
              bombPlanted && bot.team === 'ct'
                ? { x: bombPos.x, z: bombPos.z }
                : map.waypoints[bot.aiTargetWpIdx % map.waypoints.length];
            const dx = goal.x - bot.x;
            const dz = goal.z - bot.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 2.2) {
              bot.aiTargetWpIdx = (bot.aiTargetWpIdx + 1) % map.waypoints.length;
            } else {
              bot.yaw = Math.atan2(-dx, -dz);
              resolveActorMovement(bot, dx / dist, dz / dist, false, false, false, dt, map);
            }
            bot.aiWaitLeft = 0.28;
          }
        }

        // Check team elimination
        const ctAlive = actors.filter((a) => a.team === 'ct' && a.alive).length;
        const tAlive = actors.filter((a) => a.team === 't' && a.alive).length;
        if (ctAlive === 0) {
          endRound('t', 'Все бойцы CT уничтожены');
        } else if (tAlive === 0 && !bombPlanted) {
          endRound('ct', 'Все бойцы T уничтожены');
        }
      }

          // Detect landing impact for CS2 camera dip
          if (!wasGrounded && player.grounded) {
            landDip = -0.14;
          }
          wasGrounded = player.grounded;

      // Sync Camera & ViewModel (CS2 smooth crouch, strafe roll, sway, recoil punch)
      if (player.alive) {
        const eyeY = player.y + (1.58 - player.crouchFrac * 0.45) + landDip;
        camera.position.set(player.x, eyeY, player.z);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch + punchPitch;
        const strafeSign = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);
        const speedFrac = Math.min(1, Math.hypot(player.vx, player.vz) / 6.5);
        const targetRoll = strafeSign * speedFrac * 0.018;
        camRoll += (targetRoll - camRoll) * Math.min(1, dt * 12);
        camera.rotation.z = camRoll;
      } else {
        camera.position.set(player.x, 4.2, player.z + 5.5);
        camera.lookAt(player.x, 1.0, player.z);
        camera.rotation.z = 0;
      }

      const targetFov = scoped ? 22 : 74;
      if (Math.abs(camera.fov - targetFov) > 0.3) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }

      viewModel.root.visible = phase === 'playing' && player.alive && !scoped;
      (Object.keys(viewModel.weapons) as WeaponId[]).forEach((wid) => {
        viewModel.weapons[wid].visible = wid === player.weaponId;
      });
      const speedWalk = Math.min(1, Math.hypot(player.vx, player.vz) / 6.5);
      const bob = Math.sin(player.walkCycle) * 0.012 * speedWalk;
      const reloadDip = player.reloadingLeft > 0 ? -0.15 : 0;
      viewModel.root.position.set(
        bob * 0.8 + swayX,
        Math.abs(bob) * 0.45 + reloadDip + swayY + landDip * 0.35,
        viewRecoil * 0.45
      );
      viewModel.root.rotation.x = viewRecoil * 0.72 - (player.reloadingLeft > 0 ? 0.36 : 0);
      viewModel.root.rotation.y = swayX * 1.4;
      viewModel.muzzleFlash.visible = muzzleFlashTimer > 0;

      // Sync Soldier Meshes
      for (const a of actors) {
        if (a.isPlayer) continue;
        const sm = actorMeshes.get(a.id);
        if (!sm) continue;
        sm.group.visible = a.alive;
        if (!a.alive) continue;
        sm.group.position.set(a.x, a.y, a.z);
        sm.group.rotation.y = a.yaw + Math.PI;
        const swing = Math.sin(a.walkCycle) * 0.45;
        sm.legL.rotation.x = swing;
        sm.legR.rotation.x = -swing;
        (sm.torso.material as THREE.MeshStandardMaterial).emissive.set(
          a.flashHitTimer > 0 ? '#ef4444' : '#000000'
        );
      }

      renderer.render(scene, camera);

      if (now - lastHudEmit > 90) {
        lastHudEmit = now;
        const nearSite = map.bombsites.find(
          (s) => Math.hypot(player.x - s.x, player.z - s.z) < s.radius
        );
        const nearC4 =
          bombPlanted && Math.hypot(player.x - bombPos.x, player.z - bombPos.z) < 3.5;

        setHud({
          phase,
          playerTeam,
          matchMode,
          hp: player.hp,
          armor: player.armor,
          money,
          weaponId: player.weaponId,
          weaponName: WEAPONS[player.weaponId].name,
          primaryWeapon: player.primaryWeapon,
          magAmmo: player.magAmmo,
          reserveAmmo: player.reserveAmmo,
          reloading: player.reloadingLeft > 0,
          scoped,
          ctScore,
          tScore,
          roundNumber,
          roundTimeLeft: Math.max(0, Math.ceil(roundTimeLeft)),
          ctAlive: actors.filter((a) => a.team === 'ct' && a.alive).length,
          tAlive: actors.filter((a) => a.team === 't' && a.alive).length,
          bombPlanted,
          bombTimer: Math.max(0, Math.ceil(bombTimer)),
          bombSiteLabel,
          canBombAction:
            player.alive && player.team === 't' && !bombPlanted && nearSite
              ? 'plant'
              : player.alive && player.team === 'ct' && nearC4
              ? 'defuse'
              : null,
          bombActionProgress,
          buyMenuOpen,
          scoreboardOpen,
          pointerLocked: document.pointerLockElement === canvas,
          crosshairSpread: Math.round(
            4 +
              player.recoilBloom * 220 +
              (Math.hypot(player.vx, player.vz) > 1.0 ? Math.hypot(player.vx, player.vz) * 1.4 : 0) +
              (player.grounded ? 0 : 10)
          ),
          hitmarkerActive: hitmarkerTimer > 0,
          damageFlash,
          roundBanner,
          killFeed: [...killFeed],
          scoreboard: actors.map((a) => ({
            name: a.name,
            team: a.team,
            kills: a.kills,
            deaths: a.deaths,
            alive: a.alive,
            isPlayer: a.isPlayer,
          })),
        });
      }

      cancelFrame = scheduleNextFrame(renderer, isSoftwareGl, tick);
    };

    cancelFrame = scheduleNextFrame(renderer, isSoftwareGl, tick);

    return () => {
      disposed = true;
      cancelFrame();
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
      disposeRenderer();
    };
  }, [onRecordUpdate]);

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-3">
      <div className="relative w-full h-[540px] sm:h-[620px] rounded-2xl overflow-hidden border border-white/10 bg-[#0d111a] select-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair"
          aria-label="Tactical Strike 3D"
        />

        {/* Damage Red Edge Flash */}
        {hud.damageFlash > 0 && (
          <div
            className="absolute inset-0 pointer-events-none border-8 border-rose-600/70"
            style={{ opacity: hud.damageFlash }}
          />
        )}

        {/* AWP Sniper Scope Overlay */}
        {hud.scoped && hud.phase === 'playing' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-full h-full border-[90px] sm:border-[150px] border-black/95 rounded-full scale-125" />
            <div className="absolute inset-x-0 h-[1px] bg-black/90" />
            <div className="absolute inset-y-0 w-[1px] bg-black/90" />
            <div className="absolute w-2 h-2 rounded-full bg-rose-500" />
          </div>
        )}

        {/* Dynamic CS Crosshair */}
        {hud.phase === 'playing' && !hud.scoped && !hud.buyMenuOpen && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div
                className="absolute w-[2px] h-2.5 bg-emerald-400"
                style={{ transform: `translateY(-${hud.crosshairSpread}px)` }}
              />
              <div
                className="absolute w-[2px] h-2.5 bg-emerald-400"
                style={{ transform: `translateY(${hud.crosshairSpread}px)` }}
              />
              <div
                className="absolute h-[2px] w-2.5 bg-emerald-400"
                style={{ transform: `translateX(-${hud.crosshairSpread}px)` }}
              />
              <div
                className="absolute h-[2px] w-2.5 bg-emerald-400"
                style={{ transform: `translateX(${hud.crosshairSpread}px)` }}
              />
              {hud.hitmarkerActive && (
                <div className="absolute w-4 h-4 border-2 border-rose-400 rotate-45" />
              )}
            </div>
          </div>
        )}

        {/* Top-Center CS Scoreboard & Round Clock */}
        {hud.phase !== 'title' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#0a0f18]/90 border border-white/12 rounded-xl px-4 py-1.5 pointer-events-none">
            <div className="text-right">
              <div className="text-[10px] text-sky-400 font-bold">CT ({hud.ctAlive})</div>
              <div className="font-mono-num text-lg font-bold text-white leading-none">
                {hud.ctScore}
              </div>
            </div>
            <div className="px-3 border-x border-white/10 text-center">
              <div className="text-[10px] text-slate-400">РАУНД {hud.roundNumber}</div>
              <div
                className={`font-mono-num text-base font-bold ${
                  hud.bombPlanted ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                {hud.bombPlanted ? `C4 ${hud.bombTimer}с` : formatClock(hud.roundTimeLeft)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-amber-400 font-bold">T ({hud.tAlive})</div>
              <div className="font-mono-num text-lg font-bold text-white leading-none">
                {hud.tScore}
              </div>
            </div>
          </div>
        )}

        {/* Top-Right Kill Feed */}
        {hud.killFeed.length > 0 && hud.phase !== 'title' && (
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
            {hud.killFeed.map((kf) => (
              <div
                key={kf.id}
                className="bg-[#0a0f18]/90 border border-white/10 rounded-md px-2.5 py-1 text-[11px] flex items-center gap-1.5"
              >
                <span className={kf.killerTeam === 'ct' ? 'text-sky-300 font-semibold' : 'text-amber-300 font-semibold'}>
                  {kf.killer}
                </span>
                <span className="text-slate-400">[{kf.weapon}{kf.headshot ? ' ★HS' : ''}]</span>
                <span className={kf.killerTeam === 'ct' ? 'text-amber-300' : 'text-sky-300'}>
                  {kf.victim}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Round / Bomb Banner */}
        {hud.roundBanner && hud.phase !== 'title' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-[#0b101b]/95 border border-amber-400/45 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold text-amber-200 pointer-events-none whitespace-nowrap">
            {hud.roundBanner}
          </div>
        )}

        {/* Bomb Plant / Defuse Prompt */}
        {hud.canBombAction && hud.phase === 'playing' && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#0a0f18]/95 border border-amber-400/50 rounded-xl px-4 py-2 text-xs text-white text-center pointer-events-none">
            <div>
              {hud.canBombAction === 'plant'
                ? 'Удерживайте [E] для закладки бомбы C4'
                : 'Удерживайте [E] для обезвреживания C4'}
            </div>
            {hud.bombActionProgress > 0 && (
              <div className="w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5 mx-auto">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${Math.round(hud.bombActionProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Bottom-Left: HP, Armor & Money */}
        {hud.phase !== 'title' && (
          <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-[#0a0f18]/90 border border-white/12 rounded-xl px-4 py-2.5 pointer-events-none">
            <div>
              <div className="text-[10px] text-slate-400">HP</div>
              <div
                className={`font-mono-num text-xl font-bold leading-none ${
                  hud.hp > 35 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {hud.hp}
              </div>
            </div>
            <div className="border-l border-white/10 pl-3">
              <div className="text-[10px] text-slate-400">БРОНЯ</div>
              <div className="font-mono-num text-xl font-bold text-sky-300 leading-none">
                {hud.armor}
              </div>
            </div>
            <div className="border-l border-white/10 pl-3">
              <div className="text-[10px] text-slate-400">ДЕНЬГИ</div>
              <div className="font-mono-num text-xl font-bold text-amber-300 leading-none">
                ${hud.money}
              </div>
            </div>
          </div>
        )}

        {/* Bottom-Right: Weapon, Ammo & Quick Buttons */}
        {hud.phase !== 'title' && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  pendingActionRef.current.toggleBuy = true;
                }}
                className="px-2.5 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                Закупка (B)
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingActionRef.current.reload = true;
                }}
                className="px-2.5 py-1 rounded-md bg-[#111827]/90 border border-white/15 text-slate-200 text-xs font-semibold"
              >
                Перезаряд (R)
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingActionRef.current.fireTap = true;
                }}
                className="px-3 py-1 rounded-md bg-rose-600/90 text-white text-xs font-bold sm:hidden"
              >
                Огонь
              </button>
            </div>

            <div className="bg-[#0a0f18]/90 border border-white/12 rounded-xl px-4 py-2 text-right pointer-events-none">
              <div className="text-xs font-semibold text-slate-300">
                {hud.weaponName} {hud.reloading ? '· Перезарядка...' : ''}
              </div>
              <div className="font-mono-num text-xl font-bold text-white leading-none mt-0.5">
                {hud.weaponId === 'knife' ? '∞' : `${hud.magAmmo} / ${hud.reserveAmmo}`}
              </div>
            </div>
          </div>
        )}

        {/* Buy Menu Modal (B) */}
        {hud.buyMenuOpen && hud.phase === 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 z-10">
            <div className="max-w-lg w-full bg-[#111622] border border-white/15 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Магазин снаряжения</h3>
                  <p className="text-xs text-slate-400">
                    Баланс: <span className="text-emerald-400 font-mono-num font-bold">${hud.money}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    pendingActionRef.current.toggleBuy = true;
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1c2436] text-xs font-semibold text-slate-200"
                >
                  Закрыть (B)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['usp', 'ak47', 'm4a1', 'awp'] as WeaponId[]).map((wid) => {
                  const w = WEAPONS[wid];
                  const canAfford = hud.money >= w.price;
                  return (
                    <button
                      key={wid}
                      type="button"
                      disabled={!canAfford}
                      onClick={() => {
                        pendingActionRef.current.buyWeapon = wid;
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        canAfford
                          ? 'bg-[#171f30] hover:bg-[#1f2b42] border-white/12'
                          : 'bg-[#10141f] border-white/5 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{w.name}</span>
                        <span className="font-mono-num text-xs font-bold text-emerald-400">
                          ${w.price}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Урон {w.damage} · Обойма {w.magSize}/{w.reserveMax}
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={hud.money < 650 || hud.armor >= 100}
                  onClick={() => {
                    pendingActionRef.current.buyArmor = true;
                  }}
                  className={`p-3 rounded-xl border text-left sm:col-span-2 ${
                    hud.money >= 650 && hud.armor < 100
                      ? 'bg-[#171f30] hover:bg-[#1f2b42] border-white/12'
                      : 'bg-[#10141f] border-white/5 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Кевлар + Шлем</span>
                    <span className="font-mono-num text-xs font-bold text-sky-300">$650</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Снижает урон по корпусу на 20%
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Scoreboard Overlay */}
        {hud.scoreboardOpen && hud.phase !== 'title' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-4 pointer-events-none">
            <div className="max-w-lg w-full bg-[#101624] border border-white/15 rounded-xl p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Таблица счёта · Раунд {hud.roundNumber}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {(['ct', 't'] as TeamSide[]).map((tm) => (
                  <div key={tm} className="flex flex-col gap-1">
                    <div className={`font-bold pb-1 border-b border-white/10 ${tm === 'ct' ? 'text-sky-400' : 'text-amber-400'}`}>
                      {tm === 'ct' ? `Спецназ (${hud.ctScore})` : `Террористы (${hud.tScore})`}
                    </div>
                    {hud.scoreboard
                      .filter((r) => r.team === tm)
                      .map((r, idx) => (
                        <div
                          key={idx}
                          className={`flex justify-between py-0.5 ${
                            r.isPlayer ? 'text-white font-bold' : 'text-slate-300'
                          } ${!r.alive ? 'opacity-50' : ''}`}
                        >
                          <span>{r.name}</span>
                          <span className="font-mono-num">
                            {r.kills} / {r.deaths}
                          </span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Title / Match End Overlay */}
        {(hud.phase === 'title' || hud.phase === 'match_end') && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090d16]/80 p-6">
            <div className="max-w-md w-full bg-[#111726]/95 border border-white/12 rounded-2xl p-6 text-center flex flex-col gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
                  Тактический 3D-шутер · WebGL
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  {hud.phase === 'match_end' ? hud.roundBanner : 'Tactical Strike 3D'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                  Классическая карта с точками A и B, экономикой раундов, закупкой
                  AK-47 / M4A1-S / AWP с оптикой, хедшотами и закладкой бомбы C4.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTeam('ct')}
                  className={`py-2 px-3 rounded-lg border font-bold ${
                    selectedTeam === 'ct'
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : 'bg-[#171e2f] border-white/10 text-slate-300'
                  }`}
                >
                  CT · Спецназ
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTeam('t')}
                  className={`py-2 px-3 rounded-lg border font-bold ${
                    selectedTeam === 't'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-[#171e2f] border-white/10 text-slate-300'
                  }`}
                >
                  T · Террористы
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('5v5')}
                  className={`py-2 px-3 rounded-lg border font-semibold ${
                    selectedMode === '5v5'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#171e2f] border-white/10 text-slate-300'
                  }`}
                >
                  Команда 5×5
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('1v5')}
                  className={`py-2 px-3 rounded-lg border font-semibold ${
                    selectedMode === '1v5'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#171e2f] border-white/10 text-slate-300'
                  }`}
                >
                  Соло 1×5
                </button>
              </div>

              <button
                type="button"
                data-start="true"
                onClick={() => startMatch(selectedTeam, selectedMode)}
                className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors"
              >
                {hud.phase === 'match_end' ? 'Сыграть новый матч' : 'Начать раунд'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#111622] border border-white/8 rounded-xl text-xs text-slate-400">
        <span>
          Клик по экрану — захват мыши (или стрелки) · ЛКМ — огонь · ПКМ / Z — прицел AWP · WASD + Space + Ctrl
        </span>
        <span className="text-slate-300">
          1/2/3 — оружие · R — перезарядка · B — магазин · E — C4 · Tab — счёт
        </span>
      </div>
    </div>
  );
};
