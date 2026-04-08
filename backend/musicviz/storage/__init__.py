"""Project & song storage modules."""

from .projects import (
    ProjectStore,
    create_project,
    delete_project,
    get_project,
    list_projects,
)
from .scenes import (
    create_scene_from_template,
    delete_scene,
    list_scenes,
    list_templates,
    scene_file,
    sdk_file,
    template_file,
)
from .songs import (
    add_song,
    get_song,
    list_songs,
    remove_song,
    update_song,
)

__all__ = [
    "ProjectStore",
    "create_project",
    "delete_project",
    "get_project",
    "list_projects",
    "add_song",
    "get_song",
    "list_songs",
    "remove_song",
    "update_song",
    "create_scene_from_template",
    "delete_scene",
    "list_scenes",
    "list_templates",
    "scene_file",
    "sdk_file",
    "template_file",
]
