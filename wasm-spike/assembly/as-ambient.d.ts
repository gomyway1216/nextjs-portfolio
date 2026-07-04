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

/** AssemblyScript `memory` builtins (static data reservation). */
declare namespace memory {
  function data(size: i32, align?: i32): usize;
}
