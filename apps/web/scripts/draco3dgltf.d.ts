/** draco3dgltf ships no types; the asset pipeline only hands its decoder module to gltf-transform. */
declare module "draco3dgltf" {
  const draco3d: {
    createDecoderModule(): Promise<unknown>
  }
  export default draco3d
}
