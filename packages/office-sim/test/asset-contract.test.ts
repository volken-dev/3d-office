import { describe, expect, test } from "bun:test"
import {
  AssetContractSchema,
  contractMajorVersion,
  SUPPORTED_CONTRACT_MAJOR,
} from "../src/asset-contract"
import { TINY_CONTRACT } from "./support/tiny-office"

describe("asset contract", () => {
  test("accepts a minimal contract and keeps unknown keys", () => {
    const parsed = AssetContractSchema.parse({ ...TINY_CONTRACT, about: "more" })
    expect(parsed.transitions.byPoiKind.charge?.enter).toEqual(["Sit", "Plug_In"])
    expect(parsed.about).toBe("more")
  })

  test("rejects a contract with a malformed version or transitions", () => {
    expect(AssetContractSchema.safeParse({ ...TINY_CONTRACT, contractVersion: "5" }).success).toBe(
      false,
    )
    const badTransitions = { ...TINY_CONTRACT.transitions, byPoiKind: { charge: { enter: "Sit" } } }
    expect(
      AssetContractSchema.safeParse({ ...TINY_CONTRACT, transitions: badTransitions }).success,
    ).toBe(false)
  })

  test("reads the major version", () => {
    expect(contractMajorVersion("5.0.0")).toBe(SUPPORTED_CONTRACT_MAJOR)
    expect(contractMajorVersion("12.3.4")).toBe(12)
    expect(() => contractMajorVersion("v5")).toThrow()
  })
})
