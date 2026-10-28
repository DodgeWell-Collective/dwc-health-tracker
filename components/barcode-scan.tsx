"use client";

import { useEffect, useRef, useState } from "react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

async function makeDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats?.())?.includes("ean_13")) return new Native({ formats: FORMATS });
  // iPhone Safari has no native detector; load the WebAssembly one only when needed.
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

/**
 * Camera button that reads a product barcode and hands back its digits. With `continuous`,
 * the camera stays open for one item after another (a grocery haul) and shows `status`.
 */
export function BarcodeScan({ onCode, continuous, status }: { onCode: (code: string) => void; continuous?: boolean; status?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const video = useRef<HTMLVideoElement>(null);

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
        // The same item held in view reads many times a second; take it once.
        let last = { code: "", at: 0 };
        while (!stopped) {
          const code = (await detector.detect(video.current!).catch(() => []))[0]?.rawValue;
          if (code && !(code === last.code && Date.now() - last.at < 3000)) {
            navigator.vibrate?.(50);
            onCode(code);
            if (!continuous) {
              setOpen(false);
              return;
            }
            last = { code, at: Date.now() };
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
  }, [open, onCode, continuous]);

  return (
    <>
      <button type="button" onClick={() => { setError(undefined); setOpen(true); }} aria-label="Scan a barcode" title="Scan a barcode" className="rounded-md border border-zinc-300 px-2.5 text-zinc-500 hover:text-emerald-600 dark:border-zinc-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8" />
        </svg>
      </button>
      {error && <span className="basis-full text-xs text-red-600" role="status">{error}</span>}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" onClick={() => setOpen(false)}>
          <video ref={video} playsInline muted className="w-full max-w-md rounded-lg" />
          {status && <p className="text-sm font-medium text-emerald-400" role="status">{status}</p>}
          <p className="text-sm text-zinc-300">{continuous ? "Scan items one after another · tap when done" : "Point at the barcode · tap to cancel"}</p>
        </div>
      )}
    </>
  );
}
