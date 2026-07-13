from sqlalchemy.orm import Session

from app.models.server import Server


class ServerService:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self):
        return (
            self.db.query(Server)
            .order_by(Server.id)
            .all()
        )

    def get(self, server_id: int):
        return self.db.get(Server, server_id)

    def create(self, data):
        values = data.model_dump(mode="json")

        server = Server(**values)

        self.db.add(server)
        self.db.commit()
        self.db.refresh(server)

        return server

    def update(self, server: Server, data):
        values = data.model_dump(
            mode="json",
            exclude_unset=True,
        )

        for key, value in values.items():
            if value is not None:
                setattr(server, key, value)

        self.db.commit()
        self.db.refresh(server)

        return server

    def delete(self, server: Server):
        self.db.delete(server)
        self.db.commit()
