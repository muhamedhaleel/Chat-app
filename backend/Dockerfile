FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for mysqlclient
RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    gcc \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

EXPOSE 8000

# Default command: migrate then start daphne (ASGI server for WebSocket support)
CMD ["sh", "-c", "python manage.py migrate && daphne -b 0.0.0.0 -p 8000 config.asgi:application"]
