FROM python:3.10.20-alpine3.24

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN pip install -r requirements.txt

CMD ["fastapi", "dev", "--reload", "--host", "0.0.0.0"]

EXPOSE 8000