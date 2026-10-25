import { describe, expect, test } from "bun:test"
import { checkContract } from "../../src/contract/check-contract.ts"
import { readContract, readShippedModels } from "../../src/contract/read-shipped-models.ts"
import { COMMITTED_MODELS } from "../../src/model-paths.ts"

describe("the shipped models", () => {
  test("match the asset contract", async () => {
    const contract = readContract()
    const models = await readShippedModels()
    const report = checkContract(contract, models, COMMITTED_MODELS)
    expect(report.errors).toEqual([])
    expect(report.summaries.map((summary) => summary.name)).toEqual(
      expect.arrayContaining([...COMMITTED_MODELS]),
    )
  })

  test("a model over its budget or missing a POI fails, saying which", async () => {
    const contract = readContract()
    const models = await readShippedModels()
    const office = models.get("office.glb")
    if (!office) throw new Error("office.glb is committed")
    office.document
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === "poi-ship-3")
      ?.dispose()
    const report = checkContract(
      contract,
      new Map([...models, ["office.glb", { ...office, bytes: 10_000_000 }]]),
      COMMITTED_MODELS,
    )
    expect(report.errors).toContain("office.glb: 9766 KB > budget 742 KB")
    expect(report.errors).toContain("office.glb: poi-ship ids missing: 3")
  })

  test("a missing required model is a break", async () => {
    const report = checkContract(readContract(), new Map(), COMMITTED_MODELS)
    expect(report.errors).toEqual(["robot.glb: missing", "office.glb: missing"])
  })
})
