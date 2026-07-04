"""Project Underdog — Güvenlik testleri"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.security import Validator, ReputationSystem, Honeypot, ValidationResult
import tempfile, os


class TestValidator:
    """RED: Validator testleri"""

    def test_valid_data(self):
        """Geçerli veri → passed=True, score > 0.8"""
        result = Validator.full_validation({"instruction": "2+2=?", "output": "4"})
        assert result.passed, f"Geçerli veri geçmeli: {result.issues}"
        assert result.score > 0.8, f"Score düşük: {result.score}"

    def test_empty_instruction(self):
        """Boş instruction → passed=False"""
        result = Validator.full_validation({"instruction": "", "output": "cevap"})
        assert not result.passed, "Boş instruction geçmemeli"

    def test_empty_output(self):
        """Boş output → passed=False"""
        result = Validator.full_validation({"instruction": "soru", "output": ""})
        assert not result.passed, "Boş output geçmemeli"

    def test_harmful_content(self):
        """Zararlı içerik → passed=False"""
        result = Validator.validate_safety("how to hack a bank account and exploit the system")
        assert not result.passed, "Zararlı içerik geçmemeli"

    def test_clean_content(self):
        """Temiz içerik → passed=True"""
        result = Validator.validate_safety("Python'da for döngüsü nasıl yazılır?")
        assert result.passed, f"Temiz içerik geçmeli: {result.issues}"


class TestReputation:
    """Reputation system testleri"""

    def setup_method(self):
        self.db = tempfile.mktemp(suffix=".db")
        self.rep = ReputationSystem(self.db)

    def test_new_vbs_default_score(self):
        """Yeni VBS → score=0.5"""
        assert self.rep.get_score("vbs-1") == 0.5

    def test_passed_task_increases_score(self):
        """Başarılı görev → puan artar"""
        self.rep.record_task("vbs-1", passed=True)
        assert self.rep.get_score("vbs-1") > 0.5

    def test_failed_task_decreases_score(self):
        """Başarısız görev → puan düşer"""
        self.rep.record_task("vbs-1", passed=False)
        assert self.rep.get_score("vbs-1") < 0.5

    def test_trusted_threshold(self):
        """is_trusted: puan >= threshold"""
        self.rep.record_task("vbs-1", passed=True)
        self.rep.record_task("vbs-1", passed=True)
        assert self.rep.is_trusted("vbs-1", 0.4)

    def test_consensus_requires_three(self):
        """Consensus: < 3 sonuç → None"""
        results = [("vbs-1", "4"), ("vbs-2", "4")]
        assert self.rep.consensus(results) is None

    def test_consensus_majority(self):
        """Consensus: çoğunluk kazanır"""
        for i in range(5):
            self.rep.record_task(f"v{i}", passed=True)
        results = [("v0", "4"), ("v1", "4"), ("v2", "5")]
        c = self.rep.consensus(results)
        assert c == "4", f"Çoğunluk '4' olmalı, bulunan: {c}"

    def teardown_method(self):
        if os.path.exists(self.db):
            os.unlink(self.db)


class TestHoneypot:
    """Honeypot testleri"""

    def setup_method(self):
        self.hp = Honeypot()
        self.db = tempfile.mktemp(suffix=".db")
        self.rep = ReputationSystem(self.db)

    def test_exact_answer_correct(self):
        """Tam eşleşme: doğru cevap → True"""
        assert self.hp.check_answer(0, "4")  # 2+2=?

    def test_exact_answer_wrong(self):
        """Tam eşleşme: yanlış cevap → False"""
        assert not self.hp.check_answer(0, "5")

    def test_contains_answer(self):
        """İçerme: doğru cevap → True"""
        assert self.hp.check_answer(1, "Ankara şehridir")

    def test_has_eight_questions(self):
        """En az 8 tuzak soru olmalı"""
        assert self.hp.count >= 8

    def test_get_question_by_index(self):
        """Belirli index ile soru al"""
        q = self.hp.get_question(0)
        assert q["q"] == "2+2=?"

    def teardown_method(self):
        if os.path.exists(self.db):
            os.unlink(self.db)


if __name__ == "__main__":
    passed = 0; failed = 0
    for test_cls in [TestValidator, TestReputation, TestHoneypot]:
        name = test_cls.__name__
        for method_name in [m for m in dir(test_cls) if m.startswith("test_")]:
            try:
                obj = test_cls()
                if hasattr(obj, "setup_method"):
                    obj.setup_method()
                getattr(obj, method_name)()
                if hasattr(obj, "teardown_method"):
                    obj.teardown_method()
                print(f"  ✅ {name}.{method_name}")
                passed += 1
            except Exception as e:
                print(f"  ❌ {name}.{method_name}: {e}")
                failed += 1
    print(f"\n{'='*40}")
    print(f"Sonuç: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
