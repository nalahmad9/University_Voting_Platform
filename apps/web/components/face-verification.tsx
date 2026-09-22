"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { FaceReferenceError, loadFaceReference } from "@/lib/face-verification-client";

const MODEL_PATH = "/models/face-api";
const MATCH_THRESHOLD = 0.48;
const CHECK_TIMEOUT_MS = 8_000;

type FaceApiModule = typeof import("face-api.js");
let modelLoader: Promise<FaceApiModule> | undefined;

async function loadModels(): Promise<FaceApiModule> {
  modelLoader ??= import("face-api.js").then(async faceapi => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH)
    ]);
    return faceapi;
  });
  return modelLoader;
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Camera video could not start")); };
    const cleanup = () => {
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
    };
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

function averageX(points: Array<{ x: number }>): number {
  return points.reduce((total, point) => total + point.x, 0) / points.length;
}

export function FaceVerification({
  accessToken,
  verified,
  onVerified
}: {
  accessToken: string;
  verified: boolean;
  onVerified: (distance: number) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Camera remains off until you begin");
  const [error, setError] = useState("");

  useEffect(() => {
    // Warm the locally hosted models before the student starts the camera.
    void loadModels().catch(() => {
      modelLoader = undefined;
    });
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    stopCamera();
  }, []);

  const runVerification = async () => {
    if (!consent || running || !videoRef.current) return;
    cancelledRef.current = false;
    setRunning(true);
    setProgress(4);
    setError("");
    setMessage("Preparing the face check…");

    let referenceUrl = "";
    try {
      const [faceapi, referenceBlob] = await Promise.all([
        loadModels(),
        loadFaceReference(accessToken)
      ]);
      if (cancelledRef.current) return;
      setProgress(18);
      setMessage("Loading your registered profile photo…");

      referenceUrl = URL.createObjectURL(referenceBlob);
      const referenceImage = await faceapi.fetchImage(referenceUrl);
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });
      const reference = await faceapi
        .detectSingleFace(referenceImage, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!reference) {
        throw new Error("No clear face was found in your registered profile photo. Contact the election administrator.");
      }

      setMessage("Requesting camera access…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (cancelledRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await waitForVideo(videoRef.current);

      const startedAt = Date.now();
      let matchedFrames = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      let minimumNoseRatio = Number.POSITIVE_INFINITY;
      let maximumNoseRatio = Number.NEGATIVE_INFINITY;
      let identityMatched = false;

      while (!cancelledRef.current && Date.now() - startedAt < CHECK_TIMEOUT_MS) {
        const elapsed = Date.now() - startedAt;
        setProgress(25 + Math.min(65, Math.round((elapsed / CHECK_TIMEOUT_MS) * 65)));
        const faces = await faceapi
          .detectAllFaces(videoRef.current, options)
          .withFaceLandmarks(true)
          .withFaceDescriptors();

        if (faces.length === 0) {
          setMessage("Position your face inside the frame");
        } else if (faces.length > 1) {
          setMessage("Only one person should be visible");
        } else {
          const face = faces[0];
          const distance = faceapi.euclideanDistance(reference.descriptor, face.descriptor);
          bestDistance = Math.min(bestDistance, distance);
          if (distance < MATCH_THRESHOLD) {
            matchedFrames += 1;
            identityMatched = true;
          }

          // After an initial identity match, allow a small pose-related distance
          // increase while measuring the requested head movement.
          if (identityMatched && distance < MATCH_THRESHOLD + 0.1) {
            const leftEyeX = averageX(face.landmarks.getLeftEye());
            const rightEyeX = averageX(face.landmarks.getRightEye());
            const nose = face.landmarks.getNose();
            const noseX = nose[Math.min(3, nose.length - 1)].x;
            const innerEyeX = Math.min(leftEyeX, rightEyeX);
            const outerEyeX = Math.max(leftEyeX, rightEyeX);
            const eyeWidth = Math.max(1, outerEyeX - innerEyeX);
            const ratio = (noseX - innerEyeX) / eyeWidth;
            minimumNoseRatio = Math.min(minimumNoseRatio, ratio);
            maximumNoseRatio = Math.max(maximumNoseRatio, ratio);

            const movementRange = maximumNoseRatio - minimumNoseRatio;
            if (matchedFrames < 2) {
              setMessage("Face matched. Look straight at the camera");
            } else if (movementRange < 0.04) {
              setMessage("Turn your head slightly left, then right");
            } else {
              setProgress(100);
              setMessage("Identity and presence confirmed");
              stopCamera();
              await onVerified(bestDistance);
              return;
            }
          } else if (!identityMatched) {
            setMessage("Keep your face clear and look toward the camera");
          }
        }
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }

      if (!cancelledRef.current) {
        if (bestDistance >= MATCH_THRESHOLD) {
          throw new Error("Your face could not be matched to the registered profile photo. Use soft, even front lighting and avoid direct flash, then try again.");
        }
        throw new Error("The movement check was not completed. Turn your head more clearly and try again.");
      }
    } catch (failure) {
      stopCamera();
      setProgress(0);
      if (failure instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(failure.name)) {
        setError("Camera permission was denied. Allow camera access in your browser and try again.");
      } else if (failure instanceof FaceReferenceError || failure instanceof Error) {
        setError(failure.message);
      } else {
        setError("The face check could not be completed. Please try again.");
      }
      setMessage("Verification not completed");
    } finally {
      if (referenceUrl) URL.revokeObjectURL(referenceUrl);
      setRunning(false);
    }
  };

  return <div className="grid gap-8 lg:grid-cols-2">
    <div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${verified?"bg-[#e0f4ed] text-[#17745a]":"bg-[#ece9ff] text-[#6550b5]"}`}>{verified?"Check complete":"Identity check"}</span><h2 className="mt-4 text-3xl font-bold">Confirm your identity</h2><p className="mt-3 leading-7 text-[#5f5650]">Your camera image is compared with your registered university photo on this device. Camera images and face measurements are not uploaded or stored.</p><label className="mt-6 flex items-start gap-3 rounded-xl bg-[#f5f1e8] p-4 text-sm"><input type="checkbox" checked={consent} disabled={running||verified} onChange={event=>setConsent(event.target.checked)} className="mt-1 size-4 accent-[#8f2f43]"/><span>I consent to use my camera for this identity and presence check.</span></label>{error&&<div role="alert" className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800"><XCircle className="shrink-0" size={19}/><span>{error}</span></div>}{verified?<div className="mt-5 flex items-center gap-3 rounded-xl bg-[#e3f4ee] p-4 text-[#17604c]"><CheckCircle2/><div><strong>Verification passed</strong><p className="text-sm">You may continue to the candidates.</p></div></div>:<button disabled={!consent||running} onClick={()=>void runVerification()} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50">{running?<><RefreshCw size={18} className="animate-spin"/>Checking…</>:<><Camera size={18}/>Start face check</>}</button>}<div className="mt-5 flex items-start gap-3 text-sm text-[#6e665f]"><ShieldCheck className="mt-0.5 shrink-0 text-[#17745a]" size={18}/><p>Face matching supports voter verification but does not replace the separate anonymous voting safeguards.</p></div></div>
    <div className="relative grid min-h-[350px] place-items-center overflow-hidden rounded-[24px] bg-[#15101c] text-white"><video ref={videoRef} muted playsInline className={`absolute inset-0 size-full scale-x-[-1] object-cover ${running?"opacity-100":"opacity-0"}`}/><div className="pointer-events-none absolute inset-8 rounded-[42%] border-2 border-[#d9ad5f]"/><div className="relative z-10 text-center">{!running&&!verified&&<Camera size={48} className="mx-auto text-[#bdb3c2]"/>}{verified&&<CheckCircle2 size={56} className="mx-auto text-[#69c6aa]"/>}<p className="mt-4 px-8 text-sm font-semibold">{message}</p></div>{running&&<div className="absolute inset-x-8 bottom-8 z-20"><Progress value={progress} className="bg-white/15"/></div>}</div>
  </div>;
}
