# ConvertClick Backend

This is the backend service for ConvertClick, built with FastAPI, MongoDB, and Redis.

## Prerequisites

- Python 3.8+
- MongoDB
- Redis
- Poetry (optional but recommended for dependency management)

## Setup

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Copy the environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration values.

5. Build the frontend (from the Frontend directory):
   ```bash
   npm run build
   ```
   This will create a `dist` folder in the Frontend directory.

6. Start the application:
   ```bash
   uvicorn app.main:app --reload
   ```

The application will be available at `http://localhost:8000`, which will serve the frontend login page by default.

## Frontend Integration

The backend is configured to serve the Vite frontend build files:
- The frontend build folder should be located at `../Frontend/dist` relative to the backend directory
- Static assets are served from `/assets` (Vite's default asset directory)
- All non-API routes will serve the frontend's index.html, enabling client-side routing
- API routes are prefixed with `/api/v1`

## API Documentation

Once the application is running, you can access:
- Swagger UI documentation: `http://localhost:8000/docs`
- ReDoc documentation: `http://localhost:8000/redoc`

## Project Structure

```
Project/
├── Frontend/
│   └── dist/           # Vite build output
│       ├── assets/     # Static assets (JS, CSS, images)
│       └── index.html  # Main HTML file
├── Backend/
    ├── app/
    │   ├── api/
    │   │   └── v1/
    │   │       ├── endpoints/
    │   │       └── router.py
    │   ├── core/
    │   │   ├── config.py
    │   │   └── database.py
    │   └── main.py
    ├── requirements.txt
    ├── .env.example
    └── README.md
```

## Health Checks

- `GET /api/v1/health`: Basic health check
- `GET /api/v1/health/db`: Database connectivity check 