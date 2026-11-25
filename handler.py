"""Runpod Serverless worker that generates images with FLUX.1-dev."""

import base64
import io
import os
import secrets
from pathlib import Path

# Must be set before any Hugging Face library is imported.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import runpod

MODEL_ID = "black-forest-labs/FLUX.1-dev"
CACHE_ROOT = Path("/runpod-volume/huggingface-cache/hub")

MIN_SIZE, MAX_SIZE, SIZE_STEP = 256, 1536, 16
MAX_STEPS = 50
MAX_GUIDANCE = 20.0
MAX_SEED = 2**32 - 1
FIELDS = {"prompt", "width", "height", "steps", "guidance", "seed"}

pipe = None


def _integer(job_input, name, default, low, high):
    value = job_input.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}")
    return value


def validate(job_input):
    """Return complete settings, or raise ValueError describing the problem."""
    if not isinstance(job_input, dict):
        raise ValueError("input must be an object")
    unknown = sorted(set(job_input) - FIELDS)
    if unknown:
        raise ValueError(f"unknown input fields: {', '.join(unknown)}")

    prompt = job_input.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")

    settings = {"prompt": prompt.strip()}
    for name in ("width", "height"):
        settings[name] = _integer(job_input, name, 1024, MIN_SIZE, MAX_SIZE)
        if settings[name] % SIZE_STEP:
            raise ValueError(f"{name} must be divisible by {SIZE_STEP}")
    settings["steps"] = _integer(job_input, "steps", 28, 1, MAX_STEPS)

    guidance = job_input.get("guidance", 3.5)
    if isinstance(guidance, bool) or not isinstance(guidance, (int, float)):
        raise ValueError("guidance must be a number")
    if not 0 <= guidance <= MAX_GUIDANCE:
        raise ValueError(f"guidance must be between 0 and {MAX_GUIDANCE}")
    settings["guidance"] = float(guidance)

    settings["seed"] = _integer(
        job_input, "seed", secrets.randbelow(MAX_SEED + 1), 0, MAX_SEED
    )
    return settings


def resolve_snapshot(model_id=MODEL_ID, cache_root=CACHE_ROOT):
    """Find the cached model folder, or raise RuntimeError."""
    model_dir = Path(cache_root) / f"models--{model_id.replace('/', '--')}"
    ref = model_dir / "refs" / "main"
    if ref.is_file():
        snapshot = model_dir / "snapshots" / ref.read_text().strip()
        if (snapshot / "model_index.json").is_file():
            return snapshot
    for snapshot in sorted(model_dir.glob("snapshots/*")):
        if (snapshot / "model_index.json").is_file():
            return snapshot
    raise RuntimeError(
        f"{model_id} is not in {cache_root}. Check the endpoint's Model field "
        "and Hugging Face token."
    )


def load_pipeline():
    snapshot = resolve_snapshot()

    import torch
    from diffusers import FluxPipeline

    print(f"Loading {MODEL_ID} from {snapshot}")
    loaded = FluxPipeline.from_pretrained(
        snapshot, torch_dtype=torch.bfloat16, local_files_only=True
    ).to("cuda")
    print(f"Model loaded: {torch.cuda.memory_allocated() / 1e9:.1f} GB on GPU")
    return loaded


def generate(settings):
    import torch

    image = pipe(
        settings["prompt"],
        width=settings["width"],
        height=settings["height"],
        num_inference_steps=settings["steps"],
        guidance_scale=settings["guidance"],
        max_sequence_length=512,
        generator=torch.Generator("cpu").manual_seed(settings["seed"]),
    ).images[0]
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def handler(event):
    try:
        settings = validate(event.get("input"))
    except ValueError as error:
        return {"error": str(error)}
    return {"image_base64": generate(settings), **settings}


if __name__ == "__main__":
    pipe = load_pipeline()
    runpod.serverless.start({"handler": handler})
