import { OFFICE_TEXTURES_DIRECTORY } from "../src/office/office-paths.ts"
import { writeOfficeTextures } from "../src/office/textures/office-textures.ts"

const names = await writeOfficeTextures(OFFICE_TEXTURES_DIRECTORY)
console.info(
  "textures:",
  names
    .sort()
    .map((name) => `${name}.png`)
    .join(" "),
)
