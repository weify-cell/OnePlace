from openai import OpenAI
from app.services.settings import get_setting_value

AI_PROVIDERS = {
    "qwen": {"baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    "deepseek": {"baseURL": "https://api.deepseek.com/v1"},
    "openai": {"baseURL": "https://api.openai.com/v1"},
    "custom": {"baseURL": ""},
}

EMBEDDING_DIMENSIONS = {
    "text-embedding-v2": 1536,
    "text-embedding-v3": 1536,
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "deepseek-embedder": 1024,
}

def get_ai_client(provider: str) -> OpenAI:
    provider_config = AI_PROVIDERS.get(provider, AI_PROVIDERS["qwen"])
    ai_providers: dict = get_setting_value("ai_providers", {})
    provider_settings = ai_providers.get(provider, {})
    api_key = provider_settings.get("apiKey") or "sk-placeholder"
    base_url = provider_config.get("baseURL", "") if provider != "custom" else (provider_settings.get("baseURL") or "")
    return OpenAI(api_key=api_key, base_url=base_url)

def get_embedding_dimension(provider: str, model: str) -> int:
    return EMBEDDING_DIMENSIONS.get(model, 1024)