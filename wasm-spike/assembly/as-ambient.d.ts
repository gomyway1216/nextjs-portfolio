// Ambient declarations so the AssemblyScript sources in this directory also
// type-check under the app's root tsconfig (`include: ["**/*.ts"]`) without
// modifying tsconfig.json. The AssemblyScript compiler (asc) ignores this file
// and uses its own built-in definitions of these names.
//
// NOTE: These files are compiled to WASM by `asc`; they are never executed as
// JavaScript, so the declarations only need to satisfy the type checker.

declare type i8 = number;
declare type i16 = number;
declare type i32 = number;
declare type i64 = number;
declare type u8 = number;
declare type u16 = number;
declare type u32 = number;
declare type u64 = number;
declare type f32 = number;
declare type f64 = number;
declare type bool = boolean;

declare class StaticArray<T> {
  [key: number]: T;
  constructor(length: number);
  readonly length: number;
  static fromArray<U>(source: U[]): StaticArray<U>;
}

/** AssemblyScript intrinsic: skip bounds checks on array access. */
declare function unchecked<T>(expr: T): T;

declare type usize = number;

/** AssemblyScript intrinsic: raw memory load (little-endian). */
declare function load<T>(ptr: usize, immOffset?: number): T;

/** AssemblyScript intrinsic: raw memory store (little-endian). */
declare function store<T>(ptr: usize, value: T, immOffset?: number): void;

/** AssemblyScript `memory` builtins (static data reservation). */
declare namespace memory {
  function data(size: i32, align?: i32): usize;
}

/** AssemblyScript intrinsic: reinterpret a value as another type (no-op cast). */
declare function changetype<T>(value: unknown): T;

/**
 * WASM SIMD128 builtins (subset used by the NNUE inference). `asc` compiles
 * these to single v128 instructions; the declarations only satisfy tsc.
 */
declare class v128 {
  private __v128: never; // nominal typing: v128 is not interchangeable with number
  static load(ptr: usize, immOffset?: number): v128;
  static store(ptr: usize, value: v128, immOffset?: number): void;
  static any_true(a: v128): bool;
}

declare namespace i32x4 {
  function splat(value: i32): v128;
  function add(a: v128, b: v128): v128;
  function sub(a: v128, b: v128): v128;
  function max_s(a: v128, b: v128): v128;
  function min_s(a: v128, b: v128): v128;
  function shr_s(a: v128, shift: i32): v128;
  function extend_low_i16x8_s(a: v128): v128;
  function extend_high_i16x8_s(a: v128): v128;
  function extmul_low_i16x8_s(a: v128, b: v128): v128;
  function extmul_high_i16x8_s(a: v128, b: v128): v128;
  function dot_i16x8_s(a: v128, b: v128): v128;
  function extract_lane(a: v128, idx: number): i32;
}

declare namespace i16x8 {
  function splat(value: i16): v128;
  function narrow_i32x4_s(a: v128, b: v128): v128;
}
