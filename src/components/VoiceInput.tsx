import { useStore, useValue } from "nucleux";
import React, { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MediaRecorderService from "@/services/media-recorder";

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
  const mediaRecorderService = useStore(MediaRecorderService);

  const isRecording = useValue(mediaRecorderService.isRecording);
  const isProcessing = useValue(mediaRecorderService.isProcessing);
  const recordingTime = useValue(mediaRecorderService.recordingTime);
  const error = useValue(mediaRecorderService.error);

  const autoActivatedRef = useRef(false);

  useEffect(() => {
    if (onListening) {
      onListening(isRecording);
    }
  }, [isRecording, onListening]);

  // Auto-activate recording when wake word detected
  useEffect(() => {
    if (autoActivate && !isRecording && !autoActivatedRef.current) {
      autoActivatedRef.current = true;
      mediaRecorderService.startRecording(onTranscript).then(() => {
        mediaRecorderService.startSilenceDetection();
      });
    } else if (!autoActivate) {
      autoActivatedRef.current = false;
    }
    // TODO: move logic to voice store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoActivate, isRecording]);

  const handleMicClick = () => {
    if (isRecording) {
      mediaRecorderService.stopRecording();
    } else {
      mediaRecorderService.startRecording(onTranscript);
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
