import os


class Config:
    # Wyoming Piper connection
    piper_host: str = os.getenv("PIPER_HOST", "localhost")
    piper_port: int = int(os.getenv("PIPER_PORT", "10200"))

    # HTTP server settings
    bridge_host: str = os.getenv("BRIDGE_HOST", "0.0.0.0")
    bridge_port: int = int(os.getenv("BRIDGE_PORT", "10201"))

    # CORS settings (comma-separated origins)
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")

    # Timeout for Wyoming operations (seconds)
    timeout: float = float(os.getenv("TIMEOUT", "30.0"))
