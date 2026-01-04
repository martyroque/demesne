FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY main.py .
COPY config.py .

# Expose HTTP port
EXPOSE 10301

CMD ["python", "main.py"]
