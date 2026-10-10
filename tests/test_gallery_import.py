import importlib.util
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/gallery"))
import gallery_core as core

class GalleryImportTests(unittest.TestCase):
    def answer(self, **kw):
        return dict(is_aion2_character=True, safe=True, confidence=.95, title="A guardian in Atreia", description="An armored character with white wings.", **kw)

    def test_history_permission_loss_stops_reconciliation(self):
        roles=[{"id":core.GUILD_ID,"permissions":str(1024|65536)}]
        member={"roles":[]}; channel={"permission_overwrites":[]}
        core.assert_read_access("99",member,roles,channel)
        channel["permission_overwrites"]=[{"id":"99","type":1,"deny":str(65536),"allow":"0"}]
        with self.assertRaises(ValueError):core.assert_read_access("99",member,roles,channel)
        channel["permission_overwrites"]=[{"id":"99","type":1,"deny":"0","allow":str(65536)}]
        core.assert_read_access("99",member,roles,channel)

    def test_free_only_routing(self):
        core.validate_model("openrouter/free")
        core.validate_model("google/gemma-4-31b-it:free")
        for model in ["openai/gpt-4o", "", "free", "google/paid"]:
            with self.assertRaises(ValueError): core.validate_model(model)

    def test_conservative_classification(self):
        self.assertTrue(core.parse_analysis(json.dumps(self.answer()))["accepted"])
        for field, value in [("safe", False), ("is_aion2_character", False), ("confidence", .6)]:
            answer=self.answer(); answer[field]=value
            self.assertFalse(core.parse_analysis(json.dumps(answer))["accepted"])
        for field, value in [("safe", "true"), ("is_aion2_character", "yes"), ("confidence", True), ("title", None)]:
            answer=self.answer();answer[field]=value
            with self.assertRaises(ValueError):core.parse_analysis(json.dumps(answer))
        with self.assertRaises(ValueError): core.parse_analysis("not json")
        with self.assertRaises(ValueError): core.parse_analysis('{"error":"unavailable"}')

    def test_provider_singleton_array_is_supported(self):
        self.assertTrue(core.parse_analysis(json.dumps([self.answer()]))["accepted"])
        with self.assertRaises(ValueError): core.parse_analysis(json.dumps([self.answer(), self.answer()]))

    def test_untrusted_download_urls(self):
        self.assertTrue(core.allowed_image_url("https://cdn.discordapp.com/attachments/123/456/test.png?ex=123"))
        for value in ["http://cdn.discordapp.com/attachments/a.png", "https://evil.test/a.png", "https://cdn.discordapp.com@evil.test/attachments/a.png", "https://cdn.discordapp.com.evil.test/attachments/a.png", "https://cdn.discordapp.com:8443/attachments/a.png", "https://cdn.discordapp.com/icons/a.png"]:
            self.assertFalse(core.allowed_image_url(value))

    def test_reconcile_deduplicates_and_removes_absent_sources(self):
        h="a"*64
        base={"hash":h,"message_id":"123","timestamp":"2026-10-01T10:00:00Z","author":"Guildmate"}
        cache={h:{"accepted":True,"title":"A guardian","description":"Armored character","width":800,"height":1000}}
        result=core.build_images([base,dict(base,message_id="124")],cache)
        self.assertEqual(len(result),1)
        self.assertTrue(result[0]["source_url"].endswith("/124"))
        self.assertEqual(core.build_images([],cache),[])
        self.assertNotIn("message_id",result[0])
        self.assertEqual(result[0]["image"],f"/assets/gallery/{h}.webp")

    def test_failed_or_rejected_analysis_never_publishes(self):
        candidate={"hash":"b"*64,"message_id":"123","timestamp":"2026-10-01T10:00:00Z","author":"Guildmate"}
        self.assertEqual(core.build_images([candidate],{}),[])
        self.assertEqual(core.build_images([candidate],{candidate["hash"]:{"accepted":False}}),[])

    def test_bot_and_nonimage_attachments_are_excluded(self):
        msg={"id":"123","timestamp":"2026-10-01T10:00:00Z","author":{"username":"test"},"attachments":[{"id":"456","filename":"a.png","content_type":"image/png","url":"https://cdn.discordapp.com/attachments/123/456/a.png","size":500}]}
        self.assertEqual(len(core.message_candidates(msg)),1)
        msg["author"]["bot"]=True
        self.assertEqual(core.message_candidates(msg),[])

if __name__=="__main__": unittest.main()
