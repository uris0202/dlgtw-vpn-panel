import importlib.util
import os
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import news, public, settings as settings_api
from app.auth.jwt import create_access_token, create_admin_access_token
from app.db.base import Base
from app.db.deps import get_db
from app.models.audit_log import AuditLog
from app.models.news import News
from app.models.settings import PanelSettings
from app.models.user import User


class NewsApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[News.__table__, PanelSettings.__table__, User.__table__, AuditLog.__table__])
        self.sessions = sessionmaker(bind=self.engine)
        app = FastAPI()
        app.include_router(news.router)
        app.include_router(news.public_router)
        app.include_router(settings_api.router)

        def get_test_db():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(app)
        with self.sessions() as db:
            user = User(email="admin@example.com", password_hash="unused", is_admin=True)
            db.add_all([user, PanelSettings(id=1)])
            db.commit()
            self.admin = {"Authorization": f"Bearer {create_admin_access_token(user)}"}

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def create(self, **changes):
        response = self.client.post("/news", headers=self.admin, json={"title": "Обновление VPN", "body": "Первая строка\nВторая строка", **changes})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_public_feed_works_without_authentication_and_excludes_drafts(self):
        self.create(title="Секретный черновик")
        published = self.create(is_published=True)
        response = self.client.get("/public/news")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["total"], 1)
        item = response.json()["items"][0]
        self.assertEqual(item["id"], published["id"])
        self.assertEqual(set(item), {"id", "title", "body", "is_pinned", "published_at"})
        self.assertNotIn("Секретный черновик", response.text)

    def test_all_admin_operations_require_admin_authentication(self):
        item = self.create()
        customer_token = create_access_token({"sub": "1", "token_type": "client"})
        for headers in ({}, {"Authorization": f"Bearer {customer_token}"}):
            for method, url, payload in (
                ("GET", "/news", None), ("POST", "/news", {"title": "t", "body": "b"}),
                ("PATCH", f"/news/{item['id']}", {"is_published": True}),
                ("DELETE", f"/news/{item['id']}", None),
            ):
                self.assertEqual(self.client.request(method, url, headers=headers, json=payload).status_code, 401 if headers else 403)

    def test_publish_edit_unpublish_and_republish(self):
        item = self.create()
        url = f"/news/{item['id']}"
        self.assertIsNone(item["published_at"])
        published = self.client.patch(url, headers=self.admin, json={"is_published": True}).json()
        self.assertTrue(published["published_at"])
        edited = self.client.patch(url, headers=self.admin, json={"title": " Новое имя ", "body": " Изменение "}).json()
        self.assertEqual(edited["published_at"], published["published_at"])
        self.assertEqual(edited["title"], "Новое имя")
        self.client.patch(url, headers=self.admin, json={"is_published": False}).raise_for_status()
        self.assertEqual(self.client.get("/public/news").json()["total"], 0)
        republished = self.client.patch(url, headers=self.admin, json={"is_published": True}).json()
        self.assertTrue(republished["published_at"])
        self.assertEqual(self.client.get("/public/news").json()["total"], 1)

    def test_pin_order_pagination_and_admin_filters(self):
        first = self.create(title="Закреплено", is_published=True, is_pinned=True)
        self.create(title="Более новая", is_published=True)
        self.create(title="Черновик")
        page = self.client.get("/public/news?limit=1").json()
        self.assertEqual(page["items"][0]["id"], first["id"])
        self.assertEqual(page["total"], 2)
        self.assertEqual(len(self.client.get("/public/news?limit=1&offset=1").json()["items"]), 1)
        self.assertEqual(self.client.get("/news?status=draft", headers=self.admin).json()["total"], 1)
        self.assertEqual(self.client.get("/news?status=published&q=Закреп", headers=self.admin).json()["total"], 1)

    def test_delete_removes_publication_and_is_audited(self):
        item = self.create(is_published=True)
        url = f"/news/{item['id']}"
        self.assertEqual(self.client.delete(url, headers=self.admin).status_code, 200)
        self.assertEqual(self.client.get("/public/news").json()["total"], 0)
        self.assertEqual(self.client.delete(url, headers=self.admin).status_code, 404)
        with self.sessions() as db:
            self.assertEqual([event.action for event in db.query(AuditLog).order_by(AuditLog.id)], ["news.created", "news.deleted"])

    def test_invalid_content_nulls_and_pagination_are_rejected(self):
        for payload in ({"title": " "}, {"body": "\n "}, {"title": "x" * 161}, {"body": "x" * 20001}, {"title": None}, {"is_published": None}):
            response = self.client.post("/news", headers=self.admin, json={"title": "News", "body": "Body", **payload})
            self.assertEqual(response.status_code, 422, response.text)
        item = self.create()
        for payload in ({"title": None}, {"body": " "}, {"is_pinned": None}):
            self.assertEqual(self.client.patch(f"/news/{item['id']}", headers=self.admin, json=payload).status_code, 422)
        for query in ("limit=0", "limit=1000", "offset=-1"):
            self.assertEqual(self.client.get(f"/public/news?{query}").status_code, 422)

    def test_future_and_missing_publication_dates_are_not_public(self):
        with self.sessions() as db:
            db.add_all([
                News(title="Future", body="b", is_published=True, published_at=datetime.now(timezone.utc) + timedelta(days=1)),
                News(title="Missing date", body="b", is_published=True),
            ])
            db.commit()
        self.assertEqual(self.client.get("/public/news").json()["total"], 0)

    def test_server_link_setting_defaults_hidden_and_persists_both_values(self):
        self.assertFalse(self.client.get("/settings", headers=self.admin).json()["client_show_server_links"])
        for value in (True, False):
            response = self.client.patch("/settings", headers=self.admin, json={"client_show_server_links": value})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["client_show_server_links"], value)
            with self.sessions() as db:
                self.assertEqual(public.get_public_settings(db)["client_show_server_links"], value)


