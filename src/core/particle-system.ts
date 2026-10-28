import * as THREE from 'three';

export interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
  alpha: number;
}

/**
 * High-performance, lightweight particle engine using dynamic THREE.BufferGeometry and Points.
 * Keeps CPU and GPU overhead minimal without any external textures.
 */
export class ParticleEngine {
  private particles: Particle[] = [];
  private maxParticles: number;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  public points: THREE.Points;

  private positionsArray: Float32Array;
  private colorsArray: Float32Array;

  constructor(maxParticles: number = 600) {
    this.maxParticles = maxParticles;
    this.geometry = new THREE.BufferGeometry();

    this.positionsArray = new Float32Array(maxParticles * 3);
    this.colorsArray = new Float32Array(maxParticles * 3);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsArray, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorsArray, 3));

    // Create a circular glowing particle texture programmatically via Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  public emit(config: {
    count: number;
    origin: THREE.Vector3;
    spread?: number;
    velocity?: THREE.Vector3;
    velocitySpread?: THREE.Vector3;
    color: number | THREE.Color;
    size?: number;
    life?: number;
  }): void {
    const baseColor = config.color instanceof THREE.Color ? config.color : new THREE.Color(config.color);
    const spread = config.spread || 0.1;
    const baseLife = config.life || 1.0;
    const baseSize = config.size || 0.35;

    for (let i = 0; i < config.count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift(); // Recycle oldest
      }

      const p: Particle = {
        position: config.origin.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
          )
        ),
        velocity: (config.velocity ? config.velocity.clone() : new THREE.Vector3(0, 0, 0)).add(
          new THREE.Vector3(
            config.velocitySpread ? (Math.random() - 0.5) * config.velocitySpread.x : (Math.random() - 0.5) * 0.8,
            config.velocitySpread ? (Math.random() - 0.5) * config.velocitySpread.y : Math.random() * 0.8,
            config.velocitySpread ? (Math.random() - 0.5) * config.velocitySpread.z : (Math.random() - 0.5) * 0.8
          )
        ),
        color: baseColor.clone(),
        size: baseSize * (0.8 + Math.random() * 0.4),
        life: 0,
        maxLife: baseLife * (0.8 + Math.random() * 0.4),
        alpha: 1,
      };

      this.particles.push(p);
    }
  }

  public update(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      p.position.addScaledVector(p.velocity, delta);
      // Soft damping
      p.velocity.multiplyScalar(0.98);

      const lifeRatio = p.life / p.maxLife;
      p.alpha = Math.max(0, 1.0 - lifeRatio);
    }

    // Update GPU buffers
    let ptr = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.positionsArray[ptr * 3] = p.position.x;
      this.positionsArray[ptr * 3 + 1] = p.position.y;
      this.positionsArray[ptr * 3 + 2] = p.position.z;

      // Color faded by alpha
      this.colorsArray[ptr * 3] = p.color.r * p.alpha;
      this.colorsArray[ptr * 3 + 1] = p.color.g * p.alpha;
      this.colorsArray[ptr * 3 + 2] = p.color.b * p.alpha;
      ptr++;
    }

    // Hide remaining vertices
    for (let i = ptr; i < this.maxParticles; i++) {
      this.positionsArray[i * 3] = 0;
      this.positionsArray[i * 3 + 1] = -9999;
      this.positionsArray[i * 3 + 2] = 0;
      this.colorsArray[i * 3] = 0;
      this.colorsArray[i * 3 + 1] = 0;
      this.colorsArray[i * 3 + 2] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  public clear(): void {
    this.particles = [];
    this.update(0);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    if (this.material.map) {
      this.material.map.dispose();
    }
  }
}

