import axios from "axios";
import { Store } from "nucleux";

const QDRANT_URL = import.meta.env.VITE_QDRANT_URL || "http://localhost:6333";
const COLLECTION_NAME = "demesne_messages";
const VECTOR_SIZE = 768;

interface QdrantPointPayload {
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface QdrantScoredPoint {
  id: number;
  score: number;
  payload: QdrantPointPayload;
}

class QdrantService extends Store {
  private client = axios.create({ baseURL: QDRANT_URL });

  async ensureCollection(): Promise<void> {
    try {
      await this.client.get(`/collections/${COLLECTION_NAME}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await this.client.put(`/collections/${COLLECTION_NAME}`, {
          vectors: { size: VECTOR_SIZE, distance: "Cosine" },
        });
        console.log("QdrantService | Collection created");
      } else {
        throw error;
      }
    }
  }

  async upsertPoint(
    id: number,
    vector: number[],
    payload: QdrantPointPayload
  ): Promise<void> {
    await this.client.put(`/collections/${COLLECTION_NAME}/points`, {
      points: [{ id, vector, payload }],
    });
  }

  async search(
    vector: number[],
    limit: number,
    filter?: { must: Array<{ key: string; match: { value: string } }> }
  ): Promise<QdrantScoredPoint[]> {
    const body: Record<string, unknown> = { vector, limit, with_payload: true };
    if (filter) body.filter = filter;

    const response = await this.client.post(
      `/collections/${COLLECTION_NAME}/points/search`,
      body
    );
    return response.data.result as QdrantScoredPoint[];
  }
}

export default QdrantService;
