from fastapi import APIRouter

router = APIRouter()

@router.get("/test")
async def test():
    try:
        return {"message": "test"}
    except Exception as e:
        raise e