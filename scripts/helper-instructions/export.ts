import { mkdir, writeFile } from "node:fs/promises";
import { buildHelperInstructionSheet } from "../../src/lib/helper-instructions-pdf";

await mkdir("public/downloads", { recursive: true });
await writeFile("public/downloads/Harmonious-Add-a-Paperwork-Helper.pdf", await buildHelperInstructionSheet());