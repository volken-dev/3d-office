/**
 * draco3dgltf ships no types. glTF-Transform only hands these modules on to its Draco extension,
 * so they stay opaque here.
 */
declare module "draco3dgltf" {
  /** Builds the Draco decoder (WebAssembly); register it as `draco3d.decoder`. */
  export function createDecoderModule(): Promise<unknown>
  /** Builds the Draco encoder (WebAssembly); register it as `draco3d.encoder`. */
  export function createEncoderModule(): Promise<unknown>
  const draco3d: {
    createDecoderModule: typeof createDecoderModule
    createEncoderModule: typeof createEncoderModule
  }
  export default draco3d
}
