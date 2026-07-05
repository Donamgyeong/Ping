FROM python:3.10.20-alpine3.24

WORKDIR /app

COPY requirements.txt ./requirements.txt


RUN pip install -r requirements.txt

CMD ["fastapi", "dev", "--host", "0.0.0.0", "--port", "8000"]

EXPOSE 8000