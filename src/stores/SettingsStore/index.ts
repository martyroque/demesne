import { Store } from "nucleux";

class SettingsStore extends Store {
  public ttsVoice = this.atom<string>("en_US-lessac-medium", {
    persistence: { persistKey: "ttsVoice" },
  });
  public autoPlayTTS = this.atom<boolean>(true, {
    persistence: { persistKey: "autoPlayTTS" },
  });

  setTTSVoice(ttsVoice: string) {
    this.ttsVoice.value = ttsVoice;
  }

  setAutoPlayTTS(autoPlayTTS: boolean) {
    this.autoPlayTTS.value = autoPlayTTS;
  }
}

export default SettingsStore;
