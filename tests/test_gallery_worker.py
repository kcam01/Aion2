import json
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/gallery"))
import gallery_sync as sync

class WorkerTests(unittest.TestCase):
    def sample(self):
        output=io.BytesIO();Image.new("RGB",(400,600),"green").save(output,"PNG");return output.getvalue()
    def candidate(self):
        return {"key":"123:456","message_id":"123","attachment_id":"456","timestamp":"2026-10-10T00:00:00Z","author":"Guildmate","url":"https://cdn.discordapp.com/attachments/123/456/a.png","filename":"a.png","size":100}
    def test_cached_second_run_does_not_analyze_and_deletion_reconciles(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(sync.os.environ,{"DISCORD_TOKEN":"test","OPENROUTER_API_KEY":"test"}), patch.object(sync,"scan_channel",side_effect=lambda token:([self.candidate()],1)), patch.object(sync,"download",return_value=self.sample()), patch.object(sync.time,"sleep"):
            root=Path(temp)
            with patch.object(sync,"analyze",return_value={"accepted":True,"title":"Portrait","description":"An armored character"}) as analyze:
                first=sync.run(root); self.assertEqual(first["images"],1);self.assertEqual(analyze.call_count,1)
            prior=(root/"gallery.json").read_bytes()
            with patch.object(sync,"analyze",side_effect=AssertionError("Must reuse cached classification")):
                second=sync.run(root);self.assertEqual(second["reused"],1)
            self.assertEqual(prior,(root/"gallery.json").read_bytes())
            with patch.object(sync,"scan_channel",return_value=([],0)):
                third=sync.run(root)
            self.assertEqual(third["images"],0)
    def test_partial_history_failure_preserves_export(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(sync.os.environ,{"DISCORD_TOKEN":"test","OPENROUTER_API_KEY":"test"}):
            root=Path(temp);(root/"gallery.json").write_text('{"keep":"old manifest"}')
            with patch.object(sync,"scan_channel",side_effect=sync.UpstreamError("HTTP 503")):
                with self.assertRaises(sync.UpstreamError):sync.run(root)
            self.assertEqual((root/"gallery.json").read_text(),'{"keep":"old manifest"}')
    def test_model_failure_is_pending_not_rejection(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(sync.os.environ,{"DISCORD_TOKEN":"test","OPENROUTER_API_KEY":"test"}), patch.object(sync,"scan_channel",side_effect=lambda token:([self.candidate()],1)), patch.object(sync,"download",return_value=self.sample()), patch.object(sync,"analyze",side_effect=sync.UpstreamError("Invalid classification")):
            root=Path(temp);result=sync.run(root)
            self.assertEqual(result["pending"],1);self.assertEqual(result["images"],0);self.assertEqual(result["rejected"],0)
            self.assertFalse((root/"state.json").exists())
    def test_budget_preserves_accepted_source_needing_asset_repair(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(sync.os.environ,{"DISCORD_TOKEN":"test","OPENROUTER_API_KEY":"test"}), patch.object(sync,"scan_channel",side_effect=lambda token:([self.candidate()],1)), patch.object(sync,"download",return_value=self.sample()), patch.object(sync.time,"sleep"):
            root=Path(temp)
            with patch.object(sync,"analyze",return_value={"accepted":True,"title":"Portrait","description":"An armored character"}):sync.run(root)
            previous=json.loads((root/"gallery.json").read_text())
            (root/previous["images"][0]["thumbnail"].lstrip("/")).unlink()
            result=sync.run(root,max_analysis=0)
            self.assertEqual(result["pending"],1)
            self.assertEqual(json.loads((root/"gallery.json").read_text())["images"],previous["images"])

    def test_free_only_payload(self):
        with patch.object(sync,"request_json",return_value={"model":"free-test","choices":[{"message":{"content":json.dumps({"is_aion2_character":False,"safe":True,"confidence":.9,"title":"No","description":"No character"})}}]}) as request:
            sync.analyze(Image.new("RGB",(400,600)),"secret","google/gemma-4-26b-a4b-it:free")
            payload=request.call_args.args[2]
            self.assertEqual(payload["provider"]["max_price"],{"prompt":0,"completion":0})
            self.assertEqual(payload["reasoning"],{"enabled":False})
            self.assertNotIn("secret",json.dumps(payload))
if __name__ == "__main__":unittest.main()
