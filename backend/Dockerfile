FROM python:3.10.21

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN pip install -r requirements.txt

CMD ["fastapi", "dev", "--reload", "--host", "0.0.0.0"]

EXPOSE 8000