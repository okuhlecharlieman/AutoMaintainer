from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime, timezone
import uuid


def _serialize_for_db(obj: Any) -> Any:
    """Recursively convert Python objects to DB-compatible values.

    - Enums → their string values (for String/JSON columns)
    - datetime → ISO strings only inside dicts/lists (for JSON columns);
      top-level datetime values are kept as Python datetime (for DateTime columns)
    - Pydantic models → dicts via model_dump()
    - dicts/lists → recursively processed
    """
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _serialize_for_db(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_for_db(item) for item in obj]
    if hasattr(obj, "model_dump") and isinstance(obj, BaseModel):
        return _serialize_for_db(obj.model_dump())
    return obj


class AgentRole(str, Enum):
    ISSUE_ANALYST = "issue_analyst"
    ARCHITECT = "architect"
    DEVELOPER = "developer"
    QA_TESTER = "qa_tester"
    SECURITY = "security"
    DOCUMENTATION = "documentation"
    REVIEWER = "reviewer"


class IssueSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IssueType(str, Enum):
    BUG = "bug"
    FEATURE = "feature"
    DOCS = "documentation"
    REFACTOR = "refactor"
    SECURITY = "security"


class PipelineStatus(str, Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    DEVELOPING = "developing"
    TESTING = "testing"
    SECURITY_SCAN = "security_scan"
    REVIEWING = "reviewing"
    DOCUMENTING = "documenting"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    MERGED = "merged"
    FAILED = "failed"


class AgentMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_role: AgentRole
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = Field(default_factory=dict)
    thinking: Optional[str] = None


class IssueAnalysis(BaseModel):
    issue_id: str
    severity: IssueSeverity
    issue_type: IssueType
    summary: str
    requirements: List[str]
    affected_files: List[str]
    reproduction_steps: Optional[List[str]] = None
    estimated_complexity: str = "medium"


class CodeChange(BaseModel):
    file_path: str
    original_content: Optional[str] = None
    new_content: str
    change_type: str = "modify"  # create, modify, delete
    diff: Optional[str] = None
    language: Optional[str] = None


class TestResult(BaseModel):
    test_name: str
    passed: bool
    output: str
    duration_ms: Optional[float] = None
    error_message: Optional[str] = None


class SecurityFinding(BaseModel):
    severity: str
    category: str
    description: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    recommendation: str


class ReviewScore(BaseModel):
    readability: float = 0.0
    maintainability: float = 0.0
    security: float = 0.0
    performance: float = 0.0
    overall: float = 0.0
    comments: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class PipelineRun(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    repo_url: str
    issue_url: str
    issue_number: int
    issue_title: str
    issue_body: str = ""
    status: PipelineStatus = PipelineStatus.PENDING
    agent_messages: List[AgentMessage] = Field(default_factory=list)
    analysis: Optional[IssueAnalysis] = None
    code_changes: List[CodeChange] = Field(default_factory=list)
    test_results: List[TestResult] = Field(default_factory=list)
    security_findings: List[SecurityFinding] = Field(default_factory=list)
    review_score: Optional[ReviewScore] = None
    pr_url: Optional[str] = None
    pr_title: Optional[str] = None
    pr_body: Optional[str] = None
    github_token: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    error_message: Optional[str] = None
    failed_at_status: Optional[str] = None

    def db_dump(self) -> dict[str, Any]:
        """Dump model to a dict suitable for database storage.

        Converts enums to string values (for String/JSON columns) and
        datetime to ISO strings inside nested structures (for JSON columns).
        Top-level datetime fields (created_at, updated_at) are kept as
        Python datetime objects for SQLAlchemy DateTime columns.
        """
        data = self.model_dump()
        serialized = _serialize_for_db(data)
        # Restore datetime objects for DateTime columns
        serialized["created_at"] = self.created_at
        serialized["updated_at"] = self.updated_at
        # github_token is stored in a separate column, not in JSON
        return serialized

    def api_dump(self) -> dict[str, Any]:
        """Dump model for API responses — excludes sensitive fields."""
        data = self.model_dump()
        data.pop("github_token", None)
        return _serialize_for_db(data)


class PipelineEvent(BaseModel):
    pipeline_id: str
    event_type: str
    agent_role: Optional[AgentRole] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MemoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    repo_url: str
    category: str  # pattern, convention, decision, lesson
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    relevance_score: float = 1.0
