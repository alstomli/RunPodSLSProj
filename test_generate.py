"""Client seam: run the command with Runpod's HTTP interface faked."""

import base64
import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import requests

import generate

PNG = b"\x89PNG\r\n\x1a\nimage data"
OUTPUT = {"image_base64": base64.b64encode(PNG).decode(), "prompt": "a cat", "seed": 7}
ENV = {"RUNPOD_API_KEY": "test-key", "RUNPOD_ENDPOINT_ID": "ep1"}
BASE = "https://api.runpod.ai/v2/ep1"


def status(name, **extra):
    return 200, {"id": "job1", "status": name, **extra}


COMPLETED = status("COMPLETED", output=OUTPUT, delayTime=120, executionTime=340)


class FakeRunpod:
    """Answers /run and /cancel, and plays a list of /status replies in order.

    The last reply repeats. A reply can be an exception to raise.
    """

    def __init__(self, statuses, run=(200, {"id": "job1", "status": "IN_QUEUE"}),
                 cancel=(200, {"id": "job1", "status": "CANCELLED"})):
        self.statuses, self.run, self.cancel = list(statuses), run, cancel
        self.requests = []

    def send(self, adapter, request, **kwargs):
        self.requests.append(request)
        if request.url == f"{BASE}/run":
            reply = self.run
        elif request.url == f"{BASE}/cancel/job1":
            reply = self.cancel
        elif request.url == f"{BASE}/status/job1":
            reply = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
        else:
            raise AssertionError(f"unexpected request: {request.url}")
        if isinstance(reply, BaseException):
            raise reply
        code, body = reply
        response = requests.Response()
        response.status_code, response.url, response.request = code, request.url, request
        response._content = json.dumps(body).encode()
        return response

    @property
    def cancelled(self):
        return any("/cancel/" in r.url for r in self.requests)


