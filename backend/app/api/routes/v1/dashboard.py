from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func

from app.database import DbSession
from app.models.data_point_series import DataPointSeries
from app.models.data_source import DataSource
from app.models.event_record import EventRecord
from app.models.series_type_definition import SeriesTypeDefinition
from app.models.user import User
from app.models.user_connection import UserConnection
from app.schemas.system_info import SystemInfoResponse
from app.services import DeveloperDep, system_info_service

router = APIRouter()


@router.get("/stats", response_model=SystemInfoResponse, tags=["dashboard"])
async def get_stats(db: DbSession, _developer: DeveloperDep):
    """Get system dashboard statistics."""
    return system_info_service.get_system_info(db)


class UserMetricsSummary(BaseModel):
    id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    position: str | None = None
    external_user_id: str | None = None
    created_at: datetime
    provider: str | None = None
    last_sync: datetime | None = None
    # Steps & Activity
    today_steps: int | None = None
    today_calories: float | None = None
    # Heart rate
    last_heart_rate: float | None = None
    last_heart_rate_at: datetime | None = None
    today_hr_min: float | None = None
    today_hr_max: float | None = None
    today_hr_avg: float | None = None
    # SpO2
    last_spo2: float | None = None
    last_spo2_at: datetime | None = None
    # Sleep
    last_sleep_hours: float | None = None
    sleep_sessions_total: int = 0
    # Totals
    total_data_points: int = 0
    total_workouts: int = 0


def _get_latest(db, source_ids, type_code, since=None):
    """Get latest data point for a series type, optionally filtered by date."""
    st = db.query(SeriesTypeDefinition).filter(SeriesTypeDefinition.code == type_code).first()
    if not st:
        return None
    q = db.query(DataPointSeries).filter(
        DataPointSeries.data_source_id.in_(source_ids),
        DataPointSeries.series_type_definition_id == st.id,
    )
    if since:
        q = q.filter(DataPointSeries.recorded_at >= since)
    return q.order_by(DataPointSeries.recorded_at.desc()).first()


def _get_today_agg(db, source_ids, type_code, today_start, agg_func):
    """Get today's aggregate (sum/min/max/avg) for a series type."""
    st = db.query(SeriesTypeDefinition).filter(SeriesTypeDefinition.code == type_code).first()
    if not st:
        return None
    val = (
        db.query(agg_func(DataPointSeries.value))
        .filter(
            DataPointSeries.data_source_id.in_(source_ids),
            DataPointSeries.series_type_definition_id == st.id,
            DataPointSeries.recorded_at >= today_start,
        )
        .scalar()
    )
    return float(val) if val is not None else None


@router.get("/users-metrics", response_model=list[UserMetricsSummary], tags=["dashboard"])
async def get_users_with_metrics(db: DbSession, _developer: DeveloperDep):
    """Get all users with their latest health metrics summary."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    users = db.query(User).all()

    result = []
    for user in users:
        connection = (
            db.query(UserConnection)
            .filter(UserConnection.user_id == user.id, UserConnection.status == "active")
            .order_by(UserConnection.last_synced_at.desc().nullslast())
            .first()
        )

        source_ids = [
            ds.id for ds in db.query(DataSource.id).filter(DataSource.user_id == user.id).all()
        ]

        m = {
            "today_steps": None, "today_calories": None,
            "last_heart_rate": None, "last_heart_rate_at": None,
            "today_hr_min": None, "today_hr_max": None, "today_hr_avg": None,
            "last_spo2": None, "last_spo2_at": None,
            "last_sleep_hours": None, "sleep_sessions_total": 0,
            "total_data_points": 0, "total_workouts": 0,
        }

        if source_ids:
            # All metrics filtered to today only
            m["total_data_points"] = (
                db.query(func.count(DataPointSeries.id))
                .filter(
                    DataPointSeries.data_source_id.in_(source_ids),
                    DataPointSeries.recorded_at >= today_start,
                )
                .scalar() or 0
            )

            # Steps today
            steps_sum = _get_today_agg(db, source_ids, "steps", today_start, func.sum)
            m["today_steps"] = int(steps_sum) if steps_sum else None

            # Calories today
            m["today_calories"] = _get_today_agg(db, source_ids, "energy", today_start, func.sum)

            # Heart rate - last today + today stats
            last_hr = _get_latest(db, source_ids, "heart_rate", since=today_start)
            if last_hr:
                m["last_heart_rate"] = float(last_hr.value)
                m["last_heart_rate_at"] = last_hr.recorded_at
            m["today_hr_min"] = _get_today_agg(db, source_ids, "heart_rate", today_start, func.min)
            m["today_hr_max"] = _get_today_agg(db, source_ids, "heart_rate", today_start, func.max)
            m["today_hr_avg"] = _get_today_agg(db, source_ids, "heart_rate", today_start, func.avg)
            if m["today_hr_avg"]:
                m["today_hr_avg"] = round(m["today_hr_avg"], 1)

            # SpO2 - today only
            last_spo2 = _get_latest(db, source_ids, "oxygen_saturation", since=today_start)
            if last_spo2:
                m["last_spo2"] = float(last_spo2.value)
                m["last_spo2_at"] = last_spo2.recorded_at

            # Sleep - today only (sessions that ended today)
            last_sleep = (
                db.query(EventRecord)
                .filter(
                    EventRecord.data_source_id.in_(source_ids),
                    EventRecord.category == "sleep",
                    EventRecord.end_datetime >= today_start,
                )
                .order_by(EventRecord.start_datetime.desc())
                .first()
            )
            if last_sleep and last_sleep.duration_seconds:
                m["last_sleep_hours"] = round(last_sleep.duration_seconds / 3600.0, 1)

            m["sleep_sessions_total"] = (
                db.query(func.count(EventRecord.id))
                .filter(
                    EventRecord.data_source_id.in_(source_ids),
                    EventRecord.category == "sleep",
                    EventRecord.end_datetime >= today_start,
                )
                .scalar() or 0
            )

            # Workouts today
            m["total_workouts"] = (
                db.query(func.count(EventRecord.id))
                .filter(
                    EventRecord.data_source_id.in_(source_ids),
                    EventRecord.category == "workout",
                    EventRecord.start_datetime >= today_start,
                )
                .scalar() or 0
            )

        result.append(
            UserMetricsSummary(
                id=str(user.id),
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                position=user.position,
                external_user_id=user.external_user_id,
                created_at=user.created_at,
                provider=connection.provider if connection else None,
                last_sync=connection.last_synced_at if connection else None,
                **m,
            )
        )

    return result
