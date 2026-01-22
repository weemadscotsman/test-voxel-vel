import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { GameCallbacks, GameStats } from '../types';

// --- Configuration ---
const CHUNK_SIZE = 16;
const VIEW_DISTANCE = 4;
const GRAVITY = 40;
const JUMP_FORCE = 16;
const MOVE_SPEED = 12;
const SPRINT_SPEED = 20;
const DRAG = 8;

// --- Materials ---
const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x44d62c, flatShading: true }),
  dirt: new THREE.MeshStandardMaterial({ color: 0xd6882c, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true }),
  fragile: new THREE.MeshStandardMaterial({ color: 0xff4d4d, flatShading: true })
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class VoxelEngine {
  private container: HTMLElement;
  private callbacks: GameCallbacks;
  
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: PointerLockControls;
  
  private active: boolean = false;
  private animationId: number = 0;
  private lastTime: number = 0;
  
  // Game State
  private blocks = new Map<string, THREE.Mesh>();
  private chunksGenerated = new Set<number>();
  private particles: THREE.Mesh[] = [];
  private stats: GameStats = { score: 0, time: 0 };
  
  // Player
  private player = {
    mesh: new THREE.Mesh(),
    velocity: new THREE.Vector3(),
    onGround: false,
    canDoubleJump: false
  };

  // Input
  private input = { f: 0, r: 0, sprint: false };
  private mouse = new THREE.Vector2();

  private audioCtx: AudioContext;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.init();
  }

  private init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#4dc9ff');
    this.scene.fog = new THREE.Fog('#4dc9ff', 20, 50);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 5, 15);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    this.scene.add(dirLight);

    // Player Mesh
    const playerGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const playerMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      emissive: 0x222222,
      flatShading: true 
    });
    this.player.mesh = new THREE.Mesh(playerGeo, playerMat);
    this.player.mesh.castShadow = true;
    this.player.mesh.position.set(0, 5, 0);
    this.scene.add(this.player.mesh);

    // Controls
    this.controls = new PointerLockControls(this.camera, document.body);
    this.controls.addEventListener('unlock', () => {
      this.active = false;
      this.callbacks.onUnlock();
    });

    // Inputs
    this.setupInputs();

    // Initial Generation
    this.updateChunks();

    // Start Loop
    this.lastTime = performance.now();
    this.animate();
  }

  private setupInputs() {
    const onKey = (e: KeyboardEvent, v: boolean) => {
      switch(e.code) {
        case 'ArrowUp': case 'KeyW': this.input.f = v ? 1 : 0; break;
        case 'ArrowLeft': case 'KeyA': this.input.r = v ? -1 : 0; break;
        case 'ArrowDown': case 'KeyS': this.input.f = v ? -1 : 0; break;
        case 'ArrowRight': case 'KeyD': this.input.r = v ? 1 : 0; break;
        case 'ShiftLeft': this.input.sprint = v; break;
        case 'Space': 
          if (v) this.handleJump();
          break;
      }
    };

    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('mousedown', () => this.destroyBlock());
    window.addEventListener('mousemove', (e) => {
        if (!this.active) return;
        this.mouse.x += e.movementX;
        this.mouse.y += e.movementY;
        const limitX = window.innerWidth / 2;
        const limitY = window.innerHeight / 2;
        this.mouse.x = Math.max(-limitX, Math.min(limitX, this.mouse.x));
        this.mouse.y = Math.max(-limitY, Math.min(limitY, this.mouse.y));
    });
    window.addEventListener('resize', this.onResize);
  }

  private handleJump() {
    if (!this.active) return;
    if (this.player.onGround) {
      this.player.velocity.y = JUMP_FORCE;
      this.player.onGround = false;
      this.player.canDoubleJump = true;
    } else if (this.player.canDoubleJump) {
      this.player.velocity.y = JUMP_FORCE * 0.8;
      this.player.canDoubleJump = false;
      this.spawnParticles(this.player.mesh.position, 5, 0xffffff);
    }
  }

  private destroyBlock() {
    if (!this.active) return;
    const raycaster = new THREE.Raycaster();
    const ndcX = (this.mouse.x / (window.innerWidth / 2));
    const ndcY = -(this.mouse.y / (window.innerHeight / 2)); 
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const intersects = raycaster.intersectObjects(Array.from(this.blocks.values()));
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.distance < 20) {
        // @ts-ignore
        this.spawnParticles(hit.object.position, 8, hit.object.material.color.getHex());
        this.scene.remove(hit.object);
        // @ts-ignore
        this.blocks.delete(hit.object.userData.key);
        this.stats.score += 10;
        this.callbacks.onStatsUpdate(this.stats);
      }
    }
  }

  private updateChunks() {
    const playerChunkX = Math.floor(this.player.mesh.position.x / CHUNK_SIZE);
    
    for (let i = -1; i <= VIEW_DISTANCE; i++) {
      const cx = playerChunkX + i;
      if (!this.chunksGenerated.has(cx)) {
        this.generateChunk(cx);
        this.chunksGenerated.add(cx);
      }
    }
  }

  private generateChunk(cx: number) {
    const offset = cx * CHUNK_SIZE;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = offset + x;
      let height = Math.floor(Math.sin(worldX * 0.1) * 2) + 
                   Math.floor(Math.cos(worldX * 0.5) * 1);
      if (height < -2) height = -2;
      
      for (let y = -4; y <= height; y++) {
        this.createBlock(worldX, y, 0, (y === height) ? 'grass' : 'dirt');
      }

      if (Math.random() > 0.7 && x > 2) {
        const h = height + 1 + Math.floor(Math.random() * 3);
        this.createBlock(worldX, h, 0, 'fragile');
        if (Math.random() > 0.5) this.createBlock(worldX, h+1, 0, 'fragile');
      }

      if (Math.random() > 0.85) {
        const py = height + 4;
        this.createBlock(worldX, py, 0, 'stone');
        this.createBlock(worldX+1, py, 0, 'stone');
      }
    }
  }

  private createBlock(x: number, y: number, z: number, type: keyof typeof materials) {
    const key = `${x},${y},${z}`;
    if (this.blocks.has(key)) return;
    const mesh = new THREE.Mesh(boxGeo, materials[type]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type, key };
    this.scene.add(mesh);
    this.blocks.set(key, mesh);
  }

  private spawnParticles(pos: THREE.Vector3, count: number, colorHex: number) {
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5 + 2,
        (Math.random() - 0.5) * 5
      );
      mesh.userData.life = 1.0;
      this.scene.add(mesh);
      this.particles.push(mesh);
    }
  }

  private updatePhysics(dt: number) {
    const speed = this.input.sprint ? SPRINT_SPEED : MOVE_SPEED;
    
    // Acceleration/Friction
    if (this.input.r !== 0) {
      this.player.velocity.x += this.input.r * speed * dt * 5;
    } else {
      this.player.velocity.x -= this.player.velocity.x * DRAG * dt;
    }

    // Clamp
    this.player.velocity.x = Math.max(Math.min(this.player.velocity.x, speed), -speed);

    // Gravity
    this.player.velocity.y -= GRAVITY * dt;

    // Apply
    this.player.mesh.position.x += this.player.velocity.x * dt;
    this.checkCollision('x');
    this.player.mesh.position.y += this.player.velocity.y * dt;
    this.checkCollision('y');

    if (this.player.mesh.position.y < -10) {
      this.active = false;
      this.callbacks.onDeath();
      this.controls.unlock();
    }
  }

  private checkCollision(axis: 'x' | 'y') {
    const p = this.player.mesh.position;
    const minX = Math.floor(p.x - 0.35);
    const maxX = Math.floor(p.x + 0.35);
    const minY = Math.floor(p.y - 0.4);
    const maxY = Math.floor(p.y + 0.4);
    const minZ = 0;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y},${minZ}`;
        if (this.blocks.has(key)) {
          if (axis === 'x') {
            if (this.player.velocity.x > 0) p.x = x - 0.35 - 0.5;
            else p.x = x + 0.5 + 0.35;
            this.player.velocity.x = 0;
          } else {
            if (this.player.velocity.y > 0) {
              p.y = y - 0.4 - 0.5;
              this.player.velocity.y = 0;
            } else {
              p.y = y + 0.5 + 0.4;
              this.player.velocity.y = 0;
              this.player.onGround = true;
            }
          }
        }
      }
    }
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    
    const time = performance.now();
    const delta = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.active) {
      this.updatePhysics(delta);
      
      // Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.userData.life -= delta * 2;
        p.userData.vel.y -= GRAVITY * delta * 0.5;
        p.position.addScaledVector(p.userData.vel, delta);
        p.rotation.x += delta * 5;
        p.rotation.z += delta * 5;
        p.scale.setScalar(p.userData.life * 0.2);
        if (p.userData.life <= 0) {
          this.scene.remove(p);
          this.particles.splice(i, 1);
        }
      }

      // Camera
      const targetX = this.player.mesh.position.x + 5;
      const targetY = Math.max(this.player.mesh.position.y + 2, 5);
      this.camera.position.x += (targetX - this.camera.position.x) * 5 * delta;
      this.camera.position.y += (targetY - this.camera.position.y) * 5 * delta;
      this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);

      this.updateChunks();
      
      this.stats.time += delta;
      this.stats.score += delta * 10;
      this.callbacks.onStatsUpdate(this.stats);
    }

    this.renderer.render(this.scene, this.camera);
  };

  public lock() {
    this.active = true;
    this.lastTime = performance.now();
    this.controls.lock();
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public getMouse() {
    return this.mouse;
  }

  public onResize = () => {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public dispose() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    // Cleanup Three.js
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
