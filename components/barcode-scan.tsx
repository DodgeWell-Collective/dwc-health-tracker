"use client";

import { useEffect, useRef, useState } from "react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type Detector = { detect(source: HTMLVideoElement | Blob): Promise<{ rawValue: string }[]> };

async function makeDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats?.())?.includes("ean_13")) return new Native({ formats: FORMATS });
  // iPhone Safari has no native detector; load the WebAssembly one only when needed.
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

/**
 * iPhones don't keep camera permission for web apps, so live scanning asks every time.
 * There, unless the camera is already allowed, take a photo with the built-in camera
 * instead: it needs no permission.
 */
function usePhotoCapture() {
  const [photo, setPhoto] = useState(false);
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return;
    setPhoto(true);
    navigator.permissions?.query({ name: "camera" as PermissionName }).then(
      (status) => {
        const update = () => setPhoto(status.state !== "granted");
        update();
        status.onchange = update;
      },
      () => {},
    );
  }, []);
  return photo;
}

/** Camera button that reads a product barcode and hands back its digits. */
export function BarcodeScan({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const photo = usePhotoCapture();

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) return;
        video.current!.srcObject = stream;
        await video.current!.play();
        const detector = await makeDetector();
        while (!stopped) {
          const found = await detector.detect(video.current!).catch(() => []);
          if (found[0]?.rawValue) {
            navigator.vibrate?.(50);
            onCode(found[0].rawValue);
            setOpen(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        setError("Camera unavailable. Type the barcode digits instead.");
        setOpen(false);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);

  async function readPhoto(picked: File | undefined) {
    if (!picked) return;
    setReading(true);
    try {
      const found = await (await makeDetector()).detect(picked);
      if (found[0]?.rawValue) onCode(found[0].rawValue);
      else setError("No barcode found. Try again a little closer.");
    } catch {
      setError("Couldn't read that photo. Type the barcode digits instead.");
    } finally {
      setReading(false);
      if (file.current) file.current.value = "";
    }
  }

  function scan() {
    setError(undefined);
    if (photo) {
      file.current?.click();
      // Start fetching the decoder while the camera is up.
      void import("barcode-detector/ponyfill");
    } else setOpen(true);
  }

  return (
    <>
      <button type="button" onClick={scan} disabled={reading} aria-label="Scan a barcode" title="Scan a barcode" className="rounded-md border border-zinc-300 px-2.5 text-zinc-500 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700">
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${reading ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8" />
        </svg>
      </button>
      <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => readPhoto(e.target.files?.[0])} />
      {error && <span className="basis-full text-xs text-red-600" role="status">{error}</span>}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" onClick={() => setOpen(false)}>
          <video ref={video} playsInline muted className="w-full max-w-md rounded-lg" />
          <p className="text-sm text-zinc-300">Point at the barcode · tap to cancel</p>
        </div>
      )}
    </>
  );
}
