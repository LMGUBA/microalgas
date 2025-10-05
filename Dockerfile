# Use official Python image
FROM python:3.12-slim

# Environment settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies for GRIB (ecCodes)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      eccodes \
      libeccodes0 && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt

# Copy application code
COPY . .

# Expose default port (Railway will set $PORT)
EXPOSE 8080

# Start app with gunicorn, binding to Railway's $PORT
CMD ["/bin/sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --timeout 800"]