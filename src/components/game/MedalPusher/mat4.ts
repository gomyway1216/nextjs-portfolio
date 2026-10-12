/**
 * The little linear algebra the 3D field needs: 4 × 4 matrices the way WebGL
 * stores them (sixteen numbers, column by column), a point put through one,
 * and the turn of a medal as a quaternion. Everything writes into an array it
 * is handed, so a frame allocates nothing.
 */

export type Mat4 = Float32Array;

/** A matrix from its four rows, each `[x, y, z, 1]` coefficients. */
export function fromRows(out: Mat4, rows: readonly (readonly number[])[]): Mat4 {
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) out[column * 4 + row] = rows[row][column];
  return out;
}

/** Where a point lands in clip space: `[x, y, z, w]`, written into `out`. */
export function transform(out: Float64Array | number[], matrix: ArrayLike<number>, x: number, y: number, z: number): typeof out {
  out[0] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  out[1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  out[2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  out[3] = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  return out;
}

export type Vec3 = readonly [number, number, number];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The point where three planes `a·x + b·y + c·z + d = 0` meet. */
export function meet(planes: readonly (readonly number[])[]): Vec3 {
  const [p, q, r] = planes;
  const det = (a: Vec3, b: Vec3, c: Vec3) => dot(a, cross(b, c));
  const col = (i: number): Vec3 => [p[i], q[i], r[i]];
  const rhs: Vec3 = [-p[3], -q[3], -r[3]];
  const d = det(col(0), col(1), col(2));
  return [det(rhs, col(1), col(2)) / d, det(col(0), rhs, col(2)) / d, det(col(0), col(1), rhs) / d];
}

/**
 * Writes the quaternion of a medal's attitude at `out[at … at + 3]`: turned by
 * `turn` about its own axis, then tipped over by `tilt` about the level line
 * that points along `heading` (an angle from the x axis toward the player).
 */
export function attitude(out: Float32Array, at: number, turn: number, tilt: number, heading: number): void {
  const st = Math.sin(tilt / 2);
  const ct = Math.cos(tilt / 2);
  const ax = Math.cos(heading) * st;
  const az = Math.sin(heading) * st;
  const sy = Math.sin(turn / 2);
  const cy = Math.cos(turn / 2);
  // (ax, 0, az, ct) × (0, sy, 0, cy)
  out[at] = ax * cy - az * sy;
  out[at + 1] = ct * sy;
  out[at + 2] = az * cy + ax * sy;
  out[at + 3] = ct * cy;
}

/** Turns a vector by a quaternion stored at `q[at … at + 3]`. */
export function rotate(q: ArrayLike<number>, at: number, v: Vec3): Vec3 {
  const x = q[at];
  const y = q[at + 1];
  const z = q[at + 2];
  const w = q[at + 3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
