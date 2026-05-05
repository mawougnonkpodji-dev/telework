import os
import uuid

from werkzeug.utils import secure_filename


def allowed_file(filename: str, allowed_extensions: set) -> bool:
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    return ext in allowed_extensions


def save_uploaded_file(upload_folder: str, task_id: int, file_storage, max_bytes: int):
    """
    Enregistre le fichier sous uploads/tasks/<task_id>/<uuid>_<name>.
    Retourne (stored_path_relative, original_safe_name, size_bytes, mime_type).
    """
    if not file_storage or not file_storage.filename:
        raise ValueError("Fichier manquant")

    from flask import current_app

    # Flask request files carry mimetype; use it to block unsupported uploads.
    # Extension whitelist stays backward compatible if config key is missing.
    allowed_extensions = {
        ext.strip(".").lower()
        for ext in current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", set())
    }
    if allowed_extensions and not allowed_file(file_storage.filename, allowed_extensions):
        raise ValueError("Extension de fichier non autorisée")

    mime = (getattr(file_storage, "mimetype", None) or "application/octet-stream").lower()
    allowed_mimes = {
        m.lower() for m in current_app.config.get("ALLOWED_UPLOAD_MIME_TYPES", set())
    }
    if allowed_mimes and mime not in allowed_mimes:
        raise ValueError("Type MIME non autorisé")

    file_storage.seek(0, os.SEEK_END)
    size = file_storage.tell()
    file_storage.seek(0)
    if size > max_bytes:
        raise ValueError(f"Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo)")

    return save_uploaded_file_in_subdir(
        upload_folder=upload_folder,
        subdir=os.path.join("tasks", str(task_id)),
        file_storage=file_storage,
        max_bytes=max_bytes,
        validated_mime=mime,
    )


def save_uploaded_file_in_subdir(upload_folder: str, subdir: str, file_storage, max_bytes: int, validated_mime=None):
    from flask import current_app

    if validated_mime is None:
        allowed_extensions = {
            ext.strip(".").lower()
            for ext in current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", set())
        }
        if allowed_extensions and not allowed_file(file_storage.filename, allowed_extensions):
            raise ValueError("Extension de fichier non autorisée")

        mime_candidate = (getattr(file_storage, "mimetype", None) or "application/octet-stream").lower()
        allowed_mimes = {
            m.lower() for m in current_app.config.get("ALLOWED_UPLOAD_MIME_TYPES", set())
        }
        if allowed_mimes and mime_candidate not in allowed_mimes:
            raise ValueError("Type MIME non autorisé")

        file_storage.seek(0, os.SEEK_END)
        size = file_storage.tell()
        file_storage.seek(0)
        if size > max_bytes:
            raise ValueError(f"Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo)")
        validated_mime = mime_candidate

    raw_name = file_storage.filename
    safe = secure_filename(raw_name) or "fichier"
    uid = str(uuid.uuid4())
    abs_sub = os.path.join(upload_folder, subdir)
    os.makedirs(abs_sub, exist_ok=True)
    stored_name = f"{uid}_{safe}"
    abs_path = os.path.join(abs_sub, stored_name)
    file_storage.save(abs_path)
    rel = "/".join([x for x in subdir.replace("\\", "/").split("/") if x] + [stored_name])
    mime = validated_mime or getattr(file_storage, "mimetype", None) or "application/octet-stream"
    return rel, safe, os.path.getsize(abs_path), mime


def delete_stored_file(upload_folder: str, stored_path: str) -> None:
    full = os.path.join(upload_folder, stored_path)
    if os.path.isfile(full):
        os.remove(full)
    parent = os.path.dirname(full)
    if os.path.isdir(parent) and not os.listdir(parent):
        os.rmdir(parent)
