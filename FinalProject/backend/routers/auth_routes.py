from fastapi import APIRouter, Response

router = APIRouter()

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="refresh_token")
    return {"message": "Logout successful"}
