"""Send a prompt to the FLUX endpoint and save the image.

Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID in the environment first.
"""

import argparse
import base64
import os
import sys
import time
from pathlib import Path

import requests

DONE = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
POLL_SECONDS = 3


class ClientError(Exception):
    """A problem to show to the user without a traceback."""


def read_config():
    values = []
    for name in ("RUNPOD_API_KEY", "RUNPOD_ENDPOINT_ID"):
        value = os.environ.get(name, "").strip()
        if not value:
            raise ClientError(f"Set the {name} environment variable first")
        values.append(value)
    return values


def submit(session, base, job_input):
    try:
        response = session.post(f"{base}/run", json={"input": job_input}, timeout=30)
        response.raise_for_status()
    except requests.RequestException as error:
        raise ClientError(f"Could not submit the job: {error}") from error
    return response.json()["id"]


def get_status(session, base, job_id):
    """Return the job, or None after a failure worth retrying."""
    try:
        response = session.get(f"{base}/status/{job_id}", timeout=60)
    except (requests.ConnectionError, requests.Timeout):
        return None
    if response.status_code == 429 or response.status_code >= 500:
        return None
    try:
        response.raise_for_status()
    except requests.HTTPError as error:
        raise ClientError(f"Could not check the job: {error}") from error
    return response.json()


def cancel(session, base, job_id):
    print("Cancelling job")
    try:
        session.post(f"{base}/cancel/{job_id}", timeout=30).raise_for_status()
    except requests.RequestException as error:
        print(f"Could not cancel job {job_id}, so it may still be running: {error}")


def wait(session, base, job_id, max_wait):
    last, deadline = None, time.monotonic() + max_wait
    while time.monotonic() < deadline:
        job = get_status(session, base, job_id)
        if job:
            if job["status"] != last:
                last = job["status"]
                print(last)
            if last in DONE:
                return job
        time.sleep(POLL_SECONDS)
    raise ClientError(f"The job did not finish within {max_wait} seconds")


def run_job(session, base, job_input, max_wait):
    job_id = submit(session, base, job_input)
    print(f"Job {job_id} submitted")
    try:
        return wait(session, base, job_id, max_wait)
    except BaseException:  # includes Ctrl+C, so no job is left running
        cancel(session, base, job_id)
        raise


def decode_png(output):
    try:
        data = base64.b64decode(output["image_base64"], validate=True)
    except (KeyError, TypeError, ValueError):
        data = b""
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ClientError("The endpoint did not return a PNG")
    return data


def run(args):
    key, endpoint = read_config()

    job_input = {"prompt": args.prompt}
    for name in ("width", "height", "steps", "seed", "guidance"):
        if getattr(args, name) is not None:
            job_input[name] = getattr(args, name)

    with requests.Session() as session:
        session.headers["Authorization"] = f"Bearer {key}"
        base = f"https://api.runpod.ai/v2/{endpoint}"
        job = run_job(session, base, job_input, args.max_wait)

    if job["status"] != "COMPLETED":
        raise ClientError(f"{job['status']}: {job.get('error', 'no details')}")

    output = job.get("output")
    data = decode_png(output)
    path = args.output or Path("images") / f"{job['id']}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"Saved {path}")
    print({k: v for k, v in output.items() if k != "image_base64"})
    print(f"Delay {job.get('delayTime')} ms, execution {job.get('executionTime')} ms")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt")
    for name in ("width", "height", "steps", "seed"):
        parser.add_argument(f"--{name}", type=int)
    parser.add_argument("--guidance", type=float)
    parser.add_argument("--output", type=Path, help="default: images/<job id>.png")
    parser.add_argument("--max-wait", type=int, default=1800, help="seconds, default 1800")
    args = parser.parse_args()

    try:
        run(args)
    except ClientError as error:
        sys.exit(str(error))
    except KeyboardInterrupt:
        print("Interrupted")
        sys.exit(130)


if __name__ == "__main__":
    main()
