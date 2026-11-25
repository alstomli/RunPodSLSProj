FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

WORKDIR /app

# A venv keeps our libraries apart from the base's Debian-managed packages,
# which pip cannot replace. It still uses the base's PyTorch and CUDA.
RUN python -m venv --system-site-packages /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY handler.py .

ENTRYPOINT []
CMD ["python", "-u", "handler.py"]
