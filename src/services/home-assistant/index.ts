import axios from "axios";
import { Store } from "nucleux";

const HA_URL = import.meta.env.VITE_HA_URL || "http://localhost:8123";
const HA_TOKEN = import.meta.env.VITE_HA_TOKEN;
const HA_AGENT_ID = import.meta.env.VITE_HA_AGENT_ID;

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

const CONVERSATION_TIMEOUT = 5 * 60 * 1000;

class HomeAssistantService extends Store {
  public entities = this.atom<HAEntity[]>([]);
  private conversationId = this.atom<string | null>(null);
  private lastInteractionTime = this.atom<number>(0);

  private haClient = axios.create({
    baseURL: `${HA_URL}/api`,
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  private async callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown>
  ) {
    const response = await this.haClient.post(
      `/services/${domain}/${service}`,
      serviceData
    );
    return response.data;
  }

  async getStates(): Promise<HAEntity[]> {
    const response = await this.haClient.get("/states");
    return response.data;
  }

  async getState(entityId: string): Promise<HAEntity> {
    const response = await this.haClient.get(`/states/${entityId}`);
    return response.data;
  }

  async turnOn(entityId: string) {
    const domain = entityId.split(".")[0];
    return this.callService(domain, "turn_on", { entity_id: entityId });
  }

  async turnOff(entityId: string) {
    const domain = entityId.split(".")[0];
    return this.callService(domain, "turn_off", { entity_id: entityId });
  }

  async setBrightness(entityId: string, brightness: number) {
    return this.callService("light", "turn_on", {
      entity_id: entityId,
      brightness: Math.round((brightness / 100) * 255),
    });
  }

  async setColor(entityId: string, rgb: [number, number, number]) {
    return this.callService("light", "turn_on", {
      entity_id: entityId,
      rgb_color: rgb,
    });
  }

  async processConversation(
    text: string,
    language: string = "en"
  ): Promise<{ speech: string; continueConversation: boolean }> {
    try {
      // Check if conversation expired due to inactivity
      const now = Date.now();
      if (
        this.lastInteractionTime.value > 0 &&
        now - this.lastInteractionTime.value > CONVERSATION_TIMEOUT
      ) {
        console.log("Conversation expired, starting fresh");
        this.resetConversation();
      }

      const payload: {
        text: string;
        language: string;
        conversation_id?: string;
        agent_id?: string;
      } = {
        text,
        language,
      };

      if (this.conversationId.value) {
        payload.conversation_id = this.conversationId.value;
      }

      if (HA_AGENT_ID) {
        payload.agent_id = HA_AGENT_ID;
      }

      const response = await this.haClient.post(
        "/conversation/process",
        payload
      );

      const continueConversation = response.data.continue_conversation ?? false;

      if (continueConversation && response.data.conversation_id) {
        this.conversationId.value = response.data.conversation_id;
      } else {
        this.conversationId.value = null;
      }

      this.lastInteractionTime.value = now;

      const result = response.data.response;

      if (result.response_type === "error") {
        return {
          speech: result.speech.plain.speech || "Sorry, something went wrong.",
          continueConversation,
        };
      }

      if (result.data?.failed && result.data.failed.length > 0) {
        const failedNames = result.data.failed
          .map((f: { name: string }) => f.name)
          .join(", ");
        return {
          speech: `${result.speech.plain.speech} However, I couldn't control: ${failedNames}`,
          continueConversation,
        };
      }

      return { speech: result.speech.plain.speech, continueConversation };
    } catch (error) {
      console.error("HA Conversation API error:", error);
      return {
        speech: "Sorry, I couldn't process that command.",
        continueConversation: false,
      };
    }
  }

  resetConversation() {
    this.conversationId.value = null;
    this.lastInteractionTime.value = 0;
  }
}

export default HomeAssistantService;