class FakeClock:
    def __init__(self):
        self.now = 0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class ClientTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.folder = Path(temp.name)
        cwd = os.getcwd()
        os.chdir(self.folder)
        # Registered after temp.cleanup so it runs first; Windows cannot
        # delete the current folder.
        self.addCleanup(os.chdir, cwd)

    def run_command(self, runpod, *args, env=ENV):
        """Return (exit code, printed text). A traceback fails the test."""
        out = io.StringIO()
        code = 0
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch("sys.argv", ["generate.py", *args]),
            mock.patch.object(generate, "time", FakeClock()),
            mock.patch("requests.adapters.HTTPAdapter.send",
                       lambda adapter, request, **kw: runpod.send(adapter, request, **kw)),
            contextlib.redirect_stdout(out),
            contextlib.redirect_stderr(out),
        ):
            try:
                generate.main()
            except SystemExit as stop:
                code = stop.code
                if isinstance(code, str):
                    print(code)
                    code = 1
            except KeyboardInterrupt:
                self.fail("Ctrl+C was not handled")
        return code, out.getvalue()

    def test_saves_the_image_after_a_cold_start(self):
        runpod = FakeRunpod([status("IN_QUEUE"), status("IN_QUEUE"),
                             status("IN_PROGRESS"), COMPLETED])
        code, text = self.run_command(runpod, "a cat")
        self.assertEqual(code, 0, text)
        self.assertEqual((self.folder / "images" / "job1.png").read_bytes(), PNG)
        for expected in ("IN_QUEUE", "IN_PROGRESS", "COMPLETED", "'seed': 7", "120", "340"):
            self.assertIn(expected, text)
        self.assertEqual(text.count("IN_QUEUE"), 1)
        self.assertNotIn(OUTPUT["image_base64"], text)
        self.assertFalse(runpod.cancelled)

    def test_sends_only_the_given_settings_with_the_key(self):
        runpod = FakeRunpod([COMPLETED])
        self.run_command(runpod, "a cat")
        self.assertEqual(json.loads(runpod.requests[0].body), {"input": {"prompt": "a cat"}})
        for request in runpod.requests:
            self.assertEqual(request.headers["Authorization"], "Bearer test-key")

        runpod = FakeRunpod([COMPLETED])
        self.run_command(runpod, "a cat", "--width", "512", "--height", "768", "--steps", "10",
                         "--guidance", "0", "--seed", "0")
        self.assertEqual(
            json.loads(runpod.requests[0].body)["input"],
            {"prompt": "a cat", "width": 512, "height": 768, "steps": 10,
             "guidance": 0.0, "seed": 0},
        )

    def test_output_option_creates_the_folder(self):
        code, text = self.run_command(FakeRunpod([COMPLETED]), "a cat", "--output", "new/cat.png")
        self.assertEqual(code, 0, text)
        self.assertEqual((self.folder / "new" / "cat.png").read_bytes(), PNG)

    def test_failed_jobs_show_the_reason(self):
        for name in ("FAILED", "TIMED_OUT", "CANCELLED"):
            with self.subTest(name=name):
                runpod = FakeRunpod([status(name, error="width must be divisible by 16")])
                code, text = self.run_command(runpod, "a cat")
                self.assertEqual(code, 1)
                self.assertIn(name, text)
                self.assertIn("width must be divisible by 16", text)
                self.assertFalse(runpod.cancelled)

    def test_brief_failures_while_polling_are_retried(self):
        for failure in (requests.ConnectionError("down"), requests.Timeout("slow"),
                        (502, {}), (503, {}), (429, {})):
            with self.subTest(failure=failure):
                runpod = FakeRunpod([status("IN_PROGRESS"), failure, COMPLETED])
                code, text = self.run_command(runpod, "a cat")
                self.assertEqual(code, 0, text)
                self.assertFalse(runpod.cancelled)

    def test_waiting_too_long_cancels_the_job(self):
        runpod = FakeRunpod([status("IN_QUEUE")])
        code, text = self.run_command(runpod, "a cat", "--max-wait", "30")
        self.assertEqual(code, 1)
        self.assertIn("30 seconds", text)
        self.assertTrue(runpod.cancelled)

    def test_interrupting_cancels_the_job(self):
        runpod = FakeRunpod([status("IN_PROGRESS"), KeyboardInterrupt()])
        code, _ = self.run_command(runpod, "a cat")
        self.assertEqual(code, 130)
        self.assertTrue(runpod.cancelled)

    def test_failed_cancellation_warns_and_keeps_the_original_reason(self):
        for cancel in (requests.ConnectionError("down"), (500, {})):
            with self.subTest(cancel=cancel):
                runpod = FakeRunpod([status("IN_QUEUE")], cancel=cancel)
                code, text = self.run_command(runpod, "a cat", "--max-wait", "30")
                self.assertEqual(code, 1)
                self.assertIn("30 seconds", text)
                self.assertIn("may still be running", text)
                self.assertIn("job1", text)

    def test_rejected_submission_is_explained(self):
        for run, expected in (((401, {}), "401"), ((404, {}), "404"),
                              (requests.ConnectionError("down"), "down")):
            with self.subTest(run=run):
                code, text = self.run_command(FakeRunpod([COMPLETED], run=run), "a cat")
                self.assertEqual(code, 1)
                self.assertIn(expected, text)
                self.assertNotIn("test-key", text)

    def test_permanent_status_error_stops(self):
        runpod = FakeRunpod([(404, {})])
        code, text = self.run_command(runpod, "a cat")
        self.assertEqual(code, 1)
        self.assertIn("404", text)

    def test_output_that_is_not_a_png_is_not_saved(self):
        for output in ({"image_base64": base64.b64encode(b"no").decode()},
                       {"image_base64": "not base64!"}, {}, None):
            with self.subTest(output=output):
                code, text = self.run_command(
                    FakeRunpod([status("COMPLETED", output=output)]), "a cat")
                self.assertEqual(code, 1)
                self.assertIn("PNG", text)
                self.assertFalse((self.folder / "images" / "job1.png").exists())

    def test_missing_configuration_is_named_and_nothing_is_sent(self):
        for name in ENV:
            for env in ({k: v for k, v in ENV.items() if k != name}, {**ENV, name: ""}):
                with self.subTest(env=env):
                    runpod = FakeRunpod([COMPLETED])
                    code, text = self.run_command(runpod, "a cat", env=env)
                    self.assertEqual(code, 1)
                    self.assertIn(name, text)
                    self.assertEqual(runpod.requests, [])


if __name__ == "__main__":
    unittest.main()
