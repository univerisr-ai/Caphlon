"""
Caphlon — Kovan Çıkarım Motoru (Hive Inference Engine)
=====================================================

"Binlerce zayıf düğüm → tek güçlü cevap", düşük tüketimle.

Bu motor, README'de vaat edilen ama bağlanmamış parçaları gerçek bir akışta
birleştirir:

  1. lookup     — paylaşımlı önbellekte cevap var mı? (model çağırmadan)   [hive_cache]
  2. fan-out    — yoksa: aynı soruyu N online düğüm kendi küçük modeliyle yanıtlar
  3. validate   — her cevap formatı/mantığı/güvenliği için süzülür           [security.Validator]
  4. consensus  — cevaplar benzerlikle kümelenir, itibar-ağırlıklı oylanır   [security.ReputationSystem]
  5. learn      — kazanan cevap itibarları günceller + paylaşımlı önbelleğe yazılır

Honeypot tuzak soruları itibarı periyodik olarak kalibre eder (zehir savunması).

Düğüm modeli soyuttur: `NodeAnswer` zaten üretilmiş cevabı taşır. Motor ağ/model
bilmez — bu sayede yerelde (tek makinede çok-örnek) de, gerçek swarm'da da
aynı kodla çalışır ve test edilebilir.

Saf stdlib. Tek dış modül: aynı dizindeki `security.py` ve `hive_cache.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from security import Validator, ReputationSystem, Honeypot
from hive_cache import SharedSolutionCache, _tokens, _jaccard


@dataclass
class NodeAnswer:
    """Bir düğümün tek soruya verdiği cevap."""
    vbs_id: str
    output: str
    confidence: float = 1.0   # düğümün kendi öz-güveni (0..1), opsiyonel


@dataclass
class HiveResult:
    answer: Optional[str]
    source: str               # "cache" | "consensus" | "none"
    agreement: float          # 0..1 — kazanan kümenin toplam ağırlık payı
    cluster_size: int         # kazanan kümede kaç düğüm anlaştı
    contributors: int         # geçerli (validasyonu geçen) cevap sayısı
    rejected: int             # validasyonda/güvenlikte elenen cevap sayısı
    detail: dict = field(default_factory=dict)


class HiveEngine:
    """Kovanın çıkarım orkestratörü. security.py + hive_cache.py'yi bağlar."""

    def __init__(
        self,
        reputation: Optional[ReputationSystem] = None,
        cache: Optional[SharedSolutionCache] = None,
        honeypot: Optional[Honeypot] = None,
        cluster_threshold: float = 0.6,
        min_agreement: float = 0.5,
    ):
        self.rep = reputation or ReputationSystem()
        self.cache = cache or SharedSolutionCache()
        self.honeypot = honeypot or Honeypot()
        self.cluster_threshold = cluster_threshold
        self.min_agreement = min_agreement

    # ------------------------------------------------------------------ #
    # Ana akış
    # ------------------------------------------------------------------ #
    def answer(self, instruction: str, node_answers: list[NodeAnswer]) -> HiveResult:
        """Bir soruyu kovan ile yanıtla.

        `node_answers`: online düğümlerin bu soruya verdiği ham cevaplar.
        Boş verilirse yalnızca önbelleğe bakılır.
        """
        # 1) Retrieval-first: önbellekte yeterince güvenilir bir cevap var mı?
        hit = self.cache.lookup(instruction)
        if hit is not None:
            return HiveResult(
                answer=hit.output,
                source="cache",
                agreement=1.0,
                cluster_size=hit.score and 1 or 1,
                contributors=0,
                rejected=0,
                detail={"similarity": round(hit.similarity, 3), "cache_score": round(hit.score, 3)},
            )

        # 2) Validasyon — çöp/zararlı cevapları konsensüse sokmadan ele.
        valid: list[NodeAnswer] = []
        rejected = 0
        for na in node_answers:
            res = Validator.full_validation({"instruction": instruction, "output": na.output})
            if res.passed:
                valid.append(na)
            else:
                rejected += 1
                # Geçersiz çıktı üreten düğüm itibar kaybeder.
                self.rep.record_task(na.vbs_id, passed=False)

        if not valid:
            return HiveResult(None, "none", 0.0, 0, 0, rejected)

        # 3) Konsensüs — benzerlikle kümele, itibar×özgüven ile oyla.
        clusters = self._cluster(valid)
        total_weight = sum(c["weight"] for c in clusters) or 1.0
        best = max(clusters, key=lambda c: c["weight"])
        agreement = best["weight"] / total_weight

        if agreement < self.min_agreement and len(clusters) > 1:
            # Net çoğunluk yok → kararsız; yine de en güçlü kümeyi döndür ama
            # önbelleğe YAZMA (zayıf sinyali kalıcılaştırma).
            winner = self._representative(best["members"])
            self._reward(best["members"], valid, learn=False)
            return HiveResult(
                winner.output, "consensus", round(agreement, 3),
                len(best["members"]), len(valid), rejected,
                detail={"clusters": len(clusters), "decisive": False},
            )

        # 4) Net çoğunluk → kazananı seç, itibar güncelle, önbelleğe öğret.
        winner = self._representative(best["members"])
        self._reward(best["members"], valid, learn=True)
        self.cache.record(instruction, winner.output, weight=best["weight"])
        return HiveResult(
            winner.output, "consensus", round(agreement, 3),
            len(best["members"]), len(valid), rejected,
            detail={"clusters": len(clusters), "decisive": True, "weight": round(best["weight"], 3)},
        )

    # ------------------------------------------------------------------ #
    # Konsensüs yardımcıları
    # ------------------------------------------------------------------ #
    def _cluster(self, answers: list[NodeAnswer]) -> list[dict]:
        """Cevapları token-Jaccard benzerliğiyle kümele.

        security.py'deki tam-eşleşme konsensüsünden farkı: serbest metinde
        küçük farklılıkları (noktalama, sıra) tolere eder. CPU-ucuz, O(n²)
        ama n = aynı anda oylanan düğüm sayısı (küçük)."""
        clusters: list[dict] = []
        for na in answers:
            toks = _tokens(na.output)
            w = max(0.1, self.rep.get_score(na.vbs_id)) * max(0.0, min(1.0, na.confidence))
            placed = False
            for c in clusters:
                if _jaccard(toks, c["tokens"]) >= self.cluster_threshold:
                    c["members"].append(na)
                    c["weight"] += w
                    c["tokens"] |= toks  # kümenin token havuzunu genişlet
                    placed = True
                    break
            if not placed:
                clusters.append({"members": [na], "weight": w, "tokens": toks})
        return clusters

    def _representative(self, members: list[NodeAnswer]) -> NodeAnswer:
        """Kümeyi temsil eden cevabı seç: en yüksek itibarlı düğümünki."""
        return max(members, key=lambda na: (self.rep.get_score(na.vbs_id), na.confidence))

    def _reward(self, winners: list[NodeAnswer], all_valid: list[NodeAnswer], learn: bool):
        """Kazanan kümedekiler +, çoğunlukla anlaşmayanlar - itibar alır."""
        winner_ids = {na.vbs_id for na in winners}
        for na in all_valid:
            self.rep.record_task(na.vbs_id, passed=na.vbs_id in winner_ids)

    # ------------------------------------------------------------------ #
    # Honeypot kalibrasyonu (zehir savunması)
    # ------------------------------------------------------------------ #
    def calibrate(self, vbs_id: str, question_idx: int, answer: str) -> bool:
        """Bir düğümü tuzak soruyla test et; sonucu itibara işle.

        Düzenli çağrılırsa, hileli/bozuk düğümlerin itibarı düşer ve
        konsensüs ağırlıkları otomatik küçülür."""
        ok = self.honeypot.check_answer(question_idx, answer)
        self.rep.record_task(vbs_id, passed=ok)
        return ok

    def stats(self) -> dict:
        return {
            "cache": self.cache.stats(),
            "top_nodes": self.rep.get_top(5),
            "honeypot_questions": self.honeypot.count,
        }
