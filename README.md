# Demesne

> **Pronounced:** _duh-MAIN_ (medieval term for land owned directly by a lord, not leased)

**Your domain. Your rules. Your demesne.**

A voice-controlled AI smart home interface powered by local LLM technology. Control your devices with natural language, completely offline - no cloud services required.

## 🚧 Work in Progress

This project is under active development. Core features are functional but the interface and capabilities are expanding rapidly.

## What It Does

- **Voice Control**: Speak commands naturally to control your smart home
- **Voice Responses**: Zion speaks back using local text-to-speech
- **Local AI**: Uses Ollama for on-device language processing (no data leaves your network)
- **Home Assistant Integration**: Works with existing Home Assistant installations
- **Privacy-First**: 100% local operation - your voice and commands stay on your hardware
- **Multi-Language**: Supports commands in multiple languages

## Requirements

### Software

- **Node.js** 18+ and npm
- **Docker & Docker Compose** - [Install here](https://docs.docker.com/get-docker/)
- **Ollama** (local LLM server) - [Install here](https://ollama.ai)
- **Home Assistant** (running locally) - [Install guide](https://www.home-assistant.io/installation/)

### Hardware (Recommended)

- **PC/Mac** with 8GB+ RAM for running Ollama models
- **Zigbee Coordinator** (optional, for local smart devices)
- **Microphone** for voice input
- **Speakers** for voice output

## Quick Start

```bash
# Install dependencies
npm install

# Create environment configuration
# Create a .env.local file in the project root with:
```

```
VITE_OLLAMA_URL=http://localhost:11434
VITE_HA_URL=http://localhost:8123
VITE_HA_TOKEN=your_home_assistant_token_here
VITE_WHISPER_URL=http://localhost:10301
VITE_PIPER_URL=http://localhost:10201
```

Get your Home Assistant token: [Generate a Long-Lived Access Token](https://www.home-assistant.io/docs/authentication/#your-account-profile)

```bash
# Start voice services (Whisper STT + Piper TTS)
cd docker
docker-compose up -d --build

# Start development server
cd ..
npm run dev
```

Visit `http://localhost:5173` and click the microphone to start speaking commands.

## Example Commands

- "Turn on the living room light"
- "Set bedroom brightness to 50%"
- "Make the office light blue"
- "Turn everything off"

## What's Next?

Demesne is designed as the foundation for something bigger - a self-sovereign node that can optionally connect to a cooperative AI infrastructure network. Stay tuned.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **State Management**: Nucleux
- **Voice Recognition**: Local Whisper (via Wyoming protocol) + Wyoming-to-HTTP bridge
- **Text-to-Speech**: Local Piper TTS (via Wyoming protocol) + Wyoming-to-HTTP bridge
- **LLM**: Ollama (llama3.1:8b, llama3.2:3b)
- **Smart Home**: Home Assistant REST API
- **Protocol**: Zigbee (fully local, no internet required)

## License

MIT
