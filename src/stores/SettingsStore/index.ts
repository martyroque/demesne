import { Store } from "nucleux";

class SettingsStore extends Store {
  public ttsVoice = this.atom<string>("en_US-amy-medium", {
    persistence: { persistKey: "ttsVoice" },
  });
  public autoPlayTTS = this.atom<boolean>(true, {
    persistence: { persistKey: "autoPlayTTS" },
  });
  public homeControlEnabled = this.atom<boolean>(true, {
    persistence: { persistKey: "homeControlEnabled" },
  });
  public wakeWordEnabled = this.atom<boolean>(false, {
    persistence: { persistKey: "wakeWordEnabled" },
  });
  public wakeWordPhrase = this.atom<string>("hey jarvis", {
    persistence: { persistKey: "wakeWordPhrase" },
  });

  setAutoPlayTTS(autoPlayTTS: boolean) {
    this.autoPlayTTS.value = autoPlayTTS;
  }

  setHomeControlEnabled(homeControlEnabled: boolean) {
    this.homeControlEnabled.value = homeControlEnabled;
  }

  setWakeWordEnabled(enabled: boolean) {
    this.wakeWordEnabled.value = enabled;
  }
}

export default SettingsStore;
