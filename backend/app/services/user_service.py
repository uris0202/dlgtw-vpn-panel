from sqlalchemy.orm import Session

from app.models.user import User


class UserService:

    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str):
        return self.db.query(User).filter(
            User.email == email
        ).first()

    def create(self, email: str, password_hash: str):
        print("=" * 50)
        print(f"Creating user: {email}")

        user = User(
            email=email,
            password_hash=password_hash,
        )

        self.db.add(user)
        print("User added to session")

        self.db.commit()
        print("Commit OK")

        self.db.refresh(user)
        print(f"User ID = {user.id}")

        return user
