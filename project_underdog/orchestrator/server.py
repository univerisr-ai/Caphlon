"""Orchestrator server - ana merkez HTTP/WebSocket sunucusu."""

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from project_underdog.config import HEARTBEAT_INTERVAL_SEC
from project_underdog.models import (
    TaskType, TaskStatus, TaskResult,
    WorkerInfo, WorkerStatus,
)
from project_underdog.orchestrator.task_queue import TaskQueue
from project_underdog.orchestrator.consensus import compute_consensus
from project_underdog.orchestrator.reputation import ReputationManager
from project_underdog.orchestrator.validator import Validator
from project_underdog.orchestrator.honeypot import HoneypotManager


def _json_dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)

logger = logging.getLogger(__name__)

app = FastAPI(title="Project Underdog Orchestrator", version="0.2.0")


@app.get("/")
async def dashboard():
    import os
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    return FileResponse(os.path.join(static_dir, "dashboard.html"))


@app.on_event("startup")
async def startup_event():
    try:
        from project_underdog.database.engine import get_db_manager
        db = get_db_manager()
        await db.create_all()
        logger.info("Database initialized on startup")
    except Exception as e:
        logger.warning("Database init skipped: %s", e)


@app.on_event("shutdown")
async def shutdown_event():
    try:
        from project_underdog.database.engine import shutdown_db
        await shutdown_db()
        logger.info("Database connections closed")
    except Exception:
        pass

task_queue = TaskQueue()
reputation = ReputationManager()
validator = Validator()
honeypot = HoneypotManager()

connected_workers: dict[str, WebSocket] = {}
worker_info: dict[str, WorkerInfo] = {}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "workers": len(connected_workers),
        "pending_tasks": task_queue.pending_count,
        "active_tasks": task_queue.active_count,
    }


@app.get("/workers")
async def list_workers():
    return {
        "count": len(worker_info),
        "workers": [w.model_dump() for w in worker_info.values()],
    }


@app.post("/tasks")
async def create_task(task_type: str = "ping", description: str = "",
                      payload: dict | None = None, min_workers: int = 3):
    try:
        tt = TaskType(task_type)
    except ValueError:
        return JSONResponse({"error": f"Gecersiz gorev tipi: {task_type}"}, status_code=400)

    task = await task_queue.create_task(
        task_type=tt,
        description=description or f"Test task: {task_type}",
        payload=payload or {},
        min_workers=min_workers,
    )
    return task.model_dump()


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = await task_queue.get_task(task_id)
    if not task:
        return JSONResponse({"error": "Gorev bulunamadi"}, status_code=404)
    return task.model_dump()


@app.get("/tasks")
async def list_tasks():
    return {
        "count": len(task_queue.tasks),
        "tasks": [t.model_dump() for t in task_queue.tasks.values()],
    }


@app.get("/stats")
async def get_stats():
    return {
        "workers": len(connected_workers),
        "idle_workers": sum(1 for w in worker_info.values() if w.status == WorkerStatus.IDLE),
        "busy_workers": sum(1 for w in worker_info.values() if w.status == WorkerStatus.BUSY),
        "pending_tasks": task_queue.pending_count,
        "active_tasks": task_queue.active_count,
        "completed_tasks": sum(1 for t in task_queue.tasks.values()
                               if t.status in (TaskStatus.COMPLETED, TaskStatus.VERIFIED)),
        "rejected_tasks": sum(1 for t in task_queue.tasks.values()
                              if t.status == TaskStatus.REJECTED),
        "reputation_scores": {
            wid: round(score, 3) for wid, score in reputation.scores.items()
        },
    }


@app.post("/chat")
async def chat_endpoint(payload: dict):
    from uuid import uuid4

    from project_underdog.llm import get_llm_provider
    from project_underdog.knowledge import get_knowledge_store
    from project_underdog.database.repository import ConversationRepository, KnowledgeRepository

    question = payload.get("question", "").strip()
    conversation_id = payload.get("conversation_id") or f"chat-{uuid4().hex[:12]}"
    topic = payload.get("topic", "")
    save_to_knowledge = payload.get("save", True)

    if not question:
        return JSONResponse({"error": "Soru bos olamaz"}, status_code=400)

    knowledge = get_knowledge_store()
    is_dup, dup_reason = await knowledge.is_duplicate(question)
    if is_dup:
        logger.info("Knowledge dedup: %s (%s)", question[:50], dup_reason)
        return {
            "answer": f"[Bu bilgi zaten ogrenildi #{dup_reason}]",
            "conversation_id": conversation_id,
            "deduplicated": True,
            "method": "cached",
            "model": "knowledge_store",
            "tokens_used": 0,
        }

    retrieved = knowledge.retrieve_similar(question, n=3)
    rag_context = ""
    if retrieved:
        rag_context = "Ilgili gecmis bilgiler:\n" + "\n".join(
            f"Q: {r['question'][:200]}\nA: {r['answer'][:200]}" for r in retrieved
        )

    system_prompt = "Kisa ve dogru cevaplar ver. Gecmis bilgileri dikkate al."
    full_prompt = question
    if rag_context:
        full_prompt = f"{rag_context}\n\n---\nSoru: {question}"

    llm = get_llm_provider()
    response = await llm.generate(full_prompt, system=system_prompt, max_tokens=512)

    try:
        await ConversationRepository.add_message(
            conversation_id=conversation_id,
            role="user",
            content=question,
        )
        await ConversationRepository.add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=response.answer,
            model=response.model,
            tokens_used=response.tokens_used,
        )
    except Exception as e:
        logger.warning("Konusma kaydi basarisiz: %s", e)

    if save_to_knowledge and response.ok:
        if topic:
            auto_topic = topic
        else:
            words = question.split()[:8]
            auto_topic = " ".join(words)

        content_hash = knowledge.store(
            question=question,
            answer=response.answer,
            topic=auto_topic,
            source="conversation",
            source_id=conversation_id,
        )
        try:
            await KnowledgeRepository.store(
                content_hash=content_hash,
                question=question,
                answer=response.answer,
                topic=auto_topic,
                source="conversation",
                source_id=conversation_id,
                quality_score=0.7,
            )
        except Exception as e:
            pass

    return {
        "answer": response.answer,
        "conversation_id": conversation_id,
        "deduplicated": False,
        "method": "api" if response.ok else "error",
        "model": response.model,
        "tokens_used": response.tokens_used,
        "rag_context": bool(rag_context),
        "retrieved_count": len(retrieved),
        "knowledge_store_size": knowledge.count(),
    }


