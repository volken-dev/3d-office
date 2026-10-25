import type { Document } from "@gltf-transform/core"
import type { ContractReport } from "./contract-report.ts"
import type { ContractFile } from "./contract-schema.ts"

/** What every file costs to draw, and its material names, for the summary and later checks. */
export type DrawCost = { triangles: number; drawCalls: number; materialNames: string[] }

/**
 * Checks what applies to every shipped file: only extensions the loaders support, and the
 * triangle, draw-call and byte budgets the contract sets.
 */
export function checkCommon(
  report: ContractReport,
  spec: ContractFile,
  document: Document,
  bytes: number,
  allowedExtensions: readonly string[],
): DrawCost {
  const root = document.getRoot()
  const outsideExtensions = root
    .listExtensionsUsed()
    .map((extension) => extension.extensionName)
    .filter((name) => !allowedExtensions.includes(name))
  if (outsideExtensions.length) {
    report.fail(
      `uses extensions outside loading.allowedExtensions: ${report.list(outsideExtensions)}`,
    )
  }
  let triangles = 0
  let drawCalls = 0
  for (const node of root.listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      drawCalls++
      const vertexCount =
        primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0
      triangles += vertexCount / 3
    }
  }
  const { budget } = spec
  if (triangles > budget.maxTriangles) {
    report.fail(`${triangles} triangles > budget ${budget.maxTriangles}`)
  }
  if (drawCalls > budget.maxDrawCalls) {
    report.fail(`${drawCalls} draw calls > budget ${budget.maxDrawCalls}`)
  }
  if (bytes > budget.maxBytes) {
    report.fail(
      `${(bytes / 1024).toFixed(0)} KB > budget ${(budget.maxBytes / 1024).toFixed(0)} KB`,
    )
  }
  return {
    triangles,
    drawCalls,
    materialNames: root.listMaterials().map((material) => material.getName()),
  }
}
