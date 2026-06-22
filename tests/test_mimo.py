"""Mimo Code özellikleri testleri"""
import sys, os, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.mimo_features import ComposeMode, DreamSummary, WorkflowEngine


class TestComposeMode:
    def test_all_stages_present(self):
        cm = ComposeMode(lambda x: "mock cevap")
        names = cm.stage_names
        assert len(names) == 5, f"5 stage olmalı: {names}"
        assert names == ["design", "plan", "code", "test", "review"]

    def test_run_produces_all_stages(self):
        cm = ComposeMode(lambda x: f"cevap: {x[:20]}")
        result = cm.run("bir hesap makinesi yap")
        for name in ["design", "plan", "code", "test", "review"]:
            assert name in result["stages"], f"{name} eksik"
            assert "output" in result["stages"][name]
        assert "goal" in result
        assert "started_at" in result
        assert "completed_at" in result


class TestDreamSummary:
    def setup_method(self):
        self.dbpath = tempfile.mktemp(suffix=".db")
        self.ds = DreamSummary(self.dbpath)

    def test_record_and_search(self):
        self.ds.record_message("s1", "merhaba dünya")
        self.ds.record_message("s1", "python projesi")
        results = self.ds.search("python")
        assert len(results) >= 1

    def test_dream_summarizes(self):
        def summarizer(content):
            return "özet: " + content[:30]
        self.ds.record_message("s1", "uzun bir konuşma metni burada")
        result = self.ds.dream(summarizer, max_age_days=0)
        assert result["sessions_merged"] >= 0

    def teardown_method(self):
        if os.path.exists(self.dbpath):
            os.unlink(self.dbpath)


class TestWorkflowEngine:
    def setup_method(self):
        self.engine = WorkflowEngine()
        self.engine.register("test_wf", [
            {"id": "start", "action": "greet", "next": "process"},
            {"id": "process", "action": "compute", "next": "end"},
            {"id": "end", "action": "finalize", "next": None},
        ])

    def test_register_and_list(self):
        assert "test_wf" in self.engine.workflows

    def test_execute_linear(self):
        def handler(action, ctx):
            ctx["steps"] = ctx.get("steps", []) + [action]
            return {action: "done"}
        result = self.engine.execute("test_wf", {}, handler)
        assert len(result["steps"]) == 3
        assert result["steps"] == ["greet", "compute", "finalize"]


if __name__ == "__main__":
    passed = 0; failed = 0
    for cls in [TestComposeMode, TestDreamSummary, TestWorkflowEngine]:
        for m in [m for m in dir(cls) if m.startswith("test_")]:
            try:
                obj = cls()
                if hasattr(obj, "setup_method"): obj.setup_method()
                getattr(obj, m)()
                if hasattr(obj, "teardown_method"): obj.teardown_method()
                print(f"  ✅ {cls.__name__}.{m}")
                passed += 1
            except Exception as e:
                print(f"  ❌ {cls.__name__}.{m}: {e}")
                failed += 1
                import traceback; traceback.print_exc()
    print(f"\n{'='*40}\nSonuç: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
