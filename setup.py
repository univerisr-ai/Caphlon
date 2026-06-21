#!/usr/bin/env python3
"""Project Underdog - Etkilesimli Kurulum Sihirbazi."""

import os
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
ENV_FILE = PROJECT_ROOT / ".env"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
UNDERLINE = "\033[4m"
GREEN = "\033[32m"
BLUE = "\033[34m"
CYAN = "\033[36m"
YELLOW = "\033[33m"
RED = "\033[31m"
MAGENTA = "\033[35m"

LOGO = f"""
{BLUE}  ╔══════════════════════════════════════════════╗
  ║              🐕 {BOLD}PROJECT UNDERDOG{RESET}{BLUE}                ║
  ║     Kovan Zekasi ile Merkeziyetsiz AI          ║
  ╚══════════════════════════════════════════════╝{RESET}
"""


def section(title: str):
    print(f"\n{CYAN}{BOLD}▸ {title}{RESET}")
    print(f"{DIM}{'─' * 50}{RESET}")


def question(text: str, default: str = "") -> str:
    if default:
        prompt = f"  {YELLOW}?{RESET} {text} {DIM}[{default}]{RESET}: "
    else:
        prompt = f"  {YELLOW}?{RESET} {text}: "
    return input(prompt).strip() or default


def confirm(text: str, default: bool = True) -> bool:
    yn = "E/h" if default else "e/H"
    default_str = "E" if default else "H"
    answer = question(f"{text} ({yn})", default_str).lower()
    return answer in ("e", "evet", "y", "yes", "")


def show_success(text: str):
    print(f"  {GREEN}✓{RESET} {text}")


def show_info(text: str):
    print(f"  {BLUE}ℹ{RESET} {text}")


def show_warning(text: str):
    print(f"  {YELLOW}⚠{RESET} {text}")


def show_error(text: str):
    print(f"  {RED}✗{RESET} {text}")


