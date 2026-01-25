import { Store } from "nucleux";

import HomeAssistantService from "@/services/home-assistant";
import IntentClassifierService from "@/services/intent-classifier";
import OllamaService, { type Message } from "@/services/ollama";
import PiperService from "@/services/piper";

import ChatHistoryStore from "../ChatHistoryStore";
import ModelStore from "../ModelStore";
import SettingsStore from "../SettingsStore";

const RECENT_COUNT = 12;

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

  private trimMessages(messages: Message[], maxTokens = 7000): Message[] {
    if (messages.length <= RECENT_COUNT) {
      return messages;
    }

    const firstMessage = messages[0];
    const recentMessages = messages.slice(-RECENT_COUNT);

    const estimateTokens = (msg: Message) => Math.ceil(msg.content.length / 4);
    let usedTokens = estimateTokens(firstMessage);
    usedTokens += recentMessages.reduce((sum, m) => sum + estimateTokens(m), 0);

    if (usedTokens >= maxTokens) {
      // Even recent messages exceed limit, just return them
      console.warn(`Context tight: ${usedTokens} tokens`);
      return recentMessages;
    }

    const middleMessages = messages.slice(1, -RECENT_COUNT);
    const importantMiddle: Message[] = [];

    for (const msg of middleMessages.reverse()) {
      const tokens = estimateTokens(msg);

      if (usedTokens + tokens > maxTokens) break;

      // Prioritize user messages and substantial responses
      if (msg.role === "user" || msg.content.length > 200) {
        importantMiddle.unshift(msg);
        usedTokens += tokens;
      }
    }

    const trimmedCount =
      messages.length - (1 + importantMiddle.length + recentMessages.length);

    if (trimmedCount > 0) {
      console.log(
        `Trimmed ${trimmedCount} messages (${usedTokens}/${maxTokens} tokens)`
      );
    }

    return [firstMessage, ...importantMiddle, ...recentMessages];
  }

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

        const activeModel = this.modelStore.activeModel.value;
        const messages = this.chatHistoryStore.messages.value;
        const trimmedMessages = this.trimMessages([...messages, userMessage]);

        let fullResponse = "";
        let firstChunk = true;

        await this.ollamaService.chatStream(
          activeModel,
          trimmedMessages,
          (chunk) => {
            if (firstChunk) {
              this.isLoading.value = false;
              firstChunk = false;
            }
            fullResponse += chunk;
            this.streamingMessage.value = fullResponse;
          },
          { timeout: 30000 }
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

      let content = "Sorry, something went wrong.";
      if (error instanceof Error && error.message.includes("timeout")) {
        content =
          "Response timed out. Try a shorter message or start a new chat.";
      }

      const errorMessage: Message = {
        role: "assistant",
        content,
      };

      this.chatHistoryStore.addMessage(errorMessage);
      this.isLoading.value = false;
      this.isStreaming.value = false;
      this.streamingMessage.value = "";
    }
  }
}

export default ChatStore;
