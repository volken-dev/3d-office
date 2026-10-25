/** gltf-validator ships no types; the report is parsed with zod where it is read. */
declare module "gltf-validator" {
  /** Validates a GLB or glTF file's bytes against the glTF 2.0 spec (Khronos validator). */
  export function validateBytes(
    data: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<unknown>
  const validator: { validateBytes: typeof validateBytes }
  export default validator
}
