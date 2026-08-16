"""
The only module that reads the environment. Everything else imports `settings`.
A missing or malformed variable fails loudly at import time instead of at
11pm inside a checkout request.
"""
from functools import lru_cache

from pydantic import EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App -------------------------------------------------------------
    APP_ENV: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # --- Database ----------------------------------------------------------
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_STORAGE_BUCKET: str = "product-images"

    # --- Admin ---------------------------------------------------------------
    ADMIN_PASSWORD: str
    ADMIN_JWT_SECRET: str
    ADMIN_SESSION_HOURS: int = 8

    # --- Email ---------------------------------------------------------------
    BREVO_API_KEY: str
    MAIL_FROM_EMAIL: EmailStr
    MAIL_FROM_NAME: str = "Mayra Store"
    OWNER_EMAIL: EmailStr
    OWNER_NAME: str = "Mayra"

    # --- Store rules -----------------------------------------------------
    STORE_NAME: str = "Mayra Store"
    STORE_CURRENCY: str = "PKR"
    WHATSAPP_NUMBER: str
    INSTAGRAM_URL: str
    FREE_DELIVERY_THRESHOLD: int = 5000
    DELIVERY_FEE: int = 250
    LOW_STOCK_AT: int = 3
    DISCOUNT_CODE: str = "MAYRA20"
    DISCOUNT_PERCENT: int = 20

    # --- Bank transfer -----------------------------------------------------
    BANK_NAME: str = ""
    BANK_ACCOUNT_TITLE: str = ""
    BANK_ACCOUNT_NUMBER: str = ""
    BANK_IBAN: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
