import { useStore } from "nucleux";
import React, { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import WhisperService from "@/services/whisper";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onListening?: (isListening: boolean) => void;
  autoActivate?: boolean; // Automatically start recording when true
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  onListening,
  autoActivate = false,
}) => {
  const whisperService = useStore(WhisperService);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoActivatedRef = useRef(false);

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    // Stop recording and clear timer on unmount
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onListening) {
      onListening(isRecording);
    }
  }, [isRecording, onListening]);

  // Auto-activate recording when wake word detected
  useEffect(() => {
    if (autoActivate && !isRecording && !autoActivatedRef.current) {
      autoActivatedRef.current = true;
      startRecording();
    } else if (!autoActivate) {
      autoActivatedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoActivate, isRecording]);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      setRecordingTime(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16kHz for Whisper
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const supportedMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];

      let mimeType = "";
      for (const type of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log(`Using mimeType: ${mimeType}`);
          break;
        }
      }

      if (!mimeType) {
        throw new Error("No supported audio format found");
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }

        if (audioChunksRef.current.length === 0) {
          setError("No audio recorded");
          return;
        }

        setIsProcessing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType || "audio/webm",
          });

          console.log(
            `Audio recorded: ${audioBlob.size} bytes, ${recordingTime}s`
          );

          const result = await whisperService.transcribe(audioBlob);

          if (result.text.trim()) {
            onTranscript(result.text.trim());
          } else {
            setError("No speech detected");
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setIsProcessing(false);
          audioChunksRef.current = [];
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 0.1);
      }, 100);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Microphone access denied or unavailable"
      );
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Button
        onClick={handleMicClick}
        disabled={isProcessing}
        size="icon"
        className={cn(
          "h-20 w-20 rounded-full text-3xl transition-all duration-300",
          isRecording &&
            "bg-red-500 shadow-lg shadow-red-500/60 hover:bg-red-600",
          isProcessing && "cursor-not-allowed bg-muted",
          !isRecording &&
            !isProcessing &&
            "bg-green-500 shadow-lg shadow-black/20 hover:bg-green-600"
        )}
      >
        {isProcessing ? "⏳" : isRecording ? "🎤" : "🎙️"}
      </Button>

      {isRecording && (
        <div className="flex flex-col gap-1">
          <Badge variant="destructive" className="animate-pulse">
            Recording... {recordingTime.toFixed(1)}s
          </Badge>
          <p className="text-xs text-muted-foreground">Click to stop</p>
        </div>
      )}

      {isProcessing && (
        <Badge variant="secondary">Transcribing with Whisper...</Badge>
      )}

      {error && (
        <div className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
};
