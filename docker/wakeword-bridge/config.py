import os


class Config:
    # Wyoming OpenWakeWord connection
    wakeword_host: str = os.getenv("WAKEWORD_HOST", "localhost")
    wakeword_port: int = int(os.getenv("WAKEWORD_PORT", "10400"))

    # HTTP server settings
    bridge_host: str = os.getenv("BRIDGE_HOST", "0.0.0.0")
    bridge_port: int = int(os.getenv("BRIDGE_PORT", "10401"))

    # CORS settings (comma-separated origins)
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")

    # Audio format (PCM expected from browser)
    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))
    sample_width: int = int(os.getenv("SAMPLE_WIDTH", "2"))  # 16-bit = 2 bytes
    channels: int = int(os.getenv("CHANNELS", "1"))  # Mono

    # Timeout for Wyoming operations (seconds)
    timeout: float = float(os.getenv("TIMEOUT", "2.0"))
