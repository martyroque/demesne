import asyncio
import logging
from typing import Optional
from aiohttp import web
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.client import AsyncTcpClient
from wyoming.asr import Transcribe, Transcript
from wyoming.info import Describe, Info
from config import Config

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class WhisperBridge:
    def __init__(self, config: Config):
        self.config = config
        self.whisper_host = config.whisper_host
        self.whisper_port = config.whisper_port

    async def get_whisper_info(self) -> Optional[dict]:
        """Get info from Wyoming Whisper service"""
        try:
            async with AsyncTcpClient(self.whisper_host, self.whisper_port) as client:
                await client.write_event(Describe().event())

                while True:
                    event = await asyncio.wait_for(
                        client.read_event(), timeout=self.config.timeout
                    )
                    if event is None:
                        break
                    if Info.is_type(event.type):
                        info = Info.from_event(event)
                        # Build response from available attributes only
                        result = {}

                        # Safely get attributes that might exist
                        if hasattr(info, "name"):
                            result["name"] = info.name
                        if hasattr(info, "version"):
                            result["version"] = info.version
                        if hasattr(info, "attribution"):
                            result["attribution"] = info.attribution

                        # ASR info if available
                        if hasattr(info, "asr") and info.asr:
                            result["asr"] = []
                            for model in info.asr:
                                model_info = {}
                                if hasattr(model, "name"):
                                    model_info["name"] = model.name
                                if hasattr(model, "description"):
                                    model_info["description"] = model.description
                                if hasattr(model, "installed"):
                                    model_info["installed"] = model.installed
                                if hasattr(model, "languages"):
                                    model_info["languages"] = model.languages
                                result["asr"].append(model_info)

                        return result if result else {"status": "connected"}

        except asyncio.TimeoutError:
            logger.error("Timeout getting Whisper info")
            return None
        except Exception as e:
            logger.error(f"Error getting Whisper info: {e}", exc_info=True)
            return None

    async def transcribe_audio(
        self, audio_data: bytes
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Send PCM audio to Wyoming Whisper and get transcript
        Returns: (transcript_text, language) or (None, None) on error
        """
        try:
            async with AsyncTcpClient(self.whisper_host, self.whisper_port) as client:
                # Send audio start event
                await client.write_event(
                    AudioStart(
                        rate=self.config.sample_rate,
                        width=self.config.sample_width,
                        channels=self.config.channels,
                    ).event()
                )

                # Send audio in chunks if large
                chunk_size = 8192
                for i in range(0, len(audio_data), chunk_size):
                    chunk = audio_data[i : i + chunk_size]
                    await client.write_event(
                        AudioChunk(
                            audio=chunk,
                            rate=self.config.sample_rate,
                            width=self.config.sample_width,
                            channels=self.config.channels,
                        ).event()
                    )

                # Send audio stop and transcribe request
                await client.write_event(AudioStop().event())
                await client.write_event(Transcribe().event())

                # Read transcript response
                while True:
                    event = await asyncio.wait_for(
                        client.read_event(), timeout=self.config.timeout
                    )
                    if event is None:
                        break
                    if Transcript.is_type(event.type):
                        transcript = Transcript.from_event(event)
                        # Transcript only has .text attribute
                        return transcript.text, None

                return None, None

        except asyncio.TimeoutError:
            logger.error("Timeout waiting for transcription")
            return None, None
        except Exception as e:
            logger.error(f"Transcription error: {e}", exc_info=True)
            return None, None


# CORS middleware
@web.middleware
async def cors_middleware(request, handler):
    """Add CORS headers to all responses"""
    # Handle preflight OPTIONS requests
    if request.method == "OPTIONS":
        response = web.Response()
    else:
        response = await handler(request)

    # Add CORS headers
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "3600"

    return response


async def handle_transcribe(request):
    """
    POST /transcribe
    Content-Type: audio/pcm (16kHz, 16-bit, mono)
    Returns: {"text": "...", "language": "..."}
    """
    bridge = request.app["bridge"]

    try:
        audio_data = await request.read()

        if not audio_data:
            return web.json_response({"error": "No audio data provided"}, status=400)

        logger.info(f"Received {len(audio_data)} bytes of audio")

        text, _ = await bridge.transcribe_audio(audio_data)

        if text is None:
            return web.json_response({"error": "Transcription failed"}, status=500)

        logger.info(f"Transcribed: '{text}'")

        return web.json_response(
            {
                "text": text,
                "language": "en",  # Return configured language from Whisper model
            }
        )

    except Exception as e:
        logger.error(f"Request handling error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def handle_info(request):
    """
    GET /info
    Returns: Service information and Whisper service status
    """
    bridge = request.app["bridge"]

    whisper_info = await bridge.get_whisper_info()

    return web.json_response(
        {
            "service": "whisper-http-bridge",
            "version": "1.0.0",
            "whisper": {
                "host": bridge.whisper_host,
                "port": bridge.whisper_port,
                "available": whisper_info is not None,
                "info": whisper_info,
            },
            "audio_format": {
                "sample_rate": bridge.config.sample_rate,
                "sample_width": bridge.config.sample_width,
                "channels": bridge.config.channels,
            },
        }
    )


async def handle_health(request):
    """
    GET /health
    Returns: Health check status
    """
    bridge = request.app["bridge"]

    # Try to connect to Whisper service
    try:
        async with AsyncTcpClient(bridge.whisper_host, bridge.whisper_port) as client:
            await asyncio.wait_for(client.write_event(Describe().event()), timeout=1.0)
            healthy = True
    except:
        healthy = False

    status = 200 if healthy else 503
    return web.json_response(
        {
            "status": "healthy" if healthy else "unhealthy",
            "whisper_connection": healthy,
        },
        status=status,
    )


async def on_startup(app):
    """Initialize bridge on startup"""
    config = Config()
    app["bridge"] = WhisperBridge(config)
    logger.info(
        f"Whisper bridge started, connecting to {config.whisper_host}:{config.whisper_port}"
    )


async def on_cleanup(app):
    """Cleanup on shutdown"""
    logger.info("Whisper bridge shutting down")


def create_app() -> web.Application:
    # Create app with CORS middleware
    app = web.Application(middlewares=[cors_middleware])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    # Add routes
    app.router.add_post("/transcribe", handle_transcribe)
    app.router.add_get("/info", handle_info)
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    config = Config()
    app = create_app()

    logger.info(
        f"Starting Whisper HTTP Bridge on {config.bridge_host}:{config.bridge_port}"
    )
    web.run_app(
        app, host=config.bridge_host, port=config.bridge_port, access_log=logger
    )
