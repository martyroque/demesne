import { Store } from "nucleux";
import ModelStore from "../../stores/ModelStore";
import HomeAssistantService from "../home-assistant";
import OllamaService, { type Message } from "../ollama";

const SYSTEM_PROMPT = `You are a home automation assistant. Parse user requests and return JSON with actions to perform.

Available actions:
- turnOn: Turn on a device
- turnOff: Turn off a device  
- setBrightness: Set light brightness (0-100)
- setColor: Set light color (name like "red", "blue", "warm white")

Response format:
{
  "actions": [
    {"type": "turnOn", "entity": "light.living_room"},
    {"type": "setBrightness", "entity": "light.office", "value": 72}
    {"type": "setColor", "entity": "light.bedroom", "value": "red"}
  ],
  "response": [Natural language confirmation of what you're doing]
}

Only return valid JSON, no additional text.`;

export interface HAAction {
  type: "turnOn" | "turnOff" | "setBrightness" | "setColor";
  entity: string;
  value?: number | string;
}

export interface IntentResult {
  actions: HAAction[];
  response: string;
}

const COLORS: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  white: [255, 255, 255],
  "warm white": [255, 149, 46],
  "cool white": [200, 220, 255],
  yellow: [255, 255, 0],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
};

class IntentParserService extends Store {
  private ollamaService = this.inject(OllamaService);
  private homeAssistantService = this.inject(HomeAssistantService);
  private modelStore = this.inject(ModelStore);

  async parseAndExecute(
    userMessage: string,
    availableEntities: string[]
  ): Promise<{ executed: boolean; response: string }> {
    const contextMessage = `Available devices: ${availableEntities.join(", ")}`;

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextMessage },
      { role: "user", content: userMessage },
    ];

    try {
      console.log("IntentParserService | message", userMessage);

      const activeModel = this.modelStore.activeModel.value;
      const chatResponse = await this.ollamaService.chat(activeModel, messages);
      const intent: IntentResult = JSON.parse(chatResponse.message.content);

      console.log("IntentParserService | intent", intent);

      await Promise.all(
        intent.actions.map(async (action) => {
          switch (action.type) {
            case "turnOn":
              return this.homeAssistantService.turnOn(action.entity);
            case "turnOff":
              return this.homeAssistantService.turnOff(action.entity);
            case "setBrightness":
              return this.homeAssistantService.setBrightness(
                action.entity,
                action.value as number
              );
            case "setColor": {
              const colorName = (action.value as string).toLowerCase();
              const rgb = COLORS[colorName] || COLORS["white"];
              return this.homeAssistantService.setColor(action.entity, rgb);
            }
          }
        })
      );

      return {
        executed: true,
        response: intent.response,
      };
    } catch (error) {
      console.error("Intent parsing failed:", error);
      return {
        executed: false,
        response: "Sorry, I had trouble understanding that request.",
      };
    }
  }
}
export default IntentParserService;
