# Pixel-streaming render service: headless Chromium (software WebGL) + FastAPI.
# The Playwright base image ships a matching Chromium + all system libraries.
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8092
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8092"]
