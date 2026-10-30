from fastapi import APIRouter

from app.api.v1.routes import auth, batches, health, products, sales

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(batches.router)
api_router.include_router(sales.router)
