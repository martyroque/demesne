import { Store } from "nucleux";
import OllamaService, { type Message } from "../ollama";
import HomeAssistantService from "../home-assistant";

const SYSTEM_PROMPT = `You are a home automation assistant. Parse user requests and return JSON with actions to perform.

Available actions:
- turnOn: Turn on a device
- turnOff: Turn off a device  
- setTemperature: Set thermostat temperature
- setBrightness: Set light brightness (0-100)

Response format:
{
  "actions": [
    {"type": "turnOn", "entity": "light.living_room"},
    {"type": "setTemperature", "entity": "climate.thermostat", "value": 72}
  ],
  "response": "Natural language confirmation of what you're doing"
}

Only return valid JSON, no additional text.`;

export interface HAAction {
  type: 'turnOn' | 'turnOff' | 'setTemperature' | 'setBrightness';
  entity: string;
  value?: number;
}

export interface IntentResult {
  actions: HAAction[];
  response: string;
}

class IntentParserService extends Store {
  private ollamaService = this.inject(OllamaService);
  private homeAssistantService = this.inject(HomeAssistantService);

  async parseAndExecute(
    userMessage: string,
    availableEntities: string[]
  ): Promise<{ executed: boolean; response: string }> {

    const contextMessage = `Available devices: ${availableEntities.join(', ')}`;

    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextMessage },
      { role: 'user', content: userMessage },
    ];

    try {
      // Get LLM to parse intent
      const chatResponse = await this.ollamaService.chat('llama3.1:8b', messages);

      // Parse JSON response
      const intent: IntentResult = JSON.parse(chatResponse.message.content);

      // Execute actions
      const results = await Promise.all(
        intent.actions.map(async (action) => {
          switch (action.type) {
            case 'turnOn':
              return this.homeAssistantService.turnOn(action.entity);
            case 'turnOff':
              return this.homeAssistantService.turnOff(action.entity);
          }
        })
      );

      console.log("IntentParserService", results);

      return {
        executed: true,
        response: intent.response,
      };

    } catch (error) {
      console.error('Intent parsing failed:', error);
      return {
        executed: false,
        response: 'Sorry, I had trouble understanding that request.',
      };
    }
  }
}
export default IntentParserService;
