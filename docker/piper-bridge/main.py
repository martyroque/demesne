import asyncio
import logging
from typing import Optional
from aiohttp import web
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.client import AsyncTcpClient
from wyoming.tts import Synthesize
from wyoming.info import Describe, Info
from config import Config

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class PiperBridge:
    def __init__(self, config: Config):
        self.config = config
        self.piper_host = config.piper_host
        self.piper_port = config.piper_port

    async def get_piper_info(self) -> Optional[dict]:
        """Get info from Wyoming Piper service"""
        try:
            async with AsyncTcpClient(self.piper_host, self.piper_port) as client:
                await client.write_event(Describe().event())

                while True:
                    event = await asyncio.wait_for(
                        client.read_event(), timeout=self.config.timeout
                    )
                    if event is None:
                        break
                    if Info.is_type(event.type):
                        info = Info.from_event(event)
                        result = {}

                        if hasattr(info, "name"):
                            result["name"] = info.name
                        if hasattr(info, "version"):
                            result["version"] = info.version
                        if hasattr(info, "attribution"):
                            result["attribution"] = info.attribution

                        # TTS info if available
                        if hasattr(info, "tts") and info.tts:
                            result["tts"] = []
                            for voice in info.tts:
                                voice_info = {}
                                if hasattr(voice, "name"):
                                    voice_info["name"] = voice.name
                                if hasattr(voice, "description"):
                                    voice_info["description"] = voice.description
                                if hasattr(voice, "installed"):
                                    voice_info["installed"] = voice.installed
                                if hasattr(voice, "languages"):
                                    voice_info["languages"] = voice.languages
                                result["tts"].append(voice_info)

                        return result if result else {"status": "connected"}

        except asyncio.TimeoutError:
            logger.error("Timeout getting Piper info")
            return None
        except Exception as e:
            logger.error(f"Error getting Piper info: {e}", exc_info=True)
            return None

    async def synthesize_speech(
        self, text: str, voice: Optional[str] = None
    ) -> Optional[bytes]:
        """
        Send text to Wyoming Piper and get audio
        Returns: PCM audio bytes or None on error
        """
        try:
            async with AsyncTcpClient(self.piper_host, self.piper_port) as client:
                # Send synthesize request
                synthesize_event = Synthesize(text=text)

                # TODO: select voice
                # if voice:
                #     synthesize_event.voice = voice

                await client.write_event(synthesize_event.event())

                audio_data = bytearray()
                audio_format = None

                # Read audio chunks
                while True:
                    event = await asyncio.wait_for(
                        client.read_event(), timeout=self.config.timeout
                    )

                    if event is None:
                        break

                    if AudioStart.is_type(event.type):
                        audio_start = AudioStart.from_event(event)
                        audio_format = {
                            "rate": audio_start.rate,
                            "width": audio_start.width,
                            "channels": audio_start.channels,
                        }
                        logger.info(f"Audio format: {audio_format}")

                    elif AudioChunk.is_type(event.type):
                        chunk = AudioChunk.from_event(event)
                        audio_data.extend(chunk.audio)

                    elif AudioStop.is_type(event.type):
                        logger.info(f"Synthesis complete: {len(audio_data)} bytes")
                        break

                if not audio_data:
                    logger.warning("No audio data received from Piper")
                    return None

                return bytes(audio_data)

        except asyncio.TimeoutError:
            logger.error("Timeout waiting for synthesis")
            return None
        except Exception as e:
            logger.error(f"Synthesis error: {e}", exc_info=True)
            return None


@web.middleware
async def cors_middleware(request, handler):
    """Add CORS headers to all responses"""
    if request.method == "OPTIONS":
        response = web.Response()
    else:
        response = await handler(request)

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "3600"

    return response


async def handle_synthesize(request):
    """
    POST /synthesize
    Body: {"text": "...", "voice": "en_US-hfc_female-medium"} (voice optional)
    Returns: PCM audio (16-bit, 22050Hz, mono)
    """
    bridge = request.app["bridge"]

    try:
        data = await request.json()
        text = data.get("text", "").strip()
        voice = data.get("voice")  # Optional

        if not text:
            return web.json_response({"error": "No text provided"}, status=400)

        logger.info(f"Synthesizing: '{text[:50]}{'...' if len(text) > 50 else ''}'")

        audio_bytes = await bridge.synthesize_speech(text, voice)

        if audio_bytes is None:
            return web.json_response({"error": "Synthesis failed"}, status=500)

        logger.info(f"Returning {len(audio_bytes)} bytes of audio")

        return web.Response(
            body=audio_bytes,
            content_type="audio/pcm",
            headers={
                "X-Audio-Rate": "22050",
                "X-Audio-Width": "2",
                "X-Audio-Channels": "1",
            },
        )

    except Exception as e:
        logger.error(f"Request handling error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def handle_info(request):
    """
    GET /info
    Returns: Service information and Piper service status
    """
    bridge = request.app["bridge"]

    piper_info = await bridge.get_piper_info()

    return web.json_response(
        {
            "service": "piper-http-bridge",
            "version": "1.0.0",
            "piper": {
                "host": bridge.piper_host,
                "port": bridge.piper_port,
                "available": piper_info is not None,
                "info": piper_info,
            },
        }
    )


async def handle_health(request):
    """
    GET /health
    Returns: Health check status
    """
    bridge = request.app["bridge"]

    try:
        async with AsyncTcpClient(bridge.piper_host, bridge.piper_port) as client:
            await asyncio.wait_for(client.write_event(Describe().event()), timeout=1.0)
            healthy = True
    except:
        healthy = False

    status = 200 if healthy else 503
    return web.json_response(
        {
            "status": "healthy" if healthy else "unhealthy",
            "piper_connection": healthy,
        },
        status=status,
    )


async def on_startup(app):
    """Initialize bridge on startup"""
    config = Config()
    app["bridge"] = PiperBridge(config)
    logger.info(
        f"Piper bridge started, connecting to {config.piper_host}:{config.piper_port}"
    )


async def on_cleanup(app):
    """Cleanup on shutdown"""
    logger.info("Piper bridge shutting down")


def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    app.router.add_post("/synthesize", handle_synthesize)
    app.router.add_get("/info", handle_info)
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    config = Config()
    app = create_app()

    logger.info(
        f"Starting Piper HTTP Bridge on {config.bridge_host}:{config.bridge_port}"
    )
    web.run_app(
        app, host=config.bridge_host, port=config.bridge_port, access_log=logger
    )
