import { describe, expect, it } from "vitest";
import { CAMERA_CONSENT, cameraConsentValid, canStartRecording, consentFacts } from "./recording-consent";

describe("camera and microphone consent", () => {
  it("camera recording cannot start until the consent box is ticked", () => {
    expect(canStartRecording("camera", false)).toBe(false);
    expect(canStartRecording("camera", true)).toBe(true);
  });
  it("screen only needs no camera consent", () => {
    expect(canStartRecording("screen", false)).toBe(true);
  });
  it("saves the consent version and time only when camera or microphone was captured", () => {
    const at = "2026-11-19T18:00:00.000Z";
    expect(consentFacts("camera_microphone", true, at)).toEqual({ withCam: true, camera: true, microphone: true, consentedAt: at, consentVersion: CAMERA_CONSENT.version });
    expect(consentFacts("microphone", true, at)).toMatchObject({ withCam: true, camera: false, microphone: true });
    expect(consentFacts("none", false, at)).toEqual({ withCam: false, camera: false, microphone: false });
    expect(consentFacts("camera_microphone", false, at).withCam).toBe(false);
  });
  it("server refuses camera uploads without the current consent version", () => {
    const at = "2026-11-19T18:00:00.000Z";
    expect(cameraConsentValid({ consentVersion: CAMERA_CONSENT.version, consentedAt: at })).toBe(true);
    expect(cameraConsentValid({ consentVersion: "old", consentedAt: at })).toBe(false);
    expect(cameraConsentValid({ consentVersion: CAMERA_CONSENT.version })).toBe(false);
    expect(cameraConsentValid(undefined)).toBe(false);
  });
});
