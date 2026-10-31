import os
import re
import sys
import unittest

os.environ["HUB_DISABLED"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


class Page(unittest.TestCase):
    def setUp(self):
        self.c = server.app.test_client()
        self.html = self.c.get("/").get_data(as_text=True)

    def test_page_and_health(self):
        self.assertEqual(self.c.get("/").status_code, 200)
        self.assertEqual(self.c.get("/healthz").get_json(), {"ok": True})

    def test_credit_dream_card_and_not_affiliated_note(self):
        self.assertIn("Made by Legion", self.html)
        self.assertIn("dream car", self.html)
        self.assertIn("Hydra LTE242", self.html)
        self.assertIn("isn&rsquo;t made by or linked to McLaren", self.html)

    def test_every_id_the_script_uses_exists_in_the_page(self):
        js = read("static", "main.js")
        ids = set(re.findall(r'\$\("([\w-]+)"\)', js))
        missing = [i for i in ids if f'id="{i}"' not in self.html]
        self.assertEqual(missing, [])

    def test_assets_are_versioned_and_served(self):
        v = server.asset_version()
        for name in ("main.js", "car.js", "sound.js", "style.css"):
            self.assertEqual(self.c.get(f"/static/{name}").status_code, 200, name)
        self.assertIn(f"main.js?v={v}", self.html)

    def test_scripts_come_only_from_pinned_cdn_versions(self):
        self.assertIn("three@0.160.0/build/three.module.js", self.html)
        self.assertNotRegex(self.html, r"three@latest|three@0\.\d+/build(?!/three)")


if __name__ == "__main__":
    unittest.main()
