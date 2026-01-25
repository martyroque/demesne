import { Store } from "nucleux";

import HomeAssistantService from "@/services/home-assistant";
import IntentClassifierService from "@/services/intent-classifier";
import OllamaService, { type Message } from "@/services/ollama";
import PiperService from "@/services/piper";

import ChatHistoryStore from "../ChatHistoryStore";
import ModelStore from "../ModelStore";
import SettingsStore from "../SettingsStore";

class ChatStore extends Store {
  public isLoading = this.atom(false);
  public isStreaming = this.atom(false);
  public streamingMessage = this.atom("");

  private settingsStore = this.inject(SettingsStore);
  private chatHistoryStore = this.inject(ChatHistoryStore);
  private modelStore = this.inject(ModelStore);

  private piperService = this.inject(PiperService);
  private ollamaService = this.inject(OllamaService);
  private intentClassifierService = this.inject(IntentClassifierService);
  private homeAssistantService = this.inject(HomeAssistantService);

  async speakResponse(text: string) {
    const autoPlayTTS = this.settingsStore.autoPlayTTS.value;
    if (autoPlayTTS) {
      const ttsVoice = this.settingsStore.ttsVoice.value;
      await this.piperService.speak({ text, voice: ttsVoice });
    }
  }

  async sendMessage(message: string) {
    const userMessage: Message = { role: "user", content: message };

    this.chatHistoryStore.addMessage(userMessage);

    this.isLoading.value = true;

    try {
      const intentType =
        await this.intentClassifierService.classifyIntent(message);

      if (intentType === "HOME_CONTROL") {
        const result =
          await this.homeAssistantService.processConversation(message);
        const assistantMessage: Message = {
          role: "assistant",
          content: result,
        };

        this.chatHistoryStore.addMessage(assistantMessage);
        this.isLoading.value = false;
        await this.speakResponse(result);
      } else {
        this.isStreaming.value = true;
        this.streamingMessage.value = "";
        this.isLoading.value = false;

        let fullResponse = "";
        const activeModel = this.modelStore.activeModel.value;
        const messages = this.chatHistoryStore.messages.value;

        await this.ollamaService.chatStream(
          activeModel,
          [...messages, userMessage],
          (chunk) => {
            fullResponse += chunk;
            this.streamingMessage.value = fullResponse;
          }
        );

        const assistantMessage: Message = {
          role: "assistant",
          content: fullResponse,
        };

        this.chatHistoryStore.addMessage(assistantMessage);
        this.streamingMessage.value = "";
        this.isStreaming.value = false;
        await this.speakResponse(fullResponse);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, something went wrong.",
      };

      this.chatHistoryStore.addMessage(errorMessage);
      this.isLoading.value = false;
      this.isStreaming.value = false;
      this.streamingMessage.value = "";
    }
  }
}

export default ChatStore;
