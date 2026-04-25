from pydantic import BaseModel
from typing import Any

class SettingsValue(BaseModel):
    key: str
    value: Any