class CustomerConnectionVisibilityTests(unittest.TestCase):
    def test_account_hides_only_connection_data_and_does_not_mutate_profiles(self):
        for show in (False, True):
            with self.subTest(show=show), patch.object(public, "OrderService") as orders, patch.object(public, "build_subscriptions") as build, patch.object(public, "get_public_settings", return_value={"client_show_server_links": show}), patch.object(public, "build_account_summary", return_value={}), patch.object(public, "get_public_plans", return_value=[]), patch.object(public, "get_public_servers", return_value=[]):
                orders.return_value.get_all_by_account_token.return_value = []
                profile = {"server_id": 1, "server_name": "Germany", "enabled": True, "traffic": 123, "expiry": 0, "vless_url": "vless://direct", "vless_urls": ["vless://direct"], "uuid": "private-uuid", "subscription_url": "https://exit/sub/private", "inbound_id": 1}
                build.return_value = [profile]
                result = public.build_account_response(SimpleNamespace(), SimpleNamespace(id=1, client_email="Alice", account_token="account-secret"))
                self.assertTrue(result["subscription_url"].startswith("https://dlgtw.ru/api/public/subscriptions/1/"))
                item = result["subscriptions"][0]
                for key in ("vless_url", "vless_urls", "subscription_url", "uuid", "inbound_id"):
                    self.assertEqual(key in item, show)
                self.assertEqual(item["traffic"], 123)
                self.assertTrue(item["enabled"])
                self.assertEqual(profile["vless_url"], "vless://direct")


class NewsMigrationTests(unittest.TestCase):
    def test_upgrade_defaults_existing_settings_to_hidden_and_downgrade_preserves_settings(self):
        path = Path(__file__).parents[1] / "alembic/versions/c3d8f102ab67_add_news_and_account_links_setting.py"
        spec = importlib.util.spec_from_file_location("news_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE panel_settings (id INTEGER PRIMARY KEY, panel_name VARCHAR(100))"))
            connection.execute(text("INSERT INTO panel_settings VALUES (1, 'Existing panel')"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                self.assertFalse(connection.execute(text("SELECT client_show_server_links FROM panel_settings")).scalar())
                self.assertIn("news", inspect(connection).get_table_names())
                connection.execute(text("INSERT INTO news (title, body) VALUES ('Draft', 'Text')"))
                self.assertFalse(connection.execute(text("SELECT is_published FROM news")).scalar())
                migration.downgrade()
            self.assertNotIn("news", inspect(connection).get_table_names())
            self.assertEqual(connection.execute(text("SELECT panel_name FROM panel_settings")).scalar(), "Existing panel")
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
