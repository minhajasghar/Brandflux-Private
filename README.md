# BrandAI

Smart brand content tool for small business owners.

## Project Structure

```
brandai/
├── frontend/                 (Next.js 14 app)
├── backend/                  (Python FastAPI)
└── README.md
```

## Setup Instructions

### Frontend

1. Navigate to `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Run the development server:
   ```bash
   npm run dev
   ```

### Backend

1. Navigate to `backend/` directory.
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows
   .\venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and fill in the values.
5. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
