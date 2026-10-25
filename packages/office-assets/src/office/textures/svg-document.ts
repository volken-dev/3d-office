/** Wraps SVG markup in a document of the given pixel size (the PNG is rasterised at that size). */
export function svgDocument(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
}
