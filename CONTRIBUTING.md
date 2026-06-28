# Contributing to AutoMaintainer

We welcome contributions! Here's how to get started.

## Development Setup

### Prerequisites
- Node.js 18+ (frontend)
- Python 3.11+ (backend)
- Git

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your backend URL
npm run dev
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test locally
5. Commit with conventional commits: `feat:`, `fix:`, `docs:`, etc.
6. Push and open a Pull Request

## Code Style

- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Follow existing conventions, use strict types
- **Commits**: Use conventional commit messages

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include error messages and screenshots if applicable

## Architecture

See `docs/DEVPOST.md` for an overview of the multi-agent architecture.

The system consists of:
- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Backend**: FastAPI + async SQLAlchemy
- **LLM**: OpenRouter (free-tier models)
- **Database**: SQLite (production-ready for single-instance)
