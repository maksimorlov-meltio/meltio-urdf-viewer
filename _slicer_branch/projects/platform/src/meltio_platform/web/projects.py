"""Projects (folders) that group parts within an org.

Scoping: members/admins see their own org's projects; a superuser sees all.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, permissions
from ..auth import PRIVATE_SCOPE, active_org, get_current_user, require_cap
from ..db import get_db
from ..models import Part, Project, User

router = APIRouter(prefix="/api", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)


def _part_count(db: Session, project_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count(Part.id)).where(Part.project_id == project_id)
    ) or 0


def _project_payload(project: Project, part_count: int) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "orgId": str(project.org_id),
        "partCount": part_count,
        "createdAt": project.created_at.isoformat(),
        "updatedAt": project.updated_at.isoformat(),
        "isFavorite": project.is_favorite,
    }


def get_owned_project(db: Session, user: User, scope, project_id: uuid.UUID) -> Project:
    stmt = select(Project).where(Project.id == project_id)
    if scope == PRIVATE_SCOPE:
        stmt = stmt.where(Project.created_by_id == user.id, Project.is_private.is_(True))
    else:
        stmt = stmt.where(Project.org_id == scope, Project.is_private.is_(False))
    project = db.scalar(stmt)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/projects")
def list_projects(
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(Project)
    if org == PRIVATE_SCOPE:
        stmt = stmt.where(Project.created_by_id == user.id, Project.is_private.is_(True))
    else:
        stmt = stmt.where(Project.org_id == org, Project.is_private.is_(False))
    projects = db.scalars(
        stmt.order_by(Project.is_favorite.desc(), Project.updated_at.desc())
    ).all()
    return {
        "projects": [_project_payload(p, _part_count(db, p.id)) for p in projects]
    }


@router.post("/projects", status_code=201)
def create_project(
    body: ProjectCreate,
    user: User = Depends(require_cap(permissions.CREATE_PROJECT)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    private = org == PRIVATE_SCOPE
    project = Project(
        org_id=user.org_id if private else org,
        created_by_id=user.id,
        name=body.name.strip(),
        is_private=private,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    audit.record(
        db, user, "project.create", "project", target_id=project.id,
        org_id=project.org_id, detail={"name": project.name, "private": private},
    )
    return _project_payload(project, 0)


@router.get("/projects/{project_id}")
def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    project = get_owned_project(db, user, org, project_id)
    return _project_payload(project, _part_count(db, project.id))


@router.patch("/projects/{project_id}")
def rename_project(
    project_id: uuid.UUID,
    body: dict = Body(...),
    user: User = Depends(require_cap(permissions.CREATE_PROJECT)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    project = get_owned_project(db, user, org, project_id)
    if isinstance(body.get("name"), str) and body["name"].strip():
        project.name = body["name"].strip()
    if "favorite" in body:
        project.is_favorite = bool(body["favorite"])
    db.commit()
    db.refresh(project)
    audit.record(
        db, user, "project.rename", "project", target_id=project.id, org_id=project.org_id,
        detail={"name": project.name, "favorite": project.is_favorite},
    )
    return _project_payload(project, _part_count(db, project.id))


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(require_cap(permissions.CREATE_PROJECT)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    project = get_owned_project(db, user, org, project_id)
    eff_org = project.org_id
    if _part_count(db, project.id) > 0:
        raise HTTPException(
            status_code=409, detail="Project is not empty; move or delete its parts first"
        )
    name = project.name
    db.delete(project)
    db.commit()
    audit.record(
        db, user, "project.delete", "project", target_id=project_id, org_id=eff_org,
        detail={"name": name},
    )
    return {"deleted": str(project_id)}
