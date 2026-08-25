// Typed-array allocation, factored out of engine/ so that engine/ never needs
// `new` (ruling 004). A Luau twin replaces these three functions with
// table.create and nothing else changes.

export function u8(length) {
  return new Uint8Array(length);
}

export function u16(length) {
  return new Uint16Array(length);
}

export function i32(length) {
  return new Int32Array(length);
}

export function copyU8(source) {
  const out = new Uint8Array(source.length);
  out.set(source);
  return out;
}

export function copyU16(source) {
  const out = new Uint16Array(source.length);
  out.set(source);
  return out;
}

export function copyI32(source) {
  const out = new Int32Array(source.length);
  out.set(source);
  return out;
}

/** Fills without a loop in the adapter layer, so engine/ stays declarative. */
export function fill(array, value) {
  array.fill(value);
  return array;
}
