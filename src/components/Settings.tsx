import { useStore, useValue } from "nucleux";
import React, { useState } from "react";
import ModelStore from "../stores/ModelStore";
import SettingsStore from "../stores/SettingsStore";

export const Settings: React.FC = () => {
  const modelStore = useStore(ModelStore);
  const settingsStore = useStore(SettingsStore);

  const models = useValue(modelStore.models);
  const activeModel = useValue(modelStore.activeModel);
  const isLoading = useValue(modelStore.isLoading);
  const ttsVoice = useValue(settingsStore.ttsVoice);
  const autoPlayTTS = useValue(settingsStore.autoPlayTTS);
  const homeControlEnabled = useValue(settingsStore.homeControlEnabled);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="settings-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "8px 16px",
          fontSize: "14px",
          backgroundColor: "#1a1a1a",
          color: "rgba(255, 255, 255, 0.87)",
          border: "1px solid #646cff",
          borderRadius: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          transition: "border-color 0.25s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#535bf2")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#646cff")}
      >
        ⚙️ Settings
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "50px",
            right: "20px",
            backgroundColor: "#1a1a1a",
            color: "rgba(255, 255, 255, 0.87)",
            border: "1px solid #646cff",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            minWidth: "320px",
            maxHeight: "80vh",
            overflowY: "auto",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0, color: "rgba(255, 255, 255, 0.87)" }}>
              Settings
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                padding: "0 4px",
                color: "rgba(255, 255, 255, 0.87)",
              }}
            >
              ✕
            </button>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
              }}
            >
              Active Model
            </label>
            <select
              value={activeModel}
              onChange={(e) => modelStore.setActiveModel(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                borderRadius: "4px",
                border: "1px solid #646cff",
                backgroundColor: "#242424",
                color: "rgba(255, 255, 255, 0.87)",
                cursor: "pointer",
              }}
            >
              {isLoading && <option disabled>Loading models...</option>}
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "rgba(255, 255, 255, 0.6)",
              }}
            >
              {models.length} model{models.length !== 1 ? "s" : ""} available
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: "12px",
                fontWeight: "500",
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
              }}
            >
              Voice Responses
            </label>

            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                Voice (WIP)
              </label>
              <select
                value={ttsVoice}
                // WIP
                // onChange={(e) => settingsStore.setTTSVoice(e.target.value)}
                disabled
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid #646cff",
                  backgroundColor: "#242424",
                  color: "rgba(255, 255, 255, 0.87)",
                  cursor: "pointer",
                }}
              >
                <optgroup label="English (US)">
                  <option value="en_US-lessac-medium">
                    Lessac (Female, Clear)
                  </option>
                  <option value="en_US-amy-medium">
                    Amy (Female, Neutral)
                  </option>
                  <option value="en_US-danny-low">Danny (Male, Low)</option>
                </optgroup>
              </select>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={autoPlayTTS}
                onChange={(e) => settingsStore.setAutoPlayTTS(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Auto-play responses
            </label>

            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "rgba(255, 255, 255, 0.6)",
              }}
            >
              {autoPlayTTS
                ? "Zion will speak responses automatically"
                : "Click 🔊 to play responses manually"}
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: "12px",
                fontWeight: "500",
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
              }}
            >
              Home Control
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={homeControlEnabled}
                onChange={(e) =>
                  settingsStore.setHomeControlEnabled(e.target.checked)
                }
                style={{ cursor: "pointer" }}
              />
              Enable Home Control
            </label>

            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "rgba(255, 255, 255, 0.6)",
              }}
            >
              {homeControlEnabled
                ? "Zion will control your home via command"
                : "Zion will only function as a chat"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
