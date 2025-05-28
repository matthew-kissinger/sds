/**
 * Simple 2D Vector class for XZ plane calculations
 */
export class Vector2D {
    constructor(x = 0, z = 0) {
        this.x = x;
        this.z = z;
    }

    // Add another vector to this one
    add(vector) {
        this.x += vector.x;
        this.z += vector.z;
        return this;
    }

    // Subtract another vector from this one
    subtract(vector) {
        this.x -= vector.x;
        this.z -= vector.z;
        return this;
    }

    // Multiply by a scalar
    multiply(scalar) {
        this.x *= scalar;
        this.z *= scalar;
        return this;
    }

    // Divide by a scalar
    divide(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.z /= scalar;
        }
        return this;
    }

    // Get the magnitude (length) of the vector
    magnitude() {
        return Math.sqrt(this.x * this.x + this.z * this.z);
    }

    // Normalize the vector (make it unit length)
    normalize() {
        const len = this.magnitude();
        if (len > 0.00001) { // Use a small epsilon to prevent division by zero/tiny number
            this.x /= len;
            this.z /= len;
        } else {
            this.x = 0;
            this.z = 0;
        }
        return this;
    }

    // Limit the magnitude of the vector
    limit(max) {
        const len = this.magnitude();
        if (len > max && len > 0.00001) { // Only normalize if magnitude is significant and over max
            this.normalize();
            this.multiply(max);
        }
        return this;
    }

    // Get distance to another vector
    distanceTo(vector) {
        const dx = this.x - vector.x;
        const dz = this.z - vector.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    // Get the angle of the vector in radians
    angle() {
        return Math.atan2(this.z, this.x);
    }

    // Set the magnitude of the vector
    setMagnitude(magnitude) {
        this.normalize();
        this.multiply(magnitude);
        return this;
    }

    // Create a copy of this vector
    clone() {
        return new Vector2D(this.x, this.z);
    }

    // Static method to create a vector from an angle
    static fromAngle(angle) {
        return new Vector2D(Math.cos(angle), Math.sin(angle));
    }

    // Static method to get a random unit vector
    static random() {
        const angle = Math.random() * Math.PI * 2;
        return Vector2D.fromAngle(angle);
    }
} 