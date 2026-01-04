import { useStore, useValue } from "nucleux";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ModelStore from "../stores/ModelStore";
import SettingsStore from "../stores/SettingsStore";

export const Settings: React.FC = () => {
  const modelStore = useStore(ModelStore);
  const settingsStore = useStore(SettingsStore);

  const models = useValue(modelStore.models);
  const activeModel = useValue(modelStore.activeModel);
  const isLoading = useValue(modelStore.isLoading);
  const ttsVoice = useValue(settingsStore.ttsVoice);
  const autoPlayTTS = useValue(settingsStore.autoPlayTTS);
  const homeControlEnabled = useValue(settingsStore.homeControlEnabled);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          ⚙️ Settings
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="model-select">Active Model</Label>
            <Select
              value={activeModel}
              onValueChange={(value) => modelStore.setActiveModel(value)}
              disabled={isLoading}
            >
              <SelectTrigger id="model-select">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {isLoading && (
                    <SelectItem value="loading" disabled>
                      Loading models...
                    </SelectItem>
                  )}
                  {models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {models.length} model{models.length !== 1 ? "s" : ""} available
            </p>
          </div>

          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-medium">Voice Responses</Label>

            <div className="space-y-2">
              <Label htmlFor="voice-select" className="text-sm font-normal">
                Voice (WIP)
              </Label>
              <Select value={ttsVoice} disabled>
                <SelectTrigger id="voice-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>English (US)</SelectLabel>
                    <SelectItem value="en_US-lessac-medium">
                      Lessac (Female, Clear)
                    </SelectItem>
                    <SelectItem value="en_US-amy-medium">
                      Amy (Female, Neutral)
                    </SelectItem>
                    <SelectItem value="en_US-danny-low">
                      Danny (Male, Low)
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between space-x-2">
              <Label
                htmlFor="autoplay-tts"
                className="flex flex-col space-y-1 font-normal"
              >
                <span className="text-sm">Auto-play responses</span>
                <span className="text-xs text-muted-foreground">
                  {autoPlayTTS
                    ? "Zion will speak responses automatically"
                    : "Click 🔊 to play responses manually"}
                </span>
              </Label>
              <Switch
                id="autoplay-tts"
                checked={autoPlayTTS}
                onCheckedChange={(checked) =>
                  settingsStore.setAutoPlayTTS(checked)
                }
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-medium">Home Control</Label>

            <div className="flex items-center justify-between space-x-2">
              <Label
                htmlFor="home-control"
                className="flex flex-col space-y-1 font-normal"
              >
                <span className="text-sm">Enable Home Control</span>
                <span className="text-xs text-muted-foreground">
                  {homeControlEnabled
                    ? "Zion will control your home via command"
                    : "Zion will only function as a chat"}
                </span>
              </Label>
              <Switch
                id="home-control"
                checked={homeControlEnabled}
                onCheckedChange={(checked) =>
                  settingsStore.setHomeControlEnabled(checked)
                }
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
