"""HTTP endpoints for the people of a store. Only the owner may use them."""

from fastapi import APIRouter

from app.api.deps import CurrentStore, CurrentUser, TeamServiceDep, allowed_to
from app.core.permissions import Permission
from app.schemas.common import ErrorResponse
from app.schemas.team import InvitationCreate, MemberUpdate, TeamMember

router = APIRouter(prefix="/team", tags=["team"], dependencies=[allowed_to(Permission.MANAGE_TEAM)])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}


@router.get("", response_model=list[TeamMember])
def list_members(store: CurrentStore, service: TeamServiceDep):
    """Everyone in the store, owners first, with whether they have joined yet."""
    return service.list_members(store.id)


@router.post("/invitations", response_model=TeamMember, status_code=201, responses=CONFLICT)
def invite(data: InvitationCreate, user: CurrentUser, service: TeamServiceDep):
    """Emails a link with which the person chooses a password and joins the store."""
    return service.invite(user.store_id, user, data)


@router.post(
    "/{member_id}/resend-invitation",
    response_model=TeamMember,
    responses={**NOT_FOUND, **CONFLICT},
)
def resend_invitation(member_id: int, user: CurrentUser, service: TeamServiceDep):
    """A new link for someone who hasn't joined yet. The old link stops working."""
    return service.resend(user.store_id, user, member_id)


@router.patch("/{member_id}", response_model=TeamMember, responses={**NOT_FOUND, **CONFLICT})
def update_member(member_id: int, data: MemberUpdate, store: CurrentStore, service: TeamServiceDep):
    """Changes someone's role, or stops and restores their access."""
    return service.update(store.id, member_id, data)
