"""Publish only the gallery manifest and its optimized assets with a normal Git push."""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

REMOTE = "git@github.com:kcam01/Aion2.git"
ASSET = re.compile(r"assets/gallery/[a-f0-9]{64}(?:-thumb)?\.webp")

def publication_files(root):
    root = Path(root)
    manifest = json.loads((root / "gallery.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("images"), list):
        raise ValueError("Invalid gallery manifest")
    files = {"gallery.json": (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()}
    for item in manifest["images"]:
        for field in ("image", "thumbnail"):
            path = item[field].removeprefix("/")
            if not ASSET.fullmatch(path):
                raise ValueError("Unsafe gallery publication path")
            data = (root / path).read_bytes()
            if len(data) > 4 * 1024 * 1024 or not data.startswith(b"RIFF") or data[8:12] != b"WEBP":
                raise ValueError("Invalid optimized gallery asset")
            files[path] = data
    return files

def publish(root, repo, remote=REMOTE, before_push=None):
    files = publication_files(root)
    repo = Path(repo)
    repo.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_AUTHOR_NAME": "kcam01",
           "GIT_AUTHOR_EMAIL": "17442074+kcam01@users.noreply.github.com",
           "GIT_COMMITTER_NAME": "kcam01", "GIT_COMMITTER_EMAIL": "17442074+kcam01@users.noreply.github.com"}
    def git(*args, data=None, extra=None):
        result = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "--git-dir", str(repo), *args],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=60, env={**env, **(extra or {})})
        if result.returncode:
            raise RuntimeError(f"Git {args[0]} failed; next scheduled run will retry")
        return result.stdout.decode("utf-8").strip()
    if not repo.exists():
        subprocess.run(["git", "init", "--bare", str(repo)], check=True, capture_output=True, timeout=20)
        git("remote", "add", "origin", remote)
    if git("rev-parse", "--is-bare-repository") != "true" or git("remote", "get-url", "origin") != remote:
        raise ValueError("Unexpected gallery repository")
    git("fetch", "--no-tags", "--depth=1", "origin", "main")
    base = git("rev-parse", "FETCH_HEAD")
    existing = git("ls-tree", "-r", "--name-only", base, "--", "assets/gallery").splitlines()
    if any(not ASSET.fullmatch(path) for path in existing):
        raise ValueError("Unexpected file in gallery asset directory")
    with tempfile.TemporaryDirectory(prefix="gallery-index-", dir=repo.parent) as temp:
        index = {"GIT_INDEX_FILE": str(Path(temp) / "index")}
        git("read-tree", base, extra=index)
        for path, data in files.items():
            blob = git("hash-object", "-w", "--stdin", data=data)
            git("update-index", "--add", "--cacheinfo", "100644", blob, path, extra=index)
        for path in set(existing) - files.keys():
            git("update-index", "--force-remove", path, extra=index)
        tree = git("write-tree", extra=index)
        if tree == git("rev-parse", base + "^{tree}"):
            return {"changed": False, "commit": base}
        commit = git("commit-tree", tree, "-p", base, data=b"Sync Exalted character gallery\n")
    changed = git("diff-tree", "--no-commit-id", "--name-only", "-r", base, commit).splitlines()
    if not changed or any(path != "gallery.json" and not ASSET.fullmatch(path) for path in changed):
        raise ValueError("Publication would change non-gallery files")
    if before_push:
        before_push()
    git("push", "origin", commit + ":refs/heads/main")
    return {"changed": True, "commit": commit, "files": len(changed)}
