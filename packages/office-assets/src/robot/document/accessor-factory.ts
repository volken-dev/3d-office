import type { Accessor, Buffer, Document, GLTF, TypedArray } from "@gltf-transform/core"

/** Creates an accessor of `type` over `array` in the document's one buffer. */
export type AccessorFactory = (type: GLTF.AccessorType, array: TypedArray) => Accessor

/** An {@link AccessorFactory} writing into `buffer`. */
export function createAccessorFactory(document: Document, buffer: Buffer): AccessorFactory {
  return (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
}