@app.get("/knowledge/stats")
async def knowledge_stats():
    from project_underdog.knowledge import get_knowledge_store
    ks = get_knowledge_store()
    return {
        "total_entries": ks.count(),
        "storage": str(ks._persist_dir),
    }


@app.get("/conversations")
async def list_conversations():
    from project_underdog.database.repository import ConversationRepository
    convs = await ConversationRepository.list_conversations(limit=30)
    return {
        "count": len(convs),
        "conversations": [
            {
                "id": c.conversation_id,
                "title": c.title or f"Sohbet {c.conversation_id[:8]}",
                "messages": c.message_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in convs
        ],
    }


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    from project_underdog.database.repository import ConversationRepository
    msgs = await ConversationRepository.get_messages(conversation_id, limit=100)
    return {
        "conversation_id": conversation_id,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "model": m.model,
                "tokens_used": m.tokens_used,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in reversed(msgs)
        ],
    }


async def _process_worker_message(worker_id: str, message: dict):
    msg_type = message.get("type", "")

    if msg_type == "heartbeat":
        if worker_id in worker_info:
            worker_info[worker_id].last_heartbeat = datetime.now(timezone.utc)
            if worker_info[worker_id].status != WorkerStatus.BUSY:
                worker_info[worker_id].status = WorkerStatus.IDLE

    elif msg_type == "task_request":
        if honeypot.is_due(worker_id) and random.random() < 0.15:
            hp_data = honeypot.get_honeypot_task()
            hp_task = await task_queue.create_task(
                task_type=TaskType.HONEYPOT,
                description=f"Tuzak soru: {hp_data['question'][:50]}",
                payload=hp_data,
                min_workers=1,
            )
            await task_queue.assign_task(hp_task.task_id, worker_id)
            if worker_id in connected_workers:
                await connected_workers[worker_id].send_text(_json_dumps({
                    "type": "task_assigned",
                    "task": hp_task.model_dump(mode="json"),
                }))
                logger.info("Tuzak soru atandi: %s -> %s", hp_task.task_id, worker_id)
            return

        task = await task_queue.get_available_task()
        if task:
            ok = await task_queue.assign_task(task.task_id, worker_id)
            if ok and worker_id in connected_workers:
                if worker_id in worker_info:
                    worker_info[worker_id].status = WorkerStatus.BUSY
                await connected_workers[worker_id].send_text(_json_dumps({
                    "type": "task_assigned",
                    "task": task.model_dump(mode="json"),
                }))
                logger.info("Gorev atandi: %s -> %s", task.task_id, worker_id)
            else:
                await connected_workers[worker_id].send_text(_json_dumps({
                    "type": "no_task",
                }))
        else:
            await connected_workers[worker_id].send_text(json.dumps({
                "type": "no_task",
            }))

    elif msg_type == "task_result":
        task_id = message.get("task_id", "")
        result_data = message.get("result", {})
        result = TaskResult(**result_data)
        task = await task_queue.get_task(task_id)

        if not task:
            await connected_workers[worker_id].send_text(_json_dumps({
                "type": "error", "message": "Gorev bulunamadi",
            }))
            return

        is_honeypot = task.payload.get("is_honeypot", False)
        if is_honeypot:
            expected = task.payload.get("expected_answer", "")
            actual = result.data.get("answer", "")
            if honeypot.verify_answer(expected, actual):
                logger.info("Tuzak soru dogru cevaplandi: %s", worker_id)
                await reputation.reward_success(worker_id)
            else:
                logger.warning("TUZAK! Isci yanlis cevap verdi: %s (beklenen: %s, alinan: %s)",
                               worker_id, expected, actual)
                await reputation.penalize_honeypot(worker_id)
                if not await reputation.is_trusted(worker_id):
                    logger.warning("Isci guvenilmez ilan edildi: %s", worker_id)
                    if worker_id in connected_workers:
                        await connected_workers[worker_id].send_text(_json_dumps({
                            "type": "kick", "message": "Guvenilmez isci - kovandan cikariliyorsun",
                        }))
                        ws = connected_workers.pop(worker_id, None)
                        if ws:
                            await ws.close()
            honeypot.mark_checked(worker_id)
            await task_queue.finalize_task(task_id, TaskStatus.VERIFIED)
            if worker_id in worker_info:
                worker_info[worker_id].status = WorkerStatus.IDLE
            return

        is_valid, valid_msg = validator.validate_result(result_data.get("data", {}))
        if not is_valid:
            logger.warning("Gecersiz sonuc: %s - %s", worker_id, valid_msg)
            await reputation.penalize_failure(worker_id)
            if worker_id in worker_info:
                worker_info[worker_id].tasks_failed += 1
            return

        await task_queue.submit_result(task_id, result)
        await reputation.reward_success(worker_id)

        if worker_id in worker_info:
            worker_info[worker_id].tasks_completed += 1
            worker_info[worker_id].status = WorkerStatus.IDLE

        task = await task_queue.get_task(task_id)
        if task and task.status == TaskStatus.COMPLETED:
            consensus_result = compute_consensus(task.results)
            is_verified = consensus_result is not None and consensus_result.get("consensus_reached", False)
            await task_queue.finalize_task(
                task_id,
                TaskStatus.VERIFIED if is_verified else TaskStatus.REJECTED,
                consensus_result,
            )
            logger.info(
                "Gorev tamamlandi: %s - Mutabakat: %s",
                task_id,
                "SAGLANDI" if is_verified else "SAGLANAMADI",
            )

            for wid in task.results:
                if wid in connected_workers:
                    await connected_workers[wid].send_text(_json_dumps({
                        "type": "task_consensus",
                        "task_id": task_id,
                        "consensus": consensus_result,
                    }))


