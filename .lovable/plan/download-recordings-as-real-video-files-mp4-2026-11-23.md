# Download recordings as real video files (MP4)

## What changes
On the Screen recordings page, the Download button gives you an MP4 video that plays anywhere: QuickTime, Windows Photos, phones, email attachments.

- **Page replays** (the hidden, masked background ones) download today as a web page file. They will download as an MP4 video of the replay instead, with typed text still hidden.
- **Screen videos** (person-started, with optional camera/microphone) download today as WebM files, which many Macs and phones won't open. They will download as MP4. When a camera or microphone was recorded, it is combined into the same video (camera as a small corner picture, sound included) so you get one file.
- While it's being made, the button shows "Making video… 40%". Long recordings take about as long to prepare as a fast replay; you can keep using the page.
- Downloads stay leadership-only and are still logged each time. Nothing about who can watch changes.

## Technical details
- Conversion runs in the viewer's browser, on demand, so no recording data leaves storage beyond what download already reads.
- Page replays: play the existing rrweb events in an offscreen replayer, capture frames at fixed intervals (html2canvas-pro onto a canvas), encode H.264 with WebCodecs `VideoEncoder` and mux with `mp4-muxer`. Fallback when WebCodecs is missing: keep the current HTML replay download with a short note.
- Screen videos: fetch the signed WebM URLs to blobs, draw screen + camera onto one canvas, decode audio, re-encode to MP4 with WebCodecs + `mp4-muxer`; fallback to original WebM if the browser can't encode.
- New `src/lib/recording-video.ts` (client-only, dynamically imported); `DownloadRecording` in `ops.session-recordings.tsx` uses it with progress state and the existing `downloadBlob`.
- Server: `downloadRecording` file names change to `.mp4`; audit event unchanged.
- Test: a small unit test for frame-timing/file-name rules; Playwright check that a downloaded file is non-empty MP4 (`ftyp` header).
