import { Store } from "nucleux";
import ModelStore from "../../stores/ModelStore";
import OllamaService, { type Message } from "../ollama";

const CLASSIFICATION_PROMPT = `You are a smart home intent classifier. Determine if the user's message is requesting IMMEDIATE home automation control or general conversation.

HOME_CONTROL requests are ONLY commands that require IMMEDIATE device action:
- Direct device control: "turn on/off", "set", "dim", "brighten"
- Status queries about specific devices: "is the bedroom light on?"
- Temperature/climate control: "make it warmer", "set thermostat to 72"
- Scene activation: "activate movie mode", "turn on good morning scene"

HOME_CONTROL requests MUST:
1. Reference specific devices, rooms, or scenes
2. Imply immediate action (not planning or discussion)
3. Use imperative/command language

GENERAL_CHAT includes everything else:
- Questions about concepts: "how does a smart bulb work?"
- Planning/hypothetical: "should I buy smart lights?"
- Troubleshooting/help: "why won't my light connect?"
- General knowledge: "what's the weather?", "tell me about..."
- Small talk: greetings, jokes, opinions
- Discussions about home automation (not commands)
- Requests for information without device action

CRITICAL DISTINCTIONS:
- "Turn on the light" → HOME_CONTROL (immediate action)
- "How do I turn on the light?" → GENERAL_CHAT (asking for help)
- "Can you turn on the light?" → HOME_CONTROL (polite command)
- "Can smart lights save energy?" → GENERAL_CHAT (general question)
- "What lights do I have?" → GENERAL_CHAT (asking about your knowledge)
- "Turn on all the lights" → HOME_CONTROL (command)
- "Is the garage door open?" → HOME_CONTROL (status query)
- "How do garage doors work?" → GENERAL_CHAT (general knowledge)

Respond with ONLY a single word: "HOME_CONTROL" or "GENERAL_CHAT"

Examples:

User: "Turn on the living room light"
Response: HOME_CONTROL

User: "How do smart lights work?"
Response: GENERAL_CHAT

User: "Can you help me with my lights?"
Response: GENERAL_CHAT

User: "Make it warmer in here"
Response: HOME_CONTROL

User: "What's the best temperature for sleeping?"
Response: GENERAL_CHAT

User: "Tell me a joke"
Response: GENERAL_CHAT

User: "Is the front door locked?"
Response: HOME_CONTROL

User: "How do I set up a scene?"
Response: GENERAL_CHAT

User: "Activate bedtime scene"
Response: HOME_CONTROL

User: "What devices do I have?"
Response: GENERAL_CHAT

User: "Apaga la luz" (Spanish: turn off the light)
Response: HOME_CONTROL

User: "Should I get a smart thermostat?"
Response: GENERAL_CHAT

User: "Set brightness to 50%"
Response: HOME_CONTROL

User: "What's the difference between Zigbee and Z-Wave?"
Response: GENERAL_CHAT`;

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
