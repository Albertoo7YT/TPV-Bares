import type { MutableRefObject } from "react";

export function playKitchenDing(audioContextRef: MutableRefObject<AudioContext | null>) {
  playToneSequence(audioContextRef, [
    { frequency: 880, duration: 0.16, gain: 0.08, type: "sine" },
    { frequency: 1174, duration: 0.18, gain: 0.07, type: "triangle", gap: 0.04 }
  ]);
}

export function playWaiterReadyTone(
  audioContextRef: MutableRefObject<AudioContext | null>
) {
  playToneSequence(audioContextRef, [
    { frequency: 659, duration: 0.12, gain: 0.05, type: "triangle" },
    { frequency: 784, duration: 0.14, gain: 0.04, type: "sine", gap: 0.03 }
  ]);
}

export function vibrateIfSupported(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  navigator.vibrate(pattern);
}

function getAudioContext(audioContextRef: MutableRefObject<AudioContext | null>) {
  const AudioContextConstructor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  if (!audioContextRef.current) {
    audioContextRef.current = new AudioContextConstructor();
  }

  return audioContextRef.current;
}

function playToneSequence(
  audioContextRef: MutableRefObject<AudioContext | null>,
  tones: Array<{
    frequency: number;
    duration: number;
    gain: number;
    type: OscillatorType;
    gap?: number;
  }>
) {
  try {
    const context = getAudioContext(audioContextRef);

    if (!context) {
      return;
    }

    let cursor = context.currentTime;

    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const startTime = cursor;
      const endTime = startTime + tone.duration;

      oscillator.type = tone.type;
      oscillator.frequency.value = tone.frequency;
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(tone.gain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime);

      cursor = endTime + (tone.gap ?? 0);
    }
  } catch {
    // Ignore audio errors; the UI feedback still updates in real time.
  }
}
