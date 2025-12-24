import { Store } from "nucleux";
import OllamaService from "../../services/ollama";

class ModelStore extends Store {
  public models = this.atom<string[]>([]);
  public activeModel = this.atom("", {
    persistence: { persistKey: "activeModel" },
  });
  public isLoading = this.atom(false);

  private ollamaService = this.inject(OllamaService);

  constructor() {
    super();
    this.loadModels();
  }

  private async loadModels() {
    this.isLoading.value = true;

    try {
      const modelList = await this.ollamaService.listModels();

      const modelNames: string[] =
        modelList?.map((m: { name: string }) => m.name) ?? [];

      if (modelNames.length > 0) {
        this.models.value = modelNames;

        // Set default if no active model or active model no longer exists
        if (
          !this.activeModel.value ||
          !modelNames.includes(this.activeModel.value)
        ) {
          // Prefer llama3.2:3b as default, otherwise first available
          const defaultModel =
            modelNames.find((m: string) => m === "llama3.2:3b") ||
            modelNames[0];
          this.activeModel.value = defaultModel;
        }
      }
    } catch (error) {
      console.error("Failed to load models:", error);
      if (!this.activeModel.value) {
        this.activeModel.value = "llama3.2:3b";
      }
    } finally {
      this.isLoading.value = false;
    }
  }

  public async refreshModels() {
    await this.loadModels();
  }

  public setActiveModel(model: string) {
    this.activeModel.value = model;
  }
}

export default ModelStore;
