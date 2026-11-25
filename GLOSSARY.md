# FLUX Image Worker

A personal, non-commercial deployment that turns text prompts into images with FLUX.1-dev on Runpod Serverless.

## Language

**Worker**:
One running copy of our image, which processes jobs on a rented GPU.
_Avoid_: Server, pod

**Endpoint**:
Our own Runpod Serverless deployment, which receives jobs and owns the workers that run them.
_Avoid_: API, service

**Public Endpoint**:
A FLUX.1-dev deployment run by Runpod and shared by its customers. It is not part of this project.
_Avoid_: Endpoint (unqualified)

**Job**:
One request to the endpoint, together with its result.
_Avoid_: Task, call

**Cold start**:
The wait from a job arriving with no worker running until a worker is ready to process it.
_Avoid_: Warm-up, boot time
