import { Store } from "nucleux";
import axios from 'axios';

const HA_URL = import.meta.env.VITE_HA_URL || 'http://localhost:8123';
const HA_TOKEN = import.meta.env.VITE_HA_TOKEN;

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

class HomeAssistantService extends Store {
  private haClient = axios.create({
    baseURL: `${HA_URL}/api`,
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  private async callService(
    domain: string,
    service: string,
    serviceData: Record<string, any>
  ) {
    const response = await this.haClient.post(
      `/services/${domain}/${service}`,
      serviceData
    );
    return response.data;
  }

  async getStates(): Promise<HAEntity[]> {
    const response = await this.haClient.get('/states');
    console.log("HomeAssistantService", response.data);
    return response.data;
  }

  async getState(entityId: string): Promise<HAEntity> {
    const response = await this.haClient.get(`/states/${entityId}`);
    return response.data;
  }

  async turnOn(entityId: string) {
    const domain = entityId.split('.')[0];
    return this.callService(domain, 'turn_on', { entity_id: entityId });
  }

  async turnOff(entityId: string) {
    const domain = entityId.split('.')[0];
    return this.callService(domain, 'turn_off', { entity_id: entityId });
  }

  async setBrightness(entityId: string, brightness: number) {
    return this.callService('light', 'turn_on', {
      entity_id: entityId,
      brightness: Math.round((brightness / 100) * 255),
    });
  }

  async setColor(entityId: string, rgb: [number, number, number]) {
    return this.callService('light', 'turn_on', {
      entity_id: entityId,
      rgb_color: rgb,
    });
  }
}

export default HomeAssistantService;
