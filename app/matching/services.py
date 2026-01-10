from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional, Sequence

from trainings.models import Training
from trainers.models import Trainer, TrainerRuleType


LONG_TRIP_THRESHOLD_KM = 150.0


@dataclass(frozen=True)
class TrainerMatch:
    trainer: Trainer
    score: float
    estimated_cost: Optional[float]
    reasons: Sequence[str]
    warnings: Sequence[str]


@dataclass(frozen=True)
class RecommendationResult:
    matches: Sequence[TrainerMatch]
    used_compromise: bool


def is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def _rule_value(trainer: Trainer, rule_type: str):
    for rule in trainer.rules.all():
        if rule.rule_type == rule_type:
            return rule.rule_value.get("value")
    return None


def _has_conflict(training: Training, existing: Sequence[Training]) -> bool:
    for other in existing:
        if other.id == training.id:
            continue
        if training.start_datetime < other.end_datetime and training.end_datetime > other.start_datetime:
            return True
    return False


def _trainings_in_month(training: Training, existing: Sequence[Training]) -> list[Training]:
    return [
        item
        for item in existing
        if item.start_datetime.year == training.start_datetime.year
        and item.start_datetime.month == training.start_datetime.month
    ]


def _training_hours(training: Training) -> float:
    duration = training.end_datetime - training.start_datetime
    return max(0.0, duration.total_seconds() / 3600.0)


def _estimated_cost(trainer: Trainer, distance_km: float, training: Training) -> Optional[float]:
    hourly_rate = float(trainer.hourly_rate) if trainer.hourly_rate is not None else None
    travel_rate = float(trainer.travel_rate_km) if trainer.travel_rate_km is not None else None
    if hourly_rate is None and travel_rate is None:
        return None
    total = 0.0
    if hourly_rate is not None:
        total += hourly_rate * _training_hours(training)
    if travel_rate is not None:
        total += travel_rate * distance_km
    return total


def _long_trip_count(
    trainer: Trainer, training: Training, existing: Sequence[Training], threshold_km: float
) -> int:
    if trainer.home_lat is None or trainer.home_lng is None:
        return 0
    trips = 0
    for item in _trainings_in_month(training, existing):
        if item.lat is None or item.lng is None:
            continue
        distance = haversine_km(item.lat, item.lng, trainer.home_lat, trainer.home_lng)
        if distance > threshold_km:
            trips += 1
    return trips


def recommend_trainers(
    training: Training,
    trainers: Iterable[Trainer],
    existing_trainings: Iterable[Training],
) -> RecommendationResult:
    """Return ranked trainers for a training."""
    if training.lat is None or training.lng is None:
        return RecommendationResult(matches=[], used_compromise=False)

    trainings_by_trainer: dict[int, list[Training]] = {}
    for existing in existing_trainings:
        if existing.assigned_trainer_id is None:
            continue
        trainings_by_trainer.setdefault(existing.assigned_trainer_id, []).append(existing)

    matches: list[TrainerMatch] = []
    compromises: list[TrainerMatch] = []
    for trainer in trainers:
        if trainer.home_lat is None or trainer.home_lng is None:
            continue
        distance = haversine_km(
            training.lat, training.lng, trainer.home_lat, trainer.home_lng
        )
        rule_failures: list[str] = []
        soft_warnings: list[str] = []
        skill_ids = {skill.training_type_id for skill in trainer.skills.all()}
        if training.training_type_id not in skill_ids:
            rule_failures.append("Does not teach this training type")
        max_distance = _rule_value(trainer, TrainerRuleType.MAX_DISTANCE_KM)
        if max_distance and distance > max_distance:
            rule_failures.append(f"Over max distance ({max_distance} km)")
        weekend_allowed = _rule_value(trainer, TrainerRuleType.WEEKEND_ALLOWED)
        if weekend_allowed is False and is_weekend(training.start_datetime):
            rule_failures.append("No weekend availability")
        assigned_trainings = trainings_by_trainer.get(trainer.id, [])
        if _has_conflict(training, assigned_trainings):
            rule_failures.append("Time conflict")

        max_long_trips = _rule_value(trainer, TrainerRuleType.MAX_LONG_TRIPS_PER_MONTH)
        long_trips = _long_trip_count(
            trainer, training, assigned_trainings, LONG_TRIP_THRESHOLD_KM
        )
        if max_long_trips is not None and distance > LONG_TRIP_THRESHOLD_KM:
            if long_trips >= max_long_trips:
                rule_failures.append("Long trip limit reached")

        monthly_workload = len(_trainings_in_month(training, assigned_trainings))
        total_workload = monthly_workload + long_trips
        estimated_cost = _estimated_cost(trainer, distance, training)
        score = max(0.0, 800.0 - distance * 4.0)
        score += max(0.0, 20 - monthly_workload) * 6.0
        if estimated_cost is not None:
            score += max(0.0, 4000.0 - estimated_cost) * 0.04
        score -= long_trips * 3.0

        preferred_weekdays = _rule_value(trainer, TrainerRuleType.PREFERRED_WEEKDAYS) or []
        if preferred_weekdays:
            weekday = training.start_datetime.weekday()
            if weekday not in preferred_weekdays:
                score -= 15.0
                soft_warnings.append("Outside preferred weekdays")

        reasons = [
            f"Distance {distance:.1f} km",
            f"Workload {total_workload} (trainings {monthly_workload}, long trips {long_trips})",
        ]
        if estimated_cost is not None:
            reasons.append(f"Estimated cost {estimated_cost:.0f} CZK")

        match = TrainerMatch(
            trainer=trainer,
            score=score,
            estimated_cost=estimated_cost,
            reasons=reasons,
            warnings=[*rule_failures, *soft_warnings],
        )
        if not rule_failures:
            matches.append(match)
        elif len(rule_failures) == 1:
            compromises.append(match)

    ranked = sorted(matches, key=lambda match: match.score, reverse=True)
    if ranked:
        return RecommendationResult(matches=ranked, used_compromise=False)
    return RecommendationResult(
        matches=sorted(compromises, key=lambda match: match.score, reverse=True),
        used_compromise=True,
    )
