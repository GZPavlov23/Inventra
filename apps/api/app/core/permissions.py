"""What each role may do. The one place to change it: routes only name the permission they need.

Looking things up (products, stock, deliveries, suppliers) is open to everyone in the store,
because nobody can work without it. Permissions guard changing things and seeing the money.
"""

from enum import StrEnum

from app.models.user import UserRole


class Permission(StrEnum):
    SELL = "sell"  # record sales at the till
    HANDLE_STOCK = "handle_stock"  # receive goods and deliveries, write off, correct counts
    MANAGE_CATALOG = "manage_catalog"  # products, prices and suppliers
    PLAN = "plan"  # forecast, orders, placing and cancelling deliveries, CSV import
    SEE_FINANCES = "see_finances"  # dashboard, reports, the sales list with its profit
    MANAGE_TEAM = "manage_team"  # people, their roles and the store's settings


ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.OWNER: frozenset(Permission),
    # Runs the store day to day, but can't hand out access or change who works there.
    UserRole.MANAGER: frozenset(Permission) - {Permission.MANAGE_TEAM},
    # Works the till and the shelves.
    UserRole.STAFF: frozenset({Permission.SELL, Permission.HANDLE_STOCK}),
}


def can(role: UserRole, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS[role]
