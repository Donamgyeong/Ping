FROM python:3.10.21-slim

WORKDIR /app

COPY ./ ./

RUN apt-get update && apt-get install -y --no-install-recommends gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install -r requirements.txt

CMD ["fastapi", "run", "--workers", "4", "--host", "0.0.0.0"]

EXPOSE 8000