import { expect, it } from "vitest";
import { cleanSecondaryPhone } from "./person-phones";
it("normalizes Thomas's provided secondary number", () => expect(cleanSecondaryPhone("12147286100")).toEqual({ ok: true, value: "+12147286100" }));
it("accepts formatted international phone", () => expect(cleanSecondaryPhone("+1 (214) 728-6100")).toEqual({ ok: true, value: "+12147286100" }));
it("clears an empty number", () => expect(cleanSecondaryPhone("")).toEqual({ ok: true, value: null }));
it("rejects a missing country code", () => expect(cleanSecondaryPhone("2147286100").ok).toBe(false));
it("rejects malformed numbers", () => expect(cleanSecondaryPhone("+1abc").ok).toBe(false));