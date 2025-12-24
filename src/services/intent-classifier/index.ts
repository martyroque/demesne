import { Store } from "nucleux";
import ModelStore from "../../stores/ModelStore";
import OllamaService, { type Message } from "../ollama";

const CLASSIFICATION_PROMPT = `You are a smart home intent classifier. Determine if the user's message is requesting home automation control or general conversation.

Home automation requests include:
- Controlling lights, switches, fans, thermostats
- Setting brightness, color, temperature
- Querying device status
- Creating scenes or automations

General conversation includes:
- Asking questions about topics
- Casual chat
- Requests for information
- Everything not related to home control

Respond with ONLY a single word: "HOME_CONTROL" or "GENERAL_CHAT"

Examples:
User: "Turn on the living room light"
Response: HOME_CONTROL

User: "What's the weather like?"
Response: GENERAL_CHAT

User: "Make it warmer in here"
Response: HOME_CONTROL

User: "Tell me a joke"
Response: GENERAL_CHAT

User: "Apaga la luz" (Spanish: turn off the light)
Response: HOME_CONTROL`;

export type IntentType = "HOME_CONTROL" | "GENERAL_CHAT";

class IntentClassifierService extends Store {
  private ollamaService = this.inject(OllamaService);
  private modelStore = this.inject(ModelStore);

  async classifyIntent(userMessage: string): Promise<IntentType> {
    const messages: Message[] = [
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: userMessage },
    ];

    try {
      console.log("IntentClassifierService | message", userMessage);

      const activeModel = this.modelStore.activeModel.value;
      const response = await this.ollamaService.chat(activeModel, messages);

      console.log(
        "IntentClassifierService | classification",
        response.message.content
      );

      const classification = response.message.content.trim().toUpperCase();

      if (classification.includes("HOME_CONTROL")) {
        return "HOME_CONTROL";
      }

      return "GENERAL_CHAT";
    } catch (error) {
      console.error("Intent classification failed:", error);
      return "GENERAL_CHAT";
    }
  }
}

export default IntentClassifierService;
