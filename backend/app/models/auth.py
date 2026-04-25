from pydantic import BaseModel

class LoginRequest(BaseModel):
    password: str

class SetupRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    token: str