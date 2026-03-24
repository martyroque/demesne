import { Store } from "nucleux";
import ModelStore from "../../stores/ModelStore";
import SettingsStore from "../../stores/SettingsStore";
import OllamaService, { type Message } from "../ollama";

const CLASSIFICATION_PROMPT = `Classify as HOME_CONTROL or GENERAL_CHAT.

HOME_CONTROL requests are ONLY commands that require IMMEDIATE device action OR reading live home sensor/device state:
- Direct device control: "turn on/off", "set", "dim", "brighten"
- Status queries about specific devices: "is the bedroom light on?"
- Temperature/climate control: "make it warmer", "set thermostat to 72"
- Scene activation: "activate movie mode", "turn on good morning scene"
- Sensor/state read-back: "what's the temperature?", "what's the humidity?", "is the front door open?", "what's the air quality?"
  Note: indoor sensor queries go here even if phrased as questions, not commands

HOME_CONTROL requests MUST:
1. Reference specific devices, rooms, scenes, or home sensors
2. Imply immediate action or live data read-back (not planning or discussion)
3. Use imperative/command language OR ask about current indoor/home sensor state

GENERAL_CHAT includes everything else:
- Questions about concepts: "how does a smart bulb work?"
- Planning/hypothetical: "should I buy smart lights?"
- Troubleshooting/help: "why won't my light connect?"
- Outdoor/weather queries: "what's the weather?", "will it rain today?" (NOT indoor sensor reads)
- Small talk: greetings, jokes, opinions
- Discussions about home automation (not commands)
- Requests for information without device action
- Debugging: "why am I seeing this error?"

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
Response: GENERAL_CHAT

User: "Can you help me troubleshoot this error?"
Response: GENERAL_CHAT

User: "Can you help me review the following code?"
Response: GENERAL_CHAT

User: "What's the current temperature?"
Response: HOME_CONTROL

User: "What's the humidity in the bedroom?"
Response: HOME_CONTROL

User: "Is the front door open?"
Response: HOME_CONTROL

User: "What's the weather outside?"
Response: GENERAL_CHAT

User: "How warm is it in the living room?"
Response: HOME_CONTROL

User: "What's the air quality like?"
Response: HOME_CONTROL

User: "Will it rain tomorrow?"
Response: GENERAL_CHAT

Now classify this message with ONE WORD ONLY:`;

export type IntentType = "HOME_CONTROL" | "GENERAL_CHAT";

class IntentClassifierService extends Store {
  private ollamaService = this.inject(OllamaService);
  private modelStore = this.inject(ModelStore);
  private settingsStore = this.inject(SettingsStore);

  async classifyIntent(userMessage: string): Promise<IntentType> {
    if (!this.settingsStore.homeControlEnabled.value) {
      return "GENERAL_CHAT";
    }

    const messages: Message[] = [
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: userMessage },
    ];

    try {
      console.log("IntentClassifierService | message", userMessage);

      const activeModel = this.modelStore.activeModel.value;
      const response = await this.ollamaService.chat(activeModel, messages, {
        num_predict: 20,
      });

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
