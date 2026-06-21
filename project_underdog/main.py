"""Project Underdog - Ana giris noktasi.

Kullanim:
    # Orkestrator baslat (ana merkez):
    python -m project_underdog.main orchestrator

    # VBS iscisi baslat:
    python -m project_underdog.main worker --name vbs-1

    # Orkestrator + 3 isciyi ayni anda baslat (test):
    python -m project_underdog.main demo
"""

import argparse
import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("underdog")


async def run_orchestrator():
    import uvicorn
    from project_underdog.config import ORCHESTRATOR_HOST, ORCHESTRATOR_PORT
    from project_underdog.orchestrator.server import app

    logger.info("Orkestrator baslatiliyor: %s:%s", ORCHESTRATOR_HOST, ORCHESTRATOR_PORT)
    config = uvicorn.Config(app, host=ORCHESTRATOR_HOST, port=ORCHESTRATOR_PORT, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def run_worker(name: str, url: str | None = None):
    from project_underdog.worker.agent import WorkerAgent

    agent = WorkerAgent(name=name, orchestrator_url=url)
    await agent.start()


async def run_demo():
    from project_underdog.config import ORCHESTRATOR_URL
    from project_underdog.worker.agent import WorkerAgent
    from project_underdog.orchestrator.server import task_queue

    logger.info("=" * 50)
    logger.info("  PROJECT UNDERDOG - DEMO MODU")
    logger.info("=" * 50)

    orchestrator_task = asyncio.create_task(run_orchestrator())
    await asyncio.sleep(2)

    url = ORCHESTRATOR_URL
    workers = []

    logger.info("1 VBS iscisi baslatiliyor...")
    for i in range(1):
        agent = WorkerAgent(name=f"vbs-{i+1}", orchestrator_url=url)
        worker_task = asyncio.create_task(agent.start())
        workers.append(worker_task)

    await asyncio.sleep(3)

    logger.info("Test gorevleri olusturuluyor...")
    import httpx
    from project_underdog.config import get_settings

    settings = get_settings()
    base_url = f"http://localhost:{settings.port}"

    test_tasks = [
        ("qa_generation", "2+2 kactir?", {"question": "2+2 kactir?"}),
        ("research", "Yapay zeka nedir?", {"question": "Yapay Zeka (AI) nedir?"}),
    ]

    async with httpx.AsyncClient() as client:
        for task_type, desc, payload in test_tasks:
            try:
                resp = await client.post(
                    f"{base_url}/tasks",
                    params={"task_type": task_type, "description": desc, "min_workers": 1},
                    json=payload,
                )
                if resp.status_code == 200:
                    task_data = resp.json()
                    logger.info("  Gorev olusturuldu: %s - %s", task_data["task_id"], desc)
            except Exception as e:
                logger.error("Gorev olusturulamadi: %s", e)

    logger.info("Islem tamamlanana kadar bekleniyor (60 sn)...")
    await asyncio.sleep(60)

    stats = task_queue.tasks
    completed = sum(1 for t in stats.values() if t.status.value in ("verified", "completed"))
    logger.info("Tamamlanan gorevler: %d/%d", completed, len(stats))
    total_tokens = 0
    for tid, task in stats.items():
        logger.info("  %s: %s - type: %s", tid, task.status.value, task.task_type.value)
        for wid, res in task.results.items():
            data = res.get("data", {})
            tokens = res.get("tokens_used", 0)
            compression = data.get("compression", {})
            total_tokens += tokens
            if compression:
                logger.info("    %s: tokens=%d, saved=%d (%.1f%%)",
                           wid, tokens,
                           compression.get("saved_tokens", 0),
                           compression.get("savings_percent", 0))
    if total_tokens:
        logger.info("Toplam token kullanimi: %d", total_tokens)

    logger.info("Demo tamamlandi!")

    orch_task = orchestrator_task
    orch_task.cancel()
    for wt in workers:
        wt.cancel()

    try:
        await orch_task
    except asyncio.CancelledError:
        pass


async def run_export(limit: int = 5000):
    from project_underdog.database.repository import ResultRepository
    from project_underdog.export import DataExporter

    logger.info("Veri disa aktarimi baslatiliyor (limit: %d)...", limit)

    try:
        raw_data = await ResultRepository.get_export_data(limit=limit)
    except Exception:
        raw_data = []

    if not raw_data:
        logger.warning("Disa aktarilacak dogrulanmis veri bulunamadi. Demo verilerle devam ediliyor.")
        raw_data = [
            {"question": "2+2 kactir?", "answer": "4", "method": "simulation", "tokens_used": 10},
            {"question": "Python nedir?", "answer": "Python yuksek seviyeli bir programlama dilidir.", "method": "simulation", "tokens_used": 20},
        ]

    normalised = DataExporter.normalize_qa_pairs(raw_data)
    exporter = DataExporter()
    paths = exporter.package_for_training(normalised, format="all")

    logger.info("Disa aktarim tamamlandi. Dosyalar:")
    for p in paths:
        logger.info("  %s", p)


async def run_chat():
    import httpx
    from project_underdog.config import get_settings

    settings = get_settings()
    base_url = f"http://localhost:{settings.port}"
    conversation_id = None

    print()
    print("  ╔══════════════════════════════════════════╗")
    print("  ║     🐕 Project Underdog - Chat          ║")
    print("  ║     AI ogreniyor, seninle gelisiyor     ║")
    print("  ╚══════════════════════════════════════════╝")
    print()
    print("  Her sorun kaydedilir, AI ogrenir.")
    print("  Cikmak icin: /quit  veya  CTRL+C")
    print()

    async with httpx.AsyncClient(timeout=120) as client:
        while True:
            try:
                question = input("  🧑 Sen: ").strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not question:
                continue
            if question.lower() in ("/quit", "/exit", "/cik"):
                break

            print("  🤖 AI dusunuyor...", end="\r")

            try:
                resp = await client.post(
                    f"{base_url}/chat",
                    json={
                        "question": question,
                        "conversation_id": conversation_id,
                    },
                )
                data = resp.json()
                conversation_id = data.get("conversation_id")

                answer = data.get("answer", "Hata")
                method = data.get("method", "?")
                tokens = data.get("tokens_used", 0)
                dedup = data.get("deduplicated", False)
                store = data.get("knowledge_store_size", 0)

                print(f"  🤖 AI  : {answer}")
                status = []
                if dedup:
                    status.append("📚 biliniyordu")
                elif method == "api":
                    status.append(f"✨ ogrenildi")
                status.append(f"🔢 {tokens}t")
                status.append(f"📦 {store}")
                print(f"  {DIM}{' · '.join(status)}{RESET}")
                print()

            except Exception as e:
                logger.error("Chat hatasi: %s", e)
                print(f"  ❌ Hata: {e}")
                print("  Orkestrator calisiyor mu? Port: %s" % settings.port)

    print()
    print(f"  Gorusmek uzere! ({conversation_id})")
    if conversation_id:
        print(f"  Sohbet kaydedildi: /conversations/{conversation_id}")


DIM = "\033[2m"
RESET = "\033[0m"


def main():
    parser = argparse.ArgumentParser(description="Project Underdog - Kovan Zekasi AI Sistemi")
    subparsers = parser.add_subparsers(dest="command", help="Komutlar")

    subparsers.add_parser("orchestrator", help="Orkestrator sunucusunu baslat")
    worker_parser = subparsers.add_parser("worker", help="VBS iscisi baslat")
    worker_parser.add_argument("--name", default="vbs-worker", help="Isci adi")
    worker_parser.add_argument("--url", default=None, help="Orkestrator URL")
    subparsers.add_parser("demo", help="Demo modu (orkestrator + 3 isci)")
    export_parser = subparsers.add_parser("export", help="Egitim verilerini disa aktar")
    export_parser.add_argument("--limit", type=int, default=5000, help="Max kayit sayisi")
    subparsers.add_parser("chat", help="AI ile sohbet baslat (ogrenme modu)")

    args = parser.parse_args()

    if args.command == "orchestrator":
        asyncio.run(run_orchestrator())
    elif args.command == "worker":
        asyncio.run(run_worker(name=args.name, url=args.url))
    elif args.command == "demo":
        asyncio.run(run_demo())
    elif args.command == "export":
        asyncio.run(run_export(limit=args.limit))
    elif args.command == "chat":
        asyncio.run(run_chat())
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
