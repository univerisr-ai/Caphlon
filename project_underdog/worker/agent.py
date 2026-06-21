"""VBS Worker Agent - gorevleri alir, ogretmen-ogrenci dongusunu calistirir, sonuc uretir."""

import logging
import time

from project_underdog.worker.client import WorkerClient
from project_underdog.worker.teacher_student import TeacherStudentLoop

logger = logging.getLogger(__name__)


class WorkerAgent:
    def __init__(self, worker_id: str | None = None, name: str = "anonymous",
                 orchestrator_url: str | None = None):
        self.client = WorkerClient(
            worker_id=worker_id,
            name=name,
            orchestrator_url=orchestrator_url,
        )
        self.ts_loop = TeacherStudentLoop()
        self.client.set_task_handler(self.handle_task)

    async def start(self):
        await self.client.connect()
        logger.info("VBS iscisi baslatildi: %s", self.client.worker_id)
        await self.client.run()

    async def handle_task(self, task: dict) -> dict:
        task_id = task.get("task_id", "unknown")
        description = task.get("description", "")
        payload = task.get("payload", {})

        question = payload.get("question", description)
        context = payload.get("context", {})

        logger.info("[%s] Gorev isleniyor: %s", task_id, question[:80])

        start_time = time.monotonic()

        result = await self.ts_loop.run(question, context)

        latency_ms = (time.monotonic() - start_time) * 1000

        return {
            "worker_id": self.client.worker_id,
            "task_id": task_id,
            "success": True,
            "data": result,
            "tokens_used": result.get("tokens_used", 0),
            "latency_ms": latency_ms,
        }
