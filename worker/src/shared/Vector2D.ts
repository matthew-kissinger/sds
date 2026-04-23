/**
 * Simple 2D Vector class for XZ plane calculations
 * Pure function implementation with no external dependencies
 */
export class Vector2D {
  x: number;
  z: number;

  constructor(x = 0, z = 0) {
    this.x = x;
    this.z = z;
  }

  set(x: number, z: number): this {
    this.x = x;
    this.z = z;
    return this;
  }

  add(vector: Vector2D): this {
    this.x += vector.x;
    this.z += vector.z;
    return this;
  }

  subtract(vector: Vector2D): this {
    this.x -= vector.x;
    this.z -= vector.z;
    return this;
  }

  multiply(scalar: number): this {
    this.x *= scalar;
    this.z *= scalar;
    return this;
  }

  divide(scalar: number): this {
    if (scalar !== 0) {
      this.x /= scalar;
      this.z /= scalar;
    }
    return this;
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.z * this.z);
  }

  normalize(): this {
    const len = this.magnitude();
    if (len > 0.00001) {
      this.x /= len;
      this.z /= len;
    } else {
      this.x = 0;
      this.z = 0;
    }
    return this;
  }

  limit(max: number): this {
    const len = this.magnitude();
    if (len > max && len > 0.00001) {
      this.normalize();
      this.multiply(max);
    }
    return this;
  }

  distanceTo(vector: Vector2D): number {
    const dx = this.x - vector.x;
    const dz = this.z - vector.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  angle(): number {
    return Math.atan2(this.z, this.x);
  }

  setMagnitude(magnitude: number): this {
    this.normalize();
    this.multiply(magnitude);
    return this;
  }

  clone(): Vector2D {
    return new Vector2D(this.x, this.z);
  }

  static fromAngle(angle: number): Vector2D {
    return new Vector2D(Math.cos(angle), Math.sin(angle));
  }

  static random(): Vector2D {
    const angle = Math.random() * Math.PI * 2;
    return Vector2D.fromAngle(angle);
  }
}
