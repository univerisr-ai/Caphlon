"""Consensus engine - kovan mutabakati (3+ isci, cogunluk oyu)."""

import logging
from collections import Counter

from project_underdog.config import CONSENSUS_THRESHOLD

logger = logging.getLogger(__name__)


def compute_consensus(results: dict[str, dict]) -> dict | None:
    if len(results) < 1:
        return None

    answers = []
    for work_id, res in results.items():
        if res.get("success"):
            data = res.get("data", {})
            answer = data.get("answer", str(data))
            answers.append((work_id, answer))

    if not answers:
        return None

    if len(answers) == 1:
        return {
            "answer": answers[0][1],
            "consensus_ratio": 1.0,
            "total_workers": 1,
            "agreeing_workers": [answers[0][0]],
            "disagreeing_workers": [],
            "consensus_reached": True,
        }

    answer_votes = Counter(a[1] for a in answers)
    most_common_answer, vote_count = answer_votes.most_common(1)[0]
    total_votes = len(answers)

    consensus_ratio = vote_count / total_votes
    logger.info("Mutabakat: %d/%d isci ayni cevapta (ratio: %.2f)", vote_count, total_votes, consensus_ratio)

    if consensus_ratio > CONSENSUS_THRESHOLD:
        agreeing_workers = [w for w, a in answers if a == most_common_answer]
        disagreeing_workers = [w for w, a in answers if a != most_common_answer]

        return {
            "answer": most_common_answer,
            "consensus_ratio": consensus_ratio,
            "total_workers": total_votes,
            "agreeing_workers": agreeing_workers,
            "disagreeing_workers": disagreeing_workers,
            "consensus_reached": True,
        }

    return {
        "answer": most_common_answer,
        "consensus_ratio": consensus_ratio,
        "total_workers": total_votes,
        "consensus_reached": False,
    }