async def _manage_worker_lifecycle(worker_id: str):
    try:
        while worker_id in connected_workers:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
            if worker_id not in worker_info:
                continue

            elapsed = (datetime.now(timezone.utc) - worker_info[worker_id].last_heartbeat).total_seconds()
            if elapsed > HEARTBEAT_INTERVAL_SEC * 3:
                logger.warning("Isci zaman asimina ugradi: %s", worker_id)
                worker_info[worker_id].status = WorkerStatus.OFFLINE
                ws = connected_workers.pop(worker_id, None)
                if ws:
                    try:
                        await ws.close()
                    except Exception:
                        pass
                break
    except asyncio.CancelledError:
        pass


@app.websocket("/ws")
async def worker_websocket(websocket: WebSocket):
    await websocket.accept()
    worker_id = None

    try:
        data = await websocket.receive_text()
        register_msg = json.loads(data)
    except (WebSocketDisconnect, asyncio.CancelledError):
        return
    except Exception as e:
        logger.error("Kayit hatasi: %s", e)
        return

    if register_msg.get("type") != "register":
        await websocket.close(code=1008, reason="Once register mesaji gerekli")
        return

    worker_id = register_msg.get("worker_id", f"vbs-{id(websocket):x}")
    worker_name = register_msg.get("name", "unnamed")
    capabilities = register_msg.get("capabilities", [])

    worker_info[worker_id] = WorkerInfo(
        worker_id=worker_id,
        name=worker_name,
        capabilities=capabilities,
    )
    connected_workers[worker_id] = websocket
    await reputation.register_worker(worker_id)

    await websocket.send_text(_json_dumps({
        "type": "registered",
        "worker_id": worker_id,
        "message": "Project Underdog Kovanina hos geldin!",
    }))

    logger.info("Isci baglandi: %s (%s)", worker_id, worker_name)

    lifecycle_task = asyncio.create_task(_manage_worker_lifecycle(worker_id))

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_INTERVAL_SEC * 2)
                message = json.loads(raw)
                await _process_worker_message(worker_id, message)
            except asyncio.TimeoutError:
                if worker_id in connected_workers:
                    await connected_workers[worker_id].send_text(_json_dumps({
                        "type": "ping",
                    }))
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                logger.warning("Gecersiz JSON: %s", worker_id)
            except asyncio.CancelledError:
                break
    except WebSocketDisconnect:
        logger.info("Isci baglantisi koptu: %s", worker_id)
    except asyncio.CancelledError:
        logger.info("Isci gorevi iptal edildi: %s", worker_id)
    except Exception as e:
        logger.error("Worker hatasi: %s", e)
    finally:
        lifecycle_task.cancel()
        try:
            await lifecycle_task
        except (asyncio.CancelledError, Exception):
            pass
        if worker_id:
            connected_workers.pop(worker_id, None)
            if worker_id in worker_info:
                worker_info[worker_id].status = WorkerStatus.OFFLINE
            logger.info("Isci ayrildi: %s", worker_id)
