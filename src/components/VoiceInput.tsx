import { useStore } from "nucleux";
import React, { useEffect, useRef, useState } from "react";

import WhisperService from "../services/whisper";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onListening?: (isListening: boolean) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  onListening,
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (onListening) {
      onListening(isRecording);
    }
  }, [isRecording, onListening]);

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
    <div className="voice-input" style={{ textAlign: "center" }}>
      <button
        onClick={handleMicClick}
        disabled={isProcessing}
        style={{
          padding: "15px 30px",
          fontSize: "16px",
          backgroundColor: isRecording
            ? "#ff4444"
            : isProcessing
              ? "#999"
              : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "50%",
          cursor: isProcessing || isRecording ? "not-allowed" : "pointer",
          width: "80px",
          height: "80px",
          transition: "all 0.3s ease",
          boxShadow: isRecording
            ? "0 0 20px rgba(255, 68, 68, 0.6)"
            : "0 4px 8px rgba(0,0,0,0.2)",
        }}
      >
        {isProcessing ? "⏳" : isRecording ? "🎤" : "🎙️"}
      </button>

      {isRecording && (
        <div
          style={{ marginTop: "10px", color: "#ff4444", fontWeight: "bold" }}
        >
          Recording... {recordingTime.toFixed(1)}s
          <div style={{ fontSize: "12px", marginTop: "5px", color: "#666" }}>
            Click to stop
          </div>
        </div>
      )}

      {isProcessing && (
        <div style={{ marginTop: "10px", color: "#666" }}>
          Transcribing with Whisper...
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "10px",
            color: "#ff4444",
            fontSize: "14px",
            padding: "8px",
            backgroundColor: "rgba(255, 68, 68, 0.1)",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
