import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/gallery"))
from gallery_core import make_manifest
from gallery_publish import publish

class PublisherTests(unittest.TestCase):
    def test_unchanged_content_preserves_timestamp(self):
        previous = make_manifest([], None, "2026-10-10T10:00:00Z")
        self.assertEqual(make_manifest([], previous, "2026-10-11T10:00:00Z"), previous)

    def test_scoped_publication_preserves_website_and_noops(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); remote=root/"remote.git"; seed=root/"seed"; data=root/"data"
            def git(*args,cwd=None):
                result=subprocess.run(["git",*map(str,args)],cwd=cwd,check=True,capture_output=True,text=True)
                return result.stdout.strip()
            git("init","--bare",remote)
            git("init","-b","main",seed)
            git("config","user.email","test@example.test",cwd=seed)
            git("config","user.name","test",cwd=seed)
            (seed/"index.html").write_text("keep me")
            git("add","index.html",cwd=seed);git("commit","-m","seed",cwd=seed)
            git("remote","add","origin",remote,cwd=seed);git("push","origin","main",cwd=seed)
            data.mkdir()
            manifest=make_manifest([],None,"2026-10-10T10:00:00Z")
            (data/"gallery.json").write_text(json.dumps(manifest))
            (data/"private.txt").write_text("never publish")
            first=publish(data,root/"publisher.git",str(remote))
            self.assertTrue(first["changed"])
            self.assertEqual(git("--git-dir",remote,"show","main:index.html"),"keep me")
            self.assertEqual(git("--git-dir",remote,"ls-tree","--name-only","main").splitlines(),["gallery.json","index.html"])
            self.assertFalse(publish(data,root/"publisher.git",str(remote))["changed"])
            # A concurrent site update rejects our stale push; a retry preserves it.
            git("pull","--ff-only","origin","main",cwd=seed)
            manifest["updated_at"]="2026-10-11T10:00:00Z"
            (data/"gallery.json").write_text(json.dumps(manifest))
            def concurrent_update():
                (seed/"new.html").write_text("concurrent page")
                git("add","new.html",cwd=seed);git("commit","-m","concurrent website",cwd=seed)
                git("push","origin","main",cwd=seed)
            with self.assertRaises(RuntimeError):publish(data,root/"publisher.git",str(remote),before_push=concurrent_update)
            self.assertEqual(git("--git-dir",remote,"show","main:new.html"),"concurrent page")
            self.assertTrue(publish(data,root/"publisher.git",str(remote))["changed"])
            self.assertEqual(git("--git-dir",remote,"show","main:new.html"),"concurrent page")

if __name__ == "__main__": unittest.main()
