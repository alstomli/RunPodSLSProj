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

**Image**:
The PNG a job produces from a prompt, together with the settings that made it.
_Avoid_: Picture, photo

**User**:
A person who signs in to make Images. Each User sees only their own Gallery.
_Avoid_: Account, member

**Gallery**:
All the Images one User has made, newest first.
_Avoid_: History, library

**Cold start**:
The wait from a job arriving with no worker running until a worker is ready to process it.
_Avoid_: Warm-up, boot time
