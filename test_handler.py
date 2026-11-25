"""Job seam: a job event goes in, a result comes out. Only the pipeline is fake.

Needs PyTorch and Pillow, so run it in the worker image.
"""

import base64
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image

import handler


class FakePipeline:
    def __init__(self):
        self.calls = []

    def __call__(self, prompt, **kwargs):
        self.calls.append({"prompt": prompt, **kwargs})
        image = Image.new("RGB", (kwargs["width"], kwargs["height"]), (10, 20, 30))
        return SimpleNamespace(images=[image])


class JobTests(unittest.TestCase):
    def setUp(self):
        self.pipe = FakePipeline()
        patcher = mock.patch.object(handler, "pipe", self.pipe)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_job(self, **job_input):
        return handler.handler({"id": "test", "input": job_input})

    def test_prompt_only_uses_defaults(self):
        result = self.run_job(prompt="  a cat ")
        seed = result.pop("seed")
        result.pop("image_base64")
        self.assertEqual(
            result,
            {"prompt": "a cat", "width": 1024, "height": 1024, "steps": 28, "guidance": 3.5},
        )
        self.assertIsInstance(seed, int)
        self.assertTrue(0 <= seed <= 2**32 - 1)

    def test_result_is_a_png_of_the_requested_size(self):
        result = self.run_job(prompt="a cat", width=512, height=768)
        data = base64.b64decode(result["image_base64"], validate=True)
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            self.assertEqual((image.format, image.size), ("PNG", (512, 768)))
            self.assertEqual(image.getpixel((0, 0)), (10, 20, 30))

    def test_settings_reach_the_pipeline_and_are_returned(self):
        settings = {
            "prompt": "a cat", "width": 512, "height": 768,
            "steps": 10, "guidance": 2.0, "seed": 7,
        }
        result = self.run_job(**settings)
        result.pop("image_base64")
        self.assertEqual(result, settings)

        (call,) = self.pipe.calls
        self.assertEqual(call["prompt"], "a cat")
        self.assertEqual((call["width"], call["height"]), (512, 768))
        self.assertEqual(call["num_inference_steps"], 10)
        self.assertEqual(call["guidance_scale"], 2.0)
        self.assertEqual(call["generator"].initial_seed(), 7)

    def test_missing_seed_is_random_and_the_returned_one_is_used(self):
        results = [self.run_job(prompt="x", width=256, height=256) for _ in range(5)]
        self.assertGreater(len({r["seed"] for r in results}), 1)
        for result, call in zip(results, self.pipe.calls):
            self.assertEqual(call["generator"].initial_seed(), result["seed"])

    def test_limits_are_inclusive(self):
        for extra in (
            {"width": 256, "height": 256},
            {"width": 1536, "height": 1536},
            {"steps": 1},
            {"steps": 50},
            {"guidance": 0},
            {"guidance": 20},
            {"seed": 0},
            {"seed": 2**32 - 1},
        ):
            with self.subTest(extra=extra):
                self.assertIn("image_base64", self.run_job(prompt="x", **extra))

    def test_bad_input_names_the_field_and_never_reaches_the_pipeline(self):
        cases = [
            ("prompt", {}),
            ("prompt", {"prompt": None}),
            ("prompt", {"prompt": "  "}),
            ("prompt", {"prompt": 1}),
            ("stpes", {"prompt": "x", "stpes": 5}),
        ]
        values = {
            "width": [240, 1552, 1000, "1024", True, None, 512.0],
            "height": [240, 1552, 1000, "1024", True, None, 512.0],
            "steps": [0, 51, 1.5, "5", True, None],
            "guidance": [-1, 20.5, float("nan"), float("inf"), "high", True, None],
            "seed": [-1, 2**32, 1.5, "7", False, None],
        }
        for field, bad_values in values.items():
            cases += [(field, {"prompt": "x", field: value}) for value in bad_values]
        for field, job_input in cases:
            with self.subTest(job_input=job_input):
                result = self.run_job(**job_input)
                self.assertEqual(list(result), ["error"])
                self.assertIn(field, result["error"])
        for job_input in (None, "a cat", ["a cat"]):
            with self.subTest(job_input=job_input):
                self.assertIn("error", handler.handler({"input": job_input}))
        self.assertIn("error", handler.handler({}))
        self.assertEqual(self.pipe.calls, [])

    def test_pipeline_failure_fails_the_job(self):
        with mock.patch.object(handler, "pipe", side_effect=RuntimeError("out of memory")):
            with self.assertRaisesRegex(RuntimeError, "out of memory"):
                self.run_job(prompt="x")


class StartupTests(unittest.TestCase):
    """Finding the cached model cannot be reached through a job."""

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.model = self.root / "models--black-forest-labs--FLUX.1-dev"

    def add_snapshot(self, name, complete=True):
        folder = self.model / "snapshots" / name
        folder.mkdir(parents=True)
        if complete:
            (folder / "model_index.json").write_text("{}")

    def set_main(self, name):
        (self.model / "refs").mkdir(parents=True)
        (self.model / "refs" / "main").write_text(f"{name}\n")

    def resolve(self):
        return handler.resolve_snapshot(cache_root=self.root).name

    def test_prefers_the_main_reference(self):
        self.add_snapshot("aaa")
        self.add_snapshot("bbb")
        self.set_main("bbb")
        self.assertEqual(self.resolve(), "bbb")

    def test_falls_back_to_the_first_usable_snapshot(self):
        self.add_snapshot("aaa", complete=False)
        self.add_snapshot("bbb")
        self.set_main("gone")
        self.assertEqual(self.resolve(), "bbb")

    def test_missing_model_says_what_to_check(self):
        with self.assertRaisesRegex(RuntimeError, "Model field.*token"):
            self.resolve()


if __name__ == "__main__":
    unittest.main()
