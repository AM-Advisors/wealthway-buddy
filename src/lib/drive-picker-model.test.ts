import { describe, expect, it } from "vitest";
import { driveIdFromLink, driveQueryLiteral, isDriveId, pickedFileName, readableAs, sortEntries, toEntry } from "./drive-picker-model";

describe("drive picker rules", () => {
  it("reads folder and file IDs from pasted Drive links", () => {
    expect(driveIdFromLink("https://drive.google.com/drive/folders/12mMhCOcImd1qLqAAaEXYbyKNizq7PGt_?usp=sharing")).toEqual({ id: "12mMhCOcImd1qLqAAaEXYbyKNizq7PGt_", kind: "folder" });
    expect(driveIdFromLink("https://drive.google.com/drive/u/0/folders/12mMhCOcImd1qLqAAaEXYbyKNizq7PGt_")).toEqual({ id: "12mMhCOcImd1qLqAAaEXYbyKNizq7PGt_", kind: "folder" });
    expect(driveIdFromLink("https://drive.google.com/file/d/1VCK1P5nwxdjNxyxcWYk3ZVHrYluM-RIM/view")).toEqual({ id: "1VCK1P5nwxdjNxyxcWYk3ZVHrYluM-RIM", kind: "file" });
    expect(driveIdFromLink("Marwan Takieddine")).toBeNull();
  });
  it("rejects anything that isn't a Drive ID", () => {
    expect(isDriveId("12mMhCOcImd1qLqAAaEXYbyKNizq7PGt_")).toBe(true);
    expect(isDriveId("abc' or name contains '")).toBe(false);
    expect(isDriveId("short")).toBe(false);
  });
  it("only PDFs, images and Google Docs up to 10 MB can be read", () => {
    expect(readableAs("application/pdf", 478_000)).toEqual({ ok: true, as: "application/pdf" });
    expect(readableAs("application/vnd.google-apps.document", null)).toEqual({ ok: true, as: "application/pdf" });
    expect(readableAs("application/pdf", 11 * 1024 * 1024).ok).toBe(false);
    expect(readableAs("application/zip", 1000).ok).toBe(false);
  });
  it("escapes quotes in search terms", () => {
    expect(driveQueryLiteral("O'Brien")).toBe("O\\'Brien");
  });
  it("names exported Google Docs as PDFs", () => {
    expect(pickedFileName("Side letter", "application/vnd.google-apps.document")).toBe("Side letter.pdf");
    expect(pickedFileName("k1.pdf", "application/pdf")).toBe("k1.pdf");
  });
  it("lists folders before files", () => {
    const out = sortEntries([toEntry({ id: "f1xxxxxxxxxx", name: "b.pdf", mimeType: "application/pdf" }), toEntry({ id: "d1xxxxxxxxxx", name: "Investors", mimeType: "application/vnd.google-apps.folder" })]);
    expect(out.map((e) => e.kind)).toEqual(["folder", "file"]);
  });
});
