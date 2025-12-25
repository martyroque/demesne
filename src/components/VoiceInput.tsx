import React, { useEffect } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onListening?: (isListening: boolean) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  onListening,
}) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript && !listening) {
      // Stopped listening, send transcript
      onTranscript(transcript);
      resetTranscript();
    }
  }, [listening, transcript]);

  useEffect(() => {
    if (onListening) {
      onListening(listening);
    }
  }, [listening]);

  if (!browserSupportsSpeechRecognition) {
    return (
      <div style={{ color: "red" }}>
        Browser doesn't support speech recognition. Use Chrome or Edge.
      </div>
    );
  }

  if (!isMicrophoneAvailable) {
    return (
      <div style={{ color: "red" }}>
        No microphone available for voice recognition.
      </div>
    );
  }

  const startListening = () => {
    resetTranscript();
    SpeechRecognition.startListening({ continuous: false });
  };

  return (
    <div className="voice-input">
      <button
        onClick={startListening}
        disabled={listening}
        style={{
          padding: "15px 30px",
          fontSize: "16px",
          backgroundColor: listening ? "#ff4444" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "50%",
          cursor: listening ? "not-allowed" : "pointer",
          width: "80px",
          height: "80px",
        }}
      >
        {listening ? "🎤" : "🎙️"}
      </button>

      {listening && (
        <div style={{ marginTop: "10px", color: "#666" }}>Listening...</div>
      )}

      {transcript && (
        <div style={{ marginTop: "10px", fontStyle: "italic" }}>
          "{transcript}"
        </div>
      )}
    </div>
  );
};
