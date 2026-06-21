"""Worker client - orkestratore WebSocket baglantisi."""

import asyncio
import json
import logging
from uuid import uuid4

import websockets

from project_underdog.config import ORCHESTRATOR_URL, HEARTBEAT_INTERVAL_SEC

logger = logging.getLogger(__name__)


class WorkerClient:
    def __init__(self, worker_id: str | None = None, name: str = "anonymous",
                 capabilities: list[str] | None = None,
                 orchestrator_url: str | None = None):
        self.worker_id = worker_id or f"vbs-{uuid4().hex[:8]}"
        self.name = name
        self.capabilities = capabilities or ["qa_generation", "research"]
        self.url = orchestrator_url or ORCHESTRATOR_URL
        self.ws = None
        self._running = False
        self._task_handler = None
        self._current_task = None

    def set_task_handler(self, handler):
        self._task_handler = handler

    async def connect(self):
        self.ws = await websockets.connect(self.url)
        await self.ws.send(json.dumps({
            "type": "register",
            "worker_id": self.worker_id,
            "name": self.name,
            "capabilities": self.capabilities,
        }))

        response = json.loads(await self.ws.recv())
        logger.info("Baglandi: %s", response.get("message", "OK"))
        self._running = True
        return response

    async def run(self):
        if not self._task_handler:
            logger.error("Task handler ayarlanmadi!")
            return

        heartbeat_task = asyncio.create_task(self._send_heartbeat())

        try:
            while self._running:
                await self.ws.send(json.dumps({"type": "task_request"}))
                try:
                    raw = await asyncio.wait_for(self.ws.recv(), timeout=30)
                    msg = json.loads(raw)
                    await self._handle_message(msg)
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    logger.warning("Baglanti koptu")
                    break
        finally:
            heartbeat_task.cancel()
            self._running = False

    async def _send_heartbeat(self):
        while self._running:
            try:
                if self.ws:
                    await self.ws.send(json.dumps({"type": "heartbeat"}))
            except Exception:
                pass
            await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)

    async def _handle_message(self, msg: dict):
        msg_type = msg.get("type", "")

        if msg_type == "task_assigned":
            task_data = msg.get("task", {})
            task_id = task_data.get("task_id", "")
            self._current_task = task_data

            logger.info("Gorev alindi: %s - %s", task_id, task_data.get("description", ""))

            result = await self._task_handler(task_data)

            if self.ws:
                await self.ws.send(json.dumps({
                    "type": "task_result",
                    "task_id": task_id,
                    "result": result,
                }))
                logger.info("Sonuc gonderildi: %s", task_id)

        elif msg_type == "task_consensus":
            consensus = msg.get("consensus", {})
            logger.info("Mutabakat sonucu: %s", consensus.get("consensus_reached", False))

        elif msg_type == "ping":
            pass

        elif msg_type == "no_task":
            await asyncio.sleep(2)

    async def disconnect(self):
        self._running = False
        if self.ws:
            await self.ws.close()
