import { Store } from "nucleux";

import ContextRetrievalService, {
  type ContextChunk,
} from "@/services/context-retrieval";
import HomeAssistantService from "@/services/home-assistant";
import IntentClassifierService from "@/services/intent-classifier";
import OllamaService, { type Message } from "@/services/ollama";
import PiperService from "@/services/piper";

import ChatHistoryStore, { HOME_CONTROL_SESSION_ID } from "../ChatHistoryStore";
import ModelStore from "../ModelStore";
import SettingsStore from "../SettingsStore";

const RECENT_COUNT = 12;

const BASE_SYSTEM_PROMPT = `You are Zion, a helpful AI assistant integrated into a smart home system.

Key capabilities:
- Smart home control via Home Assistant
- General knowledge and assistance
- Natural, conversational responses

Current date: ${new Date().toLocaleDateString()}`;

class ChatStore extends Store {
  public isLoading = this.atom(false);
  public isStreaming = this.atom(false);
  public streamingMessage = this.atom("");
  public homeControlToast = this.atom<{ message: string; id: number } | null>(
    null
  );
  public lastContextUsed = this.atom<ContextChunk[]>([]);
  public lastContextSessionId = this.atom<string | null>(null);
  public contextRetrievalTime = this.atom(0);

  private settingsStore = this.inject(SettingsStore);
  private chatHistoryStore = this.inject(ChatHistoryStore);
  private modelStore = this.inject(ModelStore);

  private piperService = this.inject(PiperService);
  private ollamaService = this.inject(OllamaService);
  private intentClassifierService = this.inject(IntentClassifierService);
  private homeAssistantService = this.inject(HomeAssistantService);
  private contextRetrievalService = this.inject(ContextRetrievalService);

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
      console.warn(`Context tight: ${usedTokens} tokens`);
      return recentMessages;
    }

    const middleMessages = messages.slice(1, -RECENT_COUNT);
    const importantMiddle: Message[] = [];

    for (const msg of middleMessages.reverse()) {
      const tokens = estimateTokens(msg);

      if (usedTokens + tokens > maxTokens) break;

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

  private trimContextToFit(
    context: ContextChunk[],
    maxTokens: number = 2000
  ): ContextChunk[] {
    let totalTokens = 0;
    const fitted: ContextChunk[] = [];

    for (const chunk of context) {
      const chunkTokens = Math.ceil(chunk.content.length / 4);

      if (totalTokens + chunkTokens > maxTokens) break;

      fitted.push(chunk);
      totalTokens += chunkTokens;
    }

    if (fitted.length < context.length) {
      console.log(
        `Trimmed context: ${fitted.length}/${context.length} chunks (${totalTokens}/${maxTokens} tokens)`
      );
    }

    return fitted;
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

    this.isLoading.value = true;
    this.lastContextUsed.value = [];
    this.lastContextSessionId.value = null;
    this.contextRetrievalTime.value = 0;

    try {
      const intentType =
        await this.intentClassifierService.classifyIntent(message);

      if (intentType === "HOME_CONTROL") {
        this.chatHistoryStore.addMessageToSession(
          HOME_CONTROL_SESSION_ID,
          userMessage
        );

        const { speech, continueConversation } =
          await this.homeAssistantService.processConversation(message);

        if (continueConversation) {
          // TODO: Support continuing the conversation from chat/voice
          console.log("HA expects a follow-up response");
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: speech,
        };

        this.chatHistoryStore.addMessageToSession(
          HOME_CONTROL_SESSION_ID,
          assistantMessage
        );

        this.isLoading.value = false;

        const toastId = Date.now();
        this.homeControlToast.value = { message: speech, id: toastId };
        setTimeout(() => {
          if (
            this.homeControlToast.value &&
            this.homeControlToast.value.id === toastId
          ) {
            this.homeControlToast.value = null;
          }
        }, 4000);

        await this.speakResponse(speech);
      } else {
        this.chatHistoryStore.addMessage(userMessage);

        const startTime = performance.now();
        const sessionId = this.chatHistoryStore.currentSessionId.value;

        const relevantContext =
          await this.contextRetrievalService.retrieveRelevantContext(message, {
            maxResults: 5,
            sessionId: sessionId || undefined,
            minSimilarity: 0.5,
            excludeRecent: 60,
          });

        const contextTime = Math.round(performance.now() - startTime);
        this.contextRetrievalTime.value = contextTime;

        console.log(
          `ChatStore | Retrieved ${relevantContext.length} context chunks in ${contextTime}ms`
        );

        const fittedContext = this.trimContextToFit(relevantContext, 2000);

        this.lastContextUsed.value = fittedContext;
        this.lastContextSessionId.value = sessionId;

        const contextSection =
          this.contextRetrievalService.formatContextForPrompt(fittedContext);
        const messages = this.chatHistoryStore.messages.value;
        const recentMessages = messages.slice(-10);
        const systemPrompt = contextSection
          ? BASE_SYSTEM_PROMPT + contextSection
          : BASE_SYSTEM_PROMPT;

        const fullMessages: Message[] = [
          { role: "system", content: systemPrompt },
          ...recentMessages,
          userMessage,
        ];

        const totalTokens = fullMessages.reduce(
          (sum, msg) => sum + Math.ceil(msg.content.length / 4),
          0
        );

        console.log(`ChatStore | Total tokens: ${totalTokens}`);

        if (totalTokens > 7000) {
          console.warn("ChatStore | Token budget exceeded, trimming messages");
          const trimmed = this.trimMessages(fullMessages, 7000);
          fullMessages.length = 0;
          fullMessages.push(...trimmed);
        }

        this.isStreaming.value = true;
        this.streamingMessage.value = "";

        const activeModel = this.modelStore.activeModel.value;
        let fullResponse = "";
        let firstChunk = true;

        await this.ollamaService.chatStream(
          activeModel,
          fullMessages,
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
