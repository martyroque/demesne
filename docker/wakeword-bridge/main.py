import asyncio
import logging
from typing import Optional
from aiohttp import web
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.client import AsyncTcpClient
from wyoming.wake import Detect, Detection
from wyoming.info import Describe, Info
from config import Config

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class WakeWordBridge:
    def __init__(self, config: Config):
        self.config = config
        self.wakeword_host = config.wakeword_host
        self.wakeword_port = config.wakeword_port

    async def get_wakeword_info(self) -> Optional[dict]:
        """Get info from Wyoming OpenWakeWord service"""
        try:
            async with AsyncTcpClient(self.wakeword_host, self.wakeword_port) as client:
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

                        # Wake word info if available
                        if hasattr(info, "wake") and info.wake:
                            result["wake"] = []
                            for model in info.wake:
                                model_info = {}
                                if hasattr(model, "name"):
                                    model_info["name"] = model.name
                                if hasattr(model, "description"):
                                    model_info["description"] = model.description
                                if hasattr(model, "installed"):
                                    model_info["installed"] = model.installed
                                if hasattr(model, "languages"):
                                    model_info["languages"] = model.languages
                                result["wake"].append(model_info)

                        return result if result else {"status": "connected"}

        except asyncio.TimeoutError:
            logger.error("Timeout getting wake word info")
            return None
        except Exception as e:
            logger.error(f"Error getting wake word info: {e}", exc_info=True)
            return None

    async def detect_wakeword(self, audio_data: bytes) -> tuple[bool, Optional[str]]:
        """
        Send PCM audio to Wyoming OpenWakeWord and check for detection
        Returns: (detected, wakeword_name) or (False, None)
        """
        try:
            async with AsyncTcpClient(self.wakeword_host, self.wakeword_port) as client:
                # Send audio start event
                await client.write_event(
                    AudioStart(
                        rate=self.config.sample_rate,
                        width=self.config.sample_width,
                        channels=self.config.channels,
                    ).event()
                )

                # Send audio in chunks
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

                # Send audio stop and detect request
                await client.write_event(AudioStop().event())
                await client.write_event(Detect().event())

                # Read detection response
                while True:
                    event = await asyncio.wait_for(
                        client.read_event(), timeout=self.config.timeout
                    )
                    if event is None:
                        break
                    if Detection.is_type(event.type):
                        detection = Detection.from_event(event)
                        if hasattr(detection, "name"):
                            logger.info(f"Wake word detected: {detection.name}")
                            return True, detection.name
                        return True, "unknown"

                return False, None

        except asyncio.TimeoutError:
            logger.debug("No wake word detected (timeout)")
            return False, None
        except Exception as e:
            logger.error(f"Wake word detection error: {e}", exc_info=True)
            return False, None


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


async def handle_detect(request):
    """
    POST /detect
    Content-Type: audio/pcm (16kHz, 16-bit, mono)
    Returns: {"detected": true/false, "wakeword": "..."}
    """
    bridge = request.app["bridge"]

    try:
        audio_data = await request.read()

        if not audio_data:
            return web.json_response({"error": "No audio data provided"}, status=400)

        logger.debug(f"Received {len(audio_data)} bytes of audio for detection")

        detected, wakeword = await bridge.detect_wakeword(audio_data)

        return web.json_response(
            {
                "detected": detected,
                "wakeword": wakeword if wakeword else None,
            }
        )

    except Exception as e:
        logger.error(f"Request handling error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def handle_info(request):
    """
    GET /info
    Returns: Service information and wake word service status
    """
    bridge = request.app["bridge"]

    wakeword_info = await bridge.get_wakeword_info()

    return web.json_response(
        {
            "service": "wakeword-http-bridge",
            "version": "1.0.0",
            "wakeword": {
                "host": bridge.wakeword_host,
                "port": bridge.wakeword_port,
                "available": wakeword_info is not None,
                "info": wakeword_info,
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

    try:
        async with AsyncTcpClient(bridge.wakeword_host, bridge.wakeword_port) as client:
            await asyncio.wait_for(client.write_event(Describe().event()), timeout=1.0)
            healthy = True
    except:
        healthy = False

    status = 200 if healthy else 503
    return web.json_response(
        {
            "status": "healthy" if healthy else "unhealthy",
            "wakeword_connection": healthy,
        },
        status=status,
    )


async def on_startup(app):
    """Initialize bridge on startup"""
    config = Config()
    app["bridge"] = WakeWordBridge(config)
    logger.info(
        f"Wake word bridge started, connecting to {config.wakeword_host}:{config.wakeword_port}"
    )


async def on_cleanup(app):
    """Cleanup on shutdown"""
    logger.info("Wake word bridge shutting down")


def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    app.router.add_post("/detect", handle_detect)
    app.router.add_get("/info", handle_info)
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    config = Config()
    app = create_app()

    logger.info(
        f"Starting Wake Word HTTP Bridge on {config.bridge_host}:{config.bridge_port}"
    )
    web.run_app(
        app, host=config.bridge_host, port=config.bridge_port, access_log=logger
    )
