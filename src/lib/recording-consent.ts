/**
 * Camera and microphone consent shown in "Record my screen or camera".
 * Draft wording prepared for counsel review. When counsel changes the words,
 * bump CAMERA_CONSENT.version so each saved video keeps the version the person agreed to.
 */
export const CAMERA_CONSENT = {
  version: "camera-mic-consent-2026-11-19-draft1",
  title: "Before you record your camera and microphone",
  points: [
    { heading: "What is recorded", text: "Your screen, your camera and your voice, only from when you press Start recording until you press Stop recording." },
    { heading: "Why", text: "So Harmonious can see and hear the problem you are showing us and help fix it. We do not use it for marketing, to identify you by your face or voice, or to train software." },
    { heading: "You are in control", text: "Nothing is sent until you watch the video and press Send. You can stop at any time, and you can discard it instead of sending it." },
    { heading: "Who can watch it", text: "Only a small group of Harmonious leaders. Every viewing and download is logged." },
    { heading: "Other people", text: "Anyone else who can be seen or heard should agree to be recorded first. If not, record somewhere private." },
    { heading: "Keeping and removing it", text: "Sent videos are kept with your support records under our record retention policy. To ask about a video or request its deletion, email support@harmonious.co or use Account, then Privacy." },
  ],
  agreement: "I agree that Harmonious may record my screen, camera and microphone for this video and use it as described above.",
  browserStep: "Next, choose the screen to share. Your browser will then ask to use your camera and microphone. Choose Allow.",
} as const;

export type RecordingChoice = "screen" | "camera";
export type CamKind = "none" | "camera_microphone" | "microphone";

/** Camera recording can start only after the consent box is ticked. Screen only needs no camera consent. */
export function canStartRecording(choice: RecordingChoice, agreed: boolean): boolean {
  return choice === "screen" || agreed;
}

/** Consent facts saved with the video. Camera/microphone flags and consent only when that media was actually captured. */
export function consentFacts(camKind: CamKind, hasCameraFile: boolean, consentedAt: string | null) {
  const withCam = camKind !== "none" && hasCameraFile;
  if (!withCam || !consentedAt) return { withCam: false, camera: false, microphone: false } as const;
  return { withCam: true, camera: camKind === "camera_microphone", microphone: true, consentedAt, consentVersion: CAMERA_CONSENT.version } as const;
}

/** Server check: a camera or microphone upload needs the current consent version and a consent time. */
export function cameraConsentValid(info: { consentVersion?: string | null; consentedAt?: string | null } | null | undefined): boolean {
  return !!info && info.consentVersion === CAMERA_CONSENT.version && !!info.consentedAt && !Number.isNaN(Date.parse(info.consentedAt));
}
