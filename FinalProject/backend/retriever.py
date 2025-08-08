from dotenv import load_dotenv
import os

load_dotenv()

DB_HOST = os.getenv("HOST")
DB_PORT = int(os.getenv("PORT"))
DB_USER = os.getenv("USER")
DB_PASS = os.getenv("PASS")
DB_NAME = os.getenv("DB")
