import { generate506cCircular } from "@/lib/offering-circular-506c.server";

const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const ROAS = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";

const result = await generate506cCircular(ALYSSA, ROAS);
console.log("generated:", JSON.stringify(result));
