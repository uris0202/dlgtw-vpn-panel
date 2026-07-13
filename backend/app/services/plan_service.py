from sqlalchemy.orm import Session

from app.models.plan import Plan


class PlanService:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self):
        return (
            self.db.query(Plan)
            .order_by(Plan.is_active.desc(), Plan.price, Plan.id)
            .all()
        )

    def get(self, plan_id: int):
        return self.db.get(Plan, plan_id)

    def create(self, data):
        values = self._normalize_values(
            data.model_dump(),
        )

        plan = Plan(**values)

        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)

        return plan

    def update(self, plan: Plan, data):
        values = self._normalize_values(
            data.model_dump(exclude_unset=True),
        )

        for key, value in values.items():
            if value is not None:
                setattr(plan, key, value)

        self.db.commit()
        self.db.refresh(plan)

        return plan

    def delete(self, plan: Plan):
        self.db.delete(plan)
        self.db.commit()

    def _normalize_values(self, values):
        normalized = {}

        for key, value in values.items():
            if isinstance(value, str):
                value = value.strip()

            if key == "name" and not value:
                value = "Новый тариф"

            if key == "currency":
                value = (value or "RUB").upper()[:10]

            normalized[key] = value

        return normalized
