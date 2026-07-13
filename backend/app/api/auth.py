from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password
from app.db.deps import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import UserService

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post("/register", response_model=UserResponse)
def register(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    service = UserService(db)

    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed",
        )

    if service.get_by_email(user.email):
        raise HTTPException(
            status_code=400,
            detail="Email already exists",
        )

    created = service.create(
        email=user.email,
        password_hash=hash_password(user.password),
    )

    return created


@router.post("/login")
def login(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    current = db.query(User).filter(
        User.email == user.email
    ).first()

    if current is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    if not verify_password(
        user.password,
        current.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    token = create_access_token(
        {
            "sub": str(current.id),
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
def me(
    current_user: User = Depends(get_current_user),
):
    return current_user