def select_option(title: str, options: list[tuple[str, str, str]]) -> str:
    """Show a list of options, return the selected key."""
    print(f"\n  {BOLD}{title}{RESET}")
    for i, (key, label, desc) in enumerate(options, 1):
        print(f"  {GREEN}{i}{RESET}. {BOLD}{label}{RESET}  {DIM}{desc}{RESET}")
    while True:
        choice = question(f"Seciminiz (1-{len(options)})", "1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return options[idx][0]
        except ValueError:
            pass
        show_error("Gecersiz secim, tekrar deneyin.")


def main():
    print(LOGO)
    print(f"  {DIM}Project Underdog v0.2.0 - Kurulum Sihirbazi{RESET}")
    print(f"  {DIM}{'─' * 50}{RESET}")
    print()

    print(textwrap.dedent(f"""
    {BOLD}Hos geldin!{RESET}

    Bu sihirbaz, Project Underdog sistemini adim adim yapilandirmana
    yardimci olacak. Once API baglantilarini, sonra calisma modunu
    ayarlayacagiz.

    {DIM}(Istedigin zaman CTRL+C ile cikabilirsin){RESET}
    """))

    # ============================================================
    # ADIM 1: API Anahtari
    # ============================================================
    section("Adim 1/4: Yapay Zeka API Yapilandirmasi")

    print(textwrap.dedent(f"""
    Project Underdog, ogretmen-ogrenci dongusunde
    harici bir AI modele ihtiyac duyar. Su an desteklenenler:

      • OpenAI (GPT-4, GPT-4o-mini)
      • Anthropic (Claude)
      • Yerel / Simulasyon (API gerektirmez, test amacli)

    """))

    use_api = confirm("Harici bir AI API'si baglamak ister misin?", default=True)

    llm_provider = "none"
    llm_model = ""
    api_key = ""
    base_url = ""

    if use_api:
        provider = select_option("Hangi saglayiciyi kullanmak istersin?", [
            ("openai", "OpenAI", "GPT-4o, GPT-4o-mini - En populer"),
            ("anthropic", "Anthropic Claude", "Claude 3.5, Claude 3 Haiku"),
        ])

        if provider == "openai":
            llm_provider = "openai"
            model_choice = select_option("Hangi modeli kullanmak istersin?", [
                ("gpt-4o-mini", "GPT-4o-mini", "Hizli, ucuz, cogu is icin yeterli (Onerilen)"),
                ("gpt-4o", "GPT-4o", "Daha guclu ama daha pahali"),
                ("gpt-3.5-turbo", "GPT-3.5 Turbo", "En ucuz, temel isler icin"),
            ])
            llm_model = model_choice
            api_key = question("OpenAI API anahtarini gir (sk-...)")

            use_custom = confirm("Ozel bir API endpoint kullaniyor musun? (ornek: local LLM)", default=False)
            if use_custom:
                base_url = question("API Base URL", "https://api.openai.com/v1")

        elif provider == "anthropic":
            llm_provider = "anthropic"
            model_choice = select_option("Hangi Claude modelini kullanmak istersin?", [
                ("claude-3-haiku-20240307", "Claude 3 Haiku", "Hizli ve ucuz (Onerilen)"),
                ("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", "Dengeli performans"),
                ("claude-3-opus-20240229", "Claude 3 Opus", "En guclu, en pahali"),
            ])
            llm_model = model_choice
            api_key = question("Anthropic API anahtarini gir (sk-ant-...)")

        show_success(f"API yapilandirmasi tamam: {llm_provider}/{llm_model}")

        test_confirm = confirm("API baglantisini hemen test etmek ister misin?", default=True)
        if test_confirm:
            show_info("API test ediliyor...")
            test_ok = False
            try:
                import httpx, asyncio

                async def _test(provider, model, key, base):
                    if provider == "openai":
                        url = f"{base or 'https://api.openai.com/v1'}/chat/completions"
                        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                        body = {"model": model, "messages": [{"role": "user", "content": "Merhaba"}], "max_tokens": 5}
                    else:
                        url = "https://api.anthropic.com/v1/messages"
                        headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                        body = {"model": model, "max_tokens": 5, "messages": [{"role": "user", "content": "Merhaba"}]}

                    async with httpx.AsyncClient(timeout=15) as c:
                        resp = await c.post(url, headers=headers, json=body)
                        return resp.status_code == 200, resp.json().get("error", {}).get("message", resp.text) if resp.status_code != 200 else ""

                test_ok, err_msg = asyncio.run(_test(llm_provider, llm_model, api_key, base_url))
                if test_ok:
                    show_success("API baglantisi basarili!")
                else:
                    show_error(f"API hatasi: {err_msg}")
                    show_warning("API anahtarini kontrol et. Simdilik simulasyon modunda devam edecegiz.")
                    llm_provider = "none"
            except Exception as e:
                show_error(f"Baglanti hatasi: {e}")
                show_warning("Internet baglantini kontrol et. Simdilik simulasyon modunda devam edecegiz.")
                llm_provider = "none"
    else:
        show_info("API'siz simulasyon modu secildi. Test amacli uygundur.")

    # ============================================================
    # ADIM 2: Calisma Modu
    # ============================================================
    section("Adim 2/4: Calisma Modu Secimi")

    print(textwrap.dedent(f"""
    {BOLD}Project Underdog{RESET} iki sekilde calisabilir:

      {GREEN}1{RESET}. {BOLD}Sadece Soru Sor{RESET}      - AI'a soru sorar, cevap alirsin
      {GREEN}2{RESET}. {BOLD}Egitime Destek Ver{RESET}    - Kendi bilgisayarin VBS iscisi olur,
                                kovana katilir, AI'nin ogrenmesine
                                yardimci olursun
      {GREEN}3{RESET}. {BOLD}Orkestrator Calistir{RESET}  - Ana merkezi sen yonetirsin
    """))

    mode = select_option("Nasil calismak istersin?", [
        ("ask", "Sadece Soru Sor", "Soru sor, AI cevaplasın. Isci calistirmaz."),
        ("help", "Egitime Destek Ver", "VBS iscisi olarak kovana katil, AI'yi egit (Onerilen)"),
        ("orchestrator", "Orkestrator Calistir", "Ana merkezi baslat, iscileri yonet"),
    ])

    # ============================================================
    # ADIM 3: VBS yapilandirmasi
    # ============================================================
    worker_name = ""
    worker_count = 1
    orchestrator_url = "ws://localhost:8800/ws"

    if mode == "help":
        section("Adim 3/4: VBS Isci Yapilandirmasi")
        worker_name = question("Isciye bir isim ver", f"vbs-{os.uname().nodename[:8]}")
        worker_count = 1
        use_remote = confirm("Uzak bir orkestratore mi baglanacaksin?", default=False)
        if use_remote:
            orchestrator_url = question("Orkestrator adresi", "ws://localhost:8800/ws")
        show_success(f"Isci '{worker_name}' hazir!")

    elif mode == "orchestrator":
        section("Adim 3/4: Orkestrator Yapilandirmasi")
        port = question("Port numarasi", "8800")
        show_success(f"Orkestrator port {port}'de calisacak.")

    # ============================================================
    # ADIM 4: Kaydet ve Baslat
    # ============================================================
    section("Adim 4/4: Konfigurasyonu Kaydet")

    env_lines = [
        f"UNDERDOG_LLM_PROVIDER={llm_provider}",
        f"UNDERDOG_LLM_MODEL={llm_model}",
        f"UNDERDOG_LLM_API_KEY={api_key}",
    ]
    if base_url:
        env_lines.append(f"UNDERDOG_LLM_BASE_URL={base_url}")
    if mode == "orchestrator":
        port = question("Port numarasi", "8800")
        env_lines.append(f"UNDERDOG_PORT={port}")

    env_content = (
        "# Project Underdog - Otomatik olusturulan konfigurasyon\n"
        + "\n".join(env_lines)
        + "\n"
    )

    ENV_FILE.write_text(env_content, encoding="utf-8")
    show_success(".env dosyasi kaydedildi!")

    show_warning(textwrap.dedent("""
    Bu sadece test amaclidir. Ileride duzeltilecek!
    """))
    # ============================================================
    # BASLAT
    # ============================================================
    print()
    print(f"  {BOLD}{'═' * 50}{RESET}")
    print(f"  {GREEN}{BOLD}✓ Kurulum tamamlandi!{RESET}")
    print(f"  {BOLD}{'═' * 50}{RESET}")
    print()

    start_now = confirm("Sistemi hemen baslatmak ister misin?", default=True)

    if start_now:
        import subprocess

        venv_python = PROJECT_ROOT / ".venv" / "bin" / "python"
        python = str(venv_python) if venv_python.exists() else sys.executable
        cmd = [python, "-m", "project_underdog.main"]

        if mode == "orchestrator":
            section("Orkestrator baslatiliyor...")
            print(f"  {DIM}Tarayicidan: http://localhost:{port}/health{RESET}")
            print()
            subprocess.run(cmd + ["orchestrator"])
        elif mode == "help":
            section(f"VBS Isci '{worker_name}' baslatiliyor...")
            subprocess.run(cmd + ["worker", "--name", worker_name])
        elif mode == "ask":
            section("Soru-Cevap modu baslatiliyor...")
            from project_underdog.llm import get_llm_provider
            llm = get_llm_provider()

            async def ask_mode():
                while True:
                    print()
                    q = question("Sorunu yaz (cikis icin bos birak)")
                    if not q:
                        print(f"  {DIM}Gule gule!{RESET}")
                        break
                    resp = await llm.generate(q, system="Kisa ve dogru cevaplar ver.")
                    if resp.ok:
                        print(f"\n  {GREEN}🤖{RESET} {resp.answer}")
                    else:
                        show_error(f"Hata: {resp.error}")

            import asyncio
            asyncio.run(ask_mode())
    else:
        print()
        show_info("Sistemi daha sonra su komutlarla baslatabilirsin:")
        print(f"  {DIM}# Orkestrator:{RESET}  make orchestrator")
        print(f"  {DIM}# Isci:{RESET}         make worker")
        print(f"  {DIM}# Demo:{RESET}         make demo")
        print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{DIM}  Kurulum iptal edildi. Gule gule!{RESET}\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n{RED}  Beklenmeyen hata: {e}{RESET}\n", file=sys.stderr)
        sys.exit(1)
