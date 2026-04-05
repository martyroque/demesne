import axios from "axios";
import { Store } from "nucleux";

const HA_URL = import.meta.env.VITE_HA_URL || "http://localhost:8123";
const HA_TOKEN = import.meta.env.VITE_HA_TOKEN;
const WS_URL = HA_URL.replace(/^http/, "ws") + "/api/websocket";

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

type WsMsg = Record<string, unknown>;

const CONVERSATION_TIMEOUT = 5 * 60 * 1000;

class HomeAssistantService extends Store {
  public entities = this.atom<HAEntity[]>([]);

  private conversationId = this.atom<string | null>(null);
  private lastInteractionTime = this.atom<number>(0);
  private ws: WebSocket | null = null;
  private wsAuthPromise: Promise<void> | null = null;
  private msgId = 1;
  private wsListeners = new Map<number, (msg: WsMsg) => void>();

  private haClient = axios.create({
    baseURL: `${HA_URL}/api`,
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  private ensureWsConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.wsAuthPromise) {
      return this.wsAuthPromise;
    }

    this.wsAuthPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as WsMsg;

        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
          return;
        }
        if (msg.type === "auth_ok") {
          ws.onmessage = (e) => {
            const m = JSON.parse(e.data) as WsMsg;
            if (typeof m.id === "number") {
              this.wsListeners.get(m.id as number)?.(m);
            }
          };
          resolve();
          return;
        }
        if (msg.type === "auth_invalid") {
          reject(new Error(`HA WebSocket auth failed: ${msg.message}`));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.wsAuthPromise = null;
        this.wsListeners.clear();
      };

      ws.onerror = () => {
        reject(new Error("HA WebSocket connection error"));
        this.ws = null;
        this.wsAuthPromise = null;
      };
    });

    return this.wsAuthPromise;
  }

  private async runPipeline(
    text: string,
    conversationId: string | null
  ): Promise<{
    speech: string;
    continueConversation: boolean;
    conversationId: string | null;
  }> {
    await this.ensureWsConnected();

    const id = this.msgId++;
    const message: Record<string, unknown> = {
      id,
      type: "assist_pipeline/run",
      start_stage: "intent",
      end_stage: "intent",
      input: { text },
      conversation_id: conversationId,
    };

    return new Promise((resolve, reject) => {
      let intentOutput: Record<string, unknown> | null = null;

      this.wsListeners.set(id, (msg: WsMsg) => {
        if (msg.type === "event") {
          const event = msg.event as Record<string, unknown>;
          const eventType = event.type as string;

          if (eventType === "intent-end") {
            const eventData = event.data as Record<string, unknown>;
            intentOutput = eventData.intent_output as Record<string, unknown>;
          } else if (eventType === "run-end") {
            this.wsListeners.delete(id);

            if (!intentOutput) {
              reject(
                new Error("Pipeline completed but no intent output received")
              );
              return;
            }

            const response = intentOutput.response as Record<string, unknown>;
            const continueConversation =
              (intentOutput.continue_conversation as boolean) ?? false;
            const newConversationId =
              (intentOutput.conversation_id as string) ?? null;

            if (response.response_type === "error") {
              const speech = response.speech as Record<string, unknown>;
              const plain = speech.plain as Record<string, unknown>;
              resolve({
                speech:
                  (plain.speech as string) || "Sorry, something went wrong.",
                continueConversation,
                conversationId: continueConversation ? newConversationId : null,
              });
              return;
            }

            const responseData = response.data as
              | Record<string, unknown>
              | undefined;
            const failed = responseData?.failed as
              | { name: string }[]
              | undefined;
            const speech = response.speech as Record<string, unknown>;
            const plain = speech.plain as Record<string, unknown>;
            const speechText = plain.speech as string;

            resolve({
              speech:
                failed && failed.length > 0
                  ? `${speechText} However, I couldn't control: ${failed.map((f) => f.name).join(", ")}`
                  : speechText,
              continueConversation,
              conversationId: continueConversation ? newConversationId : null,
            });
          } else if (eventType === "error") {
            const eventData = event.data as Record<string, unknown>;
            this.wsListeners.delete(id);
            reject(
              new Error(
                `Pipeline error: ${eventData.message ?? eventData.code}`
              )
            );
          }
        } else if (msg.type === "result" && !msg.success) {
          this.wsListeners.delete(id);
          const err = msg.error as Record<string, unknown> | undefined;
          reject(
            new Error(
              `Pipeline failed to start: ${err?.message ?? "unknown error"}`
            )
          );
        }
      });

      this.ws!.send(JSON.stringify(message));
    });
  }

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
    text: string
  ): Promise<{ speech: string; continueConversation: boolean }> {
    try {
      const now = Date.now();
      if (
        this.lastInteractionTime.value > 0 &&
        now - this.lastInteractionTime.value > CONVERSATION_TIMEOUT
      ) {
        console.log("Conversation expired, starting fresh");
        this.resetConversation();
      }

      const result = await this.runPipeline(text, this.conversationId.value);

      this.conversationId.value = result.conversationId;
      this.lastInteractionTime.value = now;

      return {
        speech: result.speech,
        continueConversation: result.continueConversation,
      };
    } catch (error) {
      console.error("HA pipeline error:", error);
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